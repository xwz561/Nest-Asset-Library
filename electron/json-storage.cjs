const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function parseJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readJson(file, { recover = true } = {}) {
  const value = parseJsonFile(file);
  if (value !== null || !recover) return value;

  const previous = `${file}.previous`;
  const recovered = parseJsonFile(previous);
  if (recovered === null) return null;

  // Restore the last known-good copy so subsequent launches work normally.
  atomicWriteJson(file, recovered, { backup: false });
  return recovered;
}

function snapshotLibraryIndex(file, maxBackups = 30, minIntervalMs = 5 * 60 * 1000) {
  if (path.basename(file) !== '.nest-library.json' || !fs.existsSync(file)) return;
  const backupDir = path.join(path.dirname(file), '.nest-backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const existing = fs.readdirSync(backupDir)
    .filter(name => /^library-.*\.json$/.test(name))
    .map(name => ({ name, time: fs.statSync(path.join(backupDir, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  if (minIntervalMs > 0 && existing[0] && Date.now() - existing[0].time < minIntervalMs) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(file, path.join(backupDir, `library-${stamp}-${crypto.randomUUID()}.json`));

  const backups = fs.readdirSync(backupDir)
    .filter(name => /^library-.*\.json$/.test(name))
    .map(name => ({ name, time: fs.statSync(path.join(backupDir, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  for (const old of backups.slice(maxBackups)) fs.rmSync(path.join(backupDir, old.name), { force: true });
}

function atomicWriteJson(file, value, { backup = true, maxBackups = 30, backupIntervalMs = 5 * 60 * 1000 } = {}) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const temp = path.join(dir, `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  const previous = `${file}.previous`;
  const payload = JSON.stringify(value, null, 2);
  let descriptor;

  try {
    descriptor = fs.openSync(temp, 'wx');
    fs.writeFileSync(descriptor, payload, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;

    if (fs.existsSync(file)) {
      if (backup) snapshotLibraryIndex(file, maxBackups, backupIntervalMs);
      fs.copyFileSync(file, previous);
    }
    fs.renameSync(temp, file);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temp, { force: true });
  }
}

module.exports = { atomicWriteJson, parseJsonFile, readJson, snapshotLibraryIndex };
