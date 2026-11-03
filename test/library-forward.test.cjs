const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { forwardToLibrary, describeLibrary } = require('../electron/library-forward.cjs');
const { registerForwardHandlers } = require('../electron/handlers/forward.cjs');
const { LOCK_FILE } = require('../electron/file-lock.cjs');

const indexOf = root => path.join(root, '.nest-library.json');
const readIndex = root => JSON.parse(fs.readFileSync(indexOf(root), 'utf8'));
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const tmp = t => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forward-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; };
const me = { id: 'u1', name: '小李', color: '#4f9cf9' };
const ownTeam = { ownerId: 'u1', members: [{ id: 'u1', name: '小李', role: 'admin' }] };

// files: [{ id, name, folder(folderId|null), content, tags }]
function makeLibrary(root, { name, folders = [], files = [], tags = [], team } = {}) {
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  const byId = new Map(folders.map(f => [f.id, f]));
  const partsOf = id => { const out = []; for (let f = byId.get(id); f; f = byId.get(f.parentId)) out.unshift(f.name); return out; };
  const assets = files.map(file => {
    const rel = [...partsOf(file.folder), file.name].join('/');
    fs.mkdirSync(path.dirname(path.join(root, 'assets', rel)), { recursive: true });
    fs.writeFileSync(path.join(root, 'assets', rel), file.content);
    return { id: file.id, name: file.name.replace(/\.[^.]+$/, ''), file: rel, folderId: file.folder || null, hash: sha(file.content), tags: file.tags || [], note: file.note || '', createdAt: 1, modifiedAt: 1 };
  });
  fs.writeFileSync(indexOf(root), JSON.stringify({ version: 1, name, folders, assets, tags, ...(team ? { team } : {}) }));
  return root;
}
const folder = (id, name, parentId = null) => ({ id, name, parentId, icon: 'folder', color: '#fff', createdAt: 1 });
const snapshotDir = dir => { const out = {}; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out[path.relative(dir, p)] = fs.readFileSync(p, 'utf8'); } })(dir); return out; };

function pair(t, targetExtra = {}) {
  const base = tmp(t);
  const source = makeLibrary(path.join(base, 'src'), {
    name: '来源库', team: ownTeam,
    folders: [folder('f1', '角色'), folder('f2', '正面', 'f1'), folder('f3', '空文件夹', 'f1')],
    files: [
      { id: 'a1', name: 'hero.png', folder: 'f1', content: 'HERO', tags: ['主角', '设定'], note: '备注A' },
      { id: 'a2', name: 'face.png', folder: 'f2', content: 'FACE', tags: ['主角'] },
      { id: 'a3', name: 'loose.mp3', folder: null, content: 'LOOSE', tags: ['音乐'] },
    ],
    tags: ['主角', '设定', '音乐'],
  });
  const target = makeLibrary(path.join(base, 'dst'), { name: '目标库', team: ownTeam, ...targetExtra });
  return { source, target };
}

