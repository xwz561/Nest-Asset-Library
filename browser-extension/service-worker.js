importScripts('config.js');

const IMAGE_MENU_ID = 'save-image-to-nest';
const AIFLOW_VIDEO_MENU_ID = 'save-aiflow-video-to-nest';
const AIFLOW_ASSET_LINK_MENU_ID = 'link-aiflow-asset-to-nest';
const AIFLOW_FOLDER_SYNC_ACTION = 'sync-aiflow-folder';
const AIFLOW_FOLDER_DIFF_ACTION = 'preview-aiflow-folder-diff';
const AIFLOW_FOLDER_STRUCTURE_SYNC_ACTION = 'sync-aiflow-folder-structure';
const AIFLOW_FOLDER_STRUCTURE_ONLY_ACTION = 'sync-aiflow-folder-structure-only';
const AIFLOW_UPLOAD_ACTION = 'upload-nest-assets-to-aiflow-folder';
const AIFLOW_LIVE_SYNC_ACTION = 'aiflow-live-sync-tick';
const AIFLOW_REFERENCE_UPLOAD_ACTION = 'aiflow-reference-upload-tick';
const AIFLOW_REFERENCE_ATTACH_ACTION = 'attach-aiflow-uploaded-references';
const AIFLOW_LIBRARY_ASSETS_ACTION = 'aiflow-library-assets';
const AIFLOW_REFERENCE_SELECT_ACTION = 'aiflow-reference-select';
const AIFLOW_STORYBOARD_MATCH_ACTION = 'aiflow-match-storyboard-assets';
const AIFLOW_CONTROL_STATUS_ACTION = 'aiflow-control:get-status';
const AIFLOW_CONTROL_RECONNECT_ACTION = 'aiflow-control:reconnect';
const AIFLOW_CONTROL_RETRY_ACTION = 'aiflow-control:retry';
const AIFLOW_CONTROL_REFRESH_ACTION = 'aiflow-control:refresh';
const AIFLOW_CONTROL_CANCEL_UPLOAD_ACTION = 'aiflow-control:cancel-upload';
const AIFLOW_CONTROL_CONTEXT_ACTION = 'aiflow-control-context';
const AIFLOW_CONTROL_SYNC_NOW_ACTION = 'aiflow-live-sync-now';
const BRIDGE_BASE_URL = 'http://127.0.0.1:32145';
const MAX_AIFLOW_FOLDER_SYNC_ITEMS = 5000;
const LIVE_REMOTE_PULL_INTERVAL_MS = 10 * 1000;
const LIVE_WAKE_RETRY_MS = 1200;
const LIVE_UPLOAD_CONCURRENCY = 2;
let liveSyncRunning = false;
let referenceUploadRunning = false;
let lastLiveRemotePullAt = 0;
let liveRemotePullRunning = false;
let liveWakeRunning = false;
let liveWakeSequence = 0;
let liveWakeContext = null;
let lastLiveFailureMessage = '';
let lastLiveFailureAt = 0;
let lastLiveDeleteFailureMessage = '';
let lastLiveDeleteFailureAt = 0;
let lastLiveMoveFailureMessage = '';
let lastLiveMoveFailureAt = 0;
const liveUploadStates = new Map();
const videoExtendTargets = new Map();

function videoExtendTargetForTab(tabId) {
  const expiresAt = Number(videoExtendTargets.get(Number(tabId)) || 0);
  if (expiresAt <= Date.now()) {
    videoExtendTargets.delete(Number(tabId));
    return false;
  }
  return true;
}

function bridgeKey() {
  return String(globalThis.NEST_BRIDGE_KEY || '');
}

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title,
    message: String(message || '操作未完成'),
  });
}

function notifyLiveUploadFailure(errors) {
  const firstError = Array.isArray(errors) ? errors[0] : '';
  const message = typeof firstError === 'string' ? firstError.trim() : '';
  // Never turn a missing diagnostic into an operating-system notification.
  // Older page callbacks sometimes supplied an undefined array entry, which
  // made Edge repeatedly show a useless "undefined" upload-failed alert.
  if (!message || /^(undefined|null|\[object Object\])$/i.test(message)) return;
  const now = Date.now();
  if (message === lastLiveFailureMessage && now - lastLiveFailureAt < 30 * 1000) return;
  lastLiveFailureMessage = message;
  lastLiveFailureAt = now;
  notify('AI Flow 实时上传失败', message.slice(0, 180));
}

function notifyLiveDeleteFailure(errors) {
  const firstError = Array.isArray(errors) ? errors[0] : '';
  const message = typeof firstError === 'string' ? firstError.trim() : '';
  if (!message || /^(undefined|null|\[object Object\])$/i.test(message)) return;
  const now = Date.now();
  if (message === lastLiveDeleteFailureMessage && now - lastLiveDeleteFailureAt < 30 * 1000) return;
  lastLiveDeleteFailureMessage = message;
  lastLiveDeleteFailureAt = now;
  notify('AI Flow 实时删除失败', message.slice(0, 300));
}

function notifyLiveMoveFailure(errors) {
  const firstError = Array.isArray(errors) ? errors[0] : '';
  const message = typeof firstError === 'string' ? firstError.trim() : '';
  if (!message || /^(undefined|null|\[object Object\])$/i.test(message)) return;
  const now = Date.now();
  if (message === lastLiveMoveFailureMessage && now - lastLiveMoveFailureAt < 30 * 1000) return;
  lastLiveMoveFailureMessage = message;
  lastLiveMoveFailureAt = now;
  notify('AI Flow 素材移动失败', message.slice(0, 300));
}

function installMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: IMAGE_MENU_ID,
      title: '保存图片到小旺仔素材库',
      contexts: ['image'],
    });
    chrome.contextMenus.create({
      id: AIFLOW_VIDEO_MENU_ID,
      title: '复制 AI Flow 视频到小旺仔素材库',
      contexts: ['video'],
    });
    chrome.contextMenus.create({
      id: AIFLOW_ASSET_LINK_MENU_ID,
      title: '确认关联当前小旺仔素材',
      contexts: ['image', 'video', 'link'],
    });
  });
}

function fileNameFromUrl(sourceUrl, fallback = '网页图片') {
  try {
    const fileName = decodeURIComponent(new URL(sourceUrl).pathname.split('/').pop() || '');
    return fileName || fallback;
  } catch {
    return fallback;
  }
}

function isHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function bridgeHeaders(extra = {}) {
  return {
    'x-nest-bridge': bridgeKey(),
    ...extra,
  };
}

function imageFailureMessage(error) {
  const message = String(error?.message || '').trim();
  if (/failed to fetch|networkerror/i.test(message)) {
    return '请先启动小旺仔素材库并打开资源库';
  }
  return message || '请先启动小旺仔素材库并打开资源库';
}

function aiFlowFailureMessage(error) {
  const message = String(error?.message || '').trim();
  if (/failed to fetch|networkerror/i.test(message)) {
    return '请先启动小旺仔素材库，并确认桌面端已登录 AI Flow';
  }
  if (/登录|log ?in|auth|session|cookie|token|unauthori[sz]ed/i.test(message)) {
    return '请先在桌面端登录 AI Flow 后重试';
  }
  if (/目标文件夹|选定.*文件夹|文件夹.*选定|folder/i.test(message)) {
    return '请先在小旺仔素材库中选定要接收视频的文件夹';
  }
  if (/404|not found/i.test(message)) {
    return '桌面端版本暂不支持 AI Flow 视频采集，请更新并重启小旺仔素材库';
  }
  return message || '请确认桌面端已登录 AI Flow，并已选定目标文件夹';
}

function aiFlowAssetLinkFailureMessage(error) {
  const message = String(error?.message || '').trim();
  if (/failed to fetch|networkerror/i.test(message)) {
    return '请先启动小旺仔素材库并打开资源库';
  }
  if (/没有待确认|过期|准备关联/i.test(message)) {
    return '请先在小旺仔素材详情中点击“准备关联 AI Flow 网页素材”';
  }
  if (/当前配置.*AI Flow|AI Flow 网页/i.test(message)) {
    return '请在已配置的 AI Flow 网页中右键确认素材';
  }
  return message || 'AI Flow 素材关联未完成';
}

function aiFlowAssetSyncFailureMessage(error) {
  const message = String(error?.message || '').trim();
  if (/failed to fetch|networkerror/i.test(message)) {
    return '请先启动小旺仔素材库，并在扩展面板重新安装已配对的扩展';
  }
  if (/401|403|登录|auth|session|cookie|unauthori[sz]ed/i.test(message)) {
    return 'AI Flow 网页登录已失效，请刷新网页并重新登录后再试';
  }
  if (/目标文件夹|选定.*素材|资源库已切换|文件夹.*选定/i.test(message)) {
    return '请先在小旺仔素材库左侧选定接收素材的文件夹';
  }
  return message || 'AI Flow 服务器素材同步失败';
}

function aiFlowUploadFailureMessage(error) {
  const message = String(error?.message || '').trim();
  if (/failed to fetch|networkerror/i.test(message)) return '请先启动小旺仔素材库，并在扩展面板重新安装已配对的扩展';
  if (/401|403|登录|auth|session|cookie|unauthori[sz]ed/i.test(message)) return 'AI Flow 网页登录已失效，请刷新网页并重新登录后再试';
  if (/上传准备|待上传|过期|重新右键/.test(message)) return '请先在小旺仔素材库中右键素材，选择“上传到 AI Flow”并确认';
  return message || '上传到 AI Flow 失败';
}

function nestBridgeUnavailableError(error) {
  const bridgeError = new Error(`小旺仔素材库已关闭：${String(error?.message || error || '本地连接不可用')}`);
  bridgeError.code = 'NEST_BRIDGE_UNAVAILABLE';
  return bridgeError;
}

function isNestBridgeUnavailable(error) {
  return error?.code === 'NEST_BRIDGE_UNAVAILABLE'
    || /请先启动小旺仔素材库并打开资源库|请先打开资源库|当前没有.*素材库|素材库正在删除/.test(String(error?.message || ''));
}

async function fetchNestBridge(path, options) {
  try {
    return await fetch(`${BRIDGE_BASE_URL}${path}`, options);
  } catch (error) {
    throw nestBridgeUnavailableError(error);
  }
}

async function readLibraryAssetsForVideoExtend(folderId = '') {
  const response = await fetchNestBridge('/aiflow-library-assets', {
    method: 'POST', headers: bridgeHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ folderId: String(folderId || '') }), signal: AbortSignal.timeout(15000),
  });
  const result = await readResponse(response);
  if (!response.ok) throw new Error(result.error || '读取素材库失败');
  return { ok: true, ...result, assets: Array.isArray(result.assets) ? result.assets : [], folders: Array.isArray(result.folders) ? result.folders : [] };
}

