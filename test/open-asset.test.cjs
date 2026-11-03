const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const main = require('./source-tree.cjs').readSource(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
const { openAssetFile } = require('../electron/open-asset.cjs');

test('opening an asset with a missing stored file returns a visible error without invoking the shell', async () => {
  let opened = false;
  const result = await openAssetFile({ id: 'qa', name: 'QA 文件', file: 'missing.png' }, {
    resolvePath: file => `C:/qa/${file}`,
    exists: () => false,
    openPath: async () => { opened = true; return ''; },
  });
  assert.deepEqual(result, { error: '素材文件已丢失：QA 文件' });
  assert.equal(opened, false);
});

test('opening a valid asset delegates to the shell and reports shell failures', async () => {
  const result = await openAssetFile({ id: 'qa', name: 'QA 文件', file: 'asset.png' }, {
    resolvePath: file => `C:/qa/${file}`,
    exists: () => true,
    openPath: async target => target.endsWith('asset.png') ? 'No application is associated' : '',
  });
  assert.deepEqual(result, { error: '无法打开素材：No application is associated' });
});

test('the Electron open-asset handler uses the missing-file guard', () => {
  assert.match(main, /openAssetFile\(readLibrary\(\)\?\.assets\.find/);
  assert.match(main, /exists:\s*fs\.existsSync/);
});
