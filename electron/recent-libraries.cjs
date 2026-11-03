const crypto = require('crypto');
const path = require('path');

const MAX_RECENT_LIBRARIES = 12;

function normalizeLibraryRoot(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try { return path.resolve(value.trim()); } catch { return ''; }
}

function libraryIdentity(root) {
  const normalized = normalizeLibraryRoot(root);
  return normalized ? crypto.createHash('sha256').update(normalized.toLowerCase()).digest('hex').slice(0, 20) : '';
}

function rememberLibrary(recent, root, limit = MAX_RECENT_LIBRARIES) {
  const normalized = normalizeLibraryRoot(root);
  const known = Array.isArray(recent) ? recent : [];
  if (!normalized) return known.map(normalizeLibraryRoot).filter(Boolean).slice(0, limit);
  const key = normalized.toLowerCase();
  return [normalized, ...known.map(normalizeLibraryRoot).filter(item => item && item.toLowerCase() !== key)].slice(0, limit);
}

// 切换/打开素材库时计算新的“最近素材库”列表：新的当前库排第一，上一个当前库紧随其后。
// 上一个当前库可能从没被记进列表（升级前打开的库、启动时自动恢复的库）——不补上的话，一切到团队素材库它就“消失”了。
function nextRecentLibraries(recent, previousRoot, currentRoot, limit = MAX_RECENT_LIBRARIES) {
  let list = (Array.isArray(recent) ? recent : []).map(normalizeLibraryRoot).filter(Boolean);
  if (currentRoot && previousRoot) list = rememberLibrary(list, previousRoot, limit + 1);
  return currentRoot ? rememberLibrary(list, currentRoot, limit) : list.slice(0, limit);
}

function forgetLibrary(recent, id) {
  return (Array.isArray(recent) ? recent : []).map(normalizeLibraryRoot).filter(root => root && libraryIdentity(root) !== id);
}

module.exports = { MAX_RECENT_LIBRARIES, forgetLibrary, libraryIdentity, nextRecentLibraries, normalizeLibraryRoot, rememberLibrary };
