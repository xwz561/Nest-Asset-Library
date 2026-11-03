const path = require('path');
const { safeName } = require('./drag-export.cjs');

function chooseReadableFilename(assets, displayName, extension, excludeId = null) {
  const ext = String(extension || '').toLowerCase();
  const occupied = new Set((assets || [])
    .filter(asset => asset && asset.id !== excludeId && asset.file)
    .map(asset => path.basename(asset.file).toLowerCase()));
  return chooseNextReadableFilename(occupied, displayName, ext);
}

function chooseNextReadableFilename(occupied, displayName, extension) {
  const ext = String(extension || '').toLowerCase();
  const base = safeName(displayName, '未命名素材');
  let candidate = `${base}${ext}`;
  for (let number = 2; occupied.has(candidate.toLowerCase()); number += 1) candidate = `${base} (${number})${ext}`;
  return candidate;
}

module.exports = { chooseReadableFilename, chooseNextReadableFilename };
