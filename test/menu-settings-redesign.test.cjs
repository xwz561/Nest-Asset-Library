const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const renderer = require('./source-tree.cjs').readSource(path.resolve(__dirname, '..', 'src', 'main.jsx'), 'utf8');
const styles = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'ai-settings-page.css'), 'utf8');
const layout = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'ui-redesign-overrides.css'), 'utf8');

test('hamburger menu is a focused resource-library switcher', async () => {
  const { LIBRARY_MENU_ACTIONS } = await import('../src/app-menu.js');
  const ids = LIBRARY_MENU_ACTIONS.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length, 'menu action ids are unique');
  for (const required of ['create-library', 'open-library', 'clear-cache', 'merge-library']) {
    assert.ok(ids.includes(required), `menu includes ${required}`);
  }
  for (const retired of ['import-assets', 'focus-search', 'extensions', 'preferences', 'exit']) assert.ok(!ids.includes(retired), `menu omits retired ${retired}`);
  assert.ok(renderer.includes('function LibrarySwitcherMenu'), 'hamburger renders the resource switcher');
  assert.ok(renderer.includes('recentLibraries') && renderer.includes('switchRecentLibrary'), 'recent libraries can be listed and switched');
  assert.ok(renderer.includes('placeholder="搜索…"') && renderer.includes('aria-label="搜索资源库"'), 'resource libraries can be searched');
  assert.match(renderer, /item\.current \? onDelete\(\) : onForget\(item\.id\)/, 'the current library ellipsis opens its delete confirmation');
});

test('top action strip omits the redundant general settings button', () => {
  const start = renderer.indexOf('className="top-action-strip"');
  const strip = renderer.slice(start, renderer.indexOf('</header>', start));
  assert.ok(start >= 0, 'top action strip is present');
  assert.ok(!strip.includes('title="设置"'), 'general settings gear is not rendered in the top action strip');
});

test('settings opens as an integrated graphite preferences workspace with searchable sections', () => {
  assert.ok(renderer.includes('className="app-menu library-switcher-menu"'), 'hamburger renders the resource switcher');
  assert.ok(renderer.includes('placeholder="搜索设置"'), 'settings search accepts input');
  assert.ok(renderer.includes('主题与配色'), 'theme editing is part of settings');
  assert.ok(renderer.includes('inline={tab === "主题与配色"}'), 'theme editor is embedded in settings');
  assert.ok(!renderer.includes('false && tab === "外观"'), 'retired duplicate appearance editor is removed');
  assert.ok(renderer.includes('className={"ai-settings-page theme-" + resolvedThemeMode'), 'settings layout follows the live theme mode');
  assert.ok(styles.includes('.ai-settings-page{') && styles.includes('background:var(--bg-main'), 'settings follows the graphite application theme');
  assert.ok(styles.includes('html[data-platform="win32"] .ai-settings-top{padding-right:138px'), 'settings controls stay clear of native Windows title-bar buttons');
  assert.ok(styles.includes('.ai-settings-page.theme-light .ai-settings-main>h2') && styles.includes('color:var(--text-primary)'), 'light mode has readable settings text and controls');
  const inlineEditor = styles.match(/\.appearance-dialog-inline\{[^}]*\}/)?.[0] || '';
  const inlineActions = styles.match(/\.appearance-dialog-inline \.appearance-actions\{[^}]*\}/)?.[0] || '';
  assert.match(inlineEditor, /height:auto/, 'inline editor grows with its contents');
  assert.doesNotMatch(inlineActions, /position:sticky/, 'inline save actions stay after the color controls instead of covering them');
});

test('narrow workspace wraps the toolbar instead of clipping it', () => {
  assert.ok(layout.includes('.app.eagle-ui .toolbar{flex-wrap:wrap'), 'toolbar can wrap onto a second row');
});

test('asset folder picker is a separate fixed flyout and detail view hides the overlapping feedback chip', () => {
  assert.ok(renderer.includes('move-submenu-floating'), 'the folder picker uses its own flyout layer');
  assert.ok(renderer.includes('flyoutLeft') && renderer.includes('flyoutTop'), 'flyout placement accounts for the viewport');
  const assetMenu = renderer.slice(renderer.indexOf('function AssetContextMenu'), renderer.indexOf('function FolderContextMenu'));
  assert.match(assetMenu, /createPortal\([\s\S]*document\.body/, 'the folder picker is portaled outside transformed app panels');
  assert.ok(renderer.includes('contextMenuFlyoutRef.current?.contains(event.target)'), 'pointering in the flyout does not dismiss its parent menu');
  assert.ok(layout.includes('.move-submenu.move-submenu-floating{position:fixed'), 'folder picker is positioned outside the context menu flow');
  assert.ok(layout.includes('.app.detail-open .bug-feedback{display:none!important}'), 'feedback chip cannot cover detail actions');
});
