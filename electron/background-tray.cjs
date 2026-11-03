'use strict';

function keepWindowInBackground(win, shouldQuit = () => false) {
  win.on('close', event => {
    if (shouldQuit()) return;
    event.preventDefault();
    win.hide();
  });
}

function createBackgroundTray({ Tray, Menu, nativeImage, iconPath, onOpen, onQuit }) {
  const icon = nativeImage.createFromPath(iconPath);
  const tray = new Tray(icon);
  tray.setToolTip('小旺仔素材库正在后台运行');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开小旺仔素材库', click: onOpen },
    { type: 'separator' },
    { label: '退出程序', click: onQuit },
  ]));
  tray.on('click', onOpen);
  tray.on('double-click', onOpen);
  return tray;
}

module.exports = { keepWindowInBackground, createBackgroundTray };
