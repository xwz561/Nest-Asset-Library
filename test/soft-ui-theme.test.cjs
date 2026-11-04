const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const themeUtils = () => import(pathToFileURL(path.join(root, 'src', 'theme-utils.js')).href);

test('柔光橙预设：浅色、橙色强调，是新用户的默认主题', async () => {
  const { THEME_PRESETS, DEFAULT_THEME, SOFT_UI_PRESET, normalizeTheme } = await themeUtils();
  const soft = THEME_PRESETS.find((p) => p.id === 'soft-orange');
  assert.ok(soft, '有 soft-orange 预设');
  assert.equal(SOFT_UI_PRESET, 'soft-orange');
  assert.equal(soft.mode, 'light');
  assert.equal(soft.colors.accent, '#FF8A4C');
  assert.equal(DEFAULT_THEME.preset, 'soft-orange');
  assert.equal(DEFAULT_THEME.mode, 'light');
  assert.deepEqual(DEFAULT_THEME.colors, soft.colors);
  assert.equal(normalizeTheme({ mode: 'light', preset: 'soft-orange' }).preset, 'soft-orange');
  // 其他预设仍在，可以切回去
  for (const id of ['mineradio-glass', 'eagle-graphite', 'midnight', 'paper-light', 'graphite-violet']) assert.ok(THEME_PRESETS.some((p) => p.id === id), id);
});

test('新界面对所有主题生效：始终挂 soft-ui 类、图标栏和问候卡片，主题只换颜色', () => {
  const main = read('src/main.jsx');
  assert.doesNotMatch(main, /softUi|SOFT_UI_PRESET/, '不再按主题预设决定是否用新界面');
  assert.match(main, /ui-refresh theme-\$\{resolvedThemeMode\} soft-ui /);
  assert.match(main, /<aside ref=\{cardLayout\.dockRef\}>\s*<nav className="soft-rail"/);
  // 顶栏不要问候语和头像，第一行就是路径
  assert.match(main, /<header>\s*<div className="breadcrumbs">/);
  assert.doesNotMatch(main + read('src/soft-ui.css'), /soft-greeting|soft-avatar/);
  assert.match(main, /aria-label="空文件夹">\s*<SoftEmptyIllustration \/>/);
  assert.match(main, /const softRailWidth = 76;/);
  assert.match(main, /classList\.add\("soft-ui-body"\)/);
  assert.match(main, /classList\.toggle\("soft-ui-dark", resolvedThemeMode === "dark"\)/);
  assert.match(main, /import "\.\/soft-ui\.css";\r?\nimport "\.\/soft-ui-panels\.css";/);
  // 图标栏和侧栏共用同一个切换逻辑
  assert.equal((main.match(/onClick=\{\(\) => selectNav\(n\)\}/g) || []).length, 2);
});

const softCss = () => (read('src/soft-ui.css') + read('src/soft-ui-panels.css')).replace(/\/\*[\s\S]*?\*\//g, '');

test('新界面样式都限定在 .soft-ui 下，并且不再只限浅色主题', () => {
  const css = softCss();
  const selectors = [];
  const re = /([^{}@]+)\{/g;
  let m;
  // @media 之类的条件块本身不是选择器，跳过；块里的规则照样逐条检查
  while ((m = re.exec(css))) { if (/(^|\s)(media|supports)\s*\(/.test(m[1].trim())) continue; for (const sel of m[1].split(',')) if (sel.trim()) selectors.push(sel.trim()); }
  assert.ok(selectors.length > 80, String(selectors.length));
  for (const sel of selectors) {
    assert.match(sel, /^((html\[data-platform=[^\]]+\] )?\.app\.soft-ui\b|body\.soft-ui-body\b)/, `规则没有限定在新界面下：${sel}`);
  }
  assert.doesNotMatch(css, /\.theme-light/, '新界面不能只对浅色主题生效');
});

test('新界面的颜色全部来自主题变量，只保留几处固定的品牌色', () => {
  const css = softCss();
  const tokens = css.slice(0, css.indexOf('.app.soft-ui.ready-ui.ui-refresh.theme-dark'));
  assert.match(tokens, /--soft-bg: var\(--bg-main\);/);
  assert.match(tokens, /--soft-card: var\(--bg-card\);/);
  assert.match(tokens, /--soft-text: var\(--text-primary\);/);
  assert.match(tokens, /--soft-accent: var\(--accent\);/);
  assert.match(tokens, /--soft-blue: var\(--soft-select, var\(--accent\)\);/);
  assert.match(css, /\.app\.soft-ui\.ready-ui\.ui-refresh\.theme-dark,\s*body\.soft-ui-body\.soft-ui-dark \{[^}]*--soft-shadow:/, '深色主题有自己的投影');
  // 允许的固定色：关闭按钮的红、AI 导演按钮的粉紫、危险色基色、浅色投影色调、颜色混合里用来提亮的白
  const allowed = new Set(['#fff', '#000', '#ff9a8a', '#ff6b5e', '#f0564a', '#ff7ab8', '#8d6bff', '#e5484d', '#8a94b8']);
  const hexes = (css.match(/#[0-9a-f]{3,8}\b/gi) || []).map((h) => h.toLowerCase());
  assert.deepEqual([...new Set(hexes.filter((h) => !allowed.has(h)))], [], '样式里还有写死的颜色');
  const svg = read('src/components/soft-empty-illustration.jsx');
  assert.doesNotMatch(svg, /#[0-9a-f]{6}/i, '插画颜色也要跟主题走');
});

test('新界面的选中色和按钮文字：柔光橙用浅蓝选中、白字；其他主题用自己的强调色，按对比度选字色', async () => {
  const { THEME_PRESETS, themeStyle, softUiColors, onAccentText } = await themeUtils();
  const preset = (id) => THEME_PRESETS.find((p) => p.id === id);
  const orange = softUiColors({ preset: 'soft-orange', colors: preset('soft-orange').colors });
  assert.equal(orange['--soft-select'], '#6FA8F5');
  assert.equal(orange['--soft-select-strong'], '#3B78D8');
  assert.equal(orange['--soft-accent-text'], '#FFFFFF');
  assert.equal(orange['--soft-select-text'], '#FFFFFF');
  const midnight = softUiColors({ preset: 'midnight', colors: preset('midnight').colors });
  assert.equal(midnight['--soft-select'], preset('midnight').colors.accent);
  assert.equal(midnight['--soft-accent-text'], '#09111C', '浅蓝强调色上白字太淡，换深色字');
  assert.equal(onAccentText('#00F5D4'), '#09111C');
  assert.equal(onAccentText('#2563EB'), '#FFFFFF');
  // themeStyle 把这些变量一起写出去
  for (const p of THEME_PRESETS) {
    const vars = themeStyle({ preset: p.id, colors: p.colors }, p.mode || 'dark');
    for (const key of ['--soft-select', '--soft-select-text', '--soft-select-strong', '--soft-accent-text']) assert.ok(vars[key], `${p.id} 缺少 ${key}`);
  }
});

test('空状态插画是纯矢量，没有外部图片', () => {
  const svg = read('src/components/soft-empty-illustration.jsx');
  assert.match(svg, /<svg className=\{`\$\{className\} soft-empty-illustration`\} viewBox="0 0 260 184"/);
  assert.doesNotMatch(svg, /<image|href=|\.png|\.jpg/);
});
