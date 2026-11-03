const ROOT_FOLDER = '__root__';

function folderKey(folderId) {
  return folderId || ROOT_FOLDER;
}

function createDuplicateIndex(assets = []) {
  const global = new Set();
  const byFolder = new Map();
  for (const asset of assets) {
    if (!asset?.hash) continue;
    global.add(asset.hash);
    const key = folderKey(asset.folderId);
    if (!byFolder.has(key)) byFolder.set(key, new Set());
    byFolder.get(key).add(asset.hash);
  }
  return { global, byFolder };
}

function isDuplicate(index, hash, folderId, preserveFolders) {
  if (!hash) return false;
  return preserveFolders
    ? Boolean(index.byFolder.get(folderKey(folderId))?.has(hash))
    : index.global.has(hash);
}

function recordHash(index, hash, folderId) {
  if (!hash) return;
  index.global.add(hash);
  const key = folderKey(folderId);
  if (!index.byFolder.has(key)) index.byFolder.set(key, new Set());
  index.byFolder.get(key).add(hash);
}

module.exports = { createDuplicateIndex, isDuplicate, recordHash };
