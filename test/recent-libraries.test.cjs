const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { forgetLibrary, libraryIdentity, nextRecentLibraries, rememberLibrary, MAX_RECENT_LIBRARIES } = require('../electron/recent-libraries.cjs');

test('recent libraries stay unique with the active library first', () => {
  const a = path.resolve('C:/qa/library-a');
  const b = path.resolve('C:/qa/library-b');
  assert.deepEqual(rememberLibrary([a, b], b), [b, a]);
  assert.deepEqual(rememberLibrary([a, a], a), [a]);
});

test('recent library identifiers do not expose or accept arbitrary paths', () => {
  const root = path.resolve('C:/qa/library-a');
  const id = libraryIdentity(root);
  assert.match(id, /^[a-f0-9]{20}$/);
  assert.deepEqual(forgetLibrary([root], id), []);
});

test('切换到团队素材库时，从没记进列表的上一个当前库也会被保留（升级前打开/启动自动恢复的库）', () => {
  const local = path.resolve('D:/local-library');
  const team = path.resolve('Z:/team-library');
  // 旧版本只保存了 libraryPath，recentLibraries 不存在
  assert.deepEqual(nextRecentLibraries(undefined, local, team), [team, local]);
  assert.deepEqual(nextRecentLibraries([], local, team), [team, local]);
  // 已在列表里的不重复，顺序：新的当前库 → 上一个 → 其余
  const other = path.resolve('D:/other');
  assert.deepEqual(nextRecentLibraries([other, local], local, team), [team, local, other]);
  // 切回去之后两个都还在
  assert.deepEqual(nextRecentLibraries([team, local], team, local), [local, team]);
});

test('没有新的当前库（例如刚删除了当前库）时不会把被删的库重新记进列表；列表有长度上限', () => {
  const gone = path.resolve('D:/deleted');
  const other = path.resolve('D:/other');
  assert.deepEqual(nextRecentLibraries([other], gone, null), [other]);
  assert.deepEqual(nextRecentLibraries(null, null, null), []);
  const many = Array.from({ length: 20 }, (_, i) => path.resolve(`D:/lib-${i}`));
  const result = nextRecentLibraries(many, path.resolve('D:/prev'), path.resolve('D:/new'));
  assert.equal(result.length, MAX_RECENT_LIBRARIES);
  assert.deepEqual(result.slice(0, 2), [path.resolve('D:/new'), path.resolve('D:/prev')]);
});
