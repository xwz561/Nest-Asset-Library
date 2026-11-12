const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// DEC-013：AI Flow「页面配色」重做——底色接近中性，只靠一个克制的强调色区分主题。
const page = fs.readFileSync(path.join(__dirname, '..', 'browser-extension', 'aiflow-page.js'), 'utf8');
const presets = [...page.matchAll(/body\[data-nest-aiflow-theme(?:="([\w-]+)")?\] \{ (--nest-theme-bg:[^}]*)\}/g)];
const vars = body => Object.fromEntries([...body.matchAll(/--nest-theme-([\w-]+):(#[0-9a-f]{6});/g)].map(m => [m[1], m[2]]));
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const lum = hex => { const [r, g, b] = rgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test('六套配色都在，名字改成新的', () => {
  assert.equal(presets.length, 6);
  for (const name of ['夜蓝', '雾紫', '松石', '石墨', '琥珀', '玫瑰']) assert.match(page, new RegExp(`>${name}</button>`));
});

test('底色、侧栏、卡片、输入框都接近中性灰，不再整页染色', () => {
  for (const [, name = 'deep-blue', body] of presets) {
    const v = vars(body);
    for (const key of ['bg', 'sidebar', 'surface', 'field', 'overlay', 'button']) {
      const [r, g, b] = rgb(v[key]);
      assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 10, `${name} ${key} ${v[key]} 偏色太重`);
    }
  }
});

test('文字和主按钮对比度够', () => {
  for (const [, name = 'deep-blue', body] of presets) {
    const v = vars(body);
    assert.ok(contrast(v.text, v.surface) >= 12, `${name} 正文对比度`);
    assert.ok(contrast(v.muted, v.overlay) >= 4.5, `${name} 次要文字对比度`);
    assert.ok(contrast(v['primary-text'], v.primary) >= 4.3, `${name} 主按钮文字对比度`);
  }
});

test('精简布局按钮和同步前检查面板跟随配色，不再写死金色和青绿渐变', () => {
  assert.doesNotMatch(page, /rgba\(33, 27, 15|#ffe5a0|rgba\(7, 47, 40|#106f58/);
  assert.match(page, /#\$\{FOCUS_LAYOUT_TOGGLE_ID\} \{[\s\S]*?var\(--nest-theme-overlay/);
  assert.match(page, /\.nest-aiflow-diff-actions button \{[^}]*var\(--nest-theme-primary/);
});

test('「AI Flow 原版」排在第一项，选中后去掉主题标记、页面回到 AI Flow 自己的颜色，并记住选择', () => {
  assert.match(page, /<div data-nest-theme-options><button type="button" data-nest-theme="aiflow-original">AI Flow 原版<\/button>/);
  assert.match(page, /'sakura', AIFLOW_ORIGINAL_THEME\]\.includes\(theme\)/);
  const vm = require('node:vm');
  const source = page.slice(page.indexOf('function applyAIFlowTheme('), page.indexOf('function injectAIFlowThemeSwitcher('));
  const body = { dataset: { nestAiflowTheme: 'deep-blue' } };
  const sandbox = { document: { body }, AIFLOW_ORIGINAL_THEME: 'aiflow-original' };
  vm.runInNewContext(`${source}; this.applyAIFlowTheme = applyAIFlowTheme;`, sandbox);
  sandbox.applyAIFlowTheme('aiflow-original');
  assert.equal('nestAiflowTheme' in body.dataset, false);
  sandbox.applyAIFlowTheme('sakura');
  assert.equal(body.dataset.nestAiflowTheme, 'sakura');
  assert.match(page, /applyAIFlowTheme\(value\);\n\s*try \{ localStorage\.setItem\(AIFLOW_THEME_KEY, value\)/);
});