async function addLibraryAssetToVideoExtend(message, tabId) {
  const page = safeAIFlowPage(message?.pageUrl);
  const projectId = numericId(message?.projectId, 'AI Flow 项目 ID');
  const assetIds = [...new Set((Array.isArray(message?.assetIds) ? message.assetIds : [message?.assetId])
    .map(id => String(id || '').trim()).filter(Boolean))].slice(0, 8);
  if (!assetIds.length) throw new Error('请先选择一个素材');
  // The regular three-second reference poll can wake while this request is
  // uploading. Keep that poll on the video-extend route too, never global refs.
  videoExtendTargets.set(Number(tabId), Date.now() + 2 * 60 * 1000);
  const response = await fetchNestBridge('/aiflow-reference-select', {
    method: 'POST',
    headers: bridgeHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ pageUrl: page.href, projectId, assetIds }),
  });
  const prepared = await readResponse(response);
  if (!response.ok) throw new Error(prepared.error || '准备延长参考素材失败');
  const result = await runAIFlowReferenceUpload({ pageUrl: page.href, projectId, folderId: '' }, { tabId, target: 'video-extend' });
  // The attachment result is indexed by AI Flow's remote ID, whereas the
  // page card is indexed by the local library asset ID. Re-key the one exact
  // token for the caller so the page can write it at the saved prompt caret
  // immediately instead of waiting for a fragile DOM re-scan.
  const localAssetId = assetIds.length === 1 ? assetIds[0] : '';
  const referenceToken = exactVideoExtendReferenceTokenFromResult(result);
  if (!localAssetId || !referenceToken) return result;
  return {
    ...result,
    referenceTokens: {
      ...(result?.referenceTokens || {}),
      [localAssetId]: referenceToken,
    },
  };
}

function exactVideoExtendReferenceTokenFromResult(result) {
  const tokens = [result?.referenceTokens, result?.attachment?.referenceTokens]
    .flatMap(tokensByAsset => Object.values(tokensByAsset || {}))
    .map(token => String(token || ''))
    .filter(token => /^@(图片|视频|音频)\d+$/.test(token));
  return [...new Set(tokens)].length === 1 ? tokens[0] : '';
}

async function autoMatchStoryboardAssetsForVideoExtend(message, tabId) {
  const page = safeAIFlowPage(message?.pageUrl);
  const projectId = numericId(message?.projectId, 'AI Flow 项目 ID');
  const names = [...new Set((Array.isArray(message?.names) ? message.names : [])
    .map(name => String(name || '').trim()).filter(Boolean))].slice(0, 24);
  const response = await fetchNestBridge('/aiflow-match-storyboard-assets', {
    method: 'POST', headers: bridgeHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ pageUrl: page.href, projectId, names }),
  });
  const matched = await readResponse(response);
  if (!response.ok) throw new Error(matched.error || '自动匹配失败');
  const candidates = Array.isArray(matched.assets) ? matched.assets : [];
  if (!candidates.length) return { ok: false, matched: 0, error: '素材库中没有匹配到分镜人物' };
  // Attach one candidate at a time. That lets the page return the exact
  // AI Flow token for this person instead of pairing names and image numbers
  // by list order.
  const matchingAssets = [];
  const errors = [];
  for (const asset of candidates) {
    try {
      const added = await addLibraryAssetToVideoExtend({ pageUrl: page.href, projectId, assetId: asset.id }, tabId);
      matchingAssets.push({ ...asset, referenceToken: exactVideoExtendReferenceTokenFromResult(added) });
    } catch (error) {
      matchingAssets.push({ ...asset, referenceToken: '' });
      errors.push(String(error?.message || error).slice(0, 160));
    }
  }
  return { ok: true, matched: matchingAssets.length, names: matched.names || names, matchingAssets, errors };
}

async function saveImage(info) {
  if (!info.srcUrl) return;

  const image = await fetch(info.srcUrl, {
    credentials: 'include',
    cache: 'no-cache',
  });
  if (!image.ok) {
    throw new Error(`网页图片读取失败 (${image.status})`);
  }

  const blob = await image.blob();
  if (!blob.type.startsWith('image/')) {
    throw new Error(`该内容不是图片 (${blob.type || '未知格式'})`);
  }

  const name = fileNameFromUrl(info.srcUrl);
  const response = await fetch(`${BRIDGE_BASE_URL}/clip-data`, {
    method: 'POST',
    headers: bridgeHeaders({
      'content-type': blob.type,
      'x-nest-name': encodeURIComponent(name),
    }),
    body: blob,
  });
  const result = await readResponse(response);
  if (!response.ok) {
    throw new Error(result.error || result.message || `保存失败 (${response.status})`);
  }

  notify(
    '小旺仔素材库',
    result.duplicates ? '该图片已存在，已跳过' : '图片已保存到小旺仔素材库',
  );
}

async function copyAIFlowVideo(info) {
  const sourceUrl = String(info.srcUrl || '');
  if (!isHttpUrl(sourceUrl)) {
    notify('AI Flow 视频采集失败', 'AI Flow 视频地址无法识别，请在视频画面上右键');
    return;
  }

  const response = await fetch(`${BRIDGE_BASE_URL}/aiflow-video`, {
    method: 'POST',
    headers: bridgeHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({
      srcUrl: sourceUrl,
      pageUrl: String(info.pageUrl || ''),
    }),
  });
  const result = await readResponse(response);
  if (!response.ok) {
    throw new Error(result.error || result.message || `复制失败 (${response.status})`);
  }

  const folderName = String(result.folderName || '选定文件夹');
  const duplicates = Number(result.duplicates || 0);
  notify(
    '小旺仔素材库',
    duplicates > 0
      ? `AI Flow 视频已存在于“${folderName}”，已跳过`
      : `AI Flow 视频已复制到“${folderName}”`,
  );
}

async function confirmAIFlowAssetLink(info) {
  const sourceUrl = String(info.srcUrl || info.linkUrl || '');
  const pageUrl = String(info.pageUrl || '');
  if (!isHttpUrl(sourceUrl) || !isHttpUrl(pageUrl)) {
    throw new Error('请在 AI Flow 网页素材的图片、视频或链接上右键');
  }
  const response = await fetch(`${BRIDGE_BASE_URL}/aiflow-asset-link`, {
    method: 'POST',
    headers: bridgeHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({
      pageUrl,
      remote: {
        kind: String(info.mediaType || (info.srcUrl ? 'image' : 'link')),
        srcUrl: String(info.srcUrl || ''),
        linkUrl: String(info.linkUrl || ''),
        label: fileNameFromUrl(sourceUrl, 'AI Flow 网页素材'),
      },
    }),
  });
  const result = await readResponse(response);
  if (!response.ok) {
    throw new Error(result.error || result.message || `关联失败 (${response.status})`);
  }
  notify('小旺仔素材库', result.message || 'AI Flow 网页素材已关联');
}

function safeAIFlowPage(pageUrl) {
  const page = new URL(String(pageUrl || ''));
  if (!['http:', 'https:'].includes(page.protocol)) throw new Error('AI Flow 网页地址无效');
  return page;
}

function numericId(value, label, { optional = false } = {}) {
  const id = String(value || '').trim();
  if (!id && optional) return '';
  if (!/^\d{1,18}$/.test(id)) throw new Error(`${label}无效，请在 AI Flow 的素材文件夹内重试`);
  return id;
}

function compactControlLabel(value, fallback = '') {
  return String(value || fallback).trim().replace(/\s+/g, ' ').slice(0, 120);
}

function controlFailureMessage(error) {
  const message = String(error?.message || error || '').trim();
  if (/公共资产包/.test(message)) return message;
  if (/资源库|文件夹|AI Flow 项目 ID|AI Flow 网页/.test(message)) return message;
  return aiFlowAssetSyncFailureMessage(error);
}

function controlQueueCount(queue, key) {
  return Math.max(0, Number(queue?.[key]) || 0);
}

function controlAssetId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : '';
}

function controlPageOrigin(value) {
  try {
    const page = new URL(String(value || ''));
    return ['http:', 'https:'].includes(page.protocol) ? page.origin : '';
  } catch {
    return '';
  }
}

function controlAssetKind(value) {
  const kind = String(value || '').toLowerCase();
  return ['image', 'video', 'audio', 'file'].includes(kind) ? kind : 'file';
}

function liveUploadStateForScope(assetId, { serverOrigin = '', projectId = '' } = {}) {
  const active = liveUploadStates.get(assetId);
  if (!active) return null;
  const origin = controlPageOrigin(serverOrigin);
  const project = String(projectId || '').trim();
  if (origin && active.serverOrigin && active.serverOrigin !== origin) return null;
  if (project && active.projectId && active.projectId !== project) return null;
  return active;
}

function setLiveUploadState(asset, stage, { serverOrigin = '', projectId = '' } = {}) {
  const assetId = controlAssetId(asset?.id || asset?.assetId);
  if (!assetId) return;
  const existing = liveUploadStates.get(assetId);
  liveUploadStates.set(assetId, {
    stage: ['reading', 'uploading', 'confirming'].includes(stage) ? stage : 'reading',
    startedAt: Math.max(0, Number(existing?.startedAt) || 0) || Date.now(),
    serverOrigin: controlPageOrigin(serverOrigin),
    projectId: String(projectId || '').trim(),
    name: compactControlLabel(asset?.name, '正在上传的素材'),
    kind: controlAssetKind(asset?.kind || asset?.type),
    size: Math.max(0, Number(asset?.size) || 0),
    queuedAt: Math.max(0, Number(asset?.queuedAt) || 0),
  });
}

function clearLiveUploadState(asset) {
  const assetId = controlAssetId(asset?.id || asset?.assetId || asset);
  if (assetId) liveUploadStates.delete(assetId);
}

