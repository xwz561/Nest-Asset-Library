const { collectFolderSubtreeIds } = require('./folder-tree.cjs');

const LIVE_SYNC_VERSION = 3;
const MAX_PENDING_UPLOADS = 500;
const MAX_PENDING_DELETES = 500;
const MAX_PENDING_MOVES = 500;
const LIVE_UPLOAD_RETRY_BASE_MS = 3 * 1000;
const LIVE_UPLOAD_RETRY_MAX_MS = 60 * 1000;
const MAX_LIVE_STATUS_ITEMS = 8;
// Status is shown in the paired browser extension. Keep an error summary
// useful enough for retry guidance while never passing a local path, URL,
// remote asset ID, or response body across the bridge.
const MAX_LIVE_STATUS_ERROR_LENGTH = 180;

function normalizeId(value) {
  const id = String(value ?? '').trim();
  return /^\d{1,18}$/.test(id) ? id : '';
}

function normalizeRemoteAssetId(value) {
  // AI Flow's confirmed asset-delete route accepts numeric asset IDs only.
  // Reject anything else before it ever reaches the authenticated extension.
  return normalizeId(value);
}

function normalizedOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    return /^https?:$/.test(url.protocol) ? url.origin.toLowerCase() : '';
  } catch {
    return '';
  }
}

function sameOrigin(left, right) {
  return normalizedOrigin(left) !== '' && normalizedOrigin(left) === normalizedOrigin(right);
}

function nonNegativeInteger(value, maximum = Number.MAX_SAFE_INTEGER) {
  return Math.min(maximum, Math.max(0, Math.floor(Number(value) || 0)));
}

function liveUploadRetryDelay(retryCount) {
  const attempts = Math.max(1, nonNegativeInteger(retryCount, 10));
  return Math.min(LIVE_UPLOAD_RETRY_MAX_MS, LIVE_UPLOAD_RETRY_BASE_MS * (2 ** (attempts - 1)));
}

function liveUploadReadyAt(record) {
  return Math.max(0, Number(record?.nextAttemptAt) || 0);
}

function liveUploadSize(item) {
  return Math.max(0, Number(item?.asset?.size) || 0);
}

function compareLiveUploadPriority(left, right) {
  const sizeDelta = liveUploadSize(left) - liveUploadSize(right);
  if (sizeDelta) return sizeDelta;
  const queuedDelta = (Number(left?.target?.queuedAt) || 0) - (Number(right?.target?.queuedAt) || 0);
  if (queuedDelta) return queuedDelta;
  return String(left?.asset?.id || '').localeCompare(String(right?.asset?.id || ''));
}

function safeRootLink(folder) {
  const link = folder?.aiFlowRootSync;
  const serverOrigin = normalizedOrigin(link?.serverOrigin);
  const projectId = normalizeId(link?.projectId);
  if (!serverOrigin || !projectId) return null;
  return {
    serverOrigin,
    projectId,
    // 早期目录同步会写 liveSync:false，却没有记录这是用户主动关闭。
    // 这类历史对应关系迁移为默认实时；只有显式关闭的根目录才真正停止。
    liveSync: link?.liveSyncDisabledByUser !== true,
    syncedAt: Number(link?.syncedAt) || 0,
  };
}

function safeFolderLink(folder) {
  const link = folder?.aiFlowFolderSync;
  const serverOrigin = normalizedOrigin(link?.serverOrigin);
  const projectId = normalizeId(link?.projectId);
  const remoteFolderId = normalizeId(link?.remoteFolderId);
  const rootFolderId = String(link?.rootFolderId || '').trim();
  if (!serverOrigin || !projectId || !remoteFolderId || !rootFolderId) return null;
  return { serverOrigin, projectId, remoteFolderId, rootFolderId };
}

