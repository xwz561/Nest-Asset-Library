function registerLibraryFinderHandlers({ ipcMain, fs, path, runtimeState, selectFolder, recentLibraryRecords, readSettings, writeJson, settingsFile, libraryMutationQueue, openKnownLibrary, joinTeamLibrary, listLocalRoots = async () => [] }) {
  // 在某个目录（例如 NAS 上的素材文件夹）里找出小旺仔素材库，可直接打开或加入“最近素材库”列表。
  // 查找本身严格只读；渲染进程只能扫描“刚选过/推荐过”的目录，只能打开/加入“本次扫描找到的”素材库。
  const { findLibraries } = require('../library-finder.cjs');
  const { normalizeLibraryRoot, MAX_RECENT_LIBRARIES } = require('../recent-libraries.cjs');
  const lower = value => normalizeLibraryRoot(value).toLowerCase();
  const allowedRoots = new Set();
  const foundPaths = new Set();
  let controller = null;

  const suggestions = () => {
    const out = new Map();
    for (const record of recentLibraryRecords()) {
      let dir = path.dirname(path.resolve(record.path));
      for (let step = 0; step < 2; step += 1) {
        if (!dir || dir === path.dirname(dir)) break; // 不推荐盘符根目录（太大、太慢）
        out.set(lower(dir), dir);
        dir = path.dirname(dir);
      }
    }
    return [...out.values()].slice(0, 8).map(dir => { allowedRoots.add(lower(dir)); return { path: dir, label: path.basename(dir) || dir }; });
  };

  ipcMain.handle('library-finder:suggest', () => ({ roots: suggestions() }));

  ipcMain.handle('library-finder:pick', async () => {
    const root = await selectFolder('选择要查找素材库的目录（例如 NAS 上的素材文件夹）');
    if (!root) return null;
    allowedRoots.add(lower(root));
    return { path: root };
  });

  // 公共扫描流程：依次扫描若干目录，结果合并去重，实时推给界面
  const runScan = async (event, roots, { maxDepth }) => {
    if (controller) return { error: '正在查找中，请等当前这次完成或先停止' };
    foundPaths.clear();
    const known = new Set(recentLibraryRecords().map(item => lower(item.path)));
    const current = runtimeState.libraryPath ? lower(runtimeState.libraryPath) : '';
    const send = (channel, value) => { if (!event.sender.isDestroyed()) event.sender.send(channel, value); };
    controller = new AbortController();
    const total = { found: [], scannedDirs: 0, unreadable: 0, truncated: false, cancelled: false, roots: [] };
    try {
      for (const root of roots) {
        if (controller.signal.aborted) break;
        const result = await findLibraries(root, {
          signal: controller.signal, maxDepth,
          onFound: library => {
            if (foundPaths.has(lower(library.path))) return;
            foundPaths.add(lower(library.path));
            send('library-finder:found', { ...library, known: known.has(lower(library.path)), current: lower(library.path) === current });
          },
          onProgress: progress => send('library-finder:progress', { ...progress, scannedDirs: total.scannedDirs + progress.scannedDirs, found: foundPaths.size, root }),
        });
        if (result.error) { if (roots.length === 1) return result; continue; }
        total.found.push(...result.found.filter(item => !total.found.some(existing => lower(existing.path) === lower(item.path))));
        total.scannedDirs += result.scannedDirs; total.unreadable += result.unreadable || 0;
        total.truncated = total.truncated || result.truncated; total.cancelled = total.cancelled || result.cancelled; total.roots.push(root);
      }
      total.cancelled = total.cancelled || controller.signal.aborted;
      return { ok: true, ...total };
    } catch (error) {
      return { error: `查找失败：${error.message}` };
    } finally { controller = null; }
  };
  const depthOf = (value, fallback) => Math.min(Math.max(Number(value) || fallback, 1), 10);

  ipcMain.handle('library-finder:scan', (event, input = {}) => {
    const root = String(input.root || '');
    if (!root || !allowedRoots.has(lower(root))) return { error: '请先从列表里选择，或点“选择其它目录…”' };
    return runScan(event, [root], { maxDepth: depthOf(input.maxDepth, 6) });
  });

  // 一键查找本机素材库：本机固定磁盘（不含网络盘/NAS 映射盘）+ 用户目录
  ipcMain.handle('library-finder:scan-local', async event => {
    const roots = (await listLocalRoots()).filter(root => root && fs.existsSync(root));
    if (!roots.length) return { error: '没有找到可查找的本机磁盘' };
    return runScan(event, roots, { maxDepth: 5 });
  });

  ipcMain.handle('library-finder:cancel', () => { controller?.abort(); return { ok: true }; });

  // 加入“最近素材库”列表（排在后面，不抢当前库的位置）。列表最多保留 MAX_RECENT_LIBRARIES 个。
  ipcMain.handle('library-finder:add', (_event, paths) => {
    const wanted = (Array.isArray(paths) ? paths : []).map(String).filter(item => foundPaths.has(lower(item)) && fs.existsSync(path.join(item, '.nest-library.json')));
    const settings = readSettings();
    const list = recentLibraryRecords().map(item => item.path);
    let added = 0, skipped = 0;
    for (const item of wanted) {
      if (list.some(existing => lower(existing) === lower(item))) continue;
      if (list.length >= MAX_RECENT_LIBRARIES) { skipped += 1; continue; }
      list.push(normalizeLibraryRoot(item)); added += 1;
    }
    if (added) writeJson(settingsFile(), { ...settings, recentLibraries: list, libraryPath: runtimeState.libraryPath });
    return { added, skipped, max: MAX_RECENT_LIBRARIES, libraries: recentLibraryRecords() };
  });

  ipcMain.handle('library-finder:open', (_event, target) => libraryMutationQueue(async () => {
    const root = String(target || '');
    if (!foundPaths.has(lower(root)) || !fs.existsSync(path.join(root, '.nest-library.json'))) return { error: '这个素材库不在本次查找结果里，或已移动' };
    const joined = await joinTeamLibrary(root);
    const library = openKnownLibrary(path.resolve(root));
    return joined.error && library && !library.error ? { ...library, joinNotice: joined.error } : library;
  }));
}
module.exports = { registerLibraryFinderHandlers };
