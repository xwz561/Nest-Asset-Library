function activeAssets(assets) {
  return (Array.isArray(assets) ? assets : []).filter(asset => asset && !asset.trashedAt);
}

function markAssetsTrashed(assets, ids, trashedAt = Date.now()) {
  const selected = new Set((Array.isArray(ids) ? ids : []).map(String));
  let marked = 0;
  for (const asset of Array.isArray(assets) ? assets : []) {
    if (!asset || !selected.has(String(asset.id)) || asset.trashedAt) continue;
    asset.trashedAt = trashedAt;
    marked += 1;
  }
  return marked;
}

function reconcileRestoredAssets(assets, fileExists) {
  if (typeof fileExists !== 'function') return [];
  const restored = [];
  for (const asset of Array.isArray(assets) ? assets : []) {
    if (!asset?.trashedAt || !asset.file) continue;
    let exists = false;
    try { exists = Boolean(fileExists(asset.file)); } catch {}
    if (!exists) continue;
    delete asset.trashedAt;
    restored.push(String(asset.id));
  }
  return restored;
}

module.exports = { activeAssets, markAssetsTrashed, reconcileRestoredAssets };
