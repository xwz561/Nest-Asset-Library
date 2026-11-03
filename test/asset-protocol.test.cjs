const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { assetPathFromRequest } = require('../electron/asset-protocol.cjs');

test('resolves the complete categorized asset path instead of only its basename', () => {
  const root = path.join('D:', '素材库');
  const relative = 'AX17/EP03_已锁定参考资产/06_空间参考/庄园前院_整体平面图.png';
  assert.equal(assetPathFromRequest(root, `nest://asset/${encodeURIComponent(relative)}`), path.join(root, 'assets', ...relative.split('/')));
});

test('rejects traversal and malformed asset URLs', () => {
  assert.equal(assetPathFromRequest('D:/素材库', 'nest://asset/%2E%2E%2Fsecret.txt'), null);
  assert.equal(assetPathFromRequest('D:/素材库', 'nest://other/file.png'), null);
  assert.equal(assetPathFromRequest('D:/素材库', 'nest://asset/%E0%A4%A'), null);
});