test('转发文件夹：保留子文件夹结构（含空文件夹）、标签、备注，来源库完全不变', async t => {
  const { source, target } = pair(t);
  const before = { files: snapshotDir(source), index: fs.readFileSync(indexOf(source), 'utf8') };
  const result = await forwardToLibrary({ sourceRoot: source, targetRoot: target, folderIds: ['f1'], me });
  assert.equal(result.ok, true);
  assert.equal(result.copied, 2);
  assert.equal(result.targetName, '目标库');
  const data = readIndex(target);
  const names = data.folders.map(f => f.name).sort();
  assert.deepEqual(names, ['正面', '空文件夹', '角色']);
  const byName = Object.fromEntries(data.assets.map(a => [a.name, a]));
  assert.equal(byName.hero.note, '备注A');
  assert.deepEqual(byName.hero.tags, ['主角', '设定']);
  assert.equal(data.folders.find(f => f.id === byName.face.folderId).name, '正面');
  assert.equal(fs.readFileSync(path.join(target, 'assets', byName.face.file), 'utf8'), 'FACE');
  assert.match(byName.face.file.replace(/\\/g, '/'), /^角色\/正面\//);
  assert.deepEqual(data.tags.sort(), ['主角', '设定']);
  assert.equal(byName.hero.importSource.provider, '素材库转发');
  assert.notEqual(byName.hero.id, 'a1');
  // 来源库一字节都没变
  assert.deepEqual(snapshotDir(source), before.files);
  assert.equal(fs.readFileSync(indexOf(source), 'utf8'), before.index);
  assert.equal(fs.existsSync(path.join(target, LOCK_FILE)), false);
});

test('单独选中的素材放到目标库根目录，也可以指定目标文件夹', async t => {
  const { source, target } = pair(t, { folders: [folder('t1', '收件箱')] });
  const r1 = await forwardToLibrary({ sourceRoot: source, targetRoot: target, assetIds: ['a3'], me });
  assert.equal(r1.copied, 1);
  assert.equal(readIndex(target).assets[0].folderId, null);
  const r2 = await forwardToLibrary({ sourceRoot: source, targetRoot: target, assetIds: ['a1'], targetFolderId: 't1', me });
  assert.equal(r2.copied, 1);
  const asset = readIndex(target).assets[0];
  assert.equal(asset.folderId, 't1');
  assert.equal(fs.readFileSync(path.join(target, 'assets', asset.file), 'utf8'), 'HERO');
});

test('重复转发同一批：按内容去重跳过，不会产生副本', async t => {
  const { source, target } = pair(t);
  await forwardToLibrary({ sourceRoot: source, targetRoot: target, folderIds: ['f1'], assetIds: ['a3'], me });
  const files1 = snapshotDir(path.join(target, 'assets'));
  const again = await forwardToLibrary({ sourceRoot: source, targetRoot: target, folderIds: ['f1'], assetIds: ['a3'], me });
  assert.equal(again.copied, 0);
  assert.equal(again.duplicates, 3);
  assert.equal(readIndex(target).assets.length, 3);
  assert.deepEqual(snapshotDir(path.join(target, 'assets')), files1);
});

test('同名但内容不同的文件会自动改名，不覆盖目标库已有文件', async t => {
  const { source, target } = pair(t, { files: [{ id: 'x', name: 'loose.mp3', folder: null, content: 'OTHER' }] });
  const result = await forwardToLibrary({ sourceRoot: source, targetRoot: target, assetIds: ['a3'], me });
  assert.equal(result.copied, 1);
  const files = snapshotDir(path.join(target, 'assets'));
  assert.equal(files['loose.mp3'], 'OTHER');
  assert.equal(Object.keys(files).length, 2);
  assert.ok(Object.values(files).includes('LOOSE'));
});

test('来源文件丢失：记入失败列表，其它素材照常转发', async t => {
  const { source, target } = pair(t);
  fs.rmSync(path.join(source, 'assets', '角色', 'hero.png'));
  const result = await forwardToLibrary({ sourceRoot: source, targetRoot: target, folderIds: ['f1'], me });
  assert.equal(result.copied, 1);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /hero/);
});

test('目标库里只有查看权限：拒绝，且不写入任何文件', async t => {
  const { source, target } = pair(t, { team: { ownerId: 'boss', members: [{ id: 'boss', name: '老板', role: 'admin' }, { id: 'u1', name: '小李', role: 'viewer' }] } });
  const result = await forwardToLibrary({ sourceRoot: source, targetRoot: target, folderIds: ['f1'], me });
  assert.match(result.error, /编辑权限/);
  assert.deepEqual(snapshotDir(path.join(target, 'assets')), {});
  assert.equal(readIndex(target).assets.length, 0);
});

test('目标库还没加入时按 join 自动加入为编辑成员再转发；被移出的人不能转发', async t => {
  const { source, target } = pair(t, { team: { ownerId: 'boss', members: [{ id: 'boss', name: '老板', role: 'admin' }] } });
  const { joinTeamLibrary } = require('../electron/team-join.cjs');
  const join = root => joinTeamLibrary(root, me);
  assert.equal(describeLibrary(target, me).canEdit, true);
  const ok = await forwardToLibrary({ sourceRoot: source, targetRoot: target, assetIds: ['a3'], me, join });
  assert.equal(ok.copied, 1);
  assert.deepEqual(readIndex(target).team.members.map(m => m.id), ['boss', 'u1']);
  const { source: s2, target: t2 } = pair(t, { team: { ownerId: 'boss', removedIds: ['u1'], members: [{ id: 'boss', name: '老板', role: 'admin' }] } });
  assert.equal(describeLibrary(t2, me).canEdit, false);
  const denied = await forwardToLibrary({ sourceRoot: s2, targetRoot: t2, assetIds: ['a3'], me, join });
  assert.ok(denied.error);
  assert.equal(readIndex(t2).assets.length, 0);
});

