const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// 用户 2026-11-04：素材卡片加颜色（边缘颜色区分），名字下面显示备注；文件夹详情点空白收起。
const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const colors = () => import(pathToFileURL(path.join(root, 'src', 'asset-colors.js')).href);

test('颜色标记只存 id，查得到色值，查不到返回 null', async () => {
  const { ASSET_COLORS, assetColor } = await colors();
  assert.equal(ASSET_COLORS.length, 8);
  assert.equal(new Set(ASSET_COLORS.map((color) => color.id)).size, 8);
  for (const color of ASSET_COLORS) assert.match(color.value, /^#[0-9a-f]{6}$/i);
  assert.equal(assetColor('red').value, '#ff5f57');
  assert.equal(assetColor(''), null);
  assert.equal(assetColor('not-a-color'), null);
});

test('素材卡片按 labelColor 画边缘颜色，名字下面显示备注', () => {
  const main = read('src', 'main.jsx');
  assert.match(main, /import \{ assetColor \} from "\.\/asset-colors\.js"/);
  assert.match(main, /assetColor\(a\.labelColor\) \? "has-color-mark" : ""/);
  assert.match(main, /style=\{assetColor\(a\.labelColor\) \? \{ "--asset-mark": assetColor\(a\.labelColor\)\.value \} : undefined\}/);
  assert.match(main, /<strong title=\{a\.name\}>\{a\.name\}<\/strong>\s*\{a\.note\?\.trim\(\) && <p className="asset-note" title=\{a\.note\.trim\(\)\}>\{a\.note\.trim\(\)\}<\/p>\}/);
  const css = read('src', 'soft-ui.css');
  assert.match(css, /\.masonry article\.has-color-mark \{ box-shadow: 0 0 0 3px var\(--asset-mark\)/);
  assert.match(css, /article\.has-color-mark\.selected,[\s\S]*?0 0 0 7px var\(--soft-accent\)/);
  assert.match(css, /\.meta \.asset-note \{[\s\S]*?-webkit-line-clamp: 2;/);
});

test('右键菜单和详情面板都能标颜色；多选时右键标给全部选中的素材', () => {
  const main = read('src', 'main.jsx');
  const menus = read('src', 'components', 'menus.jsx');
  const media = read('src', 'components', 'media.jsx');
  assert.match(main, /color: \(labelColor\) => \{\s*if \(selectedIdSet\.has\(contextMenu\.asset\.id\) && selectedIds\.length > 1\) void batchUpdate\(\{ labelColor \}\);\s*else patch\(contextMenu\.asset\.id, \{ labelColor \}\);/);
  assert.match(menus, /\{!readOnly && actions\.color && <div className="asset-menu-colors">/);
  assert.match(menus, /<AssetColorPicker value=\{menu\.asset\.labelColor \|\| ""\}/);
  assert.match(media, /<AssetColorPicker value=\{asset\.labelColor \|\| ""\} disabled=\{!canEdit\} onChange=\{\(labelColor\) => patch\(asset\.id, \{ labelColor \}\)\} \/>/);
  const picker = read('src', 'components', 'asset-color-picker.jsx');
  assert.match(picker, /role="radiogroup" aria-label="颜色标记"/);
  assert.match(picker, /onChange\(value === color\.id \? "" : color\.id\)/);
});

test('文件夹详情点素材区空白处收起，重新打开文件夹时再出现', () => {
  const main = read('src', 'main.jsx');
  assert.match(main, /const \[folderInspectorHidden, setFolderInspectorHidden\] = React\.useState\(false\);/);
  assert.match(main, /useEffect\(\(\) => \{ setFolderInspectorHidden\(false\); \}, \[activeFolder\]\);/);
  assert.match(main, /activeModule === "library" && !folderInspectorHidden\)/);
  const openFolderStart = main.indexOf('const openFolder = (folder, event) => withViewTransition(() => {');
  const openFolder = main.slice(openFolderStart, openFolderStart + 600);
  assert.match(openFolder, /setFolderInspectorHidden\(false\);/);
  const blank = main.slice(main.indexOf('onClick={(event) => {\n          // 点素材区空白处'), main.indexOf('onContextMenu={(event) => {\n          if (!desktop || !canEdit'));
  assert.match(blank, /if \(marqueeMoved\.current\) \{ marqueeMoved\.current = false; return; \}/);
  assert.match(blank, /target\.closest\("article, button, input, textarea, select, a, label"\)/);
  assert.match(blank, /setFolderInspectorHidden\(true\);/);
});