function normalizeAIFlowControlQueueItems(queue, scope = {}) {
  const now = Date.now();
  const items = (Array.isArray(queue?.items) ? queue.items : []).map(item => {
    const assetId = controlAssetId(item?.assetId);
    if (!assetId) return null;
    const active = liveUploadStateForScope(assetId, scope);
    const fallbackState = String(item?.state || '') === 'retry-wait'
      ? 'retry-wait'
      : String(item?.state || '') === 'failed' ? 'failed' : 'queued';
    const startedAt = Math.max(0, Number(active?.startedAt) || 0);
    return {
      assetId,
      name: compactControlLabel(item?.name, '未命名素材'),
      kind: ['image', 'video', 'audio', 'file'].includes(String(item?.kind || '')) ? String(item.kind) : 'file',
      size: Math.max(0, Number(item?.size) || 0),
      queuedAt: Math.max(0, Number(item?.queuedAt) || 0),
      retryCount: Math.max(0, Number(item?.retryCount) || 0),
      nextAttemptAt: Math.max(0, Number(item?.nextAttemptAt) || 0),
      state: active?.stage || fallbackState,
      startedAt,
      elapsedMs: startedAt ? Math.max(0, now - startedAt) : 0,
    };
  }).filter(Boolean);
  const known = new Set(items.map(item => item.assetId));
  const scopeOrigin = controlPageOrigin(scope?.serverOrigin);
  const scopeProjectId = String(scope?.projectId || '').trim();
  for (const [assetId, active] of liveUploadStates) {
    if (known.has(assetId)) continue;
    if (scopeOrigin && active.serverOrigin && active.serverOrigin !== scopeOrigin) continue;
    if (scopeProjectId && active.projectId && active.projectId !== scopeProjectId) continue;
    const startedAt = Math.max(0, Number(active?.startedAt) || 0);
    items.push({
      assetId,
      name: compactControlLabel(active?.name, '正在上传的素材'),
      kind: controlAssetKind(active?.kind),
      size: Math.max(0, Number(active?.size) || 0),
      queuedAt: Math.max(0, Number(active?.queuedAt) || 0),
      retryCount: 0,
      nextAttemptAt: 0,
      state: active?.stage || 'reading',
      startedAt,
      elapsedMs: startedAt ? Math.max(0, now - startedAt) : 0,
    });
  }
  return items.sort((left, right) => {
    const leftActive = ['reading', 'uploading', 'confirming'].includes(left.state) ? 0 : 1;
    const rightActive = ['reading', 'uploading', 'confirming'].includes(right.state) ? 0 : 1;
    if (leftActive !== rightActive) return leftActive - rightActive;
    const queuedDelta = left.queuedAt - right.queuedAt;
    if (queuedDelta) return queuedDelta;
    return left.assetId.localeCompare(right.assetId);
  }).slice(0, 8);
}

function normalizeAIFlowControlStatus(context, result) {
  const queue = result && typeof result.queue === 'object' ? result.queue : {};
  const failed = controlQueueCount(queue, 'failedUploads') + controlQueueCount(queue, 'failedDeletes') + controlQueueCount(queue, 'failedMoves');
  const lastError = compactControlLabel(queue.lastError, '');
  const items = normalizeAIFlowControlQueueItems(queue, {
    serverOrigin: context?.pageUrl,
    projectId: context?.projectId,
  });
  return {
    connection: {
      state: 'connected',
      label: '已连接',
      detail: '当前 AI Flow 页面与小旺仔本机桥接已验证',
    },
    project: {
      id: context.projectId,
      name: compactControlLabel(context.projectName, `项目 ${context.projectId}`),
    },
    folder: {
      id: context.folderId,
      name: compactControlLabel(context.folderName, '我的素材'),
    },
    queue: {
      uploads: controlQueueCount(queue, 'uploads'),
      deletes: controlQueueCount(queue, 'deletes'),
      moves: controlQueueCount(queue, 'moves'),
      references: controlQueueCount(queue, 'references'),
      failed,
      running: liveSyncRunning,
      active: items.filter(item => ['reading', 'uploading', 'confirming'].includes(item.state)).length,
      oldestQueuedAt: Math.max(0, Number(queue.oldestQueuedAt) || 0),
      nextRetryAt: Math.max(0, Number(queue.nextRetryAt) || 0),
      items,
    },
    error: lastError ? { message: lastError, count: failed } : null,
    updatedAt: Number(result?.updatedAt) || Date.now(),
  };
}

async function currentAIFlowControlContext() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = Array.isArray(tabs) ? tabs.find(candidate => Number.isInteger(Number(candidate?.id))) : null;
  if (!tab) throw new Error('请先切换到已打开的 AI Flow 素材页面');
  let context;
  try {
    context = await chrome.tabs.sendMessage(Number(tab.id), { action: AIFLOW_CONTROL_CONTEXT_ACTION });
  } catch (error) {
    throw new Error(/receiving end/i.test(String(error?.message || error))
      ? '当前页面不是已打开素材库的 AI Flow 页面，请刷新后重试'
      : String(error?.message || error));
  }
  if (!context?.workspace) throw new Error('当前页面不是已打开素材库的 AI Flow 页面');
  if (context?.sharedLibrary) throw new Error('公共资产包不支持实时同步，请打开“我的素材”中的文件夹');
  if (!context?.ok) throw new Error(String(context?.error || '请在 AI Flow 的“我的素材”中打开具体文件夹'));
  const page = safeAIFlowPage(context.pageUrl);
  const projectId = numericId(context.projectId, 'AI Flow 项目 ID');
  const folderId = numericId(context.folderId, 'AI Flow 文件夹 ID', { optional: true });
  return {
    tabId: Number(tab.id),
    page,
    projectId,
    folderId,
    projectName: compactControlLabel(context.projectName, `项目 ${projectId}`),
    folderName: compactControlLabel(context.folderName, '我的素材'),
  };
}

async function readAIFlowControlStatus(context) {
  const response = await fetch(`${BRIDGE_BASE_URL}/aiflow-live-status`, {
    method: 'POST',
    headers: bridgeHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ pageUrl: context.page.href, projectId: context.projectId }),
  });
  const result = await readResponse(response);
  if (!response.ok || result?.ok === false) {
    throw new Error(result?.error || result?.message || `读取同步状态失败 (${response.status})`);
  }
  return normalizeAIFlowControlStatus(context, result);
}

async function getAIFlowControlStatus() {
  try {
    const context = await currentAIFlowControlContext();
    return { ok: true, status: await readAIFlowControlStatus(context) };
  } catch (error) {
    return { ok: false, error: controlFailureMessage(error) };
  }
}

async function retryAIFlowControlSync() {
  try {
    const context = await currentAIFlowControlContext();
    const status = await readAIFlowControlStatus(context);
    const queued = status.queue.uploads + status.queue.deletes + status.queue.moves + status.queue.references;
    if (!queued) return { ok: false, error: '当前没有待重试的同步任务', status };
    if (liveSyncRunning) return { ok: true, skipped: true, message: '同步正在进行中', status };
    const result = await chrome.tabs.sendMessage(context.tabId, { action: AIFLOW_CONTROL_SYNC_NOW_ACTION, forceRetry: true });
    if (!result?.ok) return { ok: false, error: String(result?.error || '无法重新触发同步'), status };
    return { ok: true, skipped: Boolean(result.skipped), message: result.skipped ? '同步正在进行中' : '已重新触发同步', status };
  } catch (error) {
    return { ok: false, error: controlFailureMessage(error) };
  }
}

async function refreshAIFlowControlPage() {
  try {
    const context = await currentAIFlowControlContext();
    await chrome.tabs.reload(context.tabId);
    return { ok: true, message: '已刷新当前 AI Flow 页面' };
  } catch (error) {
    return { ok: false, error: controlFailureMessage(error) };
  }
}

async function cancelAIFlowControlUpload(assetId) {
  const id = controlAssetId(assetId);
  if (!id) return { ok: false, error: '待取消的素材无效' };
  if (liveUploadStates.has(id)) {
    return { ok: false, error: '该素材正在传输，当前版本仅支持取消尚未开始的上传项' };
  }
  try {
    const context = await currentAIFlowControlContext();
    const response = await fetch(`${BRIDGE_BASE_URL}/aiflow-live-upload-cancel`, {
      method: 'POST',
      headers: bridgeHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ pageUrl: context.page.href, projectId: context.projectId, assetId: id }),
    });
    const result = await readResponse(response);
    if (!response.ok || result?.ok === false) {
      throw new Error(result?.error || result?.message || `取消待上传素材失败 (${response.status})`);
    }
    const status = await readAIFlowControlStatus(context);
    return { ok: true, message: compactControlLabel(result?.message, '已取消尚未开始的上传任务'), status };
  } catch (error) {
    return { ok: false, error: controlFailureMessage(error) };
  }
}

function sameFolder(left, right) {
  const a = left == null || left === '' ? '' : String(left);
  const b = right == null || right === '' ? '' : String(right);
  return a === b;
}

async function verifyCurrentFolderRequest(message, sender) {
  const tabId = Number(sender?.tab?.id);
  if (!Number.isInteger(tabId) || tabId < 0) {
    throw new Error('请在已打开的 AI Flow 素材页面中重新执行同步前检查');
  }
  let context;
  try {
    context = await chrome.tabs.sendMessage(tabId, { action: AIFLOW_CONTROL_CONTEXT_ACTION });
  } catch {
    throw new Error('AI Flow 页面状态已变化，请刷新页面后重新执行同步前检查');
  }
  if (!context?.workspace || context?.sharedLibrary || !context?.ok) {
    throw new Error(String(context?.error || '请在“我的素材”中的有效文件夹执行同步前检查'));
  }
  const page = safeAIFlowPage(context.pageUrl);
  const requestedPage = safeAIFlowPage(message?.pageUrl);
  const projectId = numericId(context.projectId, 'AI Flow 项目 ID');
  const folderId = numericId(context.folderId, 'AI Flow 文件夹 ID', { optional: true });
  const requestedProjectId = numericId(message?.projectId, 'AI Flow 项目 ID');
  const requestedFolderId = numericId(message?.folderId, 'AI Flow 文件夹 ID', { optional: true });
  if (page.origin !== requestedPage.origin || projectId !== requestedProjectId || !sameFolder(folderId, requestedFolderId)) {
    throw new Error('AI Flow 项目或文件夹已切换，未继续同步');
  }
  return { tabId, page, projectId, folderId };
}

async function listAIFlowAssets(page, projectId) {
  const listUrl = new URL('/auth/assets', page.origin);
  if (projectId) listUrl.searchParams.set('projectId', projectId);
  const response = await fetch(listUrl, { credentials: 'include', cache: 'no-cache' });
  if (!response.ok) throw new Error(`读取 AI Flow 服务器素材失败 (${response.status})`);
  const listing = await response.json();
  return {
    items: Array.isArray(listing?.items) ? listing.items : [],
    folders: Array.isArray(listing?.folders) ? listing.folders : [],
  };
}

function fallbackMimeForAsset(asset) {
  const name = String(asset?.name || '').toLowerCase();
  const extension = name.slice(name.lastIndexOf('.'));
  const byExtension = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
    '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.bmp': 'image/bmp',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.aac': 'audio/aac',
    '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.opus': 'audio/opus', '.wma': 'audio/x-ms-wma',
  };
  return byExtension[extension] || (asset?.type === 'video' ? 'video/mp4' : asset?.type === 'audio' ? 'audio/mpeg' : 'image/png');
}

async function resolveAIFlowFolderTarget(page, projectId, folderId) {
  const response = await fetch(`${BRIDGE_BASE_URL}/aiflow-folder-target`, {
    method: 'POST',
    headers: bridgeHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ pageUrl: page.href, projectId, folderId }),
  });
  const result = await readResponse(response);
  if (!response.ok) throw new Error(result.error || result.message || `AI Flow 文件夹对应读取失败 (${response.status})`);
  const rootFolderId = String(result?.rootFolderId || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(rootFolderId)) throw new Error('AI Flow 文件夹对应无效，请重新执行“同步目录和素材”');
  return {
    rootFolderId,
    targetFolderId: String(result?.targetFolderId || '').trim(),
    targetFolderName: String(result?.targetFolderName || '').trim(),
  };
}

