const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'soft-ui.css'), 'utf8');
const block = css.slice(css.indexOf('/* 窗口拖动区'));

// 用户反馈：只能在顶栏中间那一小段空白拖动窗口。
test('window can be dragged from the header, title card, brand row, rail and top edge on Windows and macOS', () => {
  assert.ok(block.length > 0, '窗口拖动区规则存在');
  for (const platform of ['win32', 'darwin']) {
    const p = `html\\[data-platform="${platform}"\\] \\.app\\.soft-ui\\.ready-ui\\.ui-refresh`;
    assert.match(block, new RegExp(`${p}::before`));
    for (const area of ['main header', '\\.toolbar', 'aside \\.brand', '\\.soft-rail']) {
      assert.match(block, new RegExp(`${p}:not\\(\\.soft-layout-editing\\) ${area}[,\\s]`), `${platform} ${area} 可拖`);
    }
  }
  assert.match(block, /::before \{[^}]*position: fixed;[^}]*height: 12px;[^}]*pointer-events: none;[^}]*-webkit-app-region: drag;/);
});

test('controls inside drag areas stay clickable and the asset area keeps marquee selection', () => {
  const noDragRule = block.slice(block.lastIndexOf('}', block.indexOf('-webkit-app-region: no-drag')) + 1, block.indexOf('-webkit-app-region: no-drag'));
  for (const area of ['main header', '.toolbar', 'aside .brand', '.soft-rail']) {
    for (const control of ['button', 'input', 'textarea', 'select', 'a', '[role="menu"]', '[title]', '.search', '.toolbar-popover']) {
      for (const platform of ['win32', 'darwin']) {
        assert.ok(noDragRule.includes(`html[data-platform="${platform}"] .app.soft-ui.ready-ui.ui-refresh ${area} ${control}`), `${platform} ${area} ${control} 不拖动`);
      }
    }
  }
  assert.doesNotMatch(block, /\.masonry[^{]*\{[^}]*app-region: drag/, '素材区留给框选');
  assert.doesNotMatch(block, /(^|[\s,(])main\s*\{[^}]*app-region: drag/, 'main 整块不能设成拖动');
});
