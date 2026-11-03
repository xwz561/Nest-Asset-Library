const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { joinTeamLibrary } = require('../electron/team-join.cjs');
const { registerTeamFolderHandlers } = require('../electron/handlers/team-folder.cjs');
const { registerTeamHandlers } = require('../electron/handlers/team.cjs');
const { normalizeMember } = require('../electron/team-permissions.cjs');
const { LOCK_FILE } = require('../electron/file-lock.cjs');

const indexOf = root => path.join(root, '.nest-library.json');
const tmp = t => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'team-folder-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; };
const readIndex = root => JSON.parse(fs.readFileSync(indexOf(root), 'utf8'));
const person = (id, name) => ({ id, name, color: '#4f9cf9' });
const makeLibrary = (root, extra = {}) => { fs.mkdirSync(path.join(root, 'assets'), { recursive: true }); fs.writeFileSync(indexOf(root), JSON.stringify({ version: 1, name: '公司库', folders: [], tags: [], assets: [{ id: 'a1', name: '素材' }], ...extra })); };

test('第一个人打开没有成员表的库：成为所有者和管理员，素材原样保留，并释放写锁', async t => {
  const root = tmp(t); makeLibrary(root);
  const result = await joinTeamLibrary(root, person('u1', '小李'));
  assert.deepEqual([result.joined, result.role, result.created], [true, 'admin', true]);
  const data = readIndex(root);
  assert.equal(data.team.ownerId, 'u1');
  assert.equal(data.assets.length, 1);
  assert.equal(fs.existsSync(path.join(root, LOCK_FILE)), false);
});

test('同事选同一个文件夹：自动以编辑成员加入，不影响已有成员', async t => {
  const root = tmp(t); makeLibrary(root);
  await joinTeamLibrary(root, person('u1', '小李'));
  const result = await joinTeamLibrary(root, person('u2', '小王'));
  assert.deepEqual([result.joined, result.role], [true, 'editor']);
  const data = readIndex(root);
  assert.deepEqual(data.team.members.map(m => [m.name, m.role]), [['小李', 'admin'], ['小王', 'editor']]);
  assert.equal(data.team.ownerId, 'u1');
});

test('库设置了默认角色（如仅查看）时按默认角色加入；无效值回退为编辑', async t => {
  const root = tmp(t); makeLibrary(root, { team: { ownerId: 'u1', defaultRole: 'viewer', members: [{ id: 'u1', name: '小李', role: 'admin' }] } });
  assert.equal((await joinTeamLibrary(root, person('u2', '小王'))).role, 'viewer');
  const other = tmp(t); makeLibrary(other, { team: { ownerId: 'u1', defaultRole: 'owner', members: [{ id: 'u1', name: '小李', role: 'admin' }] } });
  assert.equal((await joinTeamLibrary(other, person('u2', '小王'))).role, 'editor');
});

test('重复打开不会重复加入，也不会改变已有角色；改名会同步', async t => {
  const root = tmp(t); makeLibrary(root, { team: { ownerId: 'u1', members: [{ id: 'u1', name: '小李', role: 'admin' }, { id: 'u2', name: '小王', role: 'viewer' }] } });
  const result = await joinTeamLibrary(root, person('u2', '王小二'));
  assert.deepEqual([result.joined, result.role], [true, 'viewer']);
  const data = readIndex(root);
  assert.equal(data.team.members.length, 2);
  assert.equal(data.team.members[1].name, '王小二');
});

test('名字和别的成员重复时拒绝加入，并且不改动索引', async t => {
  const root = tmp(t); makeLibrary(root, { team: { ownerId: 'u1', members: [{ id: 'u1', name: '小李', role: 'admin' }] } });
  const before = fs.readFileSync(indexOf(root), 'utf8');
  const result = await joinTeamLibrary(root, person('u9', ' 小李 '));
  assert.equal(result.joined, false);
  assert.match(result.error, /已经有叫/);
  assert.equal(fs.readFileSync(indexOf(root), 'utf8'), before);
});