async function previewAIFlowFolderDiff(message, sender) {
  const verified = await verifyCurrentFolderRequest(message, sender);
  const { page, projectId, folderId } = verified;
  const { folders, items } = await listAIFlowAssets(page, projectId);
  const hasRequestedFolderId = Object.prototype.hasOwnProperty.call(message || {}, 'folderId');
  let sourceFolderId = hasRequestedFolderId ? folderId : '';
  if (!hasRequestedFolderId) {
    const anchorId = numericId(message?.assetId, 'AI Flow 素材 ID');
    const anchor = items.find(item => String(item?.id || '') === anchorId);
    if (!anchor) throw new Error('当前素材不在 AI Flow 可访问列表中，请刷新页面后重试');
    sourceFolderId = anchor.folderId == null ? '' : String(anchor.folderId);
    if (!sameFolder(folderId, sourceFolderId)) throw new Error('AI Flow 文件夹已切换，未继续同步');
  }
  const sharedFolderIds = new Set(folders.filter(folder => folder?.shared === true).map(folder => String(folder?.id || '')));
  if (message?.sharedLibrary === true || (sourceFolderId && sharedFolderIds.has(sourceFolderId))) {
    throw new Error('公共资产包不支持同步前检查，请打开“我的素材”中的文件夹');
  }
  const records = items
    .filter(item => sameFolder(item?.folderId, sourceFolderId))
    .filter(item => item?.shared !== true)
    .filter(item => !sharedFolderIds.has(String(item?.folderId ?? '')))
    .filter(item => ['image', 'video', 'audio'].includes(String(item?.type || '').toLowerCase()))
    .sort((left, right) => Number(left.id || 0) - Number(right.id || 0));
  if (records.length > MAX_AIFLOW_FOLDER_SYNC_ITEMS) {
    throw new Error(`当前文件夹有 ${records.length} 项素材，单次最多检查 ${MAX_AIFLOW_FOLDER_SYNC_ITEMS} 项`);
  }
  const response = await fetch(`${BRIDGE_BASE_URL}/aiflow-folder-diff-preview`, {
    method: 'POST',
    headers: bridgeHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({
      pageUrl: page.href,
      projectId,
      folderId: sourceFolderId,
      items: records.map(item => ({
        id: String(item?.id || ''),
        name: String(item?.name || `AI Flow 素材 ${item?.id || ''}`).slice(0, 180),
        kind: String(item?.type || '').toLowerCase(),
        size: Number(item?.size ?? item?.fileSize ?? 0) || 0,
      })),
    }),
  });
  const result = await readResponse(response);
  if (!response.ok || result?.ok === false) {
    throw new Error(result?.error || result?.message || `读取同步前差异失败 (${response.status})`);
  }
  return result;
}

async function syncAIFlowFolder(message, sender) {
  const verified = await verifyCurrentFolderRequest(message, sender);
  const { page, projectId, folderId: verifiedFolderId } = verified;
  const { folders, items } = await listAIFlowAssets(page, projectId);
  // New page controls send the actual open folder ID, so an empty folder can
  // be synchronized without requiring a first asset card as an anchor. Keep
  // the old anchor path for previously installed extension page scripts.
  const hasRequestedFolderId = Object.prototype.hasOwnProperty.call(message || {}, 'folderId');
  let folderId = hasRequestedFolderId ? verifiedFolderId : '';
  if (!hasRequestedFolderId) {
    const anchorId = numericId(message?.assetId, 'AI Flow 素材 ID');
    const anchor = items.find(item => String(item?.id || '') === anchorId);
    if (!anchor) throw new Error('当前素材不在 AI Flow 可访问列表中，请刷新页面后重试');
    folderId = anchor.folderId == null ? '' : String(anchor.folderId);
    if (!sameFolder(verifiedFolderId, folderId)) throw new Error('AI Flow 文件夹已切换，未继续同步');
  }
  const sharedFolderIds = new Set(folders.filter(folder => folder?.shared === true).map(folder => String(folder?.id || '')));
  if (message?.sharedLibrary === true || (folderId && sharedFolderIds.has(folderId))) {
    throw new Error('公共资产包不支持同步到小旺仔，请打开“我的素材”中的文件夹');
  }
  // Resolve the paired local root before checking whether the remote folder is
  // empty. Otherwise an unmapped empty folder would look like a successful sync.
  const target = await resolveAIFlowFolderTarget(page, projectId, folderId);
  const records = items
    .filter(item => sameFolder(item?.folderId, folderId))
    .filter(item => item?.shared !== true)
    .filter(item => !sharedFolderIds.has(String(item?.folderId ?? '')))
    .filter(item => ['image', 'video', 'audio'].includes(String(item?.type || '').toLowerCase()))
    .sort((left, right) => Number(left.id || 0) - Number(right.id || 0));
  if (records.length > MAX_AIFLOW_FOLDER_SYNC_ITEMS) {
    throw new Error(`当前文件夹有 ${records.length} 项素材，单次最多同步 ${MAX_AIFLOW_FOLDER_SYNC_ITEMS} 项`);
  }
  if (!records.length) {
    return {
      imported: 0,
      duplicates: 0,
      errors: [],
      total: 0,
      folderName: target.targetFolderName || String(message?.folderName || '当前文件夹'),
      rootFolderId: target.rootFolderId,
      targetFolderId: target.targetFolderId,
      empty: true,
    };
  }
  // Recheck immediately before resolving the local target and downloading any
  // remote bytes. A click from an old page view must never import into a new
  // project/folder the user switched to while the list request was in flight.
  await verifyCurrentFolderRequest(message, sender);
  const copied = await copyAIFlowAssets(page, projectId, records, { rootFolderId: target.rootFolderId });
  return {
    ...copied,
    rootFolderId: target.rootFolderId,
    targetFolderId: target.targetFolderId,
    folderName: copied.folderName || target.targetFolderName,
  };
}

async function copyAIFlowAssets(page, projectId, records, { rootFolderId = '' } = {}) {
  let imported = 0;
  let duplicates = 0;
  let folderName = '';
  const errors = [];
  for (const asset of records) {
    const name = String(asset.name || `AI Flow 素材 ${asset.id}`);
    try {
      const source = new URL(String(asset.localUrl || asset.url || ''), page.origin);
      if (!['http:', 'https:'].includes(source.protocol)) throw new Error('服务器未返回可读取的素材地址');
      const assetResponse = await fetch(source, { credentials: 'include', cache: 'no-cache' });
      if (!assetResponse.ok) throw new Error(`读取失败 (${assetResponse.status})`);
      const blob = await assetResponse.blob();
      if (!blob.size) throw new Error('服务器返回了空素材');
      const response = await fetch(`${BRIDGE_BASE_URL}/aiflow-asset-data`, {
        method: 'POST',
        headers: bridgeHeaders({
          'content-type': blob.type || assetResponse.headers.get('content-type') || fallbackMimeForAsset(asset),
          'x-nest-name': encodeURIComponent(name),
          'x-nest-aiflow-asset-id': String(asset.id),
          'x-nest-aiflow-project-id': projectId,
          'x-nest-aiflow-page': encodeURIComponent(page.origin),
          ...(asset?.folderId == null ? {} : { 'x-nest-aiflow-folder-id': String(asset.folderId) }),
          ...(rootFolderId ? { 'x-nest-aiflow-root-folder-id': rootFolderId } : {}),
        }),
        body: blob,
      });
      const result = await readResponse(response);
      if (!response.ok) throw new Error(result.error || result.message || `导入失败 (${response.status})`);
      imported += Number(result.imported || 0);
      duplicates += Number(result.duplicates || 0);
      folderName = String(result.folderName || folderName);
    } catch (error) {
      errors.push(`${name}: ${String(error?.message || error)}`);
      if (/目标文件夹|选定.*素材|资源库已切换|浏览器采集扩展未配对/.test(String(error?.message || ''))) throw error;
    }
  }
  return { imported, duplicates, errors, total: records.length, folderName };
}

async function syncAIFlowFolderStructure(message) {
  return syncAIFlowLibrary(message);
}

async function establishAIFlowFolderStructure(message) {
  const page = safeAIFlowPage(message?.pageUrl);
  const projectId = numericId(message?.projectId, 'AI Flow 项目 ID');
  const { folders } = await listAIFlowAssets(page, projectId);
  const response = await fetch(`${BRIDGE_BASE_URL}/aiflow-folder-structure`, {
    method: 'POST',
    headers: bridgeHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ pageUrl: page.href, projectId, folders }),
  });
  const structure = await readResponse(response);
  if (!response.ok || structure?.ok === false) throw new Error(structure?.error || structure?.message || `建立目录对应失败 (${response.status})`);
  return structure;
}

async function syncAIFlowLibrary(message) {
  const page = safeAIFlowPage(message?.pageUrl);
  const projectId = numericId(message?.projectId, 'AI Flow 项目 ID');
  const { folders, items } = await listAIFlowAssets(page, projectId);
  const response = await fetch(`${BRIDGE_BASE_URL}/aiflow-folder-structure`, {
    method: 'POST',
    headers: bridgeHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({
      pageUrl: page.href,
      projectId,
      folders,
      targetFolderId: String(message?.targetFolderId || ''),
      live: Boolean(message?.live),
    }),
  });
  const structure = await readResponse(response);
  if (!response.ok) throw new Error(structure.error || structure.message || `目录同步失败 (${response.status})`);
  const sharedFolderIds = new Set(folders.filter(folder => folder?.shared === true).map(folder => String(folder.id || '')));
  // “同步目录和素材” is intentionally folder-scoped. AI Flow also exposes
  // unfiled items at the library root; those have no folderId and must never
  // be pulled into the selected local sync root. Require a known private
  // remote folder as a second guard for malformed/stale server records.
  const privateFolderIds = new Set(folders
    .filter(folder => folder?.shared !== true)
    .map(folder => String(folder?.id ?? '').trim())
    .filter(Boolean));
  const records = items
    .filter(item => privateFolderIds.has(String(item?.folderId ?? '').trim()))
    .filter(item => item?.shared !== true)
    .filter(item => !sharedFolderIds.has(String(item?.folderId ?? '')))
    .filter(item => ['image', 'video', 'audio'].includes(String(item?.type || '').toLowerCase()))
    .sort((left, right) => Number(left.id || 0) - Number(right.id || 0));
  if (records.length > MAX_AIFLOW_FOLDER_SYNC_ITEMS) {
    throw new Error(`AI Flow“我的素材”有 ${records.length} 项素材，单次最多同步 ${MAX_AIFLOW_FOLDER_SYNC_ITEMS} 项`);
  }
  const copied = records.length
    ? await copyAIFlowAssets(page, projectId, records, { rootFolderId: String(structure.targetFolderId || '') })
    : { imported: 0, duplicates: 0, errors: [], total: 0, folderName: structure.folderName || '' };
  return { ...structure, ...copied, folderName: structure.folderName || copied.folderName };
}

