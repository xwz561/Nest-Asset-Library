const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { waitForLibraryIndex } = require('../electron/library-index-wait.cjs');

const noWait = async () => {};

test('本地盘：第一次就能看到索引文件，不等待', async () => {
  let checks = 0, waits = 0;
  const ok = await waitForLibraryIndex('/lib/.nest-library.json', { exists: () => { checks++; return true; }, wait: async () => { waits++; } });
  assert.equal(ok, true);
  assert.deepEqual([checks, waits], [1, 0]);
});

test('NAS（SMB）刚改写完索引、短暂看不到时，等一下再确认，不误报"已移动"', async () => {
  let checks = 0;
  const ok = await waitForLibraryIndex('/Volumes/NAS/团队库/.nest-library.json', { exists: () => ++checks >= 4, wait: noWait });
  assert.equal(ok, true);
  assert.equal(checks, 4);
});

test('索引确实不存在时，有限次数后放弃；检查出错也按"不存在"处理', async () => {
  let checks = 0, waited = 0;
  assert.equal(await waitForLibraryIndex('/gone', { exists: () => { checks++; return false; }, attempts: 5, delayMs: 10, wait: async (ms) => { waited += ms; } }), false);
  assert.deepEqual([checks, waited], [5, 40]);
  assert.equal(await waitForLibraryIndex('/err', { exists: () => { throw new Error('EIO'); }, attempts: 3, wait: noWait }), false);
});

test('默认最多等约 2 秒', async () => {
  let waited = 0;
  await waitForLibraryIndex('/gone', { exists: () => false, wait: async (ms) => { waited += ms; } });
  assert.ok(waited >= 1500 && waited <= 2500, String(waited));
});

test('所有打开素材库的入口都等待 openKnownLibrary 的结果，错误里带上路径', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const main = read('electron/main.cjs');
  assert.match(main, /const openKnownLibrary = async root =>/);
  assert.match(main, /await waitForLibraryIndex\(indexFile\(root\)\)/);
  assert.match(main, /这个资源库已移动或不可用：\$\{root\}/);
  for (const f of ['electron/handlers/library.cjs', 'electron/handlers/library-finder.cjs', 'electron/handlers/team-folder.cjs']) {
    const src = read(f);
    const calls = src.match(/openKnownLibrary\(/g) || [];
    const awaited = src.match(/await openKnownLibrary\(/g) || [];
    assert.ok(calls.length > 0 && calls.length === awaited.length, `${f}: ${awaited.length}/${calls.length} 处等待`);
  }
});
