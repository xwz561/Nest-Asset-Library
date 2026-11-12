const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// 用户截图：窗口矮时「已经是最新版」弹窗下半截被裁掉，看不到底部按钮。
test('update dialog fits the window height and scrolls only the release notes', () => {
  const css = read('src/soft-ui-panels.css');
  assert.match(css, /\.app\.soft-ui\.ready-ui\.ui-refresh \.modal-backdrop > \.app-dialog\.update-dialog \{[^}]*display: flex !important;[^}]*flex-direction: column;[^}]*max-height: calc\(100dvh - 36px\) !important;[^}]*overflow: hidden !important;/);
  assert.match(css, /\.app-dialog\.update-dialog > \* \{ flex-shrink: 0; \}/);
  assert.match(css, /\.app-dialog\.update-dialog > \.release-notes \{[^}]*flex: 1 1 auto;[^}]*min-height: 120px;[^}]*overflow: auto;/);
  const dialogs = read('src/components/dialogs.jsx');
  const panel = dialogs.slice(dialogs.indexOf('export function UpdatePanel'), dialogs.indexOf('export function ReleaseNotes'));
  assert.match(panel, /className="app-dialog update-dialog"/);
  assert.match(panel, /<ReleaseNotes \/>/, '更新说明是弹窗的直接子元素，才能单独滚动');
});
