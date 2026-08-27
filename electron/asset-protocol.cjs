const { physicalAssetPath } = require('./physical-folders.cjs');

function assetPathFromRequest(root, requestUrl) {
  const parsed = new URL(requestUrl);
  if (parsed.protocol !== 'nest:' || parsed.hostname !== 'asset') return null;
  let relative;
  try { relative = decodeURIComponent(parsed.pathname).replace(/^[/\\]+/, ''); }
  catch { return null; }
  if (!relative || relative.split(/[\\/]+/).some(part => part === '..')) return null;
  return physicalAssetPath(root, relative);
}

module.exports = { assetPathFromRequest };
