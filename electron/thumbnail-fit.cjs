// 缩略图尺寸：保持原图比例，短边缩到 shortSide；特别长的图再把长边压到 longCap 以内。
// 只缩小不放大。两个边都写死（如 120×120）会把非正方形的图压扁或拉长。
function fitThumbnailSize(size, shortSide = 120, longCap = 360) {
  const width = Math.floor(Number(size?.width) || 0);
  const height = Math.floor(Number(size?.height) || 0);
  if (width <= 0 || height <= 0) return null;
  let scale = Math.min(1, shortSide / Math.min(width, height));
  if (Math.max(width, height) * scale > longCap) scale = longCap / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

module.exports = { fitThumbnailSize };
