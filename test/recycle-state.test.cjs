const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const main = require('./source-tree.cjs').readSource(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
const preload = fs.readFileSync(path.join(__dirname, '..', 'electron', 'preload.cjs'), 'utf8');
const { activeAssets, markAssetsTrashed, reconcileRestoredAssets } = require('../electron/recycle-state.cjs');

test('soft-deleted assets stay hidden but retain metadata and reactivate at their original path', () => {
  const asset = { id: 'qa-asset', name: '同一素材', file: '同一素材.png', folderId: 'folder-1', tags: ['QA'], trashedAt: 12 };
  const assets = [asset, { id: 'active-asset', name: '正常素材' }];

  assert.deepEqual(activeAssets(assets).map(item => item.id), ['active-asset']);
  assert.deepEqual(reconcileRestoredAssets(assets, file => file === '同一素材.png'), ['qa-asset']);
  assert.equal(asset.trashedAt, undefined);
  assert.equal(asset.name, '同一素材');
  assert.equal(asset.folderId, 'folder-1');
  assert.deepEqual(asset.tags, ['QA']);
  assert.deepEqual(activeAssets(assets).map(item => item.id), ['qa-asset', 'active-asset']);
});

test('delete integration keeps the indexed asset and exposes a restore reconciliation path', () => {
  assert.match(main, /markAssetsTrashed\(data\.assets,\s*\[asset\.id\]/);
  assert.match(main, /assets:\s*activeAssets\(library\.assets\)/);
  assert.match(main, /library:reconcile-recycled-assets/);
  assert.match(preload, /reconcileRecycledAssets:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('library:reconcile-recycled-assets'\)/);
});