function folderTarget(data, folderId) {
  const folders = Array.isArray(data?.folders) ? data.folders : [];
  const byId = new Map(folders.map(folder => [String(folder.id), folder]));
  let current = byId.get(String(folderId || ''));
  if (!current) return null;
  const requestedFolderId = String(current.id);
  const visited = new Set();
  let mappedFolder = null;
  let rootFolder = null;
  let rootLink = null;
  while (current && !visited.has(String(current.id))) {
    visited.add(String(current.id));
    if (!mappedFolder) {
      const link = safeFolderLink(current);
      if (link) mappedFolder = { folder: current, link };
    }
    const currentRootLink = safeRootLink(current);
    if (currentRootLink) {
      rootFolder = current;
      rootLink = currentRootLink;
      break;
    }
    current = byId.get(String(current.parentId || ''));
  }
  if (!rootFolder || !rootLink) return null;
  if (mappedFolder && (
    mappedFolder.link.rootFolderId !== String(rootFolder.id)
    || mappedFolder.link.projectId !== rootLink.projectId
    || !sameOrigin(mappedFolder.link.serverOrigin, rootLink.serverOrigin)
  )) return null;
  return {
    localFolderId: requestedFolderId,
    rootFolderId: String(rootFolder.id),
    rootFolderName: String(rootFolder.name || '同步根目录'),
    remoteFolderId: mappedFolder?.link.remoteFolderId || '',
    remoteFolderName: String(mappedFolder?.folder?.name || rootFolder.name || '我的素材'),
    serverOrigin: rootLink.serverOrigin,
    projectId: rootLink.projectId,
    liveSync: rootLink.liveSync,
  };
}

function ensureLiveQueue(data) {
  const previous = data?.aiFlowLiveSync;
  const seen = new Set();
  const pendingUploads = [];
  const deleteSeen = new Set();
  const pendingDeletes = [];
  const moveByRemote = new Map();
  for (const item of Array.isArray(previous?.pendingUploads) ? previous.pendingUploads : []) {
    const assetId = String(item?.assetId || '').trim();
    const localFolderId = String(item?.localFolderId || '').trim();
    const rootFolderId = String(item?.rootFolderId || '').trim();
    const serverOrigin = normalizedOrigin(item?.serverOrigin);
    const projectId = normalizeId(item?.projectId);
    const remoteFolderId = normalizeId(item?.remoteFolderId);
    if (!assetId || !localFolderId || !rootFolderId || !serverOrigin || !projectId || seen.has(assetId)) continue;
    seen.add(assetId);
    pendingUploads.push({
      assetId,
      localFolderId,
      rootFolderId,
      serverOrigin,
      projectId,
      remoteFolderId,
      queuedAt: Math.max(0, Number(item?.queuedAt) || 0),
      lastError: String(item?.lastError || '').trim().slice(0, 500),
      lastAttemptAt: Math.max(0, Number(item?.lastAttemptAt) || 0),
      retryCount: nonNegativeInteger(item?.retryCount, 10),
      nextAttemptAt: Math.max(0, Number(item?.nextAttemptAt) || 0),
    });
  }
  for (const item of Array.isArray(previous?.pendingDeletes) ? previous.pendingDeletes : []) {
    const remoteAssetId = normalizeRemoteAssetId(item?.remoteAssetId);
    const serverOrigin = normalizedOrigin(item?.serverOrigin);
    const projectId = normalizeId(item?.projectId);
    const key = `${serverOrigin}\u001f${projectId}\u001f${remoteAssetId}`;
    if (!remoteAssetId || !serverOrigin || !projectId || deleteSeen.has(key)) continue;
    deleteSeen.add(key);
    pendingDeletes.push({
      remoteAssetId,
      serverOrigin,
      projectId,
      queuedAt: Math.max(0, Number(item?.queuedAt) || 0),
      lastError: String(item?.lastError || '').trim().slice(0, 500),
      lastAttemptAt: Math.max(0, Number(item?.lastAttemptAt) || 0),
    });
  }
  for (const item of Array.isArray(previous?.pendingMoves) ? previous.pendingMoves : []) {
    const assetId = String(item?.assetId || '').trim();
    const remoteAssetId = normalizeRemoteAssetId(item?.remoteAssetId);
    const localFolderId = String(item?.localFolderId || '').trim();
    const rootFolderId = String(item?.rootFolderId || '').trim();
    const serverOrigin = normalizedOrigin(item?.serverOrigin);
    const projectId = normalizeId(item?.projectId);
    const remoteFolderId = normalizeId(item?.remoteFolderId);
    const key = `${serverOrigin}\u001f${projectId}\u001f${remoteAssetId}`;
    if (!assetId || !remoteAssetId || !localFolderId || !rootFolderId || !serverOrigin || !projectId) continue;
    moveByRemote.set(key, {
      assetId,
      remoteAssetId,
      localFolderId,
      rootFolderId,
      serverOrigin,
      projectId,
      remoteFolderId,
      queuedAt: Math.max(0, Number(item?.queuedAt) || 0),
      lastError: String(item?.lastError || '').trim().slice(0, 500),
      lastAttemptAt: Math.max(0, Number(item?.lastAttemptAt) || 0),
    });
  }
  data.aiFlowLiveSync = {
    version: LIVE_SYNC_VERSION,
    pendingUploads: pendingUploads.slice(-MAX_PENDING_UPLOADS),
    pendingDeletes: pendingDeletes.slice(-MAX_PENDING_DELETES),
    pendingMoves: [...moveByRemote.values()].slice(-MAX_PENDING_MOVES),
  };
  return data.aiFlowLiveSync;
}

