const test = require('node:test');
const assert = require('node:assert/strict');
const { createDuplicateIndex, isDuplicate, recordHash } = require('../electron/import-duplicates.cjs');

test('folder import keeps identical content when it belongs to another folder', () => {
  const index = createDuplicateIndex([{ hash: 'same', folderId: 'folder-a' }]);
  assert.equal(isDuplicate(index, 'same', 'folder-b', true), false);
});

test('folder import skips identical content already in the same folder', () => {
  const index = createDuplicateIndex([{ hash: 'same', folderId: 'folder-a' }]);
  assert.equal(isDuplicate(index, 'same', 'folder-a', true), true);
});

test('regular file import still performs library-wide deduplication', () => {
  const index = createDuplicateIndex([{ hash: 'same', folderId: 'folder-a' }]);
  assert.equal(isDuplicate(index, 'same', 'folder-b', false), true);
});

test('records files imported earlier in the same operation', () => {
  const index = createDuplicateIndex();
  recordHash(index, 'new-hash', 'folder-a');
  assert.equal(isDuplicate(index, 'new-hash', 'folder-a', true), true);
  assert.equal(isDuplicate(index, 'new-hash', 'folder-b', true), false);
});
