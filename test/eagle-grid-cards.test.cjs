const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const P = '.app.soft-ui.ready-ui.ui-refresh main:not(.view-list) .masonry article';

// 把 CSS 拆成 { selector, body }，便于按选择器找规则
const rules = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
const ruleFor = (css, selector) => rules(css).find((rule) => rule.selector.split(',').map((s) => s.trim()).includes(selector));

test('素材网格是 Eagle 式：卡片没有底色、边框、内边距和投影，只有图片带投影', () => {
  const css = read('src', 'soft-ui.css');
  const card = ruleFor(css, P);
  assert.ok(card, '网格视图卡片规则存在');
  for (const state of [`${P}:hover:not(.selected):not(.multi-selected)`, `${P}.selected`, `${P}.multi-selected`, `${P}.has-color-mark`, `${P}.has-color-mark.selected`]) {
    assert.ok(card.selector.includes(state), `卡片的 ${state} 状态也没有卡片底`);
  }
  assert.match(card.body, /padding: 0 !important/);
  assert.match(card.body, /border: 0 !important/);
  assert.match(card.body, /background: transparent !important/);
  assert.match(card.body, /box-shadow: none !important/);
  assert.match(card.body, /transform: none !important/, '悬停不再上浮');

  const thumb = ruleFor(css, `${P} .thumb`);
  assert.ok(thumb);
  assert.match(thumb.body, /border-radius: 10px !important/);
  assert.match(thumb.body, /box-shadow: var\(--soft-thumb-shadow\) !important/);
  assert.match(thumb.body, /margin: 0 !important/);

  // 必须排在旧的卡片样式之后，同为 !important 时才能盖住
  assert.ok(css.indexOf(`${P},`) > css.indexOf('.app.soft-ui.ready-ui.ui-refresh .masonry article.has-color-mark.multi-selected'));
});

test('悬停、选中、颜色标记画成图片外圈的环，浅色和深色都有图片投影', () => {
  const css = read('src', 'soft-ui.css');
  assert.match(ruleFor(css, `${P}:hover:not(.selected):not(.multi-selected) .thumb`).body, /0 0 0 2px color-mix\(in srgb, var\(--soft-text\)/);
  assert.match(ruleFor(css, `${P}.selected .thumb`).body, /0 0 0 3px var\(--soft-accent\)/);
  assert.match(ruleFor(css, `${P}.multi-selected .thumb`).body, /0 0 0 3px var\(--soft-accent\)/);
  assert.match(ruleFor(css, `${P}.has-color-mark:hover:not(.selected):not(.multi-selected) .thumb`).body, /0 0 0 3px var\(--asset-mark\)/, '悬停时颜色标记不能被悬停环盖掉');
  assert.match(ruleFor(css, `${P}.has-color-mark.selected .thumb`).body, /var\(--asset-mark\), 0 0 0 6px var\(--soft-accent\)/);
  assert.equal((css.match(/--soft-thumb-shadow: /g) || []).length, 2, '浅色和深色各定义一份投影');
  assert.match(css, /\.theme-dark,\s*body\.soft-ui-body\.soft-ui-dark \{[^}]*--soft-thumb-shadow: /);
});

test('Eagle 式网格不在滚动元素上加昂贵效果（LES-007），列表视图不受影响', () => {
  const css = read('src', 'soft-ui.css');
  const block = rules(css).filter((rule) => rule.selector.includes('main:not(.view-list) .masonry article'));
  assert.ok(block.length >= 6);
  for (const rule of block) {
    assert.doesNotMatch(rule.body, /filter:|backdrop-filter|will-change|translateZ/, `${rule.selector} 不能用滤镜或强制合成层`);
  }
  assert.match(css, /main\.is-scrolling \.masonry article \{ pointer-events: none; \}/);
  assert.match(css, /main\.view-list \.masonry article \.meta \.meta-dimensions \{ display: none; \}/);
});

test('图片下方显示文件名和尺寸，角标按钮仍在图片里', () => {
  const main = read('src', 'main.jsx');
  const card = main.slice(main.indexOf('className="masonry"'), main.indexOf('virtualRange.after > 0'));
  assert.match(card, /<strong title=\{a\.name\}>\{a\.name\}<\/strong>\s*<small className="meta-dimensions">\{a\.width && a\.height \? `\$\{a\.width\} × \$\{a\.height\}` : ""\}<\/small>/);
  const thumb = card.slice(card.indexOf('className="thumb"'), card.indexOf('className="meta"'));
  for (const piece of ['external-drag-handle', 'onDragStart={(e) => startExternalAssetDrag(e, a)}', 'className="select-dot"', 'a.favorite ? "fav yes" : "fav"', '<Media']) {
    assert.ok(thumb.includes(piece), `${piece} 仍在图片容器里`);
  }
  const css = read('src', 'soft-ui.css');
  assert.match(ruleFor(css, `${P} .thumb .dimensions`).body, /display: none !important/, '尺寸已写在下方，图片上的尺寸角标不再重复');
});
