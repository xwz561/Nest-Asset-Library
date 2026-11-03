const fs = require('fs');
const path = require('path');

const SUPPORTED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.avif',
  '.mp4', '.webm', '.mov', '.m4v',
  '.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus', '.wma',
  '.pdf', '.docx', '.txt', '.md', '.markdown', '.fountain',
]);

function folderPartsForImport(entryFolders, { preserveFolders = false, preserveTopLevelFolders = false } = {}) {
  const folders = Array.isArray(entryFolders) ? entryFolders.filter(Boolean) : [];
  if (preserveFolders) return folders;
  return preserveTopLevelFolders && folders.length ? [folders[0]] : [];
}

async function expandImportPaths(inputPaths, { maxFiles = 10000, maxEntries = 50000, onProgress, signal } = {}) {
  const files = [];
  const entries = [];
  const directories = [];
  const errors = [];
  const visitedDirectories = new Set();
  let inspectedEntries = 0;
  const cancelled = () => Boolean(signal?.aborted);

  async function visit(target, fromDirectory = false, folderParts = []) {
    if (cancelled()) return true;
    inspectedEntries += 1;
    if (inspectedEntries > maxEntries) throw new Error(`文件夹内容过多，单次最多扫描 ${maxEntries} 个文件和文件夹`);
    if (inspectedEntries === 1 || inspectedEntries % 25 === 0) onProgress?.({ phase: 'scanning', scanned: inspectedEntries, found: files.length });
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
        if (files.length >= maxFiles) throw new Error(`单次最多导入 ${maxFiles} 个素材`);
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
      if (cancelled()) return true;
      const childFolders = entry.isDirectory() ? [...folderParts, entry.name] : folderParts;
      if (await visit(path.join(target, entry.name), true, childFolders)) return true;
    }
    return false;
  }

  for (const target of inputPaths) {
    if (cancelled()) break;
    let stat;
    try { stat = await fs.promises.lstat(target); } catch {}
    const folderParts = stat?.isDirectory() ? [path.basename(path.resolve(target))] : [];
    if (await visit(target, false, folderParts)) break;
  }
  onProgress?.({ phase: 'scanning', scanned: inspectedEntries, found: files.length });
  return { files, entries, directories: directories.filter(parts => parts.length), errors, cancelled: cancelled() };
}

module.exports = { expandImportPaths, folderPartsForImport, SUPPORTED_EXTENSIONS };
