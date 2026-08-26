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

function syncPhysicalFolders(root, data) {
  const assetsRoot = path.join(root, 'assets');
  fs.mkdirSync(assetsRoot, { recursive: true });
  const physicalDirectories = (data.folders || []).map(folder => path.resolve(path.join(assetsRoot, ...folderParts(data.folders, folder.id))));
  const expectedDirectories = new Set(physicalDirectories.map(directory => directory.toLowerCase()));
  for (const directory of physicalDirectories) fs.mkdirSync(directory, { recursive: true });
  const occupied = new Set();
  for (const asset of data.assets || []) {
    if (!asset.file) continue;
    const source = physicalAssetPath(root, asset.file);
    const directory = path.join(assetsRoot, ...folderParts(data.folders, asset.folderId));
    fs.mkdirSync(directory, { recursive: true });
    let target = path.join(directory, path.basename(asset.file));
    if (path.resolve(source).toLowerCase() !== path.resolve(target).toLowerCase()) target = nextAvailable(target, occupied);
    else occupied.add(target.toLowerCase());
    if (path.resolve(source).toLowerCase() !== path.resolve(target).toLowerCase() && fs.existsSync(source)) fs.renameSync(source, target);
    asset.file = path.relative(assetsRoot, target).replace(/\\/g, '/');
  }
  const expectedRootFiles = new Set((data.assets || []).map(asset => path.basename(asset.file || '')).filter(Boolean));
  for (const asset of data.assets || []) {
    const target = physicalAssetPath(root, asset.file), alias = path.join(assetsRoot, path.basename(asset.file || ''));
    if (target !== alias && fs.existsSync(target) && !fs.existsSync(alias)) {
      try { fs.linkSync(target, alias); } catch { fs.copyFileSync(target, alias); }
    }
  }
  for (const entry of fs.readdirSync(assetsRoot, { withFileTypes:true })) if (entry.isFile() && !expectedRootFiles.has(entry.name)) fs.rmSync(path.join(assetsRoot, entry.name), { force:true });
  const removeEmpty = directory => { for (const entry of fs.readdirSync(directory, { withFileTypes:true })) if (entry.isDirectory()) removeEmpty(path.join(directory, entry.name)); if (directory !== assetsRoot && !expectedDirectories.has(path.resolve(directory).toLowerCase()) && fs.readdirSync(directory).length === 0) fs.rmdirSync(directory); };
  removeEmpty(assetsRoot);
  return data;
}

module.exports = { folderParts, physicalAssetPath, safeRelativeFile, syncPhysicalFolders };
