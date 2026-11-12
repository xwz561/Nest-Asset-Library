const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const read = file => fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
const allCss = () => fs.readdirSync(path.join(__dirname, '..', 'src')).filter(name => name.endsWith('.css')).map(read).join('\n');

// 用户反馈：素材库点击、悬停反应慢（LES-020）。
test('no root-level :has() depends on :active/:hover/:focus, which restyles the whole app on every click', () => {
  const css = allCss();
  const selectors = [];
  for (const match of css.matchAll(/([^{}]+)\{/g)) for (const sel of match[1].split(',')) selectors.push(sel.trim());
  const offenders = selectors.filter(sel => /^(html|body|\.app)[\w.-]*:has\([^)]*:(active|hover|focus)/.test(sel));
  assert.deepEqual(offenders, []);
  assert.match(read('styles.css'), /main:active \.masonry article\{transition-duration:\.08s\}/);
});

test('hovering an asset card does not rescale the thumbnail image or video', () => {
  const soft = read('soft-ui.css');
  assert.match(soft, /\.masonry article:hover \.thumb img,\s*\.app\.soft-ui\.ready-ui\.ui-refresh \.masonry article:hover \.thumb video \{ transform: none !important; \}/);
});
