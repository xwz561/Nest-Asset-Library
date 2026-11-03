const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('ui-refresh 样式层在 mineradio-theme 之后、motion-polish 之前加载，且根节点带 ui-refresh', () => {
  const main = read('src/main.jsx');
  const order = ['./mineradio-theme.css', './ui-refresh.css', './motion-polish.css'].map(name => main.indexOf(`import "${name}"`));
  assert.ok(order.every(index => index >= 0), '三份样式都应被引入');
  assert.ok(order[0] < order[1] && order[1] < order[2], '加载顺序必须是 mineradio-theme → ui-refresh → motion-polish');
  assert.match(main, /className=\{`app eagle-ui ready-ui ui-refresh theme-/);
});

test('主题变量里的边框是细线色，同时保留用户自定义的原始边框色', async () => {
  const { DEFAULT_THEME, themeStyle } = await import('../src/theme-utils.js');
  const style = themeStyle(DEFAULT_THEME);
  assert.match(style['--ui-border'], /^color-mix\(in srgb,/);
  assert.equal(style['--theme-border'], DEFAULT_THEME.colors.border);
});

test('新增“石墨紫”预设，且不改变默认主题', async () => {
  const { THEME_PRESETS, DEFAULT_THEME, normalizeTheme } = await import('../src/theme-utils.js');
  const preset = THEME_PRESETS.find(item => item.id === 'graphite-violet');
  assert.ok(preset, '应存在 graphite-violet 预设');
  assert.equal(preset.mode, 'dark');
  assert.notEqual(DEFAULT_THEME.preset, 'graphite-violet');
  assert.equal(normalizeTheme({ preset: 'graphite-violet', mode: 'dark', colors: preset.colors }).preset, 'graphite-violet');
});

test('ui-refresh.css 不再使用粗边框、发光阴影和像素描边', () => {
  const css = read('src/ui-refresh.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /border(?:-\w+)?:\s*[2-9]px\s+solid\s+(?!transparent)/, '不应出现 2px 以上的可见实线边框（透明的滚动条留白除外）');
  assert.doesNotMatch(css, /drop-shadow\(/, '不应使用 drop-shadow 描边');
  assert.match(css, /stroke-width:\s*var\(--rf-icon-stroke\)/, '矢量图标应统一线宽');
});
