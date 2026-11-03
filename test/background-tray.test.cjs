'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { keepWindowInBackground, createBackgroundTray, trayIcon } = require('../electron/background-tray.cjs');

test('closing the main window hides it while the app remains active', () => {
  const win = new EventEmitter();
  let hidden = 0;
  win.hide = () => { hidden += 1; };
  keepWindowInBackground(win, () => false);
  let prevented = false;
  win.emit('close', { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(hidden, 1);
});

test('explicit app quit allows the main window to close', () => {
  const win = new EventEmitter();
  let hidden = 0;
  win.hide = () => { hidden += 1; };
  keepWindowInBackground(win, () => true);
  let prevented = false;
  win.emit('close', { preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  assert.equal(hidden, 0);
});

test('tray exposes open and explicit quit actions', () => {
  const handlers = {};
  let template;
  const tray = new EventEmitter();
  tray.setToolTip = value => { tray.tooltip = value; };
  tray.setContextMenu = value => { tray.menu = value; };
  const opened = [];
  const quit = [];
  const result = createBackgroundTray({
    Tray: class { constructor(image) { handlers.image = image; return tray; } },
    Menu: { buildFromTemplate(value) { template = value; return { items: value }; } },
    nativeImage: { createFromPath(value) { handlers.iconPath = value; return 'icon'; } },
    iconPath: 'app-icon.png',
    onOpen: () => opened.push(true),
    onQuit: () => quit.push(true),
  });
  assert.equal(result, tray);
  assert.equal(handlers.iconPath, 'app-icon.png');
  assert.equal(tray.tooltip, '小旺仔素材库正在后台运行');
  tray.emit('click');
  tray.emit('double-click');
  template[0].click();
  template[2].click();
  assert.equal(opened.length, 3);
  assert.equal(quit.length, 1);
});


// 假的 nativeImage：记录缩放尺寸和 Retina 版本
function fakeImage(width, height) {
  return {
    width, height, reps: [],
    isEmpty() { return width === 0; },
    resize({ width: w, height: h }) { return fakeImage(w, h); },
    toPNG() { return Buffer.from(`png${this.width}`); },
    addRepresentation(rep) { this.reps.push(rep); },
  };
}

test('macOS 菜单栏图标缩成 18px（另带 36px Retina 版本），不再把 1254px 的应用图标铺满菜单栏', () => {
  const icon = trayIcon(fakeImage(1254, 1254), 'darwin');
  assert.deepEqual([icon.width, icon.height], [18, 18]);
  assert.equal(icon.reps.length, 1);
  assert.deepEqual([icon.reps[0].scaleFactor, icon.reps[0].width, icon.reps[0].height], [2, 36, 36]);
  assert.equal(String(icon.reps[0].buffer), 'png36');
});

test('Linux 托盘缩成 22px；Windows 保持原样（系统会自动缩放）', () => {
  const linux = trayIcon(fakeImage(1254, 1254), 'linux');
  assert.deepEqual([linux.width, linux.reps.length], [22, 0]);
  const original = fakeImage(1254, 1254);
  assert.equal(trayIcon(original, 'win32'), original);
});

test('图标读取失败（空图）或不是 nativeImage 时原样返回，不报错', () => {
  const empty = fakeImage(0, 0);
  assert.equal(trayIcon(empty, 'darwin'), empty);
  assert.equal(trayIcon('icon', 'darwin'), 'icon');
});

test('createBackgroundTray 在 macOS 上用缩小后的图标创建菜单栏图标', () => {
  let used;
  const tray = new EventEmitter();
  tray.setToolTip = () => {}; tray.setContextMenu = () => {};
  createBackgroundTray({
    Tray: class { constructor(image) { used = image; return tray; } },
    Menu: { buildFromTemplate(value) { return { items: value }; } },
    nativeImage: { createFromPath() { return fakeImage(1254, 1254); } },
    iconPath: 'build/icon.png', onOpen() {}, onQuit() {}, platform: 'darwin',
  });
  assert.deepEqual([used.width, used.height], [18, 18]);
});