function queueRemoteDeletes(data, entries, { now = Date.now() } = {}) {
  const queue = ensureLiveQueue(data);
  const byRemote = new Map(queue.pendingDeletes.map(item => [`${item.serverOrigin}\u001f${item.projectId}\u001f${item.remoteAssetId}`, item]));
  let queued = 0;
  for (const entry of Array.isArray(entries) ? entries : []) {
    const remoteAssetId = normalizeRemoteAssetId(entry?.remoteAssetId);
    const serverOrigin = normalizedOrigin(entry?.serverOrigin);
    const projectId = normalizeId(entry?.projectId);
    if (!remoteAssetId || !serverOrigin || !projectId) continue;
    const key = `${serverOrigin}\u001f${projectId}\u001f${remoteAssetId}`;
    if (!byRemote.has(key)) queued += 1;
    byRemote.set(key, { remoteAssetId, serverOrigin, projectId, queuedAt: now, lastError: '', lastAttemptAt: 0 });
  }
  queue.pendingDeletes = [...byRemote.values()].slice(-MAX_PENDING_DELETES);
  return queued;
}

function remoteMoveKey(item) {
  return [
    String(item?.assetId || '').trim(),
    normalizeRemoteAssetId(item?.remoteAssetId),
    String(item?.localFolderId || '').trim(),
    normalizeId(item?.remoteFolderId),
  ].join('\u001f');
}

function queueRemoteMoves(data, entries, { now = Date.now() } = {}) {
  const queue = ensureLiveQueue(data);
  const byRemote = new Map(queue.pendingMoves.map(item => [`${item.serverOrigin}\u001f${item.projectId}\u001f${item.remoteAssetId}`, item]));
  let queued = 0;
  for (const entry of Array.isArray(entries) ? entries : []) {
    const assetId = String(entry?.assetId || '').trim();
    const remoteAssetId = normalizeRemoteAssetId(entry?.remoteAssetId);
    const localFolderId = String(entry?.localFolderId || '').trim();
    const rootFolderId = String(entry?.rootFolderId || '').trim();
    const serverOrigin = normalizedOrigin(entry?.serverOrigin);
    const projectId = normalizeId(entry?.projectId);
    const remoteFolderId = normalizeId(entry?.remoteFolderId);
    if (!assetId || !remoteAssetId || !localFolderId || !rootFolderId || !serverOrigin || !projectId) continue;
    const key = `${serverOrigin}\u001f${projectId}\u001f${remoteAssetId}`;
    if (!byRemote.has(key)) queued += 1;
    byRemote.set(key, {
      assetId,
      remoteAssetId,
      localFolderId,
      rootFolderId,
      serverOrigin,
      projectId,
      remoteFolderId,
      queuedAt: now,
      lastError: '',
      lastAttemptAt: 0,
    });
  }
  queue.pendingMoves = [...byRemote.values()].slice(-MAX_PENDING_MOVES);
  return queued;
}

