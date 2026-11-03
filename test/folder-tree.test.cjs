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

test('folder expansion scopes target current level and toggle together', async () => {
  const { expandableFolderIds, folderExpansionState, toggleExpandedFolderScope } = await import('../src/folder-tree.js');
  const folders = [
    { id: 'a', parentId: null },
    { id: 'b', parentId: null },
    { id: 'a1', parentId: 'a' },
    { id: 'b1', parentId: 'b' },
  ];
  assert.deepEqual(expandableFolderIds(folders), ['a', 'b']);
  assert.deepEqual(expandableFolderIds(folders, { parentId: null }), ['a', 'b']);
  const opened = toggleExpandedFolderScope(new Set(), ['a', 'b']);
  assert.equal(folderExpansionState(opened, ['a', 'b']), true);
  assert.deepEqual([...toggleExpandedFolderScope(opened, ['a', 'b'])], []);
});
