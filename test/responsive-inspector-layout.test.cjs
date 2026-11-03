const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const eagleStyles = fs.readFileSync(path.join(__dirname, '..', 'src', 'eagle-ui.css'), 'utf8');
const sharedStyles = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');

test('Eagle detail grid clears the legacy floating-panel spacer', () => {
  assert.match(
    eagleStyles,
    /\.app\.eagle-ui\.detail-open:not\(\.ai-panel-open\)\s*>\s*main\s*\{[^}]*margin-right:\s*0\s*!important\s*;/,
  );
});

test('Eagle asset inspector stays in the third grid track at the native frame width', () => {
  assert.match(
    eagleStyles,
    /\.app\.eagle-ui\.detail-open:not\(\.ai-panel-open\)\s*,\s*\.app\.eagle-ui\.folder-inspector-open\s*\{[^}]*minmax\(0,\s*1fr\)\s+350px/,
  );
  const inspectorRule = eagleStyles.match(
    /\.app\.eagle-ui\s+\.detail:not\(\.ai-assistant\)\s*\{([^}]*)\}/,
  )?.[1];
  assert.ok(inspectorRule, 'Eagle asset inspector rule exists');
  assert.match(inspectorRule, /position:\s*relative/);
  assert.match(inspectorRule, /grid-column:\s*3/);
  assert.match(inspectorRule, /width:\s*auto/);
});

test('long asset names can shrink and ellipsize inside the detail header', () => {
  assert.match(sharedStyles, /\.detail-head\s*>\s*strong\s*\{[^}]*min-width:\s*0[^}]*flex:\s*1[^}]*text-overflow:\s*ellipsis/);
});
