function collectFolderSubtreeIds(folders, rootId) {
  const result = new Set();
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift();
    if (!id || result.has(id)) continue;
    result.add(id);
    for (const folder of folders) if (folder.parentId === id) queue.push(folder.id);
  }
  return result;
}

module.exports = { collectFolderSubtreeIds };
