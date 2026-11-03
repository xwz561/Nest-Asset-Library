const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { buildReadableDragPath, safeName, uniqueDragPath } = require('../electron/drag-export.cjs');

test('builds a readable drag path from library, folder hierarchy and asset name', () => {
  const library = { name: 'AX17', folders: [{ id: 'a', name: '角色', parentId: null }, { id: 'b', name: 'Evan', parentId: 'a' }] };
  const asset = { name: '正面参考', file: 'random-id.png', folderId: 'b' };
  assert.equal(buildReadableDragPath('C:\\Temp\\Nest Drag', library, asset), path.join('C:\\Temp\\Nest Drag', 'AX17', '角色', 'Evan', '正面参考.png'));
});

test('removes characters that are invalid in Windows file names', () => {
  assert.equal(safeName('角色:正面?*', 'fallback'), '角色_正面__');
});

test('keeps same-named audio files separate during a multi-file drag', () => {
  const used = new Set();
  const target = path.join('C:\\Temp', '对白.mp3');
  assert.equal(uniqueDragPath(target, used), target);
  assert.equal(uniqueDragPath(target, used), path.join('C:\\Temp', '对白 (2).mp3'));
});
