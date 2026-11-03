'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { keepWindowInBackground, createBackgroundTray } = require('../electron/background-tray.cjs');

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
