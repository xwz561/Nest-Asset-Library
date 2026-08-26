const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { expandImportPaths } = require('../electron/import-paths.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-import-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'nested'));
  fs.writeFileSync(path.join(root, 'cover.JPG'), 'image');
  fs.writeFileSync(path.join(root, 'notes.txt'), 'ignore');
  fs.writeFileSync(path.join(root, 'nested', 'clip.mp4'), 'video');
  fs.writeFileSync(path.join(root, 'nested', 'sound.mp3'), 'audio');
  return root;
}

test('recursively expands a dropped folder and ignores unsupported files', async t => {
  const root = fixture(t);
  const result = await expandImportPaths([root]);
  assert.deepEqual(result.files.map(file => path.relative(root, file)).sort(), ['cover.JPG', path.join('nested', 'clip.mp4'), path.join('nested', 'sound.mp3')]);
  assert.deepEqual(result.directories, [[path.basename(root)], [path.basename(root), 'nested']]);
  assert.deepEqual(result.entries.map(entry => entry.folders), [[path.basename(root)], [path.basename(root), 'nested'], [path.basename(root), 'nested']]);
  assert.deepEqual(result.errors, []);
});

test('includes empty nested directories so their hierarchy can be recreated', async t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, 'empty', 'child'), { recursive: true });
  const result = await expandImportPaths([root]);
  assert.equal(result.directories.some(parts => parts.join('/') === `${path.basename(root)}/empty/child`), true);
});

test('keeps explicitly dropped unsupported files so import reports an error', async t => {
  const root = fixture(t);
  const unsupported = path.join(root, 'notes.txt');
  const result = await expandImportPaths([unsupported]);
  assert.deepEqual(result.files, [unsupported]);
});
