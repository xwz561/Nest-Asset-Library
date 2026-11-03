const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const renderer=require('./source-tree.cjs').readSource(path.join(root,'src','main.jsx'),'utf8');
const layout=fs.readFileSync(path.join(root,'src','ui-redesign-overrides.css'),'utf8');
const styles=fs.readFileSync(path.join(root,'src','styles.css'),'utf8');
const ready=fs.readFileSync(path.join(root,'src','ready-ui.css'),'utf8');
const typography=fs.readFileSync(path.join(root,'src','typography.css'),'utf8');
const main=require('./source-tree.cjs').readSource(path.join(root,'electron','main.cjs'),'utf8');

test('resource switcher is portaled, viewport bounded, and dismisses reliably',()=>{
 assert.match(renderer,/appMenuPanelRef\.current\?\.contains\(event\.target\)/);
 assert.match(renderer,/window\.addEventListener\("blur", close\)/);
 assert.match(renderer,/appMenuOpen && createPortal/);
 assert.match(renderer,/aria-label="关闭资源库面板"/);
 assert.match(layout,/\.app-menu\{[^}]*position:fixed[^}]*z-index:500[^}]*width:min\(416px/);
 assert.match(layout,/\.library-switcher-list\{[^}]*overflow-x:hidden[^}]*overflow-y:auto/);
});

test('application inherits the active Windows cursor scheme',()=>{
 assert.match(styles,/\.app,\.app-dialog,\.modal-backdrop,\.app-menu,\.asset-menu\{cursor:default\}/);
 assert.match(styles,/button,a,\[role="button"\]\{cursor:pointer\}/);
 assert.match(styles,/button:disabled,\[aria-disabled="true"\]\{cursor:default\}/);
 assert.doesNotMatch(styles,/cursor:url\("\.\/assets\/cursors\/macos-(?:arrow|pointer)\.svg"\)/);
});

test('opening asset details preserves maximized and fullscreen window modes',()=>{
 assert.match(main,/const preserveWindowMode=win\.isMaximized\(\)\|\|win\.isFullScreen\(\)/);
 assert.match(main,/if\(preserveWindowMode\)\{record=\{open:true,base:win\.getBounds\(\),added:0,preserveWindowMode:true,animation:null\}/);
 assert.match(main,/if\(record\.preserveWindowMode\)\{inspectorWindows\.delete\(win\);return\{ok:true,added:0\}\}/);
 assert.doesNotMatch(main,/if\(restoreMaximized\)win\.unmaximize\(\)/);
});

test('sidebar brand button has a larger icon label and menu hit target',()=>{
 assert.match(ready,/\.app\.ready-ui \.brand\{[^}]*min-height:68px[^}]*gap:12px/);
 assert.match(ready,/\.brand \.mark\{[^}]*width:34px;height:34px/);
 assert.match(ready,/aria-haspopup="menu"\]\{[^}]*width:36px;height:36px/);
 assert.match(typography,/\.brand span\{font-size:16px;font-weight:650\}/);
});
