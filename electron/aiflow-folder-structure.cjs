const crypto = require('crypto');

const MAX_AIFLOW_FOLDERS = 500;

function normalizeId(value) {
  const id = String(value ?? '').trim();
  return /^\d{1,18}$/.test(id) ? id : '';
}

function normalizeFolderName(value) {
  return String(value ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
}

function normalizedOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    return url.origin.toLowerCase();
  } catch {
    return '';
  }
}

function normalizeAIFlowFolderStructure(input, { maxFolders = MAX_AIFLOW_FOLDERS } = {}) {
  if (!Array.isArray(input)) throw new Error('AI Flow 未返回可用的文件夹列表');
  const byRemoteId = new Map();
  let skipped = 0;
  for (const item of input) {
    if (item?.shared === true) {
      skipped += 1;
      continue;
    }
    const remoteId = normalizeId(item?.id);
    const name = normalizeFolderName(item?.name);
    if (!remoteId || !name || byRemoteId.has(remoteId)) {
      skipped += 1;
      continue;
    }
    if (byRemoteId.size >= maxFolders) throw new Error(`AI Flow 文件夹过多，单次最多同步 ${maxFolders} 个`);
    byRemoteId.set(remoteId, {
      remoteId,
      name,
      rawParentRemoteId: normalizeId(item?.parentId ?? item?.parent_id),
    });
  }

  const parentFor = item => {
    let parent = item.rawParentRemoteId;
    if (!parent || !byRemoteId.has(parent)) return '';
    const visited = new Set([item.remoteId]);
    while (parent) {
      if (visited.has(parent)) return '';
      visited.add(parent);
      const current = byRemoteId.get(parent);
      parent = current?.rawParentRemoteId || '';
      if (parent && !byRemoteId.has(parent)) return '';
    }
    return item.rawParentRemoteId;
  };

  const folders = [...byRemoteId.values()].map(item => ({
    remoteId: item.remoteId,
    name: item.name,
    parentRemoteId: parentFor(item),
  }));
  const byParent = new Map();
  for (const folder of folders) {
    const key = folder.parentRemoteId || '';
    const children = byParent.get(key) || [];
    children.push(folder);
    byParent.set(key, children);
  }
  for (const children of byParent.values()) children.sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN', { numeric: true }));
  const ordered = [];
  const visit = remoteId => {
    for (const folder of byParent.get(remoteId) || []) {
      ordered.push(folder);
      visit(folder.remoteId);
    }
  };
  visit('');
  return { folders: ordered, skipped };
}

function sameFolderName(left, right) {
  return String(left || '').localeCompare(String(right || ''), 'zh-Hans-CN', { sensitivity: 'accent' }) === 0;
}

function sameId(left, right) {
  return String(left ?? '') === String(right ?? '');
}