test('不是素材库的文件夹不会被改动；锁被占用超时则不加入但不抛错', async t => {
  const empty = tmp(t);
  assert.equal((await joinTeamLibrary(empty, person('u1', '小李'))).joined, false);
  assert.deepEqual(fs.readdirSync(empty), []);
  const root = tmp(t); makeLibrary(root);
  fs.writeFileSync(path.join(root, LOCK_FILE), JSON.stringify({ token: 'other' }));
  const result = await joinTeamLibrary(root, person('u1', '小李'), { lockOptions: { timeoutMs: 150, retryMs: 20, staleMs: 60000 } });
  assert.equal(result.joined, false);
  assert.match(result.error, /其他成员写入/);
});

test('十个人同时选同一个文件夹：全部加入且没有人丢失', async t => {
  const root = tmp(t); makeLibrary(root);
  await joinTeamLibrary(root, person('owner', '管理员'));
  const people = Array.from({ length: 10 }, (_, i) => person(`u${i}`, `成员${i}`));
  const results = await Promise.all(people.map(p => joinTeamLibrary(root, p, { lockOptions: { timeoutMs: 8000 } })));
  assert.ok(results.every(r => r.joined), JSON.stringify(results));
  assert.equal(readIndex(root).team.members.length, 11);
});

function handlers(overrides = {}) {
  const channels = new Map(); const state = { profile: { id: 'u1', name: '我' }, opened: [], created: [], renamed: [] };
  registerTeamFolderHandlers({
    ipcMain: { handle: (name, fn) => channels.set(name, fn) }, fs, path,
    selectFolder: async () => state.pick,
    libraryMutationQueue: task => Promise.resolve().then(task),
    initializeLibrary: root => { state.created.push(root); makeLibrary(root); },
    openKnownLibrary: root => { state.opened.push(root); return { path: root, assets: [] }; },
    joinTeamLibrary: async () => ({ joined: true, role: 'editor' }),
    currentProfile: () => state.profile, setProfile: patch => { state.renamed.push(patch); state.profile = { ...state.profile, ...patch }; },
    indexFile: indexOf, readJson: file => JSON.parse(fs.readFileSync(file, 'utf8')), ...overrides,
  });
  return { call: (name, ...args) => channels.get(name)({}, ...args), state };
}

test('选择文件夹：已有素材库返回名称/素材数/成员数；非素材库返回里面已有多少项且不创建任何文件', async t => {
  const lib = tmp(t); makeLibrary(lib, { team: { ownerId: 'u1', members: [{ id: 'u1', name: 'a', role: 'admin' }] } });
  const h = handlers(); h.state.pick = lib;
  assert.deepEqual(await h.call('team-folder:pick'), { path: lib, isLibrary: true, name: '公司库', members: 1, assets: 1 });
  const plain = tmp(t); fs.writeFileSync(path.join(plain, 'x.wav'), 'x'); fs.writeFileSync(path.join(plain, '.hidden'), 'x');
  h.state.pick = plain;
  const picked = await h.call('team-folder:pick');
  assert.deepEqual([picked.isLibrary, picked.existingEntries], [false, 1]);
  assert.deepEqual(fs.readdirSync(plain).sort(), ['.hidden', 'x.wav']);
  h.state.pick = null;
  assert.equal(await h.call('team-folder:pick'), null);
});

test('连接只接受刚选过的目录；名字为空或为默认“我”时拒绝', async t => {
  const lib = tmp(t); makeLibrary(lib);
  const h = handlers(); h.state.pick = lib;
  assert.match((await h.call('team-folder:connect', { path: lib, name: '小李' })).error, /先选择/);
  await h.call('team-folder:pick');
  assert.match((await h.call('team-folder:connect', { path: tmp(t), name: '小李' })).error, /先选择/);
  assert.match((await h.call('team-folder:connect', { path: lib, name: '我' })).error, /名字/);
  assert.match((await h.call('team-folder:connect', { path: lib, name: '  ' })).error, /名字/);
  assert.equal(h.state.opened.length, 0);
});