function pendingRemoteDeletesForPage(data, { serverOrigin, projectId }) {
  const queue = ensureLiveQueue(data);
  const origin = normalizedOrigin(serverOrigin);
  const project = normalizeId(projectId);
  if (!origin || !project) return [];
  return queue.pendingDeletes.filter(item => sameOrigin(item.serverOrigin, origin) && item.projectId === project);
}

function pendingRemoteMovesForPage(data, { serverOrigin, projectId }) {
  const queue = ensureLiveQueue(data);
  const assetsById = new Map((data?.assets || []).map(asset => [String(asset.id), asset]));
  const origin = normalizedOrigin(serverOrigin);
  const project = normalizeId(projectId);
  const retained = [];
  const selected = [];
  for (const record of queue.pendingMoves) {
    const asset = assetsById.get(record.assetId);
    const target = asset ? folderTarget(data, asset.folderId) : null;
    if (!asset || !target?.liveSync || target.rootFolderId !== record.rootFolderId) continue;
    if (!sameOrigin(target.serverOrigin, record.serverOrigin) || target.projectId !== record.projectId) continue;
    const refreshed = {
      ...record,
      localFolderId: target.localFolderId,
      remoteFolderId: target.remoteFolderId,
    };
    retained.push(refreshed);
    if (origin && project && sameOrigin(target.serverOrigin, origin) && target.projectId === project) selected.push(refreshed);
  }
  queue.pendingMoves = retained;
  return selected;
}

function removePendingRemoteDeletes(data, remoteAssetIds, { serverOrigin, projectId } = {}) {
  const queue = ensureLiveQueue(data);
  const ids = new Set((Array.isArray(remoteAssetIds) ? remoteAssetIds : []).map(normalizeRemoteAssetId).filter(Boolean));
  const origin = normalizedOrigin(serverOrigin);
  const project = normalizeId(projectId);
  const before = queue.pendingDeletes.length;
  queue.pendingDeletes = queue.pendingDeletes.filter(item => !(ids.has(item.remoteAssetId) && (!origin || sameOrigin(item.serverOrigin, origin)) && (!project || item.projectId === project)));
  return before - queue.pendingDeletes.length;
}

function removePendingRemoteMoves(data, moves, { serverOrigin, projectId } = {}) {
  const queue = ensureLiveQueue(data);
  const accepted = new Set((Array.isArray(moves) ? moves : []).map(remoteMoveKey));
  const origin = normalizedOrigin(serverOrigin);
  const project = normalizeId(projectId);
  const before = queue.pendingMoves.length;
  queue.pendingMoves = queue.pendingMoves.filter(item => !(
    accepted.has(remoteMoveKey(item))
    && (!origin || sameOrigin(item.serverOrigin, origin))
    && (!project || item.projectId === project)
  ));
  return before - queue.pendingMoves.length;
}

