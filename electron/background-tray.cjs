'use strict';

function keepWindowInBackground(win, shouldQuit = () => false) {
  win.on('close', event => {
    if (shouldQuit()) return;
    event.preventDefault();
    win.hide();
  });
}

// The macOS menu bar (and most Linux trays) show a tray image at its own size instead of
// shrinking it like Windows does, so the 1254px app icon became a long strip across the
// whole menu bar. Shrink it to the menu bar size there, with a 2x copy for Retina.
const TRAY_ICON_SIZE = { darwin: 18, linux: 22 };
function trayIcon(icon, platform = process.platform) {
  const size = TRAY_ICON_SIZE[platform];
  if (!size || !icon || typeof icon.resize !== 'function' || (typeof icon.isEmpty === 'function' && icon.isEmpty())) return icon;
  const small = icon.resize({ width: size, height: size, quality: 'best' });
  if (platform === 'darwin' && typeof small.addRepresentation === 'function') {
    const retina = icon.resize({ width: size * 2, height: size * 2, quality: 'best' });
    small.addRepresentation({ scaleFactor: 2, width: size * 2, height: size * 2, buffer: retina.toPNG() });
  }
  return small;
}

function createBackgroundTray({ Tray, Menu, nativeImage, iconPath, onOpen, onQuit, platform = process.platform }) {
  const icon = trayIcon(nativeImage.createFromPath(iconPath), platform);
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

module.exports = { keepWindowInBackground, createBackgroundTray, trayIcon, TRAY_ICON_SIZE };
