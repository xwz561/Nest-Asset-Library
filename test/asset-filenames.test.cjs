const test = require('node:test');
const assert = require('node:assert/strict');
const { chooseReadableFilename } = require('../electron/asset-filenames.cjs');

test('uses the visible asset name for the stored file', () => {
  assert.equal(chooseReadableFilename([], '角色正面', '.png'), '角色正面.png');
});

test('adds a number instead of overwriting a same-named file', () => {
  const assets = [{ id: 'a', file: '角色正面.png' }, { id: 'b', file: '角色正面 (2).png' }];
  assert.equal(chooseReadableFilename(assets, '角色正面', '.png'), '角色正面 (3).png');
});

test('sanitizes characters Windows does not allow in file names', () => {
  assert.equal(chooseReadableFilename([], '角色:正面?', '.jpg'), '角色_正面_.jpg');
});
