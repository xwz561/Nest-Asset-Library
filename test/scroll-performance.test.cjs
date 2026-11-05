const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// 用户 2026-11-04："一旦素材堆积太多就很卡"（素材库软件，滚动时）。
// 用户资源库镜像实测：音频卡片的波形 <canvas> 被提成 GPU 图层，叠在上面的小按钮跟着各自成层，
// 每帧重排图层。改成静态图片后 46 → 70 帧/秒（LES-007）。
const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const cacheModule = () => import(pathToFileURL(path.join(root, 'src', 'waveform-cache.js')).href);

function memoryStorage() {
  const data = new Map();
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
  };
}
const peaks = (n, v) => ({ low: new Float32Array(n).fill(v), mid: new Float32Array(n).fill(v / 2), high: new Float32Array(n).fill(v / 4) });

test('卡片里的波形是一张静态图片，不再是 <canvas>', () => {
  const media = read('src', 'components', 'media.jsx');
  const waveform = media.slice(media.indexOf('export function AudioWaveform'), media.indexOf('export function useAudioPreviewState'));
  assert.match(waveform, /const canvas = document\.createElement\("canvas"\);/);
  assert.match(waveform, /canvas\.toBlob\(/);
  assert.match(waveform, /<img className="audio-waveform" src=\{image\}/);
  assert.doesNotMatch(waveform, /<canvas/);
  assert.match(waveform, /waveformImages\.set\(imageKey, url\);/);
  assert.match(media, /<AudioWaveform src=\{asset\.url\} large=\{preview\} version=\{asset\.hash \|\| String\(asset\.size \|\| ""\)\} \/>/);
  assert.match(read('src', 'soft-ui.css'), /\.audio-waveform \{ transform: none; object-fit: fill !important; \}/);
});

test('入场动画结束后不保留最后一帧，免得一直占着动画图层', () => {
  const motion = read('src', 'interaction-motion.css');
  assert.match(motion, /animation: toolbar-heading-enter 320ms var\(--apple-ease\) backwards;/);
  assert.match(motion, /animation: folder-inspector-enter 190ms var\(--apple-ease\) backwards;/);
  assert.match(motion, /animation: folder-inspector-row-enter 220ms ease backwards;/);
});

test('波形峰值存到本机，下次打开直接用；坏数据忽略', async () => {
  const { createWaveformCache } = await cacheModule();
  const storage = memoryStorage();
  const first = createWaveformCache(4, { storage });
  first.set('a', peaks(88, 0.5));
  const second = createWaveformCache(4, { storage });
  const restored = second.get('a');
  assert.ok(restored);
  assert.equal(restored.low.length, 88);
  assert.ok(Math.abs(restored.low[0] - 0.5) < 0.001);
  storage.setItem('nest-waveform-v1:broken', '{not json');
  assert.equal(second.get('broken'), undefined);
});

test('本机存的波形有上限，最久没用的先删；存满时也能腾出地方', async () => {
  const { createWaveformCache } = await cacheModule();
  const storage = memoryStorage();
  const cache = createWaveformCache(2, { storage, storageLimit: 3 });
  for (const key of ['a', 'b', 'c', 'd']) cache.set(key, peaks(8, 0.2));
  assert.equal(storage.getItem('nest-waveform-v1:a'), null);
  assert.ok(storage.getItem('nest-waveform-v1:d'));
  assert.deepEqual(JSON.parse(storage.getItem('nest-waveform-v1-index')), ['b', 'c', 'd']);
  // 模拟本机存储满了：只有删掉一条旧的以后才写得进去
  let full = true;
  const original = storage.setItem;
  storage.setItem = (key, value) => { if (full && key.startsWith('nest-waveform-v1:') && !key.endsWith('index')) { full = false; throw new Error('QuotaExceededError'); } original(key, value); };
  cache.set('e', peaks(8, 0.3));
  assert.ok(storage.getItem('nest-waveform-v1:e'));
  assert.equal(storage.getItem('nest-waveform-v1:b'), null);
});

test('没有本机存储时只用内存，不报错', async () => {
  const { createWaveformCache } = await cacheModule();
  const cache = createWaveformCache(2, { storage: null });
  cache.set('x', peaks(4, 0.1));
  assert.ok(cache.get('x'));
  assert.equal(cache.get('missing'), undefined);
});

test('卡片上悬停才出现的小按钮：平时 display: none，悬停时从透明淡入，离开时淡出后再隐藏', () => {
  const motion = read('src', 'interaction-motion.css');
  const P = '.app.soft-ui.ready-ui.ui-refresh .masonry article';
  assert.ok(motion.includes(`${P} .thumb:not(:hover) .fav:not(.yes),`));
  assert.ok(motion.includes(`${P}:not(.multi-selected) .thumb:not(:hover) .select-dot,`));
  assert.ok(motion.includes(`${P} .thumb:not(:hover) .external-drag-handle:not(:focus-visible) { display: none !important; }`));
  assert.match(motion, /display \.18s allow-discrete !important;/);
  assert.match(motion, /@starting-style \{[\s\S]*?\.thumb:hover \.fav,[\s\S]*?\{ opacity: 0; \}/);
});

test('滚动时暂停卡片悬停效果：main 上临时加 is-scrolling，不走 React 状态', () => {
  const main = read('src', 'main.jsx');
  const handler = main.slice(main.indexOf('onScroll={(e) => {'), main.indexOf('onClick={(event) => {', main.indexOf('onScroll={(e) => {')));
  assert.match(handler, /updateVirtualRange\(e\.currentTarget\);/);
  assert.match(handler, /scroller\.classList\.add\("is-scrolling"\);/);
  assert.match(handler, /setTimeout\(\(\) => scroller\.classList\.remove\("is-scrolling"\), 160\)/);
  assert.doesNotMatch(handler, /setState|setScrolling/);
  assert.match(read('src', 'soft-ui.css'), /main\.is-scrolling \.masonry article \{ pointer-events: none; \}/);
});
