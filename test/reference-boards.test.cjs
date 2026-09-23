const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createReferenceBoard,
  normalizeReferenceBoards,
  updateReferenceBoard,
} = require('../electron/reference-boards.cjs');

const assets = [{ id: 'asset-a' }, { id: 'asset-b' }];

test('reference boards retain references, never embed source asset records', () => {
  const board = createReferenceBoard({ name: 'EP26 构图', assetIds: ['asset-a', 'missing', 'asset-b'] }, assets, { id: 'board-a', now: 100 });
  assert.equal(board.name, 'EP26 构图');
  assert.deepEqual(board.items.map(item => item.assetId), ['asset-a', 'asset-b']);
  assert.equal(Object.hasOwn(board.items[0], 'file'), false);
  assert.equal(board.items[0].x, 0);
  assert.equal(board.items[1].x, 300);
});

test('normalization removes deleted assets and clamps untrusted layout values', () => {
  const [board] = normalizeReferenceBoards([{
    id: 'safe', name: '  参考板  ', camera: { x: Infinity, y: -Infinity, zoom: 99 },
    items: [
      { id: 'same', assetId: 'asset-a', x: 999999, y: -999999, width: 9, rotation: 999, note: 'a'.repeat(1200) },
      { id: 'same', assetId: 'deleted', x: 1 },
    ],
  }], assets);
  assert.deepEqual(board.camera, { x: 0, y: 0, zoom: 3 });
  assert.equal(board.items.length, 1);
  assert.equal(board.items[0].x, 100000);
  assert.equal(board.items[0].y, -100000);
  assert.equal(board.items[0].width, 150);
  assert.equal(board.items[0].rotation, 180);
  assert.equal(board.items[0].note.length, 1000);
});

test('updates keep board identity and creation timestamp while replacing the visible layout', () => {
  const current = createReferenceBoard({ name: '原始板', assetIds: ['asset-a'] }, assets, { id: 'board-a', now: 10 });
  const updated = updateReferenceBoard(current, {
    name: '更新后',
    camera: { x: 31, y: -16, zoom: 1.6 },
    items: [{ id: 'node-a', assetId: 'asset-b', x: 8, y: 9, width: 320, rotation: -5, note: '镜头反应' }],
  }, assets, { now: 20 });
  assert.equal(updated.id, 'board-a');
  assert.equal(updated.createdAt, 10);
  assert.equal(updated.updatedAt, 20);
  assert.equal(updated.items[0].assetId, 'asset-b');
  assert.equal(updated.items[0].note, '镜头反应');
});

test('reference board groups are bounded metadata and only known group links survive', () => {
  const [board] = normalizeReferenceBoards([{
    id: 'grouped',
    groups: [{ id: 'scene-a', name: '场景 A', x: 3, y: 4, width: 420, height: 260, color: '#25B899' }],
    items: [
      { id: 'node-a', assetId: 'asset-a', groupId: 'scene-a' },
      { id: 'node-b', assetId: 'asset-b', groupId: 'missing-group' },
    ],
  }], assets);
  assert.deepEqual(board.groups, [{ id: 'scene-a', name: '场景 A', x: 3, y: 4, width: 420, height: 260, color: '#25b899', zIndex: 0 }]);
  assert.equal(board.items[0].groupId, 'scene-a');
  assert.equal(board.items[1].groupId, '');
});

test('connections survive only between distinct current nodes and are deduplicated', () => {
  const [board] = normalizeReferenceBoards([{
    id: 'linked',
    items: [{ id: 'left', assetId: 'asset-a' }, { id: 'right', assetId: 'asset-b' }],
    connections: [
      { id: 'first', fromId: 'left', toId: 'right' },
      { id: 'same-pair', fromId: 'right', toId: 'left' },
      { id: 'self', fromId: 'left', toId: 'left' },
      { id: 'missing', fromId: 'left', toId: 'gone' },
    ],
  }], assets);
  assert.deepEqual(board.connections, [{ id: 'first', fromId: 'left', toId: 'right' }]);
});