test('不能转发到自己；目标不可用；选择为空', async t => {
  const { source, target } = pair(t);
  assert.match((await forwardToLibrary({ sourceRoot: source, targetRoot: source, assetIds: ['a1'], me })).error, /自己/);
  assert.ok((await forwardToLibrary({ sourceRoot: source, targetRoot: path.join(target, 'nope'), assetIds: ['a1'], me })).error);
  assert.match((await forwardToLibrary({ sourceRoot: source, targetRoot: target, assetIds: ['zzz'], me })).error, /没有可转发/);
  assert.match((await forwardToLibrary({ sourceRoot: source, targetRoot: target, assetIds: ['a1'], targetFolderId: 'ghost', me })).error, /目标文件夹/);
});

test('目标库被别人持有写锁时等待而不是写坏；拿不到锁则清理自己复制的文件并报错', async t => {
  const { source, target } = pair(t);
  fs.writeFileSync(path.join(target, LOCK_FILE), JSON.stringify({ owner: 'other', host: 'x', pid: 1, createdAt: Date.now(), heartbeatAt: Date.now() }));
  const result = await forwardToLibrary({ sourceRoot: source, targetRoot: target, folderIds: ['f1'], me, lockOptions: { timeoutMs: 300, retryMs: 50 } });
  assert.ok(result.error, '应该报错');
  assert.deepEqual(snapshotDir(path.join(target, 'assets')), {}, '孤儿文件被清理');
  assert.equal(readIndex(target).assets.length, 0);
});

test('进度回调：复制阶段按素材数递增，结束时给出 complete', async t => {
  const { source, target } = pair(t);
  const events = [];
  await forwardToLibrary({ sourceRoot: source, targetRoot: target, folderIds: ['f1'], assetIds: ['a3'], me, onProgress: value => events.push(value) });
  assert.equal(events[0].total, 3);
  assert.equal(events.at(-1).phase, 'complete');
  assert.equal(events.at(-1).processed, 3);
});

test('IPC：目标只能是最近列表里的非当前库；同时只允许一个转发', async t => {
  const { source, target } = pair(t);
  const handlers = new Map();
  const ipcMain = { handle: (channel, fn) => handlers.set(channel, fn) };
  const records = [{ id: 'cur', path: source, current: true }, { id: 'dst', path: target, current: false }];
  registerForwardHandlers({ ipcMain, runtimeState: { libraryPath: source }, recentLibraryRecords: () => records, joinTeamLibrary: async () => ({}), currentProfile: () => me });
  assert.deepEqual([...handlers.keys()].sort(), ['library:forward', 'library:forward-info']);
  assert.ok((await handlers.get('library:forward-info')({}, 'cur')).error);
  assert.ok((await handlers.get('library:forward-info')({}, '../etc')).error);
  const info = await handlers.get('library:forward-info')({}, 'dst');
  assert.equal(info.name, '目标库');
  assert.deepEqual(info.folders, []);
  const sent = [];
  const event = { sender: { isDestroyed: () => false, send: (...args) => sent.push(args) } };
  assert.ok((await handlers.get('library:forward')(event, { targetId: 'nope', assetIds: ['a1'] })).error);
  const first = handlers.get('library:forward')(event, { targetId: 'dst', folderIds: ['f1'] });
  const second = await handlers.get('library:forward')(event, { targetId: 'dst', folderIds: ['f1'] });
  assert.match(second.error, /正在转发/);
  assert.equal((await first).copied, 2);
  assert.ok(sent.some(([channel, value]) => channel === 'library:forward-progress' && value.phase === 'complete'));
});
