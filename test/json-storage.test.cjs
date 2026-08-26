const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { atomicWriteJson, readJson } = require('../electron/json-storage.cjs');

function temporaryDirectory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-storage-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('writes valid JSON atomically and leaves no temporary files', t => {
  const dir = temporaryDirectory(t);
  const file = path.join(dir, '.nest-library.json');
  atomicWriteJson(file, { assets: [{ id: 'one' }] });
  assert.deepEqual(readJson(file), { assets: [{ id: 'one' }] });
  assert.equal(fs.readdirSync(dir).some(name => name.endsWith('.tmp')), false);
});

test('recovers a damaged index from the previous known-good copy', t => {
  const dir = temporaryDirectory(t);
  const file = path.join(dir, '.nest-library.json');
  atomicWriteJson(file, { version: 1 });
  atomicWriteJson(file, { version: 2 });
  fs.writeFileSync(file, '{broken', 'utf8');
  assert.deepEqual(readJson(file), { version: 1 });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { version: 1 });
});

test('keeps only the configured number of rolling index backups', t => {
  const dir = temporaryDirectory(t);
  const file = path.join(dir, '.nest-library.json');
  atomicWriteJson(file, { version: 0 }, { maxBackups: 2 });
  for (let version = 1; version <= 4; version += 1) {
    atomicWriteJson(file, { version }, { maxBackups: 2 });
  }
  const backups = fs.readdirSync(path.join(dir, '.nest-backups'));
  assert.equal(backups.length, 2);
});