function recordRemoteDeleteFailures(data, failures, { serverOrigin, projectId, now = Date.now() } = {}) {
  const queue = ensureLiveQueue(data);
  const origin = normalizedOrigin(serverOrigin);
  const project = normalizeId(projectId);
  const messages = new Map((Array.isArray(failures) ? failures : []).map(item => [normalizeRemoteAssetId(item?.remoteAssetId), String(item?.error || '').trim().slice(0, 500)]).filter(([id, message]) => id && message));
  let updated = 0;
  for (const item of queue.pendingDeletes) {
    const error = messages.get(item.remoteAssetId);
    if (error && sameOrigin(item.serverOrigin, origin) && item.projectId === project) {
      item.lastError = error;
      item.lastAttemptAt = now;
      updated += 1;
    }
  }
  return updated;
}

function recordRemoteMoveFailures(data, failures, { serverOrigin, projectId, now = Date.now() } = {}) {
  const queue = ensureLiveQueue(data);
  const origin = normalizedOrigin(serverOrigin);
  const project = normalizeId(projectId);
  const messages = new Map((Array.isArray(failures) ? failures : [])
    .map(item => [remoteMoveKey(item), String(item?.error || '').trim().slice(0, 500)])
    .filter(([key, message]) => key && message));
  let updated = 0;
  for (const item of queue.pendingMoves) {
    const error = messages.get(remoteMoveKey(item));
    if (error && sameOrigin(item.serverOrigin, origin) && item.projectId === project) {
      item.lastError = error;
      item.lastAttemptAt = now;
      updated += 1;
    }
  }
  return updated;
}

function queueAssetsForLiveSync(data, assets, { now = Date.now() } = {}) {
  const queue = ensureLiveQueue(data);
  const byAssetId = new Map(queue.pendingUploads.map(item => [item.assetId, item]));
  let queued = 0;
  for (const asset of Array.isArray(assets) ? assets : []) {
    if (!asset?.id || asset?.importSource?.provider === 'AI Flow') continue;
    const target = folderTarget(data, asset.folderId);
    if (!target?.liveSync) continue;
    const record = {
      assetId: String(asset.id),
      localFolderId: target.localFolderId,
      rootFolderId: target.rootFolderId,
      serverOrigin: target.serverOrigin,
      projectId: target.projectId,
      remoteFolderId: target.remoteFolderId,
      queuedAt: now,
      // A new local file (or a re-import) deserves a fresh attempt. Do not
      // keep an old server failure badge after the user has changed it.
      lastError: '',
      lastAttemptAt: 0,
      retryCount: 0,
      nextAttemptAt: 0,
    };
    if (!byAssetId.has(record.assetId)) queued += 1;
    byAssetId.set(record.assetId, record);
  }
  queue.pendingUploads = [...byAssetId.values()].slice(-MAX_PENDING_UPLOADS);
  return queued;
}

function removePendingLiveUploads(data, assetIds) {
  const queue = ensureLiveQueue(data);
  const removed = new Set((Array.isArray(assetIds) ? assetIds : []).map(id => String(id || '')).filter(Boolean));
  const before = queue.pendingUploads.length;
  queue.pendingUploads = queue.pendingUploads.filter(item => !removed.has(item.assetId));
  return before - queue.pendingUploads.length;
}

function recordLiveUploadFailures(data, failures, { serverOrigin, projectId, now = Date.now() } = {}) {
  const queue = ensureLiveQueue(data);
  const origin = normalizedOrigin(serverOrigin);
  const project = normalizeId(projectId);
  const messages = new Map((Array.isArray(failures) ? failures : [])
    .map(item => [String(item?.assetId || '').trim(), String(item?.error || '').trim().slice(0, 500)])
    .filter(([assetId, message]) => assetId && message));
  let updated = 0;
  let nextRetryAt = 0;
  for (const item of queue.pendingUploads) {
    const error = messages.get(item.assetId);
    if (!error || !sameOrigin(item.serverOrigin, origin) || item.projectId !== project) continue;
    item.lastError = error;
    item.lastAttemptAt = now;
    item.retryCount = Math.min(10, nonNegativeInteger(item.retryCount, 10) + 1);
    item.nextAttemptAt = now + liveUploadRetryDelay(item.retryCount);
    nextRetryAt = !nextRetryAt ? item.nextAttemptAt : Math.min(nextRetryAt, item.nextAttemptAt);
    updated += 1;
  }
  return { updated, nextRetryAt };
}

