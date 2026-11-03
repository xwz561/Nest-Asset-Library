const fs = require('fs');
const path = require('path');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.avif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.m4v']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus', '.wma']);
const DOCUMENT_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md', '.markdown', '.fountain']);
const ASSET_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
]);
const DEFAULT_LOCAL_ROOT = 'D:\\AI_Flow\\Assets save-dev';

function extensionOf(file) {
  return path.extname(String(file || '')).toLowerCase();
}

function isVideoFile(file) {
  return VIDEO_EXTENSIONS.has(extensionOf(file));
}

function isSupportedAssetFile(file) {
  return ASSET_EXTENSIONS.has(extensionOf(file));
}

function assetKindFor(file) {
  const ext = extensionOf(file);
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'document';
  return 'file';
}

function isWithinRoot(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function resolveLocalRoot(root = DEFAULT_LOCAL_ROOT, label = '视频') {
  const requested = path.resolve(String(root || DEFAULT_LOCAL_ROOT));
  let stat;
  try {
    stat = await fs.promises.stat(requested);
  } catch {
    throw new Error(`AI Flow 本地${label}目录不存在`);
  }
  if (!stat.isDirectory()) throw new Error(`AI Flow 本地${label}目录不存在`);
  return fs.promises.realpath(requested);
}

async function listLocalFiles(root = DEFAULT_LOCAL_ROOT, {
  extensions = VIDEO_EXTENSIONS,
  label = '视频',
  limit = 1000,
  onProgress,
} = {}) {
  const resolvedRoot = await resolveLocalRoot(root, label);
  const results = [];
  const visited = new Set();
  const stack = [resolvedRoot];
  let scanned = 0;
  let truncated = false;

  while (stack.length) {
    if (results.length >= limit) {
      truncated = true;
      break;
    }
    const directory = stack.pop();
    let realDirectory;
    try {
      realDirectory = await fs.promises.realpath(directory);
    } catch {
      continue;
    }
    if (!isWithinRoot(resolvedRoot, realDirectory) || visited.has(realDirectory)) continue;
    visited.add(realDirectory);

    let entries;
    try {
      entries = await fs.promises.readdir(realDirectory, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      scanned += 1;
      if (scanned === 1 || scanned % 100 === 0) onProgress?.({ scanned, found: results.length });
      if (entry.isSymbolicLink()) continue;
      const candidate = path.join(realDirectory, entry.name);
      if (entry.isDirectory()) {
        stack.push(candidate);
        continue;
      }
      if (!entry.isFile() || !extensions.has(extensionOf(entry.name))) continue;
      let stat;
      try {
        stat = await fs.promises.stat(candidate);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      const realFile = await fs.promises.realpath(candidate).catch(() => '');
      if (!realFile || !isWithinRoot(resolvedRoot, realFile)) continue;
      results.push({
        path: realFile,
        name: path.basename(realFile),
        relativePath: path.relative(resolvedRoot, realFile).replace(/\\/g, '/'),
        kind: assetKindFor(realFile),
        size: stat.size,
        modifiedAt: stat.mtimeMs,
      });
      if (results.length >= limit) {
        truncated = index < entries.length - 1 || stack.length > 0;
        break;
      }
    }
  }

  results.sort((a, b) => b.modifiedAt - a.modifiedAt || a.relativePath.localeCompare(b.relativePath));
  onProgress?.({ scanned, found: results.length, complete: true });
  return { root: resolvedRoot, records: results, scanned, truncated };
}

async function listLocalVideos(root = DEFAULT_LOCAL_ROOT, options = {}) {
  const result = await listLocalFiles(root, { ...options, extensions: VIDEO_EXTENSIONS, label: '视频' });
  return { ...result, videos: result.records };
}

async function listLocalAssets(root = DEFAULT_LOCAL_ROOT, options = {}) {
  const result = await listLocalFiles(root, { ...options, extensions: ASSET_EXTENSIONS, label: '素材' });
  return { ...result, assets: result.records };
}

async function validateLocalSelections(root, paths, {
  extensions = VIDEO_EXTENSIONS,
  label = '视频',
} = {}) {
  const resolvedRoot = await resolveLocalRoot(root, label);
  const allowed = [];
  for (const value of Array.isArray(paths) ? paths : []) {
    const candidate = path.resolve(String(value || ''));
    if (!extensions.has(extensionOf(candidate))) continue;
    try {
      const stat = await fs.promises.lstat(candidate);
      if (stat.isSymbolicLink() || !stat.isFile()) continue;
      const realFile = await fs.promises.realpath(candidate);
      if (!isWithinRoot(resolvedRoot, realFile)) continue;
      allowed.push(realFile);
    } catch {
      // The AI Flow file can disappear between scan and import. Ignore it here;
      // the caller will report the missing selection explicitly.
    }
  }
  return [...new Set(allowed)];
}

async function validateLocalVideoSelections(root, paths) {
  return validateLocalSelections(root, paths, { extensions: VIDEO_EXTENSIONS, label: '视频' });
}

async function validateLocalAssetSelections(root, paths) {
  return validateLocalSelections(root, paths, { extensions: ASSET_EXTENSIONS, label: '素材' });
}

module.exports = {
  DEFAULT_LOCAL_ROOT,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  AUDIO_EXTENSIONS,
  DOCUMENT_EXTENSIONS,
  ASSET_EXTENSIONS,
  extensionOf,
  isVideoFile,
  isSupportedAssetFile,
  assetKindFor,
  isWithinRoot,
  resolveLocalRoot,
  listLocalFiles,
  listLocalVideos,
  listLocalAssets,
  validateLocalSelections,
  validateLocalVideoSelections,
  validateLocalAssetSelections,
};