async function uploadNestAssetsToAIFlowFolder(message) {
  const page = safeAIFlowPage(message?.pageUrl);
  const projectId = numericId(message?.projectId, 'AI Flow 项目 ID');
  const folderId = numericId(message?.folderId, 'AI Flow 文件夹 ID', { optional: true });
  const planResponse = await fetch(`${BRIDGE_BASE_URL}/aiflow-upload-plan`, {
    method: 'POST',
    headers: bridgeHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ pageUrl: page.href, projectId, folderId }),
  });
  const plan = await readResponse(planResponse);
  if (!planResponse.ok) throw new Error(plan.error || plan.message || `读取待上传素材失败 (${planResponse.status})`);
  if (!Array.isArray(plan.assets) || !plan.assets.length) throw new Error('没有待上传的小旺仔素材');

  return uploadAIFlowPlan(page, plan, { projectId, folderId, folderName: String(message?.folderName || '') });
}

function isAIFlowLiveUploadCancellation(error) {
  const message = String(error?.message || error || '');
  return /不在当前 AI Flow 实时上传队列|上传任务已取消|待取消的素材/.test(message);
}

function shouldAbortAIFlowUploadPlan(error) {
  return /上传准备|待上传|资源库已切换|浏览器采集扩展未配对/.test(String(error?.message || error || ''));
}

async function uploadAIFlowPlanAsset(page, asset, {
  projectId,
  folderId = '',
  dataEndpoint = '/aiflow-upload-data',
  dataPayload = {},
  trackLiveTransfer = false,
  holdLiveStateOnSuccess = false,
} = {}) {
  let succeeded = false;
  try {
    const targetProjectId = numericId(asset?.projectId || projectId, 'AI Flow 项目 ID');
    const targetFolderId = numericId(asset?.targetFolderId ?? folderId, 'AI Flow 文件夹 ID', { optional: true });
    const transferScope = { serverOrigin: page.origin, projectId: targetProjectId };
    const target = new URL('/auth/upload-asset', page.origin);
    target.searchParams.set('projectId', targetProjectId);
    if (targetFolderId) target.searchParams.set('folderId', targetFolderId);
    if (trackLiveTransfer) setLiveUploadState(asset, 'reading', transferScope);
    const sourceResponse = await fetch(`${BRIDGE_BASE_URL}${dataEndpoint}`, {
      method: 'POST',
      headers: bridgeHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ ...dataPayload, assetId: asset.id }),
    });
    if (!sourceResponse.ok) {
      const failure = await readResponse(sourceResponse);
      throw new Error(failure.error || failure.message || `读取本地文件失败 (${sourceResponse.status})`);
    }
    const blob = await sourceResponse.blob();
    if (!blob.size) throw new Error('本地文件为空');
    if (trackLiveTransfer) setLiveUploadState(asset, 'uploading', transferScope);
    const form = new FormData();
    form.append('file', blob, String(asset.name || '小旺仔素材'));
    const uploadResponse = await fetch(target, { method: 'POST', body: form, credentials: 'include' });
    if (trackLiveTransfer) setLiveUploadState(asset, 'confirming', transferScope);
    const uploadResult = await readResponse(uploadResponse);
    if (!uploadResponse.ok || uploadResult?.success === false) {
      throw new Error(uploadResult.error || uploadResult.message || `上传失败 (${uploadResponse.status})`);
    }
    const remote = uploadResult?.asset || uploadResult?.data?.asset || uploadResult?.data || uploadResult;
    const remoteAssetId = String(remote?.id || uploadResult?.assetId || '').trim();
    if (trackLiveTransfer && !/^\d{1,18}$/.test(remoteAssetId)) {
      // A live upload without the authoritative server id cannot be safely
      // associated or deleted later. Keep it in the local queue for a visible,
      // backoff-controlled retry instead of falsely completing the task.
      throw new Error('AI Flow 上传未返回可关联素材 ID，已保留本地同步队列');
    }
    succeeded = true;
    return {
      ok: true,
      asset,
      uploadedAssetId: String(asset.id),
      uploadedAsset: /^\d{1,18}$/.test(remoteAssetId) ? { assetId: String(asset.id), remoteAssetId } : null,
    };
  } catch (error) {
    return {
      ok: false,
      asset,
      error,
      cancelled: trackLiveTransfer && isAIFlowLiveUploadCancellation(error),
      fatal: shouldAbortAIFlowUploadPlan(error),
    };
  } finally {
    if (trackLiveTransfer && (!succeeded || !holdLiveStateOnSuccess)) clearLiveUploadState(asset);
  }
}

async function uploadAIFlowPlan(page, plan, {
  projectId,
  folderId = '',
  folderName = '',
  dataEndpoint = '/aiflow-upload-data',
  dataPayload = {},
  concurrency = 1,
  trackLiveTransfer = false,
  holdLiveStateOnSuccess = false,
  continueOnFatal = false,
} = {}) {
  const assets = Array.isArray(plan?.assets) ? plan.assets : [];
  const results = new Array(assets.length);
  let nextIndex = 0;
  const workers = Math.max(1, Math.min(LIVE_UPLOAD_CONCURRENCY, Math.floor(Number(concurrency) || 1), assets.length || 1));
  const runWorker = async () => {
    while (nextIndex < assets.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await uploadAIFlowPlanAsset(page, assets[index], {
        projectId,
        folderId,
        dataEndpoint,
        dataPayload: { uploadId: plan?.uploadId, ...dataPayload },
        trackLiveTransfer,
        holdLiveStateOnSuccess,
      });
    }
  };
  await Promise.all(Array.from({ length: workers }, runWorker));

  let uploaded = 0;
  const errors = [];
  const failures = [];
  const uploadedAssetIds = [];
  const uploadedAssets = [];
  const cancelledAssetIds = [];
  let fatalError = null;
  for (const result of results) {
    if (!result) continue;
    if (result.ok) {
      uploaded += 1;
      uploadedAssetIds.push(result.uploadedAssetId);
      if (result.uploadedAsset) uploadedAssets.push(result.uploadedAsset);
      continue;
    }
    if (result.cancelled) {
      cancelledAssetIds.push(String(result.asset?.id || ''));
      continue;
    }
    const message = String(result.error?.message || result.error);
    errors.push(`${result.asset?.name || '未命名素材'}: ${message}`);
    failures.push({ assetId: String(result.asset?.id || ''), error: message.slice(0, 500) });
    if (result.fatal && !fatalError) fatalError = result.error;
  }
  if (fatalError && !continueOnFatal) throw fatalError;
  return { uploaded, total: assets.length, errors, failures, uploadedAssetIds, uploadedAssets, cancelledAssetIds, folderName };
}

function normalizeAIFlowReferenceIds(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(id => String(id || '').trim())
    .filter(id => /^\d{1,18}$/.test(id)))];
}

function normalizeAIFlowReferenceAttachResult(result, requestedIds) {
  const ids = normalizeAIFlowReferenceIds(requestedIds);
  const attachedIds = normalizeAIFlowReferenceIds(result?.attachedIds).filter(id => ids.includes(id));
  const referenceTokens = Object.fromEntries(ids.flatMap(id => {
    const token = String(result?.referenceTokens?.[id] || '');
    return /^@(图片|视频|音频)\d+$/.test(token) ? [[id, token]] : [];
  }));
  return {
    ...(result && typeof result === 'object' ? result : {}),
    attached: attachedIds.length,
    attachedIds,
    missing: ids.filter(id => !attachedIds.includes(id)),
    referenceTokens,
  };
}

async function attachAIFlowUploadedReferencesInPageWorld(tabId, remoteAssetIds, projectId) {
  const ids = normalizeAIFlowReferenceIds(remoteAssetIds);
  if (!Number.isInteger(tabId) || tabId < 0 || !ids.length || !chrome.scripting?.executeScript) {
    return { attached: 0, attachedIds: [], missing: ids };
  }
  try {
    const frames = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [ids, String(projectId || '')],
      func: async (requestedIds, activeProjectId) => {
        const cleanIds = [...new Set((Array.isArray(requestedIds) ? requestedIds : [])
          .map(id => String(id || '').trim())
          .filter(id => /^\d{1,18}$/.test(id)))];
        const referenceMode = document.querySelector('.mode-tab[data-mode="reference"]');
        if (referenceMode instanceof HTMLElement && !referenceMode.classList.contains('active')) referenceMode.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        let payload = null;
        try {
          const response = await fetch(`/auth/assets?projectId=${encodeURIComponent(activeProjectId)}`, { credentials: 'include' });
          if (response.ok) payload = await response.json();
        } catch {}
        const assets = Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload?.data?.items)
            ? payload.data.items
            : Array.isArray(payload?.data)
              ? payload.data
              : [];
        const useAsset = typeof window.useAssetFromLibrary === 'function' ? window.useAssetFromLibrary : null;
        if (!useAsset) return { attachedIds: [], missing: cleanIds, error: 'AI Flow 当前页面未提供引用素材入口' };
        const attachedIds = [];
        for (const id of cleanIds) {
          const asset = assets.find(item => String(item?.id || '') === id);
          if (!asset) continue;
          try {
            await Promise.resolve(useAsset(asset));
            attachedIds.push(id);
          } catch {}
        }
        return { attachedIds, missing: cleanIds.filter(id => !attachedIds.includes(id)) };
      },
    });
    const pageResult = frames.find(frame => frame.frameId === 0)?.result || frames[0]?.result;
    return normalizeAIFlowReferenceAttachResult(pageResult, ids);
  } catch (error) {
    return { attached: 0, attachedIds: [], missing: ids, error: String(error?.message || error) };
  }
}

function attachAIFlowUploadedReferencesViaDom(tabId, remoteAssetIds) {
  const ids = normalizeAIFlowReferenceIds(remoteAssetIds);
  if (!Number.isInteger(tabId) || tabId < 0 || !ids.length) return Promise.resolve({ attached: 0, attachedIds: [], missing: ids });
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, { action: AIFLOW_REFERENCE_ATTACH_ACTION, remoteAssetIds: ids }, response => {
      const error = chrome.runtime.lastError;
      if (error) return resolve({ attached: 0, attachedIds: [], missing: ids, error: error.message });
      resolve(normalizeAIFlowReferenceAttachResult(response, ids));
    });
  });
}

