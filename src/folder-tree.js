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
  const walk = (parentId = null, depth = 0) => {
    for (const folder of childrenByParent.get(parentId) || []) {
      if (visited.has(folder.id)) continue;
      visited.add(folder.id);
      const hasChildren = (childrenByParent.get(folder.id) || []).length > 0;
      rows.push({ ...folder, depth, hasChildren });
      if (hasChildren && (includeHidden || expanded.has(folder.id))) walk(folder.id, depth + 1);
    }
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