test('连接已有素材库：保存名字、加入并打开；非素材库未确认创建时不创建，确认后才创建', async t => {
  const lib = tmp(t); makeLibrary(lib);
  const h = handlers(); h.state.pick = lib; await h.call('team-folder:pick');
  const opened = await h.call('team-folder:connect', { path: lib, name: '小王' });
  assert.deepEqual([opened.path, opened.joinedRole, h.state.renamed], [lib, 'editor', [{ name: '小王' }]]);
  const plain = tmp(t); h.state.pick = plain; await h.call('team-folder:pick');
  assert.match((await h.call('team-folder:connect', { path: plain, name: '小王' })).error, /还不是素材库/);
  assert.equal(h.state.created.length, 0);
  const created = await h.call('team-folder:connect', { path: plain, name: '小王', create: true });
  assert.deepEqual([h.state.created, created.path], [[plain], plain]);
});

test('加入失败（如重名）时返回错误并且不打开素材库', async t => {
  const lib = tmp(t); makeLibrary(lib);
  const h = handlers({ joinTeamLibrary: async () => ({ joined: false, error: '团队里已经有叫“小王”的成员，请换一个名字' }) });
  h.state.pick = lib; await h.call('team-folder:pick');
  assert.match((await h.call('team-folder:connect', { path: lib, name: '小王' })).error, /已经有叫/);
  assert.equal(h.state.opened.length, 0);
});

// ---- 成员与权限（管理员配置）----
function teamHarness(root, me) {
  const channels = new Map(); const profile = { ...me };
  const readLibrary = () => { const data = JSON.parse(fs.readFileSync(indexOf(root), 'utf8')); data.assets = data.assets || []; return data; };
  const roleOf = data => { const m = data.team.members.find(item => item.id === profile.id); return m ? (m.id === data.team.ownerId ? 'owner' : m.role) : null; };
  const LEVEL = { viewer: 1, editor: 2, admin: 3, owner: 4 };
  registerTeamHandlers({
    ipcMain: { handle: (name, fn) => channels.set(name, fn) }, readLibrary,
    currentProfile: () => profile, currentRole: roleOf,
    setProfile: patch => Object.assign(profile, patch),
    enqueueLibraryMutation: async (task, minRole = 'editor') => {
      if (minRole) { const data = readLibrary(); if (!data.team || (LEVEL[roleOf(data)] || 0) < LEVEL[minRole]) return { error: '权限不足' }; }
      return task();
    },
    normalizeMember, writeJson: (file, value) => fs.writeFileSync(file, JSON.stringify(value)), indexFile: indexOf,
    publicLibrary: data => data, runtimeState: { libraryPath: root },
  });
  return { call: (name, ...args) => channels.get(name)({}, ...args), profile };
}

test('管理员预先添加同事：同名同事第一次加入时认领，沿用管理员设的角色，不会出现两条记录', async t => {
  const root = tmp(t); makeLibrary(root);
  await joinTeamLibrary(root, person('owner', '管理员'));
  const admin = teamHarness(root, person('owner', '管理员'));
  assert.equal((await admin.call('team:add-member', { name: '小王', role: 'viewer' })).ok, true);
  assert.equal(readIndex(root).team.members.find(m => m.name === '小王').invited, true);
  const result = await joinTeamLibrary(root, person('wang-pc', '小王'));
  assert.deepEqual([result.joined, result.role, result.claimed], [true, 'viewer', true]);
  const members = readIndex(root).team.members;
  assert.equal(members.length, 2);
  const wang = members.find(m => m.name === '小王');
  assert.deepEqual([wang.id, wang.invited], ['wang-pc', undefined]);
});