async function attachAIFlowVideoExtendReferencesInPageWorld(tabId, remoteAssetIds) {
  const ids = normalizeAIFlowReferenceIds(remoteAssetIds);
  if (!Number.isInteger(tabId) || tabId < 0 || !ids.length || !chrome.scripting?.executeScript) return { attached: 0, attachedIds: [], missing: ids };
  try {
    const frames = await chrome.scripting.executeScript({
      target: { tabId }, world: 'MAIN', args: [ids],
      func: async requestedIds => {
        const cleanIds = [...new Set((Array.isArray(requestedIds) ? requestedIds : []).map(id => String(id || '').trim()).filter(id => /^\d{1,18}$/.test(id)))];
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        const submit = [...document.querySelectorAll('button')].find(button => String(button.textContent || '').trim() === '提交延长');
        let dialog = submit?.parentElement || null;
        while (dialog && !dialog.querySelector('#sd25RefAdd')) dialog = dialog.parentElement;
        const refButton = dialog?.querySelector('#sd25RefAdd');
        if (!dialog || !refButton) return { attachedIds: [], missing: cleanIds, error: '未找到视频延长素材窗口' };
        try { await window._loadAssetLibrary?.(false, true); } catch {}
        const picker = dialog.querySelector('#sd25RefPicker');
        if (picker?.style.display && picker.style.display !== 'none') refButton.click();
        refButton.click();
        await wait(100);
        const exactToken = value => String(value || '').trim().match(/^@(图片|视频|音频)\s*(\d+)$/);
        const referenceTokensInDialog = () => {
          const root = dialog.querySelector('#sd25RefChips');
          if (!root) return [];
          const tokens = new Set();
          for (const node of root.querySelectorAll('[data-ref-token], [data-reference-token], [data-refchip]')) {
            for (const value of [node.getAttribute('data-ref-token'), node.getAttribute('data-reference-token'), node.getAttribute('data-refchip')]) {
              const match = exactToken(value);
              if (match) tokens.add(`@${match[1]}${match[2]}`);
            }
          }
          const walker = document.createTreeWalker(root, 4);
          let textNode = walker.nextNode();
          while (textNode) {
            const match = exactToken(textNode.nodeValue);
            if (match) tokens.add(`@${match[1]}${match[2]}`);
            textNode = walker.nextNode();
          }
          return [...tokens];
        };
        const attachedIds = [];
        const referenceTokens = {};
        for (const id of cleanIds) {
          const beforeTokens = new Set(referenceTokensInDialog());
          const card = dialog.querySelector(`[data-refpick="${id}"]`);
          if (!card) continue;
          card.click();
          // React replaces picker cards after a selection. Yield before the
          // next lookup so each ID is clicked in the current picker tree.
          await wait(90);
          const createdTokens = referenceTokensInDialog().filter(token => !beforeTokens.has(token));
          if (createdTokens.length === 1) referenceTokens[id] = createdTokens[0];
          attachedIds.push(id);
        }
        return { attachedIds, referenceTokens, missing: cleanIds.filter(id => !attachedIds.includes(id)) };
      },
    });
    const result = frames.find(frame => frame.frameId === 0)?.result || frames[0]?.result;
    return normalizeAIFlowReferenceAttachResult(result, ids);
  } catch (error) {
    return { attached: 0, attachedIds: [], missing: ids, error: String(error?.message || error) };
  }
}

async function attachAIFlowUploadedReferences(tabId, remoteAssetIds, projectId, { target = 'global' } = {}) {
  const ids = normalizeAIFlowReferenceIds(remoteAssetIds);
  if (target === 'video-extend') return attachAIFlowVideoExtendReferencesInPageWorld(tabId, ids);
  const direct = await attachAIFlowUploadedReferencesInPageWorld(tabId, ids, projectId);
  if (!direct.missing.length) return direct;
  const fallback = await attachAIFlowUploadedReferencesViaDom(tabId, direct.missing);
  const attachedIds = normalizeAIFlowReferenceIds([...direct.attachedIds, ...fallback.attachedIds]);
  return {
    attached: attachedIds.length,
    attachedIds,
    missing: ids.filter(id => !attachedIds.includes(id)),
    ...(direct.error && fallback.error ? { error: `${direct.error}; ${fallback.error}` } : {}),
  };
}

async function acknowledgeAIFlowReferenceAttachment(page, projectId, attachment, result) {
  const attachmentId = String(attachment?.id || '').trim();
  const attachedAssetIds = normalizeAIFlowReferenceIds(result?.attachedIds);
  if (!attachmentId || !attachedAssetIds.length) return { acknowledged: 0, remaining: Array.isArray(attachment?.remoteAssetIds) ? attachment.remoteAssetIds.length : 0 };
  const response = await fetchNestBridge('/aiflow-reference-attach-complete', {
    method: 'POST',
    headers: bridgeHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ pageUrl: page.href, projectId, attachmentId, attachedAssetIds }),
  });
  const payload = await readResponse(response);
  if (!response.ok) throw new Error(payload.error || payload.message || '本地引用加入状态未能确认');
  return payload;
}

async function runAIFlowReferenceUpload(message, { tabId = -1, target = 'global' } = {}) {
  const page = safeAIFlowPage(message?.pageUrl);
  const projectId = numericId(message?.projectId, 'AI Flow 项目 ID');
  const folderId = numericId(message?.folderId, 'AI Flow 文件夹 ID', { optional: true });
  const planResponse = await fetchNestBridge('/aiflow-reference-upload-plan', {
    method: 'POST',
    headers: bridgeHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ pageUrl: page.href, projectId, folderId }),
  });
  const plan = await readResponse(planResponse);
  if (!planResponse.ok) throw new Error(plan.error || plan.message || `读取引用上传计划失败 (${planResponse.status})`);
  if (!plan?.pending || !Array.isArray(plan.assets) || !plan.assets.length) {
    const attachment = plan?.attachment || null;
    if (!attachment?.remoteAssetIds?.length) return { pending: false, uploaded: 0, total: 0, errors: [] };
    const attachmentResult = await attachAIFlowUploadedReferences(tabId, attachment.remoteAssetIds, projectId, { target });
    let acknowledgement = null;
    let acknowledgementError = '';
    try { acknowledgement = await acknowledgeAIFlowReferenceAttachment(page, projectId, attachment, attachmentResult); }
    catch (error) { acknowledgementError = String(error?.message || error); }
    return { pending: false, uploaded: 0, total: 0, errors: [], attachment: attachmentResult, attachmentOnly: true, acknowledgement, acknowledgementError };
  }

  const uploaded = await uploadAIFlowPlan(page, plan, {
    projectId,
    folderId,
    folderName: String(message?.folderName || '当前素材区'),
  });
  const completedResponse = await fetchNestBridge('/aiflow-reference-upload-complete', {
    method: 'POST',
    headers: bridgeHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({
      pageUrl: page.href,
      projectId,
      uploadId: plan.uploadId,
      uploadedAssets: uploaded.uploadedAssets,
    }),
  });
  const completed = await readResponse(completedResponse);
  if (!completedResponse.ok) throw new Error(completed.error || completed.message || '本地引用上传状态未能确认');
  const attachmentPlan = completed?.attachment || plan?.attachment || null;
  const remoteAssetIds = normalizeAIFlowReferenceIds(attachmentPlan?.remoteAssetIds || uploaded.uploadedAssets.map(item => item.remoteAssetId));
  const attachment = await attachAIFlowUploadedReferences(tabId, remoteAssetIds, projectId, { target });
  if (remoteAssetIds.length && (!attachment || Number(attachment.attached || 0) === 0)) {
    throw new Error(attachment?.error || '引用未能加入视频延长窗口');
  }
  let acknowledgement = null;
  let acknowledgementError = '';
  if (attachmentPlan) {
    try { acknowledgement = await acknowledgeAIFlowReferenceAttachment(page, projectId, attachmentPlan, attachment); }
    catch (error) { acknowledgementError = String(error?.message || error); }
  }
  return { pending: true, ...uploaded, remoteAssetIds, attachment, acknowledgement, acknowledgementError };
}

async function runAIFlowReferenceUploadWhenWoken(message, { tabId = -1, target = videoExtendTargetForTab(tabId) ? 'video-extend' : 'global' } = {}) {
  // The page still has a 3-second fallback tick. If it happens to be
  // processing at the exact same time, leave that in-flight run alone instead
  // of starting a duplicate upload. The next regular tick remains the safe
  // recovery path, while the normal path below is immediate.
  if (referenceUploadRunning) return { skipped: true };
  referenceUploadRunning = true;
  try {
    return await runAIFlowReferenceUpload(message, { tabId, target });
  } finally {
    referenceUploadRunning = false;
  }
}

function isAIFlowAssetAlreadyAbsent(response, result) {
  // DELETE is idempotent: an item that is already gone satisfies the user's
  // requested end state. The current AI Flow deployment reports this as a
  // business error ("资产不存在"), while other deployments may use 404/410.
  const status = Number(response?.status) || 0;
  if (status === 404 || status === 410) return true;
  const message = [result?.error, result?.message]
    .filter(value => typeof value === 'string')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /(?:素材|资产)\s*(?:已)?不存在|asset\s+not\s+found|does\s+not\s+exist|already\s+deleted/i.test(message);
}

async function deleteAIFlowPlan(page, deletes) {
  let deleted = 0;
  const errors = [];
  const failures = [];
  const deletedRemoteAssetIds = [];
  for (const item of Array.isArray(deletes) ? deletes : []) {
    const remoteAssetId = numericId(item?.remoteAssetId, 'AI Flow 素材 ID');
    try {
      const target = new URL(`/auth/assets/${encodeURIComponent(remoteAssetId)}`, page.origin);
      const response = await fetch(target, { method: 'DELETE', credentials: 'include' });
      const result = await readResponse(response);
      if (isAIFlowAssetAlreadyAbsent(response, result)) {
        deleted += 1;
        deletedRemoteAssetIds.push(remoteAssetId);
        continue;
      }
      if (!response.ok || result?.success === false) throw new Error(result.error || result.message || `删除失败 (${response.status})`);
      deleted += 1;
      deletedRemoteAssetIds.push(remoteAssetId);
    } catch (error) {
      const message = String(error?.message || error);
      errors.push(`服务器素材 ${remoteAssetId}: ${message}`);
      failures.push({ remoteAssetId, error: message.slice(0, 500) });
    }
  }
  return { deleted, errors, failures, deletedRemoteAssetIds };
}

function moveAIFlowFolderValue(folderId) {
  if (!folderId) return null;
  const numeric = Number(folderId);
  return Number.isSafeInteger(numeric) ? numeric : String(folderId);
}

