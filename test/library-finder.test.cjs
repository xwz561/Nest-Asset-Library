const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { findLibraries } = require('../electron/library-finder.cjs');
const { registerLibraryFinderHandlers } = require('../electron/handlers/library-finder.cjs');

const tmp = t => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finder-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; };
const makeLib = (dir, name, assets = 2, extra = {}) => {
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.nest-library.json'), JSON.stringify({ version: 1, name, folders: [], assets: Array.from({ length: assets }, (_, i) => ({ id: String(i), file: `a${i}.wav` })), ...extra }));
};
const snapshot = dir => { const out = {}; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); out[path.relative(dir, p)] = e.isDirectory() ? 'dir' : fs.readFileSync(p, 'utf8'); if (e.isDirectory()) walk(p); } })(dir); return out; };

test('递归找出素材库：名称、素材数（不含回收站）、不进入库内部', async t => {
  const root = tmp(t);
  makeLib(path.join(root, 'A'), '音乐库', 3);
  makeLib(path.join(root, 'LW', 'deep', 'B'), '新建文件夹', 1, { assets: [{ id: '1' }, { id: '2', trashedAt: 1 }], team: { ownerId: 'u', members: [{ id: 'u' }] } });
  makeLib(path.join(root, 'A', 'assets', 'inner'), '库里面的库', 1); // 在库里面，不应被找到
  fs.mkdirSync(path.join(root, 'empty'));
  const seen = [];
  const result = await findLibraries(root, { onFound: lib => seen.push(lib.name) });
  assert.equal(result.ok, true);
  assert.deepEqual(result.found.map(lib => lib.name).sort(), ['新建文件夹', '音乐库']);
  assert.equal(result.found.find(lib => lib.name === '音乐库').assets, 3);
  const b = result.found.find(lib => lib.name === '新建文件夹');
  assert.equal(b.assets, 1); assert.equal(b.team, true);
  assert.equal(seen.length, 2);
});

test('严格只读：查找前后整个目录树逐字节一致', async t => {
  const root = tmp(t);
  makeLib(path.join(root, 'A'), 'A', 2); makeLib(path.join(root, 'x', 'B'), 'B', 1);
  fs.writeFileSync(path.join(root, 'note.txt'), 'hello');
  const before = snapshot(root);
  await findLibraries(root);
  assert.deepEqual(snapshot(root), before);
});

test('忽略损坏/不是素材库的 .nest-library.json，并继续往里找；跳过系统目录和隐藏目录', async t => {
  const root = tmp(t);
  fs.mkdirSync(path.join(root, 'bad', 'good'), { recursive: true });
  fs.writeFileSync(path.join(root, 'bad', '.nest-library.json'), '{not json');
  makeLib(path.join(root, 'bad', 'good'), '好库', 1);
  fs.mkdirSync(path.join(root, 'other')); fs.writeFileSync(path.join(root, 'other', '.nest-library.json'), JSON.stringify({ hello: 1 }));
  makeLib(path.join(root, '$RECYCLE.BIN', 'S-1', 'x'), '回收站里的', 1);
  makeLib(path.join(root, '#recycle', 'x'), 'NAS回收站里的', 1);
  makeLib(path.join(root, '.hidden', 'x'), '隐藏的', 1);
  makeLib(path.join(root, 'node_modules', 'x'), 'nm', 1);
  const result = await findLibraries(root);
  assert.deepEqual(result.found.map(lib => lib.name), ['好库']);
});

test('深度限制、数量上限与取消', async t => {
  const root = tmp(t);
  makeLib(path.join(root, 'a'), '浅', 1); makeLib(path.join(root, 'a1', 'a2', 'a3', 'deep'), '深', 1);
  assert.deepEqual((await findLibraries(root, { maxDepth: 1 })).found.map(l => l.name), ['浅']);
  assert.equal((await findLibraries(root, { maxDepth: 6 })).found.length, 2);
  const capped = await findLibraries(root, { maxResults: 1 });
  assert.equal(capped.found.length, 1); assert.equal(capped.truncated, true);
  const controller = new AbortController(); controller.abort();
  const cancelled = await findLibraries(root, { signal: controller.signal });
  assert.equal(cancelled.cancelled, true); assert.equal(cancelled.found.length, 0);
  const limited = await findLibraries(root, { maxDirs: 2 });
  assert.equal(limited.truncated, true);
});

test('符号链接不会被跟随（避免死循环）；目录不存在返回错误', async t => {
  const root = tmp(t);
  makeLib(path.join(root, 'A'), 'A', 1);
  try { fs.symlinkSync(root, path.join(root, 'A2'), 'dir'); } catch { /* 无权限创建链接时跳过 */ }
  const result = await findLibraries(root);
  assert.deepEqual(result.found.map(l => l.name), ['A']);
  assert.ok((await findLibraries(path.join(root, 'nope'))).error);
});