function pendingLiveUploadsForPage(data, { serverOrigin, projectId }) {
  const queue = ensureLiveQueue(data);
  const assetsById = new Map((data?.assets || []).map(asset => [String(asset.id), asset]));
  const origin = normalizedOrigin(serverOrigin);
  const project = normalizeId(projectId);
  const retained = [];
  const selected = [];
  for (const record of queue.pendingUploads) {
    const asset = assetsById.get(record.assetId);
    const target = asset ? folderTarget(data, asset.folderId) : null;
    if (!asset || !target?.liveSync || target.rootFolderId !== record.rootFolderId) continue;
    const refreshed = {
      ...record,
      localFolderId: target.localFolderId,
      serverOrigin: target.serverOrigin,
      projectId: target.projectId,
      remoteFolderId: target.remoteFolderId,
    };
    retained.push(refreshed);
    if (origin && project && sameOrigin(target.serverOrigin, origin) && target.projectId === project) {
      selected.push({ asset, target: refreshed });
    }
  }
  queue.pendingUploads = retained;
  return selected;
}

function nextLiveUploadRetryAt(items, { now = Date.now() } = {}) {
  return (Array.isArray(items) ? items : [])
    .map(item => liveUploadReadyAt(item?.target || item))
    .filter(value => value > now)
    .reduce((earliest, value) => (!earliest ? value : Math.min(earliest, value)), 0);
}

function prioritizedLiveUploads(items, { now = Date.now(), includeDeferred = false } = {}) {
  return (Array.isArray(items) ? items : [])
    .filter(item => includeDeferred || liveUploadReadyAt(item?.target || item) <= now)
    .slice()
    .sort(compareLiveUploadPriority);
}

function liveSyncStatusError(value) {
  const message = String(value || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!message || /^(?:undefined|null|\[object Object\])$/i.test(message)) {
    return '同步失败，未返回可用错误信息';
  }
  // Never forward a substratum of the raw error. It may contain an absolute
  // file path, file/data URL, remote ID, server response body, or a filename.
  // Instead expose a small, stable diagnostic category that is safe for the
  // extension popup and still tells the user what to do next.
  const status = message.match(/\b(?:http(?:\s*(?:status|code))?|status|returned|返回)\s*[:=]?\s*([1-5]\d{2})\b/i)?.[1];
  if (status === '401' || status === '403') return `AI Flow 登录状态已失效（HTTP ${status}）`.slice(0, MAX_LIVE_STATUS_ERROR_LENGTH);
  if (status === '413') return '素材超过 AI Flow 的上传限制（HTTP 413）';
  if (status === '429') return 'AI Flow 正在限流，请稍后重试（HTTP 429）';
  if (status && status.startsWith('5')) return `AI Flow 服务暂时不可用（HTTP ${status}）`;
  if (status) return `AI Flow 返回 HTTP ${status}`;
  if (/(?:timeout|timed out|超时)/i.test(message)) return '连接 AI Flow 超时，请检查网络或服务状态';
  if (/(?:network|fetch|econn|连接失败|无法连接|网络)/i.test(message)) return '无法连接 AI Flow，请检查服务地址或网络';
  return 'AI Flow 同步失败，请重试';
}

function statusUploadRecordForPage(data, record, { serverOrigin, projectId }) {
  const assetId = String(record?.assetId || '').trim();
  if (!assetId || !sameOrigin(record?.serverOrigin, serverOrigin) || normalizeId(record?.projectId) !== projectId) return null;
  const asset = (data?.assets || []).find(item => String(item?.id) === assetId);
  const target = asset ? folderTarget(data, asset.folderId) : null;
  if (!target?.liveSync || target.rootFolderId !== String(record?.rootFolderId || '')) return null;
  if (!sameOrigin(target.serverOrigin, serverOrigin) || target.projectId !== projectId) return null;
  return { record, asset };
}

