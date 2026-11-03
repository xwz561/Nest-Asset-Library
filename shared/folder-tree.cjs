function collectFolderSubtreeIds(folders, rootId) {
  const result = new Set();
  const children = new Map();
  for (const folder of folders || []) {
    if (!children.has(folder.parentId)) children.set(folder.parentId, []);
    children.get(folder.parentId).push(folder.id);
  }
  const queue = [rootId];
  for (let head = 0; head < queue.length; head += 1) {
    const id = queue[head];
    if (!id || result.has(id)) continue;
    result.add(id);
    for (const child of children.get(id) || []) queue.push(child);
  }
  return result;
}
module.exports = { collectFolderSubtreeIds };
