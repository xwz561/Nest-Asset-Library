const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const main = require('./source-tree.cjs').readSource(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
const { resolveLibraryPath } = require('../electron/library-path-settings.cjs');

test('bridge startup preserves a saved QA library path when the in-memory path is not initialized', () => {
  const expected = 'C:/qa/library';
  assert.equal(resolveLibraryPath(null, { libraryPath: expected }, file => file === expected), expected);
});

test('an existing in-memory library path wins and invalid saved paths are ignored', () => {
  assert.equal(resolveLibraryPath('C:/qa/current', { libraryPath: 'C:/qa/stale' }, file => file === 'C:/qa/current'), 'C:/qa/current');
  assert.equal(resolveLibraryPath(null, { libraryPath: 'C:/qa/stale' }, () => false), null);
});

test('secure clip key initialization restores the configured library before writing settings', () => {
  assert.match(main, /resolveLibraryPath\(libraryPath,\s*settings,\s*file\s*=>\s*fs\.existsSync\(indexFile\(file\)\)\)/);
});
