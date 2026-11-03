const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'src', 'main.jsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');

test('reference controls stay inside their card and clear the external-drag corner', () => {
  assert.match(renderer, /className="reference-shelf-card"/);
  assert.match(renderer, /className="reference-shelf-remove"/);
  assert.match(renderer, /className="external-drag-handle"/);
  assert.match(renderer, /className="reference-added">已引用<\/span>/);

  assert.match(styles, /\.reference-shelf-open\{[^}]*padding:4px 29px 4px 4px/);
  assert.match(styles, /\.reference-shelf-remove\{[^}]*top:50%[^}]*right:5px[^}]*transform:translateY\(-50%\)/);
  assert.match(styles, /\.reference-added\{[^}]*right:38px/);
  assert.match(styles, /\.external-drag-handle\{[^}]*right:7px[^}]*bottom:7px[^}]*width:24px/);
});
