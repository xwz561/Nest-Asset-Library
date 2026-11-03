const test = require('node:test');
const assert = require('node:assert/strict');

test('folder details count nested assets and bytes without including sibling folders', async () => {
  const { summarizeFolderAssets } = await import('../src/folder-tree.js');
  const folders = [
    { id: 'root', name: 'EP13' },
    { id: 'child', name: 'S01', parentId: 'root' },
    { id: 'grandchild', name: 'Scene 1', parentId: 'child' },
    { id: 'sibling', name: 'EP14' },
  ];
  const assets = [
    { id: 'a', folderId: 'root', size: 1024 },
    { id: 'b', folderId: 'child', size: 2048 },
    { id: 'c', folderId: 'grandchild', size: 1024 },
    { id: 'd', folderId: 'sibling', size: 512 },
    { id: 'e', folderId: 'missing-folder', size: 128 },
  ];

  assert.deepEqual(summarizeFolderAssets?.('root', folders, assets), {
    fileCount: 3,
    totalBytes: 4096,
  });
});

test('empty folder usage is displayed as a zero-byte value', async () => {
  const { formatFolderBytes } = await import('../src/folder-tree.js');
  assert.equal(formatFolderBytes?.(0), '0.00 bytes');
  assert.equal(formatFolderBytes?.(1024), '1.00 KB');
});
