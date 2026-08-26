const path = require('path');

function safeName(value, fallback) {
  const cleaned = String(value || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().replace(/[. ]+$/g, '').slice(0, 100);
  return cleaned || fallback;
}

function folderPathForAsset(folders, folderId) {
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  const names = [];
  const visited = new Set();
  let id = folderId;
  while (id && byId.has(id) && !visited.has(id)) {
    visited.add(id);
    const folder = byId.get(id);
    names.unshift(safeName(folder.name, '未命名文件夹'));
    id = folder.parentId;
  }
  return names;
}

function buildReadableDragPath(tempRoot, library, asset) {
  const extension = path.extname(asset.file || asset.originalName || '');
  const libraryName = safeName(library.name, 'Nest 素材库');
  const folderParts = folderPathForAsset(library.folders || [], asset.folderId);
  const fileName = `${safeName(asset.name, '未命名素材')}${extension}`;
  return path.join(tempRoot, libraryName, ...folderParts, fileName);
}

function uniqueDragPath(target, usedPaths) {
  const used = usedPaths || new Set();
  const extension = path.extname(target);
  const base = target.slice(0, -extension.length || undefined);
  let candidate = target;
  for (let number = 2; used.has(candidate.toLowerCase()); number += 1) candidate = `${base} (${number})${extension}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

module.exports = { buildReadableDragPath, folderPathForAsset, safeName, uniqueDragPath };
