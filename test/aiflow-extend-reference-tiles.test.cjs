const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// 用户 2026-11-04：延长参考素材也要做成和 AI Flow 素材网格一样的缩略图格子。
// 真 AI Flow 的参考条：title 是完整文件名，图片参考带一张小图，视频参考只有图标（要从素材网格里找同名视频取第一帧）。
const page = fs.readFileSync(path.join(__dirname, '..', 'browser-extension', 'aiflow-page.js'), 'utf8');
const between = (start, end) => page.slice(page.indexOf(start), page.indexOf(end, page.indexOf(start)));

test('解析 AI Flow 参考条时带上完整文件名和缩略图，匹配用的 filename 不变', () => {
  const parse = between('function parseNativeVideoExtendReference', 'function videoExtendPromptReferenceTokens');
  assert.match(parse, /const title = String\(node\.getAttribute\('title'\) \|\| ''\)\.trim\(\);/);
  assert.match(parse, /const image = node\.querySelector\('img'\);/);
  assert.match(parse, /return \{ token, filename, title, thumb \};/);
});

test('参考素材预览：参考条自带的图 → 素材网格里同名的那一格（视频取第一帧）→ 按类型显示文字', () => {
  const preview = between('function videoExtendReferencePreview', 'function videoExtendPreviewSources');
  assert.match(preview, /if \(item\.thumb\) return \{ kind: 'image', src: item\.thumb \};/);
  assert.match(preview, /dialog\.querySelectorAll\('\[data-refpick\]'\)/);
  assert.match(preview, /String\(tile\.textContent \|\| ''\)\.trim\(\) !== name && !decoded\.includes\(name\)/);
  assert.match(preview, /kind: media\.tagName === 'VIDEO' \? 'video' : 'image'/);
});

test('参考素材显示成缩略图格子：@编号压在缩略图上、下面文件名、右上角删除，点格子插入编号', () => {
  const workbench = between('function injectVideoExtendWorkbench()', 'function extractVideoExtendStoryboardNames');
  assert.match(workbench, /insert\.type = 'button'; insert\.className = 'nx-ref-pick'; insert\.dataset\.nestWorkbenchReferenceInsert = token;/);
  assert.match(workbench, /video\.src = preview\.src\.includes\('#'\) \? preview\.src : `\$\{preview\.src\}#t=0\.1`;/);
  assert.match(workbench, /badge\.className = 'nx-ref-token'; badge\.textContent = token;/);
  assert.match(workbench, /remove\.className = 'nx-btn nx-ref-del'/);
  assert.match(workbench, /referenceNumber\(left\) - referenceNumber\(right\)/);
  assert.match(workbench, /const nextChipsKey = referenceItems\.map\(\(item, index\) => `\$\{item\.token\}:\$\{item\.title \|\| item\.filename\}:\$\{previews\[index\]\.src\}`\)/);
  const style = between('function ensureVideoExtendWorkbenchStyle()', 'function isNativeVideoExtendModeOpen()');
  assert.match(style, /\$\{W\} \.nx-ref-media \{[^}]*width: 76px !important; height: 76px !important;/);
  assert.match(style, /\$\{W\} \.nx-ref:hover \[data-nest-workbench-reference-remove\]/);
});
