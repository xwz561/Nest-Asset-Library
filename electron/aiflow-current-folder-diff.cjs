const { normalizeAIFlowMappings } = require('./aiflow-mappings.cjs');
const { resolveMappedAIFlowFolder } = require('./aiflow-current-folder-target.cjs');

const MAX_REMOTE_ITEMS = 5000;
const MAX_DISPLAY_ITEMS = 30;
const MEDIA_KINDS = new Set(['image', 'video', 'audio']);

function normalizeId(value) {
  const text = String(value ?? '').trim();
  return text || '';
}

function normalizeOrigin(value) {
  try {
    return new URL(String(value || '')).origin;
  } catch {
    return '';
  }
}

function sameOrigin(left, right) {
  const a = normalizeOrigin(left);
  const b = normalizeOrigin(right);
  return Boolean(a && b && a === b);
}

function displayName(value, fallback = '未命名素材') {
  const cleaned = String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    // Remote item names are not trusted display data. A hostile or malformed
    // remote filename must not turn the read-only preview into a way to expose
    // a URL, file URL, drive path, or UNC path.
    .replace(/\b(?:https?|file):\/\/[^\s]+/gi, '[链接已隐藏]')
    .replace(/[a-z]:[\\/][^\s]*/gi, '[路径已隐藏]')
    .replace(/\\\\[^\s]*/g, '[路径已隐藏]')
    .replace(/(^|[\s(=,:;])\/(?:users|home|var|tmp|private|mnt|volumes)\/[^\s]*/gi, '$1[路径已隐藏]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  return cleaned || fallback;
}

function nameKey(value) {
  return displayName(value, '')
    .toLocaleLowerCase('en-US')
    .replace(/\.[a-z0-9]{1,12}$/i, '')
    .trim();
}

function normalizedKind(value) {
  const kind = String(value ?? '').trim().toLowerCase();
  const category = kind.split('/', 1)[0];
  return MEDIA_KINDS.has(kind) ? kind : MEDIA_KINDS.has(category) ? category : '';
}

function safeSize(value) {
  const size = Number(value);
  return Number.isFinite(size) && size > 0 ? Math.min(Math.floor(size), Number.MAX_SAFE_INTEGER) : 0;
}

function publicAsset(asset) {
  return {
    name: displayName(asset?.name || asset?.originalName),
    kind: normalizedKind(asset?.type || asset?.kind || asset?.mime) || 'other',
    size: safeSize(asset?.size),
  };
}

function normalizeRemoteItems(input) {
  const records = [];
  const seen = new Set();
  let invalid = 0;
  for (const source of Array.isArray(input) ? input.slice(0, MAX_REMOTE_ITEMS + 1) : []) {
    const id = String(source?.id ?? '').trim();
    const name = displayName(source?.name, '');
    const kind = normalizedKind(source?.kind || source?.type);
    if (!/^\d{1,18}$/.test(id) || !name || !kind || seen.has(id)) {
      invalid += 1;
      continue;
    }
    seen.add(id);
    records.push({ id, name, kind, size: safeSize(source?.size) });
  }
  if (Array.isArray(input) && input.length > MAX_REMOTE_ITEMS) invalid += input.length - MAX_REMOTE_ITEMS;
  return { records, invalid };
}

function aiFlowImportRemoteId(asset, scope) {
  const source = asset?.importSource;
  if (String(source?.provider || '').trim().toLowerCase() !== 'ai flow') return '';
  if (String(source?.projectId || '') !== scope.projectId || !sameOrigin(source?.serverOrigin, scope.serverOrigin)) return '';
  const id = String(source?.assetId || '').trim();
  return /^\d{1,18}$/.test(id) ? id : '';
}

function mappingRelations(data, assetsById, scope) {
  const activeByAsset = new Map();
  const staleByAsset = new Map();
  const unconfirmedByAsset = new Map();
  const missingRemoteIds = new Set();
  const mappings = normalizeAIFlowMappings(data?.aiFlowMappings).mappings;
  for (const mapping of mappings) {
    if (mapping.provider !== 'ai-flow' || String(mapping.projectId || '') !== scope.projectId) continue;
    const remoteId = String(mapping.remoteAssetId || '').trim();
    if (!/^\d{1,18}$/.test(remoteId)) continue;
    const asset = assetsById.get(String(mapping.assetId || ''));
    if (mapping.status !== 'confirmed') {
      if (asset) {
        const records = unconfirmedByAsset.get(String(asset.id)) || [];
        records.push(remoteId);
        unconfirmedByAsset.set(String(asset.id), records);
      }
      continue;
    }
    if (!asset) {
      missingRemoteIds.add(remoteId);
      continue;
    }
    if (String(mapping.currentHash || '') !== String(asset.hash || '')) {
      staleByAsset.set(String(asset.id), remoteId);
      continue;
    }
    const records = activeByAsset.get(String(asset.id)) || [];
    records.push(remoteId);
    activeByAsset.set(String(asset.id), records);
  }
  return { activeByAsset, staleByAsset, unconfirmedByAsset, missingRemoteIds };
}

function issue(name, message) {
  return { name: displayName(name), message: String(message || '').slice(0, 180) };
}

function limit(items) {
  return items.slice(0, MAX_DISPLAY_ITEMS);
}

// This function is deliberately pure: it reads the in-memory library and a
// browser supplied remote snapshot, without repairing mappings or touching a
// sync queue. Its public result excludes local paths, remote ids, URLs, and hashes.
function previewMappedAIFlowFolderDiff(data, {
  serverOrigin,
  projectId,
  remoteFolderId = '',
  remoteItems,
} = {}) {
  const scope = { serverOrigin: normalizeOrigin(serverOrigin), projectId: normalizeId(projectId) };
  if (!scope.serverOrigin || !scope.projectId) throw new Error('AI Flow 当前项目无效，请刷新页面后重试');
  const target = resolveMappedAIFlowFolder(data, {
    serverOrigin: scope.serverOrigin,
    projectId: scope.projectId,
    remoteFolderId,
  });
  const { records: remote, invalid } = normalizeRemoteItems(remoteItems);
  const assets = Array.isArray(data?.assets) ? data.assets : [];
  const assetsById = new Map(assets.map(asset => [String(asset?.id || ''), asset]).filter(([id]) => id));
  const local = assets.filter(asset => String(asset?.folderId || '') === String(target.id));
  const { activeByAsset, staleByAsset, unconfirmedByAsset, missingRemoteIds } = mappingRelations(data, assetsById, scope);
  const staleAssetByRemoteId = new Map();
  for (const [assetId, remoteId] of staleByAsset) {
    const asset = assetsById.get(assetId);
    if (asset && !staleAssetByRemoteId.has(remoteId)) staleAssetByRemoteId.set(remoteId, asset);
  }
  const unconfirmedAssetByRemoteId = new Map();
  for (const [assetId, remoteIds] of unconfirmedByAsset) {
    const asset = assetsById.get(assetId);
    if (!asset) continue;
    for (const remoteId of remoteIds) {
      if (!unconfirmedAssetByRemoteId.has(remoteId)) unconfirmedAssetByRemoteId.set(remoteId, asset);
    }
  }
  const directRemoteByAsset = new Map();
  const allRemoteRelations = new Map();
  for (const asset of assets) {
    const relationIds = new Set(activeByAsset.get(String(asset?.id || '')) || []);
    const importedRemoteId = aiFlowImportRemoteId(asset, scope);
    if (importedRemoteId) relationIds.add(importedRemoteId);
    if (!relationIds.size) continue;
    allRemoteRelations.set(String(asset.id), relationIds);
    if (String(asset.folderId || '') === String(target.id)) directRemoteByAsset.set(String(asset.id), relationIds);
  }

  const issues = [];
  const issueKeys = new Set();
  const addIssue = (key, name, message) => {
    if (issueKeys.has(key)) return;
    issueKeys.add(key);
    issues.push(issue(name, message));
  };
  if (invalid) addIssue('invalid-remote', '当前 AI Flow 文件夹', `远端素材列表存在 ${invalid} 项无效或重复记录`);

  for (const asset of local) {
    const staleRemoteId = staleByAsset.get(String(asset.id));
    if (staleRemoteId) addIssue(`stale:${asset.id}`, asset.name, '本地版本已变化，需要重新上传或重新关联');
    if (unconfirmedByAsset.has(String(asset.id))) {
      addIssue(`unconfirmed:${asset.id}`, asset.name, '该素材对应尚未确认，请重新关联后再同步');
    }
    const relations = directRemoteByAsset.get(String(asset.id));
    if (relations && [...relations].some(id => !remote.some(item => item.id === id))) {
      addIssue(`outside:${asset.id}`, asset.name, '已关联的远端素材不在当前网页文件夹');
    }
  }

  const usedLocalIds = new Set();
  const linkedLocalIds = new Set();
  const possibleDuplicates = [];
  const remoteOnly = [];
  let linked = 0;
  for (const item of remote) {
    const unconfirmed = unconfirmedAssetByRemoteId.get(item.id);
    if (unconfirmed) {
      addIssue(`unconfirmed:${unconfirmed.id}`, unconfirmed.name, '该素材对应尚未确认，请重新关联后再同步');
      continue;
    }
    if (missingRemoteIds.has(item.id)) {
      addIssue(`remote-missing-local:${item.id}`, item.name, '关联的本地素材已不存在，需要重新确认对应关系');
      continue;
    }
    const stale = staleAssetByRemoteId.get(item.id);
    if (stale) {
      addIssue(`stale:${stale.id}`, stale.name, '本地版本已变化，需要重新上传或重新关联');
      continue;
    }
    const direct = local.find(asset => (directRemoteByAsset.get(String(asset.id)) || new Set()).has(item.id));
    if (direct) {
      linked += 1;
      linkedLocalIds.add(String(direct.id));
      continue;
    }
    const elsewhere = assets.find(asset => {
      if (String(asset.folderId || '') === String(target.id)) return false;
      return (allRemoteRelations.get(String(asset.id)) || new Set()).has(item.id);
    });
    if (elsewhere) {
      addIssue(`remote-outside:${item.id}`, elsewhere.name, '关联素材位于其他本地目录，请重新确认目录对应');
      continue;
    }
    const candidate = local.find(asset => {
      if (linkedLocalIds.has(String(asset.id)) || usedLocalIds.has(String(asset.id))) return false;
      const current = publicAsset(asset);
      return current.kind === item.kind && nameKey(current.name) && nameKey(current.name) === nameKey(item.name);
    });
    if (candidate) {
      usedLocalIds.add(String(candidate.id));
      const localItem = publicAsset(candidate);
      possibleDuplicates.push({
        local: localItem,
        remote: { name: item.name, kind: item.kind, size: item.size },
        reason: localItem.size && item.size && localItem.size === item.size ? '同名、同类型、大小一致' : '同名、同类型，需人工确认',
      });
      continue;
    }
    remoteOnly.push({ name: item.name, kind: item.kind, size: item.size });
  }

  const localNew = local
    .filter(asset => !linkedLocalIds.has(String(asset.id)) && !usedLocalIds.has(String(asset.id)))
    .filter(asset => !staleByAsset.has(String(asset.id)))
    .filter(asset => !unconfirmedByAsset.has(String(asset.id)))
    .filter(asset => !(directRemoteByAsset.get(String(asset.id)) || new Set()).size)
    .map(publicAsset);

  const summary = {
    linked,
    localNew: localNew.length,
    possibleDuplicates: possibleDuplicates.length,
    remoteOnly: remoteOnly.length,
    mappingIssues: issues.length,
  };
  const lists = {
    localNew: limit(localNew),
    possibleDuplicates: limit(possibleDuplicates),
    remoteOnly: limit(remoteOnly),
    mappingIssues: limit(issues),
  };
  return {
    folder: { name: displayName(target.name, '当前文件夹') },
    summary,
    ...lists,
    truncated: Object.entries(summary).some(([key, value]) => key !== 'linked' && value > lists[key]?.length),
  };
}

module.exports = {
  MAX_REMOTE_ITEMS,
  MAX_DISPLAY_ITEMS,
  previewMappedAIFlowFolderDiff,
};
