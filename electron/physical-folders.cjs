const fs = require('fs');
const path = require('path');
const { safeName } = require('./drag-export.cjs');

function folderParts(folders, folderId) {
  const byId = new Map((folders || []).map(folder => [folder.id, folder]));
  const parts = [], visited = new Set();
  let current = folderId;
  while (current && byId.has(current) && !visited.has(current)) {
    visited.add(current);
    const folder = byId.get(current);
    parts.unshift(safeName(folder.name, '未命名文件夹'));
    current = folder.parentId || null;
  }
  return parts;
}

function safeRelativeFile(file) {
  const parts = String(file || '').replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.map(part => safeName(part, '未命名素材')).join(path.sep);
}

function physicalAssetPath(root, file) {
  const relative = safeRelativeFile(file);
  if (!relative) return path.join(root, 'assets');
  return path.join(root, 'assets', relative);
}

function nextAvailable(target, occupied = new Set()) {
  const extension = path.extname(target), base = target.slice(0, -extension.length || undefined);
  let candidate = target;
  for (let number = 2; occupied.has(candidate.toLowerCase()) || fs.existsSync(candidate); number += 1) candidate = `${base} (${number})${extension}`;
  occupied.add(candidate.toLowerCase());
  return candidate;
}

function buildFolderPartsMap(folders) {
  const byId = new Map((folders || []).map(folder => [folder.id, folder]));
  const cache = new Map();
  const resolve = (id, visiting = new Set()) => {
    if (!id || !byId.has(id)) return [];
    if (cache.has(id)) return cache.get(id);
    if (visiting.has(id)) return [];
    const nextVisiting = new Set(visiting).add(id), folder = byId.get(id);
    const parts = [...resolve(folder.parentId, nextVisiting), safeName(folder.name, '未命名文件夹')];
    cache.set(id, parts);
    return parts;
  };
  for (const id of byId.keys()) resolve(id);
  return cache;
}

function syncPhysicalFolders(root, data) {
  const assetsRoot = path.join(root, 'assets');
  fs.mkdirSync(assetsRoot, { recursive: true });
  const partsById = buildFolderPartsMap(data.folders || []);
  const physicalDirectories = (data.folders || []).map(folder => path.resolve(path.join(assetsRoot, ...(partsById.get(folder.id) || []))));
  const expectedDirectories = new Set(physicalDirectories.map(directory => directory.toLowerCase()));
  for (const directory of physicalDirectories) fs.mkdirSync(directory, { recursive: true });
  const occupied = new Set();
  for (const asset of data.assets || []) {
    if (!asset.file) continue;
    const source = physicalAssetPath(root, asset.file);
    const directory = path.join(assetsRoot, ...(partsById.get(asset.folderId) || []));
    fs.mkdirSync(directory, { recursive: true });
    let target = path.join(directory, path.basename(asset.file));
    if (path.resolve(source).toLowerCase() !== path.resolve(target).toLowerCase()) target = nextAvailable(target, occupied);
    else occupied.add(target.toLowerCase());
    if (path.resolve(source).toLowerCase() !== path.resolve(target).toLowerCase() && fs.existsSync(source)) fs.renameSync(source, target);
    asset.file = path.relative(assetsRoot, target).replace(/\\/g, '/');
  }
  const removeEmpty = directory => { for (const entry of fs.readdirSync(directory, { withFileTypes:true })) if (entry.isDirectory()) removeEmpty(path.join(directory, entry.name)); if (directory !== assetsRoot && !expectedDirectories.has(path.resolve(directory).toLowerCase()) && fs.readdirSync(directory).length === 0) fs.rmdirSync(directory); };
  removeEmpty(assetsRoot);
  return data;
}

function archiveLegacyRootAliases(root, data) {
  const assetsRoot = path.join(root, 'assets'), archiveRoot = path.join(root, '.nest-backups', 'legacy-root-aliases');
  let archived = 0;
  for (const asset of data.assets || []) {
    if (!asset.file || path.dirname(String(asset.file)) === '.') continue;
    const source = physicalAssetPath(root, asset.file), alias = path.join(assetsRoot, path.basename(asset.file));
    if (!fs.existsSync(source) || !fs.existsSync(alias) || path.resolve(source).toLowerCase() === path.resolve(alias).toLowerCase()) continue;
    fs.mkdirSync(archiveRoot, { recursive:true });
    fs.renameSync(alias, nextAvailable(path.join(archiveRoot, path.basename(alias))));
    archived += 1;
  }
  return archived;
}

function needsPhysicalLayoutSync(data, version = 1) {
  return Boolean(data) && data.physicalLayoutVersion !== version;
}

module.exports = { folderParts, physicalAssetPath, safeRelativeFile, syncPhysicalFolders, needsPhysicalLayoutSync, buildFolderPartsMap, archiveLegacyRootAliases };
