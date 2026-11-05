const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const styles = fs.readFileSync(path.join(__dirname, '..', 'src', 'ready-ui.css'), 'utf8');
const softUiPanels = fs.readFileSync(path.join(__dirname, '..', 'src', 'soft-ui-panels.css'), 'utf8');
const motion = fs.readFileSync(path.join(__dirname, '..', 'src', 'motion-polish.css'), 'utf8');

test('paper theme batch actions remain readable on the dark floating bar', () => {
  assert.match(styles, /theme-light \.batch-bar strong\{color:#f5f9ff!important\}/);
  assert.match(styles, /theme-light \.batch-bar button:not\(\.danger\)\{color:#dcecff!important\}/);
  assert.match(styles, /theme-light \.batch-bar button\.danger\{color:#ff9aa4!important\}/);
  assert.match(styles, /theme-light \.batch-bar button:disabled\{color:#9db1c6!important;opacity:\.78!important\}/);
});

test('soft UI batch action bar follows the active theme and has a restrained entrance', () => {
  assert.match(softUiPanels, /\.app\.soft-ui\.ready-ui\.ui-refresh \.batch-bar\s*\{(?=[^}]*background:\s*var\(--soft-card\))(?=[^}]*border:\s*1px solid var\(--soft-line\))[^}]*\}/s);
  assert.match(softUiPanels, /\.app\.soft-ui\.ready-ui\.ui-refresh \.batch-bar strong\s*\{[^}]*color:\s*var\(--soft-blue\)/s);
  assert.match(softUiPanels, /\.app\.soft-ui\.ready-ui\.ui-refresh \.batch-bar button:not\(\.danger\)\s*\{[^}]*background:\s*var\(--soft-tint\)[^}]*color:\s*var\(--soft-text\)/s);
  assert.match(softUiPanels, /\.app\.soft-ui\.ready-ui\.ui-refresh \.batch-bar button\.danger\s*\{[^}]*background:\s*var\(--soft-danger-tint\)[^}]*color:\s*var\(--soft-danger\)/s);
  assert.match(motion, /\.app\.soft-ui\.ready-ui\.ui-refresh \.batch-bar\s*\{\s*animation:\s*batch-bar-enter 200ms var\(--apple-ease\) backwards;/);
  assert.match(motion, /@keyframes batch-bar-enter\s*\{[^}]*opacity:\s*0[^}]*translate:\s*0 8px/s);
  assert.match(motion, /prefers-reduced-motion:\s*reduce[\s\S]*?\.app\.soft-ui\.ready-ui\.ui-refresh \.batch-bar[\s\S]*?animation:\s*none/s);
});
