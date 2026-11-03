const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const readyStyles = fs.readFileSync(path.join(root, 'src', 'ready-ui.css'), 'utf8');

test('light import panel uses semantic readable text and icon colors', () => {
  assert.match(readyStyles, /\.app\.ready-ui \.import-actions-head strong,\.app\.ready-ui \.import-action>span\{color:var\(--text-primary\)!important\}/);
  assert.match(readyStyles, /\.app\.ready-ui \.import-actions-head small,\.app\.ready-ui \.import-action>small\{color:var\(--text-secondary\)!important\}/);
  assert.match(readyStyles, /\.app\.ready-ui \.import-actions \.import-action>svg\{[^}]*color:var\(--text-secondary\)!important/);
  assert.match(readyStyles, /\.app\.ready-ui \.import-actions \.import-action:disabled\{opacity:1!important/);
});

test('light folder tree gives connected lightning a crisp contrast shadow', () => {
  assert.match(readyStyles, /\.app\.ready-ui \.aiflow-live-bolt\{[^}]*drop-shadow\(0 1px 1px color-mix\(in srgb,var\(--text-primary\) 72%,transparent\)\)/);
  assert.match(readyStyles, /\.app\.ready-ui\.theme-light \.aiflow-live-bolt\{[^}]*color:#0aa66f/);
});

test('light workspace keeps empty states, breadcrumbs, view labels, and feedback readable', () => {
  assert.match(readyStyles, /\.app\.ready-ui\.theme-light \.empty-library-state h2\{color:var\(--text-primary\)\}/);
  assert.match(readyStyles, /\.app\.ready-ui\.theme-light \.empty-library-state p\{color:var\(--text-secondary\)\}/);
  assert.match(readyStyles, /\.app\.ready-ui\.theme-light \.breadcrumbs b,[\s\S]*\.breadcrumbs \.breadcrumb-link\{color:var\(--text-secondary\)\}/);
  assert.match(readyStyles, /\.app\.ready-ui\.theme-light \.toolbar \.view-actions button span\{color:inherit\}/);
  assert.match(readyStyles, /\.app\.ready-ui\.theme-light \.bug-feedback\{[^}]*background:var\(--bg-card\)[^}]*color:var\(--text-primary\)/);
});

test('folder hover actions have tight independent icon-sized hit surfaces', () => {
  assert.match(readyStyles, /\.app\.ready-ui \.compact-folder-tree \.folder-action\{[^}]*width:22px!important[^}]*height:22px!important[^}]*border-radius:5px[^}]*background:transparent!important[^}]*box-shadow:none!important/);
  assert.match(readyStyles, /\.app\.ready-ui \.compact-folder-tree \.folder-action:hover[^}]*background:var\(--hover-bg\)!important/);
});

test('pet native motion sampling is tuned for high refresh displays', () => {
  const pet = require('../electron/desktop-pet.cjs');
  assert.equal(pet.PET_MOTION_INTERVAL_MS, 8);
  const source = fs.readFileSync(path.join(root, 'electron', 'desktop-pet.cjs'), 'utf8');
  assert.equal((source.match(/},PET_MOTION_INTERVAL_MS\)/g) || []).length, 2);
});
