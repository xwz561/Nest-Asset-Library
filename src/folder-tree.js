export function buildFolderRows(folders, expandedFolderIds, { includeHidden = false } = {}) {
  const all = Array.isArray(folders) ? folders : [];
  const expanded = expandedFolderIds instanceof Set ? expandedFolderIds : new Set(expandedFolderIds || []);
  const childrenByParent = new Map();
  for (const folder of all) {
    const parentId = folder.parentId || null;
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(folder);
  }
  const rows = [];
  const visited = new Set();
  const walk = (parentId = null, depth = 0, ancestorContinuations = []) => {
    const siblings = childrenByParent.get(parentId) || [];
    siblings.forEach((folder, siblingIndex) => {
      if (visited.has(folder.id)) return;
      visited.add(folder.id);
      const hasChildren = (childrenByParent.get(folder.id) || []).length > 0;
      const isLastSibling = siblingIndex === siblings.length - 1;
      rows.push({ ...folder, depth, hasChildren, isLastSibling, ancestorContinuations });
      if (hasChildren && (includeHidden || expanded.has(folder.id))) {
        walk(folder.id, depth + 1, [...ancestorContinuations, !isLastSibling]);
      }
    });
  };
  walk();
  return rows;
}

export function toggleExpandedFolder(expandedFolderIds, folderId) {
  const next = new Set(expandedFolderIds || []);
  if (next.has(folderId)) next.delete(folderId);
  else next.add(folderId);
  return next;
}

export function collapseFolderSubtree(expandedFolderIds, folders, folderId) {
  const next = new Set(expandedFolderIds || []);
  for (const id of collectFolderSubtreeIds(folders, folderId)) next.delete(id);
  return next;
}

export function expandFolderAncestors(expandedFolderIds, folders, folderId) {
  const all = Array.isArray(folders) ? folders : [];
  const byId = new Map(all.filter(folder => folder?.id).map(folder => [folder.id, folder]));
  const next = collapseFolderSubtree(expandedFolderIds, all, folderId);
  const visited = new Set([folderId]);
  let parentId = byId.get(folderId)?.parentId || null;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    next.add(parentId);
    parentId = parent.parentId || null;
  }
  return next;
}

export function expandableFolderIds(folders, { parentId } = {}) {
  const all = Array.isArray(folders) ? folders : [];
  const parents = new Set(all.map(folder => folder?.parentId).filter(Boolean));
  return all
    .filter(folder => folder?.id && parents.has(folder.id))
    .filter(folder => parentId === undefined || (folder.parentId || null) === (parentId || null))
    .map(folder => folder.id);
}

export function folderExpansionState(expandedFolderIds, folderIds) {
  const expanded = expandedFolderIds instanceof Set ? expandedFolderIds : new Set(expandedFolderIds || []);
  const ids = Array.from(folderIds || []).filter(Boolean);
  return ids.length > 0 && ids.every(id => expanded.has(id));
}

export function toggleExpandedFolderScope(expandedFolderIds, folderIds) {
  const next = new Set(expandedFolderIds || []);
  const ids = Array.from(folderIds || []).filter(Boolean);
  const collapse = ids.length > 0 && ids.every(id => next.has(id));
  for (const id of ids) {
    if (collapse) next.delete(id);
    else next.add(id);
  }
  return next;
}

export function defaultExpandedFolderIds(folders) {
  const all = Array.isArray(folders) ? folders : [];
  const parents = new Set(all.map(folder => folder?.parentId).filter(Boolean));
  return new Set(
    all
      .filter(folder => folder?.id && !(folder.parentId || null) && parents.has(folder.id))
      .map(folder => folder.id),
  );
}

export function summarizeFolderAssets(folderId, folders = [], assets = []) {
  if (!folderId) return { fileCount: 0, totalBytes: 0 };

  const nestedIds = collectFolderSubtreeIds(folders, folderId);

  let fileCount = 0;
  let totalBytes = 0;
  for (const asset of Array.isArray(assets) ? assets : []) {
    if (!nestedIds.has(asset?.folderId)) continue;
    fileCount += 1;
    const size = Number(asset?.size);
    if (Number.isFinite(size) && size > 0) totalBytes += size;
  }

  return { fileCount, totalBytes };
}

export function formatFolderBytes(value) {
  const raw = Number(value);
  const bytes = Number.isFinite(raw) ? Math.max(0, raw) : 0;
  if (bytes < 1024) return `${bytes.toFixed(2)} bytes`;
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  const unit = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** unit).toFixed(2)} ${units[unit]}`;
}
import { collectFolderSubtreeIds } from "../shared/folder-tree.cjs";
export { collectFolderSubtreeIds };