test('已被认领的名字，别人再用同名加入会被拒绝', async t => {
  const root = tmp(t); makeLibrary(root);
  await joinTeamLibrary(root, person('owner', '管理员'));
  await teamHarness(root, person('owner', '管理员')).call('team:add-member', { name: '小王', role: 'editor' });
  await joinTeamLibrary(root, person('wang-pc', '小王'));
  assert.equal((await joinTeamLibrary(root, person('other-pc', '小王'))).joined, false);
});

test('被移除的成员下次打开不会被自动加回；管理员重新添加后可以回来', async t => {
  const root = tmp(t); makeLibrary(root);
  await joinTeamLibrary(root, person('owner', '管理员'));
  await joinTeamLibrary(root, person('wang-pc', '小王'));
  const admin = teamHarness(root, person('owner', '管理员'));
  assert.equal((await admin.call('team:remove-member', 'wang-pc')).ok, true);
  assert.deepEqual(readIndex(root).team.removedIds, ['wang-pc']);
  const again = await joinTeamLibrary(root, person('wang-pc', '小王'));
  assert.deepEqual([again.joined, again.removed], [false, true]);
  assert.match(again.error, /被管理员移出/);
  assert.equal(readIndex(root).team.members.length, 1);
  await admin.call('team:add-member', { name: '小王', role: 'editor' });
  const back = await joinTeamLibrary(root, person('wang-pc', '小王'));
  assert.deepEqual([back.joined, back.claimed], [true, true]);
  assert.deepEqual(readIndex(root).team.removedIds, []);
});

test('默认角色：只有管理员能改，只允许编辑者/查看者，新成员按它加入', async t => {
  const root = tmp(t); makeLibrary(root);
  await joinTeamLibrary(root, person('owner', '管理员'));
  await joinTeamLibrary(root, person('e1', '编辑甲'));
  const admin = teamHarness(root, person('owner', '管理员')), editor = teamHarness(root, person('e1', '编辑甲'));
  assert.equal((await editor.call('team:set-default-role', 'viewer')).error, '权限不足');
  assert.match((await admin.call('team:set-default-role', 'admin')).error, /只能是/);
  assert.equal((await admin.call('team:set-default-role', 'viewer')).ok, true);
  assert.equal((await joinTeamLibrary(root, person('n1', '新人'))).role, 'viewer');
  assert.equal((await admin.call('team:info')).defaultRole, 'viewer');
});

test('普通成员不能添加/移除/改角色；所有者不能被移除或降级', async t => {
  const root = tmp(t); makeLibrary(root);
  await joinTeamLibrary(root, person('owner', '管理员'));
  await joinTeamLibrary(root, person('e1', '编辑甲'));
  const editor = teamHarness(root, person('e1', '编辑甲')), admin = teamHarness(root, person('owner', '管理员'));
  assert.equal((await editor.call('team:add-member', { name: '谁', role: 'admin' })).error, '权限不足');
  assert.equal((await editor.call('team:remove-member', 'owner')).error, '权限不足');
  assert.equal((await editor.call('team:update-member', 'e1', { role: 'admin' })).error, '权限不足');
  assert.match((await admin.call('team:remove-member', 'owner')).error, /所有者/);
  assert.match((await admin.call('team:update-member', 'owner', { role: 'viewer' })).error, /所有者/);
  assert.equal((await admin.call('team:update-member', 'e1', { role: 'admin' })).ok, true);
});

test('改名同步到成员表；与他人重名时拒绝且本机名字不变', async t => {
  const root = tmp(t); makeLibrary(root);
  await joinTeamLibrary(root, person('owner', '管理员'));
  await joinTeamLibrary(root, person('e1', '编辑甲'));
  const editor = teamHarness(root, person('e1', '编辑甲'));
  assert.equal((await editor.call('team:update-profile', { name: '编辑乙' })).ok, true);
  assert.equal(readIndex(root).team.members.find(m => m.id === 'e1').name, '编辑乙');
  assert.equal(editor.profile.name, '编辑乙');
  const clash = await editor.call('team:update-profile', { name: '管理员' });
  assert.match(clash.error, /已经有叫/);
  assert.equal(editor.profile.name, '编辑乙');
});
