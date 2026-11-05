const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const renderer = require('./source-tree.cjs').readSource(path.join(__dirname, '..', 'src', 'main.jsx'), 'utf8');

test('opens on the Recent view so an empty startup matches the reference screen', () => {
  assert.match(renderer, /\[filter, setFilter\] = useState\("最近"\)/);
  assert.match(renderer, /\[activeFolder, setActiveFolder\] = useState\(null\)/);
});

test('opening a folder switches back to its all-assets view', () => {
  assert.match(renderer, /const openFolder = \(folder, event\) => withViewTransition\(\(\) => \{\s*setActiveModule\("library"\);\s*setFilter\("全部素材"\);/);
});
