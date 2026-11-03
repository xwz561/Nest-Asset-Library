const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const main = require('./source-tree.cjs').readSource(path.join(root, 'src', 'main.jsx'), 'utf8');
const readyCss = fs.readFileSync(path.join(root, 'src', 'ready-ui.css'), 'utf8');

test('leaf folders hide the disabled expander while keeping their tree indent', () => {
  assert.match(readyCss, /\.folder-toggle:disabled\{opacity:0!important;visibility:hidden;pointer-events:none\}/);
});

test('nested folders render branch and ancestor connectors with a terminating last branch', () => {
  assert.match(main, /className="folder-tree-guides"/);
  assert.match(main, /folder-tree-branch \$\{f\.isLastSibling \? "last" : ""\}/);
  assert.match(readyCss + fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8'), /\.folder-tree-branch\.last\{bottom:50%\}/);
});

test('the material toolbar no longer contains the trailing open-library ellipsis', () => {
  assert.doesNotMatch(main, /title="打开其他资源库"/);
});

test('the header preference action uses the settings gear', () => {
  assert.match(main, /title="偏好设置"[\s\S]{0,160}<Settings size=\{14\}/);
});