function mirrorAIFlowFolderStructure(data, input, { makeId = () => crypto.randomUUID(), now = () => Date.now() } = {}) {
  if (!data || !Array.isArray(data.folders)) throw new Error('请先打开资源库');
  const targetFolderId = String(input?.targetFolderId || '');
  const targetRoot = data.folders.find(folder => sameId(folder.id, targetFolderId));
  if (!targetRoot) throw new Error('请先在小旺仔素材库中选定接收目录结构的父文件夹');
  const serverOrigin = normalizedOrigin(input?.serverOrigin);
  const projectId = normalizeId(input?.projectId);
  if (!serverOrigin || !projectId) throw new Error('AI Flow 目录同步请求无效');

  // The root is intentionally separate from a remote folder mapping: AI Flow's
  // “我的素材” root has no remote folder id, but it still needs a durable local
  // pairing for root assets and for explicitly enabled live synchronization.
  const previousRootSync = targetRoot.aiFlowRootSync || {};
  const liveSyncDisabledByUser = previousRootSync.liveSyncDisabledByUser === true;
  targetRoot.aiFlowRootSync = {
    serverOrigin,
    projectId,
    // 同步目录和素材就是用户建立双向对应关系的动作，默认立刻开始实时同步。
    // 只有用户明确在菜单关闭过，下一次手动目录同步才继续保持关闭。
    liveSync: !liveSyncDisabledByUser,
    liveSyncDisabledByUser,
    syncedAt: now(),
  };

  const normalized = normalizeAIFlowFolderStructure(input?.folders);
  const localByRemoteId = new Map();
  for (const folder of data.folders) {
    const source = folder?.aiFlowFolderSync;
    if (!source || !sameId(source.rootFolderId, targetFolderId) || String(source.projectId || '') !== projectId || normalizedOrigin(source.serverOrigin) !== serverOrigin) continue;
    const remoteId = normalizeId(source.remoteFolderId);
    if (remoteId && !localByRemoteId.has(remoteId)) localByRemoteId.set(remoteId, folder);
  }
  // 若用户在 AI Flow 某个具体文件夹内执行同步，选中的本地根目录本身可能已经
  // 对应这个远程文件夹。把它作为该 remote id 的本地节点复用，避免再生成一层
  // 同名「测试/测试」嵌套目录。
  const targetRootFolderLink = targetRoot.aiFlowFolderSync;
  const targetRootRemoteId = normalizeId(targetRootFolderLink?.remoteFolderId);
  if (
    targetRootRemoteId
    && String(targetRootFolderLink?.projectId || '') === projectId
    && normalizedOrigin(targetRootFolderLink?.serverOrigin) === serverOrigin
  ) localByRemoteId.set(targetRootRemoteId, targetRoot);

  // Older builds could create a second local folder with the same name and the
  // same remote id directly below a selected mapped root (for example 测试/测试).
  // It is an application-generated alias, not a user folder: merge its assets
  // back into the selected root before the next live upload/pull, then remove
  // the empty alias so both sides have one unambiguous destination.
  if (targetRootRemoteId) {
    const aliases = data.folders.filter(folder => {
      if (sameId(folder.id, targetRoot.id) || !sameId(folder.parentId, targetRoot.id) || !sameFolderName(folder.name, targetRoot.name)) return false;
      const link = folder.aiFlowFolderSync;
      return link
        && String(link.remoteFolderId) === targetRootRemoteId
        && String(link.projectId || '') === projectId
        && normalizedOrigin(link.serverOrigin) === serverOrigin
        && sameId(link.rootFolderId, targetRoot.id);
    });
    for (const alias of aliases) {
      for (const asset of data.assets || []) if (sameId(asset.folderId, alias.id)) asset.folderId = targetRoot.id;
      data.folders = data.folders.filter(folder => !sameId(folder.id, alias.id));
    }
  }

  let created = 0;
  let reused = 0;
  for (const remoteFolder of normalized.folders) {
    const targetParentId = localByRemoteId.get(remoteFolder.parentRemoteId)?.id || targetFolderId;
    let localFolder = localByRemoteId.get(remoteFolder.remoteId) || null;
    if (!localFolder) {
      localFolder = data.folders.find(folder => sameId(folder.parentId, targetParentId) && sameFolderName(folder.name, remoteFolder.name)) || null;
      if (localFolder) reused += 1;
    } else {
      reused += 1;
    }
    if (!localFolder) {
      localFolder = {
        id: makeId(),
        name: remoteFolder.name,
        parentId: targetParentId,
        icon: 'folder',
        color: '#8f98a3',
        createdAt: now(),
      };
      data.folders.push(localFolder);
      created += 1;
    }
    localFolder.aiFlowFolderSync = {
      serverOrigin,
      projectId,
      remoteFolderId: remoteFolder.remoteId,
      rootFolderId: targetFolderId,
      syncedAt: now(),
    };
    localByRemoteId.set(remoteFolder.remoteId, localFolder);
  }
  return {
    created,
    reused,
    skipped: normalized.skipped,
    total: normalized.folders.length,
  };
}

function detachAIFlowFolderConnections(data) {
  if (!data || !Array.isArray(data.folders)) throw new Error('请先打开资源库');
  let roots = 0;
  let folders = 0;
  for (const folder of data.folders) {
    if (folder.aiFlowRootSync) {
      delete folder.aiFlowRootSync;
      roots += 1;
    }
    if (folder.aiFlowFolderSync) {
      delete folder.aiFlowFolderSync;
      folders += 1;
    }
  }
  if (data.aiFlowLiveSync && typeof data.aiFlowLiveSync === 'object') {
    data.aiFlowLiveSync = {
      ...data.aiFlowLiveSync,
      pendingUploads: [],
      pendingDeletes: [],
    };
  }
  return { roots, folders };
}

module.exports = {
  MAX_AIFLOW_FOLDERS,
  normalizeId,
  normalizeFolderName,
  normalizeAIFlowFolderStructure,
  mirrorAIFlowFolderStructure,
  detachAIFlowFolderConnections,
};