async function moveAIFlowPlan(page, moves) {
  let moved = 0;
  const errors = [];
  const failures = [];
  const movedMoves = [];
  for (const item of Array.isArray(moves) ? moves : []) {
    try {
      const remoteAssetId = numericId(item?.remoteAssetId, 'AI Flow 素材 ID');
      const remoteFolderId = numericId(item?.remoteFolderId, 'AI Flow 文件夹 ID', { optional: true });
      const assetId = String(item?.assetId || '').trim();
      const localFolderId = String(item?.localFolderId || '').trim();
      if (!assetId || !localFolderId) throw new Error('本地移动任务无效');
      const target = new URL(`/auth/assets/${encodeURIComponent(remoteAssetId)}/folder`, page.origin);
      const response = await fetch(target, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ folderId: moveAIFlowFolderValue(remoteFolderId) }),
      });
      const result = await readResponse(response);
      if (!response.ok || result?.success === false) throw new Error(result.error || result.message || `移动失败 (${response.status})`);
      const movedRecord = { assetId, remoteAssetId, localFolderId, remoteFolderId };
      moved += 1;
      movedMoves.push(movedRecord);
    } catch (error) {
      const message = String(error?.message || error);
      errors.push(`服务器素材移动失败：${message}`);
      failures.push({
        assetId: String(item?.assetId || '').trim(),
        remoteAssetId: String(item?.remoteAssetId || '').trim(),
        localFolderId: String(item?.localFolderId || '').trim(),
        remoteFolderId: String(item?.remoteFolderId || '').trim(),
        error: message.slice(0, 500),
      });
    }
  }
  return { moved, errors, failures, movedMoves };
}

async function runAIFlowLiveSync(message, { tabId = -1 } = {}) {
  const page = safeAIFlowPage(message?.pageUrl);
  const projectId = numericId(message?.projectId, 'AI Flow 项目 ID');
  const planResponse = await fetch(`${BRIDGE_BASE_URL}/aiflow-live-plan`, {
    method: 'POST',
    headers: bridgeHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ pageUrl: page.href, projectId, forceRetry: message?.forceRetry === true }),
  });
  const plan = await readResponse(planResponse);
  if (!planResponse.ok) throw new Error(plan.error || plan.message || `读取 AI Flow 实时同步计划失败 (${planResponse.status})`);
  liveWakeSequence = Math.max(liveWakeSequence, Number(plan.wakeSequence) || 0);
  // A local deletion must not wait behind a potentially large file upload.
  // The desktop already woke this authenticated extension as soon as the item
  // entered the deletion queue, so delete it before the normal upload batch.
  const deleted = Array.isArray(plan.deletes) && plan.deletes.length
    ? await deleteAIFlowPlan(page, plan.deletes)
    : { deleted: 0, errors: [], failures: [], deletedRemoteAssetIds: [] };
  const moved = Array.isArray(plan.moves) && plan.moves.length
    ? await moveAIFlowPlan(page, plan.moves)
    : { moved: 0, errors: [], failures: [], movedMoves: [] };
  const uploaded = Array.isArray(plan.assets) && plan.assets.length
    ? await uploadAIFlowPlan(page, { uploadId: '', assets: plan.assets }, {
      projectId,
      dataEndpoint: '/aiflow-live-upload-data',
      dataPayload: { pageUrl: page.href, projectId },
      concurrency: LIVE_UPLOAD_CONCURRENCY,
      trackLiveTransfer: true,
      holdLiveStateOnSuccess: true,
      continueOnFatal: true,
    })
    : { uploaded: 0, total: 0, errors: [], failures: [], uploadedAssetIds: [], uploadedAssets: [] };
  try {
    if (uploaded.uploadedAssetIds.length) {
      const completed = await fetch(`${BRIDGE_BASE_URL}/aiflow-live-upload-complete`, {
        method: 'POST',
        headers: bridgeHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ pageUrl: page.href, projectId, assetIds: uploaded.uploadedAssetIds, uploadedAssets: uploaded.uploadedAssets }),
      });
      if (!completed.ok) throw new Error('本地实时上传状态未能确认，请稍后重试');
    }
    if (deleted.deletedRemoteAssetIds.length) {
      const completed = await fetch(`${BRIDGE_BASE_URL}/aiflow-live-delete-complete`, {
        method: 'POST', headers: bridgeHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ pageUrl: page.href, projectId, remoteAssetIds: deleted.deletedRemoteAssetIds }),
      });
      if (!completed.ok) throw new Error('本地实时删除状态未能确认，请稍后重试');
    }
    if (moved.movedMoves.length) {
      const completed = await fetch(`${BRIDGE_BASE_URL}/aiflow-live-move-complete`, {
        method: 'POST', headers: bridgeHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ pageUrl: page.href, projectId, moves: moved.movedMoves }),
      });
      if (!completed.ok) throw new Error('本地实时移动状态未能确认，请稍后重试');
    }
  } finally {
    for (const assetId of uploaded.uploadedAssetIds) clearLiveUploadState(assetId);
  }
  // Upload, delete, and move operations are already confirmed above.  Do not
  // reload AI Flow here: a reload destroys the user's in-progress prompt,
  // generation state, and the video-extension workbench.  The new material is
  // available on the server immediately and appears the next time AI Flow
  // naturally refreshes its asset list (or when the user explicitly refreshes
  // that list).
  if (uploaded.failures.length) {
    const failed = await fetch(`${BRIDGE_BASE_URL}/aiflow-live-upload-failed`, {
      method: 'POST',
      headers: bridgeHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ pageUrl: page.href, projectId, failures: uploaded.failures }),
    });
    if (!failed.ok) console.warn('Unable to record AI Flow live upload failure', failed.status);
  }
  if (deleted.failures.length) {
    const failed = await fetch(`${BRIDGE_BASE_URL}/aiflow-live-delete-failed`, {
      method: 'POST', headers: bridgeHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ pageUrl: page.href, projectId, failures: deleted.failures }),
    });
    if (!failed.ok) console.warn('Unable to record AI Flow live delete failure', failed.status);
  }
  if (moved.failures.length) {
    const failed = await fetch(`${BRIDGE_BASE_URL}/aiflow-live-move-failed`, {
      method: 'POST', headers: bridgeHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ pageUrl: page.href, projectId, failures: moved.failures }),
    });
    if (!failed.ok) console.warn('Unable to record AI Flow live move failure', failed.status);
  }
  // Remote-to-local mirroring may take a while for a large project. It must
  // never keep the live-upload lock, otherwise a newly added local asset can
  // be skipped for minutes while old remote files are being checked.
  if (!liveRemotePullRunning && Date.now() - lastLiveRemotePullAt >= LIVE_REMOTE_PULL_INTERVAL_MS) {
    startAIFlowLiveRemotePull(page, projectId, plan.roots);
  }
  return {
    uploaded: uploaded.uploaded,
    // These are deliberately upload-only. A background remote mirror warning
    // must not be shown as an "upload failed" notification after the upload
    // itself has already succeeded.
    uploadErrors: uploaded.errors,
    deleteErrors: deleted.errors,
    moveErrors: moved.errors,
    nextRetryAt: Math.max(0, Number(plan.nextRetryAt) || 0),
    wakeSequence: liveWakeSequence,
  };
}

function startAIFlowLiveRemotePull(page, projectId, roots) {
  liveRemotePullRunning = true;
  Promise.resolve().then(async () => {
    for (const root of Array.isArray(roots) ? roots : []) {
      await syncAIFlowLibrary({
        pageUrl: page.href,
        projectId,
        targetFolderId: root.folderId,
        live: true,
      });
    }
  }).catch(error => {
    // This is a non-blocking mirror. The next 10-second pass will retry it,
    // while local-to-AI-Flow upload remains available immediately.
    console.warn('AI Flow background remote mirror failed', error?.message || error);
  }).finally(() => {
    lastLiveRemotePullAt = Date.now();
    liveRemotePullRunning = false;
  });
}

async function waitForAIFlowLiveWake(message) {
  const page = safeAIFlowPage(message?.pageUrl);
  const projectId = numericId(message?.projectId, 'AI Flow 项目 ID');
  const response = await fetch(`${BRIDGE_BASE_URL}/aiflow-live-wait`, {
    method: 'POST',
    headers: bridgeHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ pageUrl: page.href, projectId, since: liveWakeSequence }),
  });
  const result = await readResponse(response);
  if (!response.ok) throw new Error(result.error || result.message || `等待本地素材变化失败 (${response.status})`);
  liveWakeSequence = Math.max(liveWakeSequence, Number(result.wakeSequence) || 0);
  return result;
}

function armAIFlowLiveWake(message, delay = 0, tabId = -1) {
  liveWakeContext = { pageUrl: String(message?.pageUrl || ''), projectId: String(message?.projectId || ''), tabId: Number.isInteger(tabId) ? tabId : -1 };
  if (liveWakeRunning) return;
  const listen = async () => {
    if (!liveWakeContext) return;
    liveWakeRunning = true;
    let retryDelay = 0;
    try {
      const result = await waitForAIFlowLiveWake(liveWakeContext);
      if (result?.woke) {
        // A desktop "上传到 AI Flow" reference request publishes this same
        // authenticated wake. Handle the reference plan before ordinary live
        // sync, so existing server assets join the top bar without waiting for
        // the content script's 3-second fallback poll.
        try {
          await runAIFlowReferenceUploadWhenWoken(liveWakeContext, { tabId: liveWakeContext.tabId, target: videoExtendTargetForTab(liveWakeContext.tabId) ? 'video-extend' : 'global' });
        } catch (error) {
          // Reference upload is an independent opt-in action. A temporary
          // problem there must never delay normal folder live-sync or deletion.
          console.warn('AI Flow immediate reference upload failed', error?.message || error);
        }
      }
      if (result?.woke && !liveSyncRunning) {
        liveSyncRunning = true;
        let syncResult = null;
        try {
          syncResult = await runAIFlowLiveSync(liveWakeContext, { tabId: liveWakeContext.tabId });
          notifyLiveUploadFailure(syncResult.uploadErrors);
          notifyLiveDeleteFailure(syncResult.deleteErrors);
          notifyLiveMoveFailure(syncResult.moveErrors);
        } finally { liveSyncRunning = false; }
        // Failed items remain visible for diagnosis. The desktop supplies the
        // earliest retry timestamp, so this listener never retries a failed
        // upload in a tight loop. The page's 3-second fallback may still ask
        // for a plan, but deferred items are not sent again before that time.
        retryDelay = liveWakeRetryDelay(result, syncResult);
      }
    } catch {
      retryDelay = LIVE_WAKE_RETRY_MS;
    } finally {
      liveWakeRunning = false;
      if (liveWakeContext) setTimeout(listen, retryDelay || delay);
    }
  };
  setTimeout(listen, delay);
}

function liveWakeRetryDelay(wakeResult, syncResult, now = Date.now()) {
  const nextRetryAt = Math.max(0, Number(syncResult?.nextRetryAt) || Number(wakeResult?.nextRetryAt) || 0);
  if (nextRetryAt > now) return Math.max(250, nextRetryAt - now);
  return wakeResult?.pending ? 3 * 1000 : 0;
}

