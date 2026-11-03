'use strict';
// Wait briefly for a library index file to become visible before treating the
// library as moved/unavailable.
//
// Opening a team library first rewrites .nest-library.json (temp file + rename,
// see team-join.cjs). On a NAS mounted over SMB, macOS can report the file as
// missing for a moment right after that rename, which made "这个资源库已移动或不可用"
// appear on Macs even though the library was fine. Local disks answer on the first
// check, so this only costs time when the file really is missing (~2 s).
const fs = require('fs');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForLibraryIndex(file, { exists = fs.existsSync, attempts = 14, delayMs = 150, wait = sleep } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try { if (exists(file)) return true; } catch {}
    if (attempt < attempts - 1) await wait(delayMs);
  }
  return false;
}

module.exports = { waitForLibraryIndex };