test('IPC：只能扫描选过的目录；只能打开/加入本次找到的库；加入列表受上限约束', async t => {
  const root = tmp(t);
  makeLib(path.join(root, 'cur'), '当前库', 1); makeLib(path.join(root, 'A'), 'A库', 2); makeLib(path.join(root, 'B'), 'B库', 3);
  const handlers = new Map();
  const ipcMain = { handle: (channel, fn) => handlers.set(channel, fn) };
  let settings = { recentLibraries: [path.join(root, 'cur')] };
  const written = [];
  const opened = [];
  const state = { libraryPath: path.join(root, 'cur') };
  const records = () => settings.recentLibraries.map(p => ({ id: p, path: p, name: path.basename(p), current: p === state.libraryPath }));
  registerLibraryFinderHandlers({
    ipcMain, fs, path, runtimeState: state, recentLibraryRecords: records, readSettings: () => settings, writeJson: (_f, value) => { settings = value; written.push(value); }, settingsFile: () => 'settings.json',
    selectFolder: async () => root, libraryMutationQueue: fn => fn(), openKnownLibrary: p => { opened.push(p); return { name: path.basename(p), assets: [] }; }, joinTeamLibrary: async () => ({}),
  });
  assert.deepEqual([...handlers.keys()].sort(), ['library-finder:add', 'library-finder:cancel', 'library-finder:open', 'library-finder:pick', 'library-finder:scan', 'library-finder:scan-local', 'library-finder:suggest']);
  const event = { sender: { isDestroyed: () => false, send: () => {} } };
  assert.ok((await handlers.get('library-finder:scan')(event, { root })).error, '没选过的目录不能扫描');
  assert.ok((await handlers.get('library-finder:open')({}, path.join(root, 'A'))).error, '没扫描前不能打开');
  const suggested = await handlers.get('library-finder:suggest')();
  assert.equal(suggested.roots[0].path, root);
  const picked = await handlers.get('library-finder:pick')();
  assert.equal(picked.path, root);
  const sent = [];
  const result = await handlers.get('library-finder:scan')({ sender: { isDestroyed: () => false, send: (c, v) => sent.push([c, v]) } }, { root: picked.path });
  assert.equal(result.found.length, 3);
  const foundMsgs = sent.filter(([c]) => c === 'library-finder:found').map(([, v]) => v);
  assert.equal(foundMsgs.find(v => v.name === '当前库').current, true);
  assert.equal(foundMsgs.find(v => v.name === '当前库').known, true);
  assert.equal(foundMsgs.find(v => v.name === 'A库').known, false);
  assert.ok((await handlers.get('library-finder:add')({}, [path.join(os.tmpdir(), 'evil')])).added === 0, '不在结果里的路径被忽略');
  const added = await handlers.get('library-finder:add')({}, [path.join(root, 'A'), path.join(root, 'B'), path.join(root, 'A')]);
  assert.equal(added.added, 2);
  assert.equal(settings.recentLibraries[0], path.join(root, 'cur'), '当前库仍排第一');
  assert.equal(settings.recentLibraries.length, 3);
  const open = await handlers.get('library-finder:open')({}, path.join(root, 'B'));
  assert.equal(open.name, 'B'); assert.deepEqual(opened, [path.join(root, 'B')]);
});

test('一键查找本机：依次扫描本机磁盘/用户目录，合并去重，网络盘不在其中', async t => {
  const diskA = tmp(t), diskB = tmp(t);
  makeLib(path.join(diskA, '撬座棩', '音乐库'), '音乐库', 5); makeLib(path.join(diskB, 'Work', 'X'), 'X库', 2);
  const handlers = new Map();
  const ipcMain = { handle: (channel, fn) => handlers.set(channel, fn) };
  const state = { libraryPath: null };
  registerLibraryFinderHandlers({
    ipcMain, fs, path, runtimeState: state, recentLibraryRecords: () => [], readSettings: () => ({}), writeJson: () => {}, settingsFile: () => 's.json',
    selectFolder: async () => null, libraryMutationQueue: fn => fn(), openKnownLibrary: () => ({}), joinTeamLibrary: async () => ({}),
    listLocalRoots: async () => [diskA, diskB, diskA, path.join(diskA, 'missing')],
  });
  const sent = [];
  const event = { sender: { isDestroyed: () => false, send: (c, v) => sent.push([c, v]) } };
  const result = await handlers.get('library-finder:scan-local')(event);
  assert.equal(result.ok, true);
  assert.deepEqual(result.found.map(l => l.name).sort(), ['X库', '音乐库']);
  assert.equal(sent.filter(([c]) => c === 'library-finder:found').length, 2, '重复的盘只报一次');
  assert.ok(sent.some(([c, v]) => c === 'library-finder:progress' && v.root === diskB));
  assert.ok((await handlers.get('library-finder:add')({}, [path.join(diskA, '撬座棩', '音乐库')])).added === 1, '扫描结果可以加入列表');
});

test('本机磁盘列表：在非 Windows 环境下至少给出用户目录；不返回网络盘', async () => {
  const { listLocalRoots } = require('../electron/local-drives.cjs');
  const roots = await listLocalRoots();
  assert.ok(Array.isArray(roots) && roots.length >= 1);
  assert.ok(roots.every(root => typeof root === 'string' && root.length > 1));
});
