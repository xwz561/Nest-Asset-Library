const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const renderer = require('./source-tree.cjs').readSource(path.join(root, 'src', 'main.jsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src', 'ready-ui.css'), 'utf8');

test('paper theme keeps dark preview, menu, media, and card controls light', () => {
  assert.match(styles, /theme-light \.preview-top button,[\s\S]*?color:#e5f0fc!important/);
  assert.match(styles, /theme-light \.asset-menu>\.fui-Button,[\s\S]*?color:#dcecff!important/);
  assert.match(styles, /theme-light \.thumb \.select-dot,[\s\S]*?color:#f5f9ff!important/);
  assert.match(styles, /theme-light \.thumb \.external-drag-handle,[\s\S]*?color:#dcecff!important/);
  assert.match(styles, /theme-light \.video-card-controls button/);
  assert.match(styles, /theme-light \.import-actions \.import-action>span/);
});

test('small audio waveform uses a high-contrast blue-gray on its navy card', () => {
  assert.match(renderer, /ctx\.fillStyle = large \? "#77a9f5" : "#aac4df"/);
});
