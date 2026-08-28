function duplicateGroups(assets = []) {
  const byHash = new Map();
  for (const asset of assets) {
    if (!asset?.id || !asset.hash) continue;
    if (!byHash.has(asset.hash)) byHash.set(asset.hash, []);
    byHash.get(asset.hash).push(asset.id);
  }
  return [...byHash.entries()].filter(([, ids]) => ids.length > 1).map(([hash, assetIds]) => ({ hash, assetIds }));
}

function similarAssets(assets = [], sourceId, limit = 24) {
  const source = assets.find(asset => asset.id === sourceId);
  if (!source) return [];
  const sourceTags = new Set(source.tags || []), sourceAspect = source.width && source.height ? source.width / source.height : 0;
  const words = new Set(String(source.name || '').toLowerCase().split(/[\s_\-.]+/).filter(word => word.length > 1));
  return assets.filter(asset => asset.id !== sourceId).map(asset => {
    let score = asset.type?.split('/')[0] === source.type?.split('/')[0] ? 0.25 : 0;
    const tags = new Set(asset.tags || []), union = new Set([...sourceTags, ...tags]), intersection = [...sourceTags].filter(tag => tags.has(tag));
    if (union.size) score += intersection.length / union.size * 0.45;
    const aspect = asset.width && asset.height ? asset.width / asset.height : 0;
    if (sourceAspect && aspect) score += Math.max(0, 1 - Math.abs(sourceAspect - aspect) / Math.max(sourceAspect, aspect)) * 0.2;
    const otherWords = new Set(String(asset.name || '').toLowerCase().split(/[\s_\-.]+/));
    if (words.size) score += [...words].filter(word => otherWords.has(word)).length / words.size * 0.1;
    return { assetId: asset.id, score: Math.round(score * 1000) / 1000 };
  }).filter(item => item.score > 0.15).sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(100, limit)));
}

module.exports = { duplicateGroups, similarAssets };
