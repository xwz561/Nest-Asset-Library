const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { expandImportPaths, folderPartsForImport } = require('../electron/import-paths.cjs');

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

test('recursively expands a dropped folder including supported script documents', async t => {
  const root = fixture(t);
  const result = await expandImportPaths([root]);
  assert.deepEqual(result.files.map(file => path.relative(root, file)).sort(), ['cover.JPG', path.join('nested', 'clip.mp4'), path.join('nested', 'sound.mp3'), 'notes.txt']);
  assert.deepEqual(result.directories, [[path.basename(root)], [path.basename(root), 'nested']]);
  assert.equal(result.entries.length, 4);
  assert.equal(result.entries.some(entry => path.basename(entry.file) === 'notes.txt' && entry.folders.length === 1), true);
  assert.deepEqual(result.errors, []);
});

test('includes empty nested directories so their hierarchy can be recreated', async t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, 'empty', 'child'), { recursive: true });
  const result = await expandImportPaths([root]);
  assert.equal(result.directories.some(parts => parts.join('/') === `${path.basename(root)}/empty/child`), true);
});

test('preserves only the dropped outer folder when requested', () => {
  assert.deepEqual(
    folderPartsForImport(['外部素材', '镜头', '特写'], { preserveTopLevelFolders: true }),
    ['外部素材'],
  );
  assert.deepEqual(folderPartsForImport(['外部素材', '镜头'], { preserveFolders: true }), ['外部素材', '镜头']);
  assert.deepEqual(folderPartsForImport([], { preserveTopLevelFolders: true }), []);
});

test('keeps explicitly dropped unsupported files so import reports an error', async t => {
  const root = fixture(t);
  const unsupported = path.join(root, 'unsupported.exe');
  fs.writeFileSync(unsupported, 'unsupported');
  const result = await expandImportPaths([unsupported]);
  assert.deepEqual(result.files, [unsupported]);
});

test('stops scanning oversized folder trees even when files are unsupported', async t => {
  const root = fixture(t);
  for (let index = 0; index < 12; index += 1) {
    fs.writeFileSync(path.join(root, `ignored-${index}.txt`), 'ignore');
  }
  await assert.rejects(
    expandImportPaths([root], { maxEntries: 8 }),
    /单次最多扫描 8 个文件和文件夹/,
  );
});

test('reports scanning progress for folder imports', async t => {
  const root = fixture(t);
  const updates = [];
  await expandImportPaths([root], { onProgress: progress => updates.push(progress) });
  assert.equal(updates.at(-1).phase, 'scanning');
  assert.equal(updates.at(-1).found, 4);
  assert.ok(updates.at(-1).scanned >= 5);
});

test('stops folder scanning cleanly when the import is cancelled', async t => {
  const root = fixture(t);
  const controller = new AbortController();
  controller.abort();
  const result = await expandImportPaths([root], { signal: controller.signal });
  assert.equal(result.cancelled, true);
  assert.deepEqual(result.entries, []);
  assert.deepEqual(result.directories, []);
});


test('accepts exactly the file limit with trailing empty folders and ignored files', async t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, 'zz-empty'));
  fs.writeFileSync(path.join(root, 'zz-ignored.bin'), 'ignored');
  const result = await expandImportPaths([root], { maxFiles: 4 });
  assert.equal(result.files.length, 4);
  assert.ok(result.directories.some(parts => parts.at(-1) === 'zz-empty'));
});

test('rejects an actual supported file beyond the limit', async t => {
  const root = fixture(t);
  await assert.rejects(expandImportPaths([root], { maxFiles: 3 }), /单次最多导入 3 个素材/);
});
