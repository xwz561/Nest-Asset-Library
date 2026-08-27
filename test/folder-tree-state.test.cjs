const test = require('node:test');
const assert = require('node:assert/strict');

const folders = [
  { id: 'ax17', name: 'AX17' },
  { id: '01', name: '01', parentId: 'ax17' },
  { id: 'effects', name: '特效', parentId: '01' },
  { id: 'people', name: '人设图', parentId: '01' },
  { id: 'blocking', name: '站位图', parentId: '01' },
  { id: 'locked', name: 'EP01_已锁定参考资产', parentId: '01' },
  { id: 'characters', name: '01_角色', parentId: 'locked' },
  { id: 'evan', name: '01_Evan', parentId: 'characters' },
  { id: 'deep-5', name: '第五层', parentId: 'evan' },
  { id: 'deep-6', name: '第六层', parentId: 'deep-5' },
  { id: 'deep-7', name: '第七层', parentId: 'deep-6' },
  { id: 'deep-8', name: '第八层', parentId: 'deep-7' },
  { id: 'other', name: '兄弟根目录' },
  { id: 'other-child', name: '兄弟子目录', parentId: 'other' },
];

test('folders start collapsed and expose only root nodes', async () => {
  const { buildFolderRows } = await import('../src/folder-tree.js');
  assert.deepEqual(buildFolderRows(folders, new Set()).map(item => item.id), ['ax17', 'other']);
});

test('expanding AX17 and 01 reveals direct children but not deeper descendants', async () => {
  const { buildFolderRows } = await import('../src/folder-tree.js');
  const ids = buildFolderRows(folders, new Set(['ax17', '01'])).map(item => item.id);
  assert.deepEqual(ids, ['ax17', '01', 'effects', 'people', 'blocking', 'locked', 'other']);
  assert.equal(ids.includes('characters'), false);
  assert.equal(ids.includes('evan'), false);
});

test('each toggle changes only the requested folder id', async () => {
  const { toggleExpandedFolder } = await import('../src/folder-tree.js');
  const before = new Set(['ax17', 'other', 'locked']);
  const after = toggleExpandedFolder(before, '01');
  assert.deepEqual([...before].sort(), ['ax17', 'locked', 'other']);
  assert.deepEqual([...after].sort(), ['01', 'ax17', 'locked', 'other']);
  const collapsed = toggleExpandedFolder(after, 'other');
  assert.deepEqual([...collapsed].sort(), ['01', 'ax17', 'locked']);
});

test('collapsing a parent hides descendants without clearing descendant state', async () => {
  const { buildFolderRows, toggleExpandedFolder } = await import('../src/folder-tree.js');
  const expanded = new Set(['ax17', '01', 'locked', 'characters']);
  assert.equal(buildFolderRows(folders, expanded).some(item => item.id === 'evan'), true);
  const hidden = toggleExpandedFolder(expanded, '01');
  assert.equal(hidden.has('locked'), true);
  assert.equal(hidden.has('characters'), true);
  assert.equal(buildFolderRows(folders, hidden).some(item => item.id === 'locked'), false);
  const restored = toggleExpandedFolder(hidden, '01');
  assert.equal(buildFolderRows(folders, restored).some(item => item.id === 'evan'), true);
});

test('eight nested levels require eight independent expansions', async () => {
  const { buildFolderRows } = await import('../src/folder-tree.js');
  const partial = new Set(['ax17', '01', 'locked', 'characters', 'evan', 'deep-5', 'deep-6']);
  const ids = buildFolderRows(folders, partial).map(item => item.id);
  assert.equal(ids.includes('deep-7'), true);
  assert.equal(ids.includes('deep-8'), false);
});

test('full folder choices remain available independently of visible expansion state', async () => {
  const { buildFolderRows } = await import('../src/folder-tree.js');
  const all = buildFolderRows(folders, new Set(), { includeHidden: true });
  assert.equal(all.length, folders.length);
  assert.equal(all.find(item => item.id === 'deep-8').depth, 8);
});
