const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const styles = fs.readFileSync(path.join(__dirname, '..', 'src', 'ready-ui.css'), 'utf8');

test('paper theme batch actions remain readable on the dark floating bar', () => {
  assert.match(styles, /theme-light \.batch-bar strong\{color:#f5f9ff!important\}/);
  assert.match(styles, /theme-light \.batch-bar button:not\(\.danger\)\{color:#dcecff!important\}/);
  assert.match(styles, /theme-light \.batch-bar button\.danger\{color:#ff9aa4!important\}/);
  assert.match(styles, /theme-light \.batch-bar button:disabled\{color:#9db1c6!important;opacity:\.78!important\}/);
});
