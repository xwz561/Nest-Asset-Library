const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const { fitThumbnailSize } = require(path.join(root, 'electron', 'thumbnail-fit.cjs'));

const ratio = size => size.width / size.height;

test('缩略图保持原图比例：横图、竖图、方图都不变形', () => {
  assert.deepEqual(fitThumbnailSize({ width: 1920, height: 1080 }), { width: 213, height: 120 });
  assert.deepEqual(fitThumbnailSize({ width: 1080, height: 1920 }), { width: 120, height: 213 });
  assert.deepEqual(fitThumbnailSize({ width: 800, height: 800 }), { width: 120, height: 120 });
  for (const size of [{ width: 1920, height: 1080 }, { width: 1080, height: 1920 }, { width: 3000, height: 2000 }]) {
    assert.ok(Math.abs(ratio(fitThumbnailSize(size)) - ratio(size)) < 0.02);
  }
});

test('特别长的图把长边压到上限以内，仍然保持比例', () => {
  const panorama = fitThumbnailSize({ width: 6000, height: 600 });
  assert.deepEqual(panorama, { width: 360, height: 36 });
  const strip = fitThumbnailSize({ width: 500, height: 8000 });
  assert.equal(strip.height, 360);
  assert.ok(Math.abs(ratio(strip) - 500 / 8000) < 0.01);
});

test('小图不放大，坏尺寸返回 null', () => {
  assert.deepEqual(fitThumbnailSize({ width: 64, height: 48 }), { width: 64, height: 48 });
  assert.equal(fitThumbnailSize({ width: 0, height: 100 }), null);
  assert.equal(fitThumbnailSize(null), null);
});

test('视频延长素材库的缩略图不再写死 120×120', () => {
  const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
  assert.doesNotMatch(main, /resize\(\{\s*width:\s*120,\s*height:\s*120/);
  assert.match(main, /require\('\.\/thumbnail-fit\.cjs'\)/);
  assert.match(main, /fitThumbnailSize\(image\.getSize\(\)\)/);
});
