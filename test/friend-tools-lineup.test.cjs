const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { registerFriendToolsHandlers } = require('../electron/handlers/friend-tools.cjs');

// 用户 2026-11-04 要求从友商工具集移除红果桌面版和 Mineradio，只留 macOS 指针管家和深度视频转换器。
const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('友商工具集不再注册红果桌面版和 Mineradio 的启动通道', () => {
  const handlers = new Map();
  registerFriendToolsHandlers({
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, BrowserWindow: { fromWebContents: () => ({}) },
    petMainWindows: new Set(), app: { isPackaged: false, getAppPath: () => root }, path, fs, spawn: () => {},
    shell: {}, runtimeState: {}, electronDirectory: 'unused',
  });
  assert.ok(handlers.has('friend-tools:open-cursor-picker'));
  assert.ok(handlers.has('friend-tools:open-depth-video-converter'));
  assert.equal(handlers.has('friend-tools:open-hongguo'), false);
  assert.equal(handlers.has('friend-tools:open-mineradio'), false);
  assert.doesNotMatch(read('electron', 'preload.cjs'), /openHongguo|openMineradio/);
});

test('安装包不再带红果安装程序和 Mineradio', () => {
  const resources = JSON.parse(read('package.json')).build.win.extraResources.map((item) => item.from);
  assert.equal(resources.some((from) => /hongguo|mineradio/i.test(from)), false);
  assert.ok(resources.includes('build/friend-tools/DepthVideoConverterV2.exe'));
});

test('工具集窗口只剩指针管家和深度视频转换器，都标"仅 Windows 可用"，空位补满 16 格', () => {
  const dialog = read('src', 'components', 'friend-tools-dialog.jsx');
  const main = read('src', 'main.jsx');
  assert.doesNotMatch(dialog, /"红果桌面版"|"Mineradio"|launchHongguo|launchMineradio/);
  assert.doesNotMatch(main, /launchHongguo|launchMineradio|openHongguo|openMineradio/);
  for (const launcher of ['launchCursorPicker', 'launchDepthVideoConverter']) {
    assert.match(dialog, new RegExp(`disabled=\\{busy \\|\\| windowsOnly\\} title=\\{onlyOnWindows \\|\\| undefined\\} onClick=\\{${launcher}\\}`));
  }
  assert.equal((dialog.match(/friend-tool-slot friend-tool-card/g) || []).length, 2);
  assert.match(dialog, /Array\.from\(\{length: 14\}/);
  assert.match(dialog, /这些小工具目前仅 Windows 可用/);
  assert.match(main, /disabled=\{!\["win32", "darwin"\]\.includes\(window\.nestDesktop\.platform\)\}/);
});

test('当前版本说明和演示视频不再提到被移除的工具', () => {
  const notes = read('src', 'lib', 'app-config.js');
  const section = notes.slice(notes.indexOf('title: "友商工具集"'), notes.indexOf('title: "友商工具集"') + 300);
  assert.match(section, /红果桌面版和 Mineradio 已移除/);
  assert.doesNotMatch(read('scripts', 'usage-demo', 'demo.js'), /Mineradio|红果/);
});
