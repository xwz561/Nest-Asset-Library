const test = require('node:test');
const assert = require('node:assert/strict');
const { removeRetiredVirtualGroups } = require('../electron/retired-features.cjs');

test('opening a legacy library removes retired virtual groups without touching folders or assets', () => {
  const data = {
    folders: [{ id: 'folder-1', name: '镜头' }],
    assets: [{ id: 'asset-1', folderId: 'folder-1' }],
    collections: [{ id: 'group-1', assetIds: ['asset-1'] }],
  };
  assert.equal(removeRetiredVirtualGroups(data), true);
  assert.equal(Object.hasOwn(data, 'collections'), false);
  assert.deepEqual(data.folders, [{ id: 'folder-1', name: '镜头' }]);
  assert.deepEqual(data.assets, [{ id: 'asset-1', folderId: 'folder-1' }]);
  assert.equal(removeRetiredVirtualGroups(data), false);
});