function statusDeleteRecordForPage(record, { serverOrigin, projectId }) {
  if (!normalizeRemoteAssetId(record?.remoteAssetId)) return null;
  if (!sameOrigin(record?.serverOrigin, serverOrigin) || normalizeId(record?.projectId) !== projectId) return null;
  return record;
}

// This deliberately reads the persisted queue directly rather than calling
// ensureLiveQueue() or the plan helpers. A status refresh must neither repair,
// filter, reorder, nor otherwise mutate queued work.
function liveSyncStatusForPage(data, { serverOrigin, projectId }) {
  const origin = normalizedOrigin(serverOrigin);
  const project = normalizeId(projectId);
  const empty = {
    roots: [],
    queue: {
      uploads: 0,
      deletes: 0,
      moves: 0,
      failedUploads: 0,
      failedDeletes: 0,
      failedMoves: 0,
      oldestQueuedAt: 0,
      lastError: '',
    },
  };
  if (!origin || !project) return empty;

  const queue = data?.aiFlowLiveSync && typeof data.aiFlowLiveSync === 'object' ? data.aiFlowLiveSync : {};
  const scope = { serverOrigin: origin, projectId: project };
  const uploads = (Array.isArray(queue.pendingUploads) ? queue.pendingUploads : [])
    .map(record => statusUploadRecordForPage(data, record, scope))
    .filter(Boolean);
  const deletes = (Array.isArray(queue.pendingDeletes) ? queue.pendingDeletes : [])
    .map(record => statusDeleteRecordForPage(record, scope))
    .filter(Boolean);
  const moves = (Array.isArray(queue.pendingMoves) ? queue.pendingMoves : [])
    .filter(record => sameOrigin(record?.serverOrigin, origin) && normalizeId(record?.projectId) === project);
  const uploadRecords = uploads.map(item => item.record);
  const records = [...uploadRecords, ...deletes, ...moves];
  const queuedTimes = records.map(record => Math.max(0, Number(record?.queuedAt) || 0)).filter(Boolean);
  const failures = records
    .filter(record => String(record?.lastError || '').trim())
    .map(record => ({
      error: liveSyncStatusError(record.lastError),
      at: Math.max(0, Number(record?.lastAttemptAt) || 0, Number(record?.queuedAt) || 0),
    }));
  const latestFailure = failures.reduce((latest, current) => (!latest || current.at > latest.at ? current : latest), null);
  const now = Date.now();
  const items = uploads.map(({ record, asset }) => {
    const type = String(asset?.type || '').toLowerCase();
    const kind = type.startsWith('image/') ? 'image' : type.startsWith('video/') ? 'video' : type.startsWith('audio/') ? 'audio' : 'file';
    const nextAttemptAt = liveUploadReadyAt(record);
    return {
      assetId: String(record.assetId),
      name: String(asset?.name || asset?.originalName || '未命名素材').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 120),
      kind,
      size: Math.max(0, Number(asset?.size) || 0),
      queuedAt: Math.max(0, Number(record.queuedAt) || 0),
      retryCount: nonNegativeInteger(record.retryCount, 10),
      nextAttemptAt,
      state: nextAttemptAt > now ? 'retry-wait' : String(record.lastError || '').trim() ? 'failed' : 'queued',
    };
  }).sort((left, right) => {
    const sizeDelta = left.size - right.size;
    if (sizeDelta) return sizeDelta;
    const queuedDelta = left.queuedAt - right.queuedAt;
    if (queuedDelta) return queuedDelta;
    return left.assetId.localeCompare(right.assetId);
  }).slice(0, MAX_LIVE_STATUS_ITEMS);

  return {
    // Root names are useful in the popup but do not disclose local paths or
    // bridge-only folder identifiers.
    roots: liveSyncRootsForPage(data, scope).map(root => ({ name: root.folderName })),
    queue: {
      uploads: uploadRecords.length,
      deletes: deletes.length,
      moves: moves.length,
      failedUploads: uploadRecords.filter(record => String(record?.lastError || '').trim()).length,
      failedDeletes: deletes.filter(record => String(record?.lastError || '').trim()).length,
      failedMoves: moves.filter(record => String(record?.lastError || '').trim()).length,
      oldestQueuedAt: queuedTimes.length ? Math.min(...queuedTimes) : 0,
      lastError: latestFailure?.error || '',
      nextRetryAt: nextLiveUploadRetryAt(uploadRecords, { now }),
      items,
    },
  };
}

