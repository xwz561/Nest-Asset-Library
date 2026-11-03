async function openAssetFile(asset, { resolvePath, exists, openPath } = {}) {
  if (!asset) return { error: '素材不存在或已被删除' };
  const target = typeof resolvePath === 'function' ? resolvePath(asset.file) : '';
  let available = false;
  try { available = typeof exists === 'function' && Boolean(exists(target)); } catch {}
  if (!available) return { error: `素材文件已丢失：${asset.name || asset.originalName || '未命名素材'}` };
  try {
    const error = await openPath(target);
    return error ? { error: `无法打开素材：${error}` } : { ok: true };
  } catch (error) {
    return { error: `无法打开素材：${error?.message || error}` };
  }
}

module.exports = { openAssetFile };
