const test = require('node:test');
const assert = require('node:assert/strict');
const { collectFolderSubtreeIds } = require('../electron/folder-tree.cjs');

test('collects a folder and all nested descendants without including siblings', () => {
  const folders = [
    { id: 'root', parentId: null },
    { id: 'child', parentId: 'root' },
    { id: 'grandchild', parentId: 'child' },
    { id: 'sibling', parentId: null },
  ];
  assert.deepEqual([...collectFolderSubtreeIds(folders, 'root')], ['root', 'child', 'grandchild']);
});

test('terminates safely when corrupted folder data contains a cycle', () => {
  const folders = [{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }];
  assert.deepEqual(new Set(collectFolderSubtreeIds(folders, 'a')), new Set(['a', 'b']));
});
