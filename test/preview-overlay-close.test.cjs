const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'src', 'main.jsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');

test('fullscreen preview keeps an explicit close affordance outside the Windows titlebar overlay', () => {
  assert.match(renderer, /className="preview-close"/);
  assert.match(renderer, /aria-label="关闭预览"/);
  assert.match(renderer, /关闭预览<\/span>/);
  assert.match(renderer, /previewId && event\.key === "Escape"/);
  assert.match(renderer, /event\.target === event\.currentTarget\) close\(\)/);
  assert.match(styles, /html\[data-platform="win32"\] \.preview-overlay\{padding-top:44px\}/);
  assert.match(styles, /\.preview-close\{[^}]*background:/);
});
