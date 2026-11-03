const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'ready-ui.css'), 'utf8');

test('full-width Windows library header stays clear of native caption buttons', () => {
  assert.match(
    css,
    /html\[data-platform="win32"\] \.app\.eagle-ui\.ready-ui:not\(\.detail-open\):not\(\.folder-inspector-open\):not\(\.ai-panel-open\) main>header\s*\{[^}]*padding-right:\s*154px/s,
  );
  assert.match(
    css,
    /main>header \.search\s*\{[^}]*max-width:\s*100%[^}]*min-width:\s*0/s,
  );
});

test('inspector header keeps compact spacing because the caption buttons sit over its own right column', () => {
  assert.match(css, /html\[data-platform="win32"\] \.app\.ready-ui\.detail-open main>header\{padding-right:12px\}/);
});
