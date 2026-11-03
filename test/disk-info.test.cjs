const test = require('node:test');
const assert = require('node:assert/strict');
const { libraryVolume, libraryStorageInfo } = require('../electron/disk-info.cjs');

const fakeFs = (ok) => {
  const calls = [];
  return { calls, statfsSync(p) { calls.push(p); if (!ok(p)) throw new Error('ENOENT ' + p); return { blocks: 1000, bsize: 4096, bavail: 250 }; } };
};

test('Windows：仍按盘符统计，显示"本地磁盘 (D:)"', () => {
  const v = libraryVolume('D:\\deepsick\\素材库', 'win32');
  assert.deepEqual([v.root, v.statPath, v.label], ['D:\\', 'D:\\', '本地磁盘 (D:)']);
  const fs = fakeFs(() => true);
  const info = libraryStorageInfo('D:\\deepsick\\素材库', { fs, platform: 'win32' });
  assert.deepEqual(fs.calls, ['D:\\']);
  assert.deepEqual(info, { root: 'D:\\', label: '本地磁盘 (D:)', total: 4096000, free: 1024000, used: 3072000 });
});

test('macOS 系统盘：名字不再是"(—)"，统计素材库所在的文件系统', () => {
  const v = libraryVolume('/Users/edy/小旺仔素材库', 'darwin');
  assert.equal(v.label, '本地磁盘');
  assert.doesNotMatch(v.label, /—/);
  const fs = fakeFs(() => true);
  libraryStorageInfo('/Users/edy/小旺仔素材库', { fs, platform: 'darwin' });
  assert.deepEqual(fs.calls, ['/Users/edy/小旺仔素材库'], '统计素材库目录本身，而不是 "/"');
});

test('macOS 外接盘 / NAS：按 /Volumes 下的卷名显示，并统计那块盘', () => {
  const v = libraryVolume('/Volumes/LW素材/项目/库', 'darwin');
  assert.deepEqual([v.root, v.label], ['/Volumes/LW素材', '磁盘 (LW素材)']);
  const fs = fakeFs(() => true);
  libraryStorageInfo('/Volumes/LW素材/项目/库', { fs, platform: 'darwin' });
  assert.deepEqual(fs.calls, ['/Volumes/LW素材/项目/库']);
});

test('素材库目录读不到时退回卷根或 "/"，Windows 读不到时报错', () => {
  const ext = fakeFs((p) => p === '/Volumes/LW');
  assert.equal(libraryStorageInfo('/Volumes/LW/gone', { fs: ext, platform: 'darwin' }).label, '磁盘 (LW)');
  assert.deepEqual(ext.calls, ['/Volumes/LW/gone', '/Volumes/LW']);
  const sys = fakeFs((p) => p === '/');
  assert.equal(libraryStorageInfo('/Users/x/gone', { fs: sys, platform: 'darwin' }).root, '/');
  assert.throws(() => libraryStorageInfo('Z:\\nope', { fs: fakeFs(() => false), platform: 'win32' }));
});

test('Linux：同样统计素材库目录本身', () => {
  const v = libraryVolume('/mnt/data/lib', 'linux');
  assert.deepEqual([v.root, v.statPath, v.label], ['/', '/mnt/data/lib', '本地磁盘']);
});
