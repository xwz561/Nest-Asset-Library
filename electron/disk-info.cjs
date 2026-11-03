'use strict';
// Which disk a library lives on, for the sidebar capacity card.
//
// Windows: the drive root (D:\) — same as before.
// macOS / Linux: every path's root is "/", so statfs("/") would always report the
// system disk even when the library is on an external drive. There we stat the
// library folder itself (statfs reports the filesystem that contains it) and name
// external macOS volumes after their /Volumes/<name> mount point.
const path = require('path');

function libraryVolume(libraryPath, platform = process.platform) {
  const target = String(libraryPath || '');
  if (platform === 'win32') {
    const root = path.win32.parse(target).root || target;
    const name = root.replace(/[\\/]+$/, '');
    return { root, statPath: root, label: name ? `本地磁盘 (${name})` : '本地磁盘' };
  }
  const mount = platform === 'darwin' ? /^\/Volumes\/([^/]+)/.exec(target) : null;
  if (mount) return { root: `/Volumes/${mount[1]}`, statPath: target, fallbackStatPath: `/Volumes/${mount[1]}`, label: `磁盘 (${mount[1]})` };
  return { root: '/', statPath: target, fallbackStatPath: '/', label: '本地磁盘' };
}

function libraryStorageInfo(libraryPath, { fs = require('fs'), platform = process.platform } = {}) {
  const volume = libraryVolume(libraryPath, platform);
  let stat;
  try { stat = fs.statfsSync(volume.statPath); }
  catch (error) {
    if (!volume.fallbackStatPath) throw error;
    stat = fs.statfsSync(volume.fallbackStatPath);
  }
  const total = Number(stat.blocks) * Number(stat.bsize), free = Number(stat.bavail) * Number(stat.bsize);
  return { root: volume.root, label: volume.label, total, free, used: Math.max(0, total - free) };
}

module.exports = { libraryVolume, libraryStorageInfo };