function setRootLiveSync(data, folderId, enabled, { now = Date.now() } = {}) {
  const folder = (data?.folders || []).find(item => String(item.id) === String(folderId || ''));
  const link = safeRootLink(folder);
  if (!folder || !link) throw new Error('请在“同步目录和素材”时选定的本地根文件夹上开启实时同步');
  folder.aiFlowRootSync = {
    ...folder.aiFlowRootSync,
    ...link,
    liveSync: Boolean(enabled),
    liveSyncDisabledByUser: !enabled,
    syncedAt: now,
  };
  return { folder, enabled: Boolean(enabled) };
}

function liveSyncRootsForPage(data, { serverOrigin, projectId }) {
  const origin = normalizedOrigin(serverOrigin);
  const project = normalizeId(projectId);
  if (!origin || !project) return [];
  return (data?.folders || []).flatMap(folder => {
    const link = safeRootLink(folder);
    if (!link?.liveSync || !sameOrigin(link.serverOrigin, origin) || link.projectId !== project) return [];
    return [{ folderId: String(folder.id), folderName: String(folder.name || '同步根目录') }];
  });
}

function folderAssetsForUpload(data, folderId) {
  const target = folderTarget(data, folderId);
  if (!target) throw new Error('此文件夹尚未与 AI Flow 对应，请先在网页执行“同步目录和素材”');
  const ids = collectFolderSubtreeIds(data?.folders || [], String(folderId || ''));
  const assets = [];
  const skipped = [];
  for (const asset of data?.assets || []) {
    if (!ids.has(asset.folderId)) continue;
    if (asset?.importSource?.provider === 'AI Flow') continue;
    const destination = folderTarget(data, asset.folderId);
    if (!destination || destination.rootFolderId !== target.rootFolderId) {
      skipped.push(String(asset.name || '未命名素材'));
      continue;
    }
    assets.push({ asset, target: destination });
  }
  return { target, assets, skipped };
}

module.exports = {
  LIVE_SYNC_VERSION,
  MAX_PENDING_UPLOADS,
  MAX_PENDING_DELETES,
  MAX_PENDING_MOVES,
  LIVE_UPLOAD_RETRY_BASE_MS,
  LIVE_UPLOAD_RETRY_MAX_MS,
  normalizedOrigin,
  safeRootLink,
  safeFolderLink,
  folderTarget,
  ensureLiveQueue,
  queueAssetsForLiveSync,
  queueRemoteDeletes,
  queueRemoteMoves,
  removePendingLiveUploads,
  recordLiveUploadFailures,
  pendingLiveUploadsForPage,
  prioritizedLiveUploads,
  nextLiveUploadRetryAt,
  liveSyncStatusForPage,
  pendingRemoteDeletesForPage,
  pendingRemoteMovesForPage,
  removePendingRemoteDeletes,
  removePendingRemoteMoves,
  recordRemoteDeleteFailures,
  recordRemoteMoveFailures,
  setRootLiveSync,
  liveSyncRootsForPage,
  folderAssetsForUpload,
};
