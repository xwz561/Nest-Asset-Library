// 素材库目录查找：在指定目录下（例如 NAS 上的素材文件夹）找出所有小旺仔素材库。
// 严格只读：只列目录、读 .nest-library.json，不创建、不修改、不删除任何东西。
// 找到素材库（含 .nest-library.json 的文件夹）后不再往它里面深入（assets 里面不会有别的库）。
const fs = require('fs');
const path = require('path');

const INDEX_NAME = '.nest-library.json';
const MAX_INDEX_BYTES = 128 * 1024 * 1024;
// 系统/回收站/缩略图等目录：既没有素材库，在 NAS 上扫描还特别慢
const SKIP_DIRS = new Set(['$recycle.bin', 'system volume information', 'node_modules', '#recycle', '@eadir', '#snapshot', '.git', '.svn', 'windows', 'program files', 'program files (x86)', 'programdata', 'appdata']);

function summarizeLibrary(dir, indexName) {
  const file = path.join(dir, indexName);
  let stat;
  try { stat = fs.statSync(file); } catch { return null; }
  if (!stat.isFile()) return null;
  const fallback = { path: dir, name: path.basename(dir), assets: null, folders: null, team: false, updatedAt: stat.mtimeMs };
  if (stat.size > MAX_INDEX_BYTES) return fallback;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object' || (!Array.isArray(data.assets) && !Array.isArray(data.folders))) return null;
    return {
      path: dir,
      name: String(data.name || path.basename(dir)),
      assets: Array.isArray(data.assets) ? data.assets.filter(asset => asset && !asset.trashedAt).length : 0,
      folders: Array.isArray(data.folders) ? data.folders.length : 0,
      team: Boolean(data.team?.members?.length),
      updatedAt: stat.mtimeMs,
    };
  } catch { return null; }
}

async function findLibraries(root, { maxDepth = 6, maxDirs = 30000, maxResults = 200, concurrency = 8, signal, onFound, onProgress, indexName = INDEX_NAME } = {}) {
  const start = path.resolve(String(root || ''));
  if (!root || !fs.existsSync(start)) return { error: '这个目录不存在或当前无法访问', found: [], scannedDirs: 0 };
  const found = [];
  let level = [start], depth = 0, scannedDirs = 0, unreadable = 0, truncated = false;
  const report = () => onProgress?.({ scannedDirs, found: found.length, current: level[0] || '' });
  outer: while (level.length && depth <= maxDepth) {
    const next = [];
    for (let i = 0; i < level.length; i += concurrency) {
      if (signal?.aborted) break outer;
      const batch = level.slice(i, i + concurrency);
      const results = await Promise.all(batch.map(async dir => {
        try { return { dir, entries: await fs.promises.readdir(dir, { withFileTypes: true }) }; }
        catch { unreadable += 1; return { dir, entries: null }; }
      }));
      for (const { dir, entries } of results) {
        scannedDirs += 1;
        if (!entries) continue;
        if (entries.some(entry => entry.name === indexName && entry.isFile())) {
          const library = summarizeLibrary(dir, indexName);
          if (library) {
            found.push(library); onFound?.(library);
            if (found.length >= maxResults) { truncated = true; break outer; }
            continue; // 不再进入素材库内部
          }
        }
        if (depth < maxDepth) {
          for (const entry of entries) {
            // 只进真正的目录；符号链接/快捷方式一律不跟，避免死循环和跑到别处
            if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
            const lower = entry.name.toLowerCase();
            if (SKIP_DIRS.has(lower) || lower.startsWith('.')) continue;
            next.push(path.join(dir, entry.name));
          }
        }
      }
      report();
      if (scannedDirs + next.length > maxDirs) { truncated = true; break outer; }
    }
    level = next; depth += 1;
  }
  report();
  return { ok: true, found, scannedDirs, unreadable, truncated, cancelled: Boolean(signal?.aborted), root: start };
}

module.exports = { findLibraries, summarizeLibrary, INDEX_NAME };
