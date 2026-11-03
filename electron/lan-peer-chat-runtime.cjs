const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { LanPeerChat, cleanFilename, validAvatar } = require('./lan-peer-chat.cjs');

function registerPeerChat({ app, BrowserWindow, ipcMain, dialog, nativeImage, screen, signals, getMainWindows, isSignalPanelSender, getAsset, archiveFile, resolveArchivedFile }) {
  const service = new LanPeerChat({ directory: path.join(app.getPath('userData'), 'lan-peer-chat'), signals });
  service.resolveArchivedFile = resolveArchivedFile;
  const archiving = new Set();
  let window = null, activePeer = null, toastWindow = null, toastReady = false, pendingToast = null, toastTimer = null;
  const subscribers = new Set();
  const trusted = event => (window && !window.isDestroyed() && window.webContents === event.sender) || isSignalPanelSender(event) || getMainWindows().some(win => !win.isDestroyed() && win.webContents === event.sender);
  const send = (channel, value) => {
    if (window && !window.isDestroyed()) window.webContents.send(channel, value);
    for (const win of getMainWindows()) if (!win.isDestroyed()) win.webContents.send(channel, value);
  };
  service.on('state', value => { send('peer-chat:state', value); for (const callback of subscribers) callback(value); });
  service.on('progress', value => { if (window && !window.isDestroyed()) window.webContents.send('peer-chat:progress', value); });
  function positionToast() {
    if (!toastWindow || toastWindow.isDestroyed()) return;
    const point = screen?.getCursorScreenPoint?.() || { x: 0, y: 0 };
    const display = screen?.getDisplayNearestPoint?.(point) || screen?.getPrimaryDisplay?.();
    const area = display?.workArea;
    if (!area) return;
    const bounds = toastWindow.getBounds();
    toastWindow.setPosition(area.x + area.width - bounds.width - 16, area.y + area.height - bounds.height - 16);
  }
  function presentToast() {
    if (!toastWindow || toastWindow.isDestroyed() || !toastReady || !pendingToast) return;
    positionToast();
    toastWindow.webContents.send('peer-chat:toast-show', pendingToast);
    toastWindow.showInactive(); toastWindow.moveTop();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (toastWindow && !toastWindow.isDestroyed()) toastWindow.hide(); pendingToast = null; }, 6500);
  }
  function showToast(message) {
    const peerId = message.from;
    if (window && !window.isDestroyed() && window.isFocused() && activePeer === peerId) return;
    const peer = signals.peers.get(peerId);
    const profile = service.profileFor(peerId);
    const name = peer?.name || profile.name || '局域网好友';
    const preview = message.file ? `发送了文件：${message.file.name}` : String(message.text || '').replace(/\s+/g, ' ').trim();
    pendingToast = { peerId, name, avatar: profile.avatar || '', preview: preview.slice(0, 120) || '发来一条消息' };
    if (!toastWindow || toastWindow.isDestroyed()) {
      toastReady = false;
      toastWindow = new BrowserWindow({
        width: 360, height: 96, show: false, frame: false, transparent: true,
        resizable: false, movable: false, minimizable: false, maximizable: false,
        skipTaskbar: true, alwaysOnTop: true, focusable: false, hasShadow: false,
        backgroundColor: '#00000000', webPreferences: {
          preload: path.join(__dirname, 'lan-peer-toast-preload.cjs'),
          contextIsolation: true, nodeIntegration: false, sandbox: true
        }
      });
      toastWindow.setAlwaysOnTop(true, 'floating');
      toastWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      toastWindow.webContents.on('will-navigate', event => event.preventDefault());
      toastWindow.once('ready-to-show', () => { toastReady = true; presentToast(); });
      toastWindow.once('closed', () => { toastWindow = null; toastReady = false; clearTimeout(toastTimer); });
      toastWindow.loadFile(path.join(__dirname, 'lan-peer-toast.html'));
      return;
    }
    presentToast();
  }
  function dismissToast() {
    clearTimeout(toastTimer); pendingToast = null;
    if (toastWindow && !toastWindow.isDestroyed()) toastWindow.hide();
  }
  ipcMain.on('peer-chat:toast-open', (event, peerId) => {
    if (!toastWindow || toastWindow.isDestroyed() || event.sender !== toastWindow.webContents) return;
    dismissToast();
    try { open(peerId); } catch (error) { console.warn('[peer-chat-toast]', error.message); }
  });
  ipcMain.on('peer-chat:toast-dismiss', event => {
    if (toastWindow && !toastWindow.isDestroyed() && event.sender === toastWindow.webContents) dismissToast();
  });
  async function archiveMessage(id) {
    const message = service.data.messages.find(item => item.id === id);
    if (!message?.file || message.from === signals.peer) throw new Error('只能导入好友发来的附件');
    if (message.archive) return { ok: true, archive: message.archive };
    if (!archiveFile) return { deferred: true };
    if (archiving.has(id)) return { deferred: true };
    archiving.add(id); service.updateMessage(id, { archiveStatus: 'importing', archiveError: '' });
    try {
      const result = await archiveFile(message, service.profileFor(message.from).name || '素材库用户');
      if (result?.error) throw new Error(result.error);
      if (result?.deferred) { service.updateMessage(id, { archiveStatus: 'cached', archiveError: result.reason || '未打开素材库，文件保存在聊天缓存，可稍后手动导入' }); return result; }
      const cached = message.localPath;
      service.updateMessage(id, { archive: result, archiveStatus: 'archived', archiveError: '', localPath: null });
      if (cached && path.dirname(cached) === path.join(service.directory, 'files')) await fs.promises.rm(cached, { force: true }).catch(() => {});
      return { ok: true, archive: result };
    } catch (error) { service.updateMessage(id, { archiveStatus: 'cached', archiveError: `自动归档未完成：${error.message}；文件已保留，可手动导入` }); return { error: error.message }; }
    finally { archiving.delete(id); }
  }
  service.on('message', message => {
    if (message.from === signals.peer) return;
    if (message.file) archiveMessage(message.id).catch(error => console.warn('[received-file]', error.message));
    showToast(message);
  });

  function open(peerId) {
    peerId ||= activePeer || signals.peers.keys().next().value || Object.keys(service.data.contacts)[0] || null;
    peerId = service.resolvePeerId(peerId);
    if (peerId && !signals.peers.has(peerId) && !service.data.contacts[peerId]) throw new Error('好友已离线');
    if (peerId === signals.peer) throw new Error('请选择其他电脑');
    activePeer = peerId;
    if (window && !window.isDestroyed()) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); window.webContents.send('peer-chat:open', peerId); return { ok: true }; }
    window = new BrowserWindow({ width: 790, height: 670, minWidth: 560, minHeight: 470, title: '局域网私聊', backgroundColor: '#10181d', autoHideMenuBar: true, show: false, icon: path.join(app.getAppPath(), 'build', 'icon.png'), webPreferences: { preload: path.join(__dirname, 'lan-peer-chat-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    window.once('ready-to-show', () => { if (window && !window.isDestroyed()) window.show(); });
    window.once('closed', () => { window = null; });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.loadFile(path.join(__dirname, 'lan-peer-chat.html'));
    return { ok: true };
  }

  async function sendFiles(peerId, files) {
    peerId = service.resolvePeerId(peerId);
    if (!service.data.contacts[peerId] && !signals.peers.has(peerId)) throw new Error('请选择已记录的好友');
    open(peerId);
    let sent = 0, queued = 0;
    for (const file of files) {
      try {
        const id = crypto.randomUUID();
        const peer = signals.peers.get(peerId);
        if (!peer?.chat) { await service.queueFile(peerId, file.path, file.name, id); queued++; continue; }
        try { await service.sendFile(peerId, file.path, file.name, { id }); sent++; }
        catch (error) {
          if (/已取消/.test(error.message)) throw error;
          await service.queueFile(peerId, file.path, file.name, id); queued++;
        }
      }
      catch (error) { throw new Error(`已发送 ${sent} 个文件；${error.message}`); }
    }
    return { ok: true, sent, queued };
  }
  async function avatar(reset) {
    if (reset) { service.setAvatar(''); return { ok: true }; }
    const result = await dialog.showOpenDialog({ title: '选择我的头像', properties: ['openFile'], filters: [{ name: '头像图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }] });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const filename = result.filePaths[0], stat = await fs.promises.stat(filename);
    if (stat.size > 10 * 1024 * 1024) throw new Error('请选择不超过 10 MB 的头像图片');
    const image = nativeImage.createFromPath(filename);
    if (image.isEmpty()) throw new Error('无法读取这张图片');
    const { width, height } = image.getSize(), side = Math.min(width, height);
    const cropped = image.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side }).resize({ width: 96, height: 96, quality: 'best' });
    service.setAvatar(`data:image/png;base64,${cropped.toPNG().toString('base64')}`);
    return { ok: true };
  }
  async function savePeerAvatar(peerId) {
    peerId = service.resolvePeerId(peerId);
    if (!service.data.contacts[peerId] && !signals.peers.has(peerId)) throw new Error('好友记录不存在');
    let profile = service.profileFor(peerId);
    if (!validAvatar(profile.avatar) && signals.peers.has(peerId)) {
      await service.fetchProfile(peerId);
      profile = service.profileFor(peerId);
    }
    if (!validAvatar(profile.avatar)) throw new Error('这位好友没有可保存的头像');
    const image = nativeImage.createFromDataURL(profile.avatar);
    if (image.isEmpty()) throw new Error('头像图片无法读取');
    const result = await dialog.showSaveDialog({ title: '保存好友头像', defaultPath: cleanFilename(`${profile.name || '好友'}-头像.png`), filters: [{ name: 'PNG 图片', extensions: ['png'] }] });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fs.promises.writeFile(result.filePath, image.toPNG());
    return { ok: true, filePath: result.filePath };
  }
  const handlers = {
    state: () => ({ ...service.snapshot(), activePeer: activePeer ? service.resolvePeerId(activePeer) : null }),
    open: ({ peerId }) => open(peerId),
    read: ({ peerId }) => service.read(peerId),
    send: ({ peerId, text, id }) => service.sendText(peerId, text, id),
    files: async ({ peerId }) => { peerId = service.resolvePeerId(peerId); if (!service.data.contacts[peerId] && !signals.peers.has(peerId)) throw new Error('请选择已记录的好友'); const result = await dialog.showOpenDialog({ title: '发送文件给好友（单个最多 10 GB）', properties: ['openFile', 'multiSelections'] }); return result.canceled ? { canceled: true } : sendFiles(peerId, result.filePaths.map(file => ({ path: file }))); },
    drop: ({ peerId, files, droppedCount }) => {
      if (!Number.isInteger(droppedCount) || droppedCount < 1) throw new Error('没有识别到拖入的文件，请拖入文件而不是文件夹');
      if (droppedCount > 50) throw new Error('一次最多拖入 50 个文件');
      if (!Array.isArray(files) || files.length !== droppedCount || files.some(file => typeof file !== 'string' || !file.trim())) throw new Error('无法读取拖入文件的本地路径，请使用“发送文件”按钮选择');
      return sendFiles(peerId, files.map(file => ({ path: file })));
    },
    assets: ({ peerId, ids }) => { if (!Array.isArray(ids) || !ids.length || ids.length > 50) throw new Error('请选择 1–50 个素材'); const files = ids.map(id => { const asset = getAsset(id); if (!asset?.path) throw new Error('素材不存在'); return asset; }); return sendFiles(peerId, files); },
    avatar: ({ reset }) => avatar(reset),
    'avatar-save': ({ peerId }) => savePeerAvatar(peerId),
    cancel: ({ id }) => service.cancel(id),
    archive: ({ id }) => archiveMessage(id),
    save: async ({ id }) => {
      const file = service.file(id);
      const result = await dialog.showSaveDialog({ title: '保存好友附件', defaultPath: cleanFilename(file.name) });
      if (result.canceled || !result.filePath) return { canceled: true };
      if (path.resolve(result.filePath) === path.resolve(file.path)) return { ok: true, filePath: result.filePath };
      const temporary = path.join(path.dirname(result.filePath), `.${path.basename(result.filePath)}.${crypto.randomUUID()}.nest-part`);
      try { await pipeline(fs.createReadStream(file.path), fs.createWriteStream(temporary, { flags: 'wx' })); await fs.promises.rename(temporary, result.filePath); }
      finally { await fs.promises.rm(temporary, { force: true }); }
      return { ok: true, filePath: result.filePath };
    },
    preview: async ({ id }) => { const file = service.file(id); if (!/\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name) || file.size > 25 * 1024 * 1024) throw new Error('图片预览支持 PNG/JPG/GIF/WebP/BMP，最大 25 MB'); const image = nativeImage.createFromPath(file.path); if (image.isEmpty()) throw new Error('图片预览不可用'); return { dataUrl: image.resize({ width: Math.min(image.getSize().width, 1200) }).toDataURL() }; }
  };
  for (const [key, handler] of Object.entries(handlers)) ipcMain.handle('peer-chat:' + key, async (event, input) => {
    if (!trusted(event)) return { error: '窗口不可用' };
    try { return await handler(input || {}); } catch (error) { return { error: /fetch failed/i.test(error.message) ? '无法连接好友，请检查双方的局域网连接和 Windows 防火墙授权' : error.message }; }
  });
  return {
    service, archiving, profile: () => service.profile(), profileFor: id => service.profileFor(id), onChanged: callback => { subscribers.add(callback); return () => subscribers.delete(callback); },
    start: () => service.start().catch(error => { service.error = error.code === 'EADDRINUSE' ? '私聊端口 43128 被其他程序占用' : error.message; service.notify(); }),
    stop: () => { clearTimeout(toastTimer); if (toastWindow && !toastWindow.isDestroyed()) toastWindow.close(); if (window && !window.isDestroyed()) window.close(); return service.stop(); }
  };
}

module.exports = { registerPeerChat };
