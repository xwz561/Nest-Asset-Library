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

test('collapsing a folder clears its whole expanded subtree without mutating the input', async () => {
  const { collapseFolderSubtree } = await import('../src/folder-tree.js');
  const folders = [
    { id: 'root' },
    { id: 'child', parentId: 'root' },
    { id: 'grandchild', parentId: 'child' },
    { id: 'sibling' },
    { id: 'sibling-child', parentId: 'sibling' },
  ];
  const before = new Set(['root', 'child', 'grandchild', 'sibling', 'sibling-child']);
  const after = collapseFolderSubtree(before, folders, 'root');
  assert.deepEqual([...after].sort(), ['sibling', 'sibling-child']);
  assert.equal(before.size, 5);
});

test('entering a folder opens its ancestors and clears expansion inside the destination subtree', async () => {
  const { expandFolderAncestors } = await import('../src/folder-tree.js');
  const folders = [
    { id: 'root' },
    { id: 'middle', parentId: 'root' },
    { id: 'target', parentId: 'middle' },
    { id: 'target-child', parentId: 'target' },
    { id: 'target-grandchild', parentId: 'target-child' },
    { id: 'other', parentId: 'root' },
  ];
  const before = new Set(['root', 'middle', 'target', 'target-child', 'other']);
  assert.deepEqual([...expandFolderAncestors(before, folders, 'target')].sort(), ['middle', 'other', 'root']);
});
