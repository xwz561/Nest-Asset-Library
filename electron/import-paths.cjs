const fs = require('fs');
const path = require('path');

const SUPPORTED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.avif',
  '.mp4', '.webm', '.mov', '.m4v',
  '.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus', '.wma',
]);

async function expandImportPaths(inputPaths, { maxFiles = 10000 } = {}) {
  const files = [];
  const entries = [];
  const directories = [];
  const errors = [];
  const visitedDirectories = new Set();

  async function visit(target, fromDirectory = false, folderParts = []) {
    if (files.length >= maxFiles) throw new Error(`单次最多导入 ${maxFiles} 个素材`);
    let stat;
    try {
      stat = await fs.promises.lstat(target);
    } catch (error) {
      errors.push(`${path.basename(target)}: ${error.message}`);
      return;
    }

    if (stat.isSymbolicLink()) return;
    if (stat.isFile()) {
      if (!fromDirectory || SUPPORTED_EXTENSIONS.has(path.extname(target).toLowerCase())) {
        files.push(target);
        entries.push({ file: target, folders: folderParts });
      }
      return;
    }
    if (!stat.isDirectory()) return;

    const real = await fs.promises.realpath(target).catch(() => path.resolve(target));
    if (visitedDirectories.has(real)) return;
    visitedDirectories.add(real);
    directories.push(folderParts);

    let dirEntries;
    try {
      dirEntries = await fs.promises.readdir(target, { withFileTypes: true });
    } catch (error) {
      errors.push(`${path.basename(target)}: ${error.message}`);
      return;
    }
    dirEntries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of dirEntries) {
      const childFolders = entry.isDirectory() ? [...folderParts, entry.name] : folderParts;
      await visit(path.join(target, entry.name), true, childFolders);
    }
  }

  for (const target of inputPaths) {
    let stat;
    try { stat = await fs.promises.lstat(target); } catch {}
    const folderParts = stat?.isDirectory() ? [path.basename(path.resolve(target))] : [];
    await visit(target, false, folderParts);
  }
  return { files, entries, directories: directories.filter(parts => parts.length), errors };
}

module.exports = { expandImportPaths, SUPPORTED_EXTENSIONS };