chrome.runtime.onInstalled.addListener(installMenus);
chrome.runtime.onStartup.addListener(installMenus);

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === IMAGE_MENU_ID) {
    try {
      await saveImage(info);
    } catch (error) {
      notify('小旺仔素材库采集失败', imageFailureMessage(error));
    }
    return;
  }

  if (info.menuItemId === AIFLOW_VIDEO_MENU_ID) {
    try {
      await copyAIFlowVideo(info);
    } catch (error) {
      notify('AI Flow 视频采集失败', aiFlowFailureMessage(error));
    }
    return;
  }

  if (info.menuItemId === AIFLOW_ASSET_LINK_MENU_ID) {
    try {
      await confirmAIFlowAssetLink(info);
    } catch (error) {
      notify('AI Flow 素材关联失败', aiFlowAssetLinkFailureMessage(error));
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === AIFLOW_LIBRARY_ASSETS_ACTION) {
    if (sender.id !== chrome.runtime.id || !sender.tab || !/^https?:\/\//.test(sender.tab.url || '')) { sendResponse({ ok: false, error: '请从 AI Flow 页面打开素材库' }); return false; }
    readLibraryAssetsForVideoExtend(message?.folderId).then(sendResponse, error => sendResponse({ ok: false, error: isNestBridgeUnavailable(error) ? '请先启动小旺仔素材库并打开资源库' : String(error.message || error) }));
    return true;
  }
  if (message?.action === AIFLOW_REFERENCE_SELECT_ACTION) {
    if (sender.id !== chrome.runtime.id || !sender.tab || !/^https?:\/\//.test(sender.tab.url || '')) { sendResponse({ ok: false, error: '请从 AI Flow 页面加入延长参考' }); return false; }
    addLibraryAssetToVideoExtend(message, Number(sender.tab.id)).then(
      result => sendResponse({ ok: true, ...result }),
      error => sendResponse({ ok: false, error: aiFlowUploadFailureMessage(error) }),
    );
    return true;
  }
  if (message?.action === AIFLOW_STORYBOARD_MATCH_ACTION) {
    if (sender.id !== chrome.runtime.id || !sender.tab || !/^https?:\/\//.test(sender.tab.url || '')) { sendResponse({ ok: false, error: '请从 AI Flow 页面自动匹配人物' }); return false; }
    autoMatchStoryboardAssetsForVideoExtend(message, Number(sender.tab.id)).then(
      result => sendResponse(result),
      error => sendResponse({ ok: false, error: aiFlowUploadFailureMessage(error) }),
    );
    return true;
  }
  if (['nest-prompt-review-status', 'nest-prompt-review', 'nest-prompt-review-result'].includes(message?.action)) {
    if (sender.id !== chrome.runtime.id || !sender.tab || !/^https?:\/\//.test(sender.tab.url || '')) { sendResponse({ error: '请从 AI Flow 页面发起审查' }); return false; }
    const route = '/' + message.action.replace('nest-', '');
    fetchNestBridge(route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-nest-bridge': bridgeKey() }, body: JSON.stringify(message.input || {}), signal: AbortSignal.timeout(15000) })
      .then(async response => { const result = await response.json().catch(() => ({ error: '请启动新版素材库，并重新准备扩展完成配对。' })); if (!response.ok) throw new Error(result.error || '审查失败'); sendResponse(result); })
      .catch(error => sendResponse({ error: isNestBridgeUnavailable(error) ? '请启动新版素材库，并重新准备扩展完成配对。' : String(error.message || '审查连接失败') }));
    return true;
  }
  if (message?.action === AIFLOW_CONTROL_STATUS_ACTION || message?.action === AIFLOW_CONTROL_RECONNECT_ACTION) {
    getAIFlowControlStatus().then(sendResponse, error => sendResponse({ ok: false, error: controlFailureMessage(error) }));
    return true;
  }
  if (message?.action === AIFLOW_CONTROL_RETRY_ACTION) {
    retryAIFlowControlSync().then(sendResponse, error => sendResponse({ ok: false, error: controlFailureMessage(error) }));
    return true;
  }
  if (message?.action === AIFLOW_CONTROL_REFRESH_ACTION) {
    refreshAIFlowControlPage().then(sendResponse, error => sendResponse({ ok: false, error: controlFailureMessage(error) }));
    return true;
  }
  if (message?.action === AIFLOW_CONTROL_CANCEL_UPLOAD_ACTION) {
    cancelAIFlowControlUpload(message?.assetId).then(sendResponse, error => sendResponse({ ok: false, error: controlFailureMessage(error) }));
    return true;
  }
  if (message?.action === 'copy-aiflow-video') {
    copyAIFlowVideo({
      srcUrl: String(message.srcUrl || ''),
      pageUrl: String(message.pageUrl || ''),
    }).then(
      () => sendResponse({ ok: true }),
      error => {
        notify('AI Flow 视频采集失败', aiFlowFailureMessage(error));
        sendResponse({ ok: false, error: String(error?.message || error) });
      },
    );
    return true;
  }
  if (message?.action === AIFLOW_FOLDER_SYNC_ACTION) {
    syncAIFlowFolder(message, sender).then(
      result => {
        const failed = result.errors.length;
        const target = result.folderName ? `到“${result.folderName}”` : '';
        const source = String(message?.folderName || '当前文件夹');
        const completed = Boolean(result.empty || Number(result.imported || 0) || Number(result.duplicates || 0));
        const fullyFailed = !result.empty && result.total > 0 && !completed && failed >= result.total;
        if (fullyFailed) {
          notify('AI Flow 当前文件夹同步失败', result.errors[0] || `“${source}”中的素材未能导入`);
          sendResponse({ ok: false, error: result.errors[0] || '当前文件夹同步失败', ...result });
          return;
        }
        notify(
          failed ? 'AI Flow 当前文件夹同步部分完成' : 'AI Flow 当前文件夹同步完成',
          result.empty
            ? `“${source}”中暂无可同步素材`
            : `已从“${source}”复制 ${result.imported} 项${target}，跳过 ${result.duplicates} 项重复${failed ? `，失败 ${failed} 项` : ''}`,
        );
        sendResponse({ ok: true, partial: failed > 0, ...result });
      },
      error => {
        const message = aiFlowAssetSyncFailureMessage(error);
        notify('AI Flow 素材同步失败', message);
        sendResponse({ ok: false, error: message });
      },
    );
    return true;
  }
  if (message?.action === AIFLOW_FOLDER_DIFF_ACTION) {
    previewAIFlowFolderDiff(message, sender).then(
      result => sendResponse({ ok: true, ...result }),
      error => sendResponse({ ok: false, error: aiFlowAssetSyncFailureMessage(error) }),
    );
    return true;
  }
  if (message?.action === AIFLOW_FOLDER_STRUCTURE_SYNC_ACTION) {
    syncAIFlowFolderStructure(message).then(
      result => {
        const failed = result.errors?.length || 0;
        notify('AI Flow 目录和素材同步完成', `已在“${result.folderName || '选定文件夹'}”同步 ${Number(result.imported || 0)} 项素材，跳过 ${Number(result.duplicates || 0)} 项重复；目录新增 ${Number(result.created || 0)} 个${failed ? `，失败 ${failed} 项` : ''}`);
        sendResponse({ ok: true, ...result });
      },
      error => {
        const message = aiFlowAssetSyncFailureMessage(error);
        notify('AI Flow 目录同步失败', message);
        sendResponse({ ok: false, error: message });
      },
    );
    return true;
  }
  if (message?.action === AIFLOW_FOLDER_STRUCTURE_ONLY_ACTION) {
    establishAIFlowFolderStructure(message).then(
      result => sendResponse({ ok: true, ...result }),
      error => sendResponse({ ok: false, error: aiFlowAssetSyncFailureMessage(error) }),
    );
    return true;
  }
  if (message?.action === AIFLOW_UPLOAD_ACTION) {
    uploadNestAssetsToAIFlowFolder(message).then(
      result => {
        const failed = result.errors.length;
        const target = result.folderName ? `到“${result.folderName}”` : '到 AI Flow';
        notify('AI Flow 上传完成', `已上传 ${result.uploaded}/${result.total} 项${target}${failed ? `，失败 ${failed} 项` : ''}`);
        sendResponse({ ok: true, ...result });
      },
      error => {
        const message = aiFlowUploadFailureMessage(error);
        notify('AI Flow 上传失败', message);
        sendResponse({ ok: false, error: message });
      },
    );
    return true;
  }
  if (message?.action === AIFLOW_REFERENCE_UPLOAD_ACTION) {
    if (referenceUploadRunning) {
      sendResponse({ ok: true, skipped: true });
      return undefined;
    }
    const tabId = Number(sender?.tab?.id);
    runAIFlowReferenceUploadWhenWoken(message, { tabId, target: videoExtendTargetForTab(tabId) ? 'video-extend' : 'global' }).then(
      result => {
        if (result.pending) {
          const attachment = Number(result.attachment?.attached) > 0 ? `，已加入顶部引用 ${result.attachment.attached} 项` : '';
          const missing = Array.isArray(result.attachment?.missing) && result.attachment.missing.length ? `，${result.attachment.missing.length} 项未能自动加入` : '';
          const failed = result.errors.length ? `，失败 ${result.errors.length} 项` : '';
          notify('AI Flow 引用上传完成', `已上传 ${result.uploaded}/${result.total} 项${attachment}${missing}${failed}`);
        }
        sendResponse({ ok: true, ...result });
      },
      error => {
        if (isNestBridgeUnavailable(error)) {
          sendResponse({ ok: true, cancelled: true, offline: true });
          return;
        }
        const message = aiFlowUploadFailureMessage(error);
        notify('AI Flow 引用上传失败', message);
        sendResponse({ ok: false, error: message });
      },
    );
    return true;
  }
  if (message?.action === AIFLOW_LIVE_SYNC_ACTION) {
    if (liveSyncRunning) {
      sendResponse({ ok: true, skipped: true });
      return undefined;
    }
    liveSyncRunning = true;
    const tabId = Number(sender?.tab?.id);
    runAIFlowLiveSync(message, { tabId }).then(
      result => {
        if (message?.source !== 'control-center') {
          notifyLiveUploadFailure(result.uploadErrors);
          notifyLiveDeleteFailure(result.deleteErrors);
          notifyLiveMoveFailure(result.moveErrors);
        }
        armAIFlowLiveWake(message, 0, tabId);
        sendResponse({ ok: true, ...result });
      },
      error => sendResponse({ ok: false, error: aiFlowAssetSyncFailureMessage(error) }),
    ).finally(() => { liveSyncRunning = false; });
    return true;
  }
  return undefined;
});
