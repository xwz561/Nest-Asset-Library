const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { LanSignals } = require('./lan-signals.cjs');
const { machineAccountDeviceId } = require('./lan-device-id.cjs');

const PINGS = [
  { id: 'danger', label: '危险', emoji: '⚠️', color: '#ff5364' },
  { id: 'push', label: '推进', emoji: '⬆️', color: '#46d987' },
  { id: 'omw', label: '我来了', emoji: '🏃', color: '#55a3ff' },
  { id: 'allin', label: '集合', emoji: '⚔️', color: '#ffbf47' },
  { id: 'assist', label: '需要支援', emoji: '🆘', color: '#72dd56' },
  { id: 'needvision', label: '注意视野', emoji: '👁️', color: '#58d9c2' },
  { id: 'missing', label: '敌人消失', emoji: '❓', color: '#f2d34e' },
  { id: 'enemyvision', label: '发现敌方', emoji: '🔴', color: '#ff5364' }
];
const DEFAULT_EMOTES = ['😀', '😂', '👍', '😮', '😭', '🔥', '👀', '🎉'].map(emoji => ({ type: 'emoji', emoji }));
const ADMIN_ACCOUNT_IDS = new Set(['fd1f9127-258f-8ded-8b63-4ef651bbcf4e']);

function singleEmoji(value) {
  const emoji = String(value || '').trim();
  if (!emoji || emoji.length > 32) return '';
  const segments = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(emoji)] : [...emoji];
  return segments.length === 1 && /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(emoji) ? emoji : '';
}

function normalizeWheelEmotes(input, fallback = true) {
  if (!Array.isArray(input)) return fallback ? DEFAULT_EMOTES.map(item => ({ ...item })) : [];
  const result = [], seen = new Set();
  for (const item of input) {
    let clean;
    if (item?.type === 'image' && /^[\da-f]{64}$/i.test(String(item.id || ''))) {
      const id = String(item.id).toLowerCase(); clean = { type: 'image', id, name: String(item.name || '本地图片').replace(/[\u0000-\u001f]/g, '').slice(0, 48) || '本地图片' };
    } else {
      const emoji = singleEmoji(item?.emoji);
      if (emoji) clean = { type: 'emoji', emoji };
    }
    if (!clean) continue;
    const key = clean.type === 'image' ? `image:${clean.id}` : `emoji:${clean.emoji}`;
    if (seen.has(key)) continue;
    seen.add(key); result.push(clean);
    if (result.length === 8) break;
  }
  return result.length || !fallback ? result : DEFAULT_EMOTES.map(item => ({ ...item }));
}

function wheelIndexForVector(x, y, count = 8) {
  const sectors = Math.max(1, Math.min(8, Math.trunc(Number(count) || 8)));
  if (sectors === 1) return 0;
  const angle = Math.atan2(y, x);
  const step = Math.PI * 2 / sectors;
  return (Math.round((angle + Math.PI / 2) / step) + sectors * 2) % sectors;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function registerLanSignals({ app, BrowserWindow, ipcMain, screen, dialog, nativeImage, clipboard, getMainWindows, signalsInstance, spawnProcess = spawn }) {
  const nameSettingsPath = () => path.join(app.getPath('userData'), 'lan-signal-settings.json');
  const readSavedSettings = () => {
    try {
      const value = JSON.parse(fs.readFileSync(nameSettingsPath(), 'utf8'));
      return value && typeof value === 'object' ? value : {};
    } catch { return {}; }
  };
  const savedSettings = readSavedSettings();
  let shortcutEnabled = savedSettings.shortcutEnabled !== false;
  let hideEmotesOnThisDevice = savedSettings.hideEmotesOnThisDevice === true;
  let wheelEmotes = normalizeWheelEmotes(savedSettings.wheelEmotes);
  let previousDeviceIds = Array.isArray(savedSettings.previousDeviceIds) ? savedSettings.previousDeviceIds.filter(id => /^[\da-f-]{36}$/i.test(String(id || ''))) : [];
  let preferredDeviceId = savedSettings.deviceId;
  try {
    preferredDeviceId = machineAccountDeviceId();
    if (savedSettings.deviceId && savedSettings.deviceId !== preferredDeviceId) previousDeviceIds.push(savedSettings.deviceId);
  } catch (error) { console.warn('[lan-signals] 无法读取稳定机器身份，沿用本机已保存的设备 ID:', error.message); }
  previousDeviceIds = [...new Set(previousDeviceIds.filter(id => id !== preferredDeviceId))].slice(-16);
  const signals = signalsInstance || new LanSignals({ displayName: savedSettings.name, peer: preferredDeviceId });
  const isAdminAccount = ADMIN_ACCOUNT_IDS.has(String(signals.peer || '').toLowerCase());
  if (!signalsInstance && (savedSettings.deviceId !== signals.peer || JSON.stringify(savedSettings.previousDeviceIds || []) !== JSON.stringify(previousDeviceIds))) saveSettings({ deviceId: signals.peer, previousDeviceIds });
  let peerChat = null;
  let hook = null;
  let panel = null;
  let wheelWindow = null;
  const signalWindows = new Map();
  let wheelReady = false;
  let wheelSelection = 0;
  const warmEmoteImages = new Set();
  const warmingEmoteImages = new Map();
  const emoteImageRetryAfter = new Map();

  function publishPanelState(open) {
    for (const win of getMainWindows()) {
      if (!win.isDestroyed()) win.webContents.send('lan-signals:panel-state', { open: Boolean(open) });
    }
  }
  let startPoint = null;
  let latestPoint = null;
  let pointWheel = 'ping';
  let shuttingDown = false;

  function currentState() {
    const state = signals.snapshot(), chat = peerChat?.service.snapshot();
    const peers = new Map((chat?.peers || []).map(peer => [peer.id, peer]));
    return { ...state, accountId: signals.peer, isAdmin: isAdminAccount, avatar: chat?.avatar || '', chatReady: chat?.ready || false, chatError: chat?.error || '', peers: state.peers.map(peer => ({ ...peer, avatar: peers.get(peer.id)?.avatar || '', unread: peers.get(peer.id)?.unread || 0 })), shortcutEnabled, hideEmotesOnThisDevice: hideEmotesOnThisDevice && !isAdminAccount, wheelEmotes };
  }
  function publishState() {
    const value = currentState();
    if (panel && !panel.isDestroyed()) panel.webContents.send('lan-signals:state', value);
    for (const win of getMainWindows()) if (!win.isDestroyed()) win.webContents.send('lan-signals:state', value);
  }
  function saveSettings(next) {
    fs.mkdirSync(path.dirname(nameSettingsPath()), { recursive: true });
    fs.writeFileSync(nameSettingsPath(), JSON.stringify({ ...readSavedSettings(), ...next }, null, 2), 'utf8');
  }

  const helperPath = () => app.isPackaged
    ? path.join(process.resourcesPath, 'lan-signal-hook.exe')
    : path.join(app.getAppPath(), 'native', 'lan-signal-hook', 'build', 'hook-helper.exe');

  function displayPointForPhysical(x, y) {
    const displays = screen.getAllDisplays().sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
    const target = displays.find(d => { const scale=d.scaleFactor||1,b=d.bounds; return x>=b.x*scale&&x<(b.x+b.width)*scale&&y>=b.y*scale&&y<(b.y+b.height)*scale; }) || screen.getPrimaryDisplay();
    const scale = target.scaleFactor || 1;
    const localDipX = x/scale - target.bounds.x;
    const localDipY = y/scale - target.bounds.y;
    return {
      x: Math.max(0, Math.min(1, localDipX / target.bounds.width)),
      y: Math.max(0, Math.min(1, localDipY / target.bounds.height)),
      display: Math.max(0, displays.findIndex(d => d.id === target.id)),
      screenX: target.bounds.x + localDipX,
      screenY: target.bounds.y + localDipY
    };
  }

  function primaryScreenPoint(x, y) {
    const point = displayPointForPhysical(x, y);
    return { x: point.x, y: point.y, display: point.display };
  }

  function selectionForPoint(x, y) {
    return wheelIndexForVector(x - startPoint.x, y - startPoint.y, pointWheel === 'emote' ? wheelEmotes.length : PINGS.length);
  }

  function wheelImageData(id) {
    const filename = wheelImagePath(id);
    if (!filename) return '';
    try { return `data:image/png;base64,${fs.readFileSync(filename).toString('base64')}`; } catch { return ''; }
  }

  function wheelImagePath(id) {
    return peerChat?.service?.emoteImagePath(id) || (/^[\da-f]{64}$/i.test(String(id || '')) ? path.join(app.getPath('userData'), 'lan-peer-chat', 'signal-emotes', `${String(id).toLowerCase()}.png`) : null);
  }

  function warmWheelImageForPeers(id) {
    const service = peerChat?.service;
    const filename = wheelImagePath(id);
    if (!service || !filename || !fs.existsSync(filename)) return Promise.resolve();
    const peers = [...signals.peers.values()].filter(peer => peer.chat?.signalEmotesVersion === 1);
    const pendingPeers = peers.filter(peer => {
      const key = `${peer.id}:${peer.chat.token || ''}:${id}`;
      return !warmEmoteImages.has(key) && !warmingEmoteImages.has(key) && (emoteImageRetryAfter.get(key) || 0) <= Date.now();
    });
    if (!pendingPeers.length) return Promise.all(peers.map(peer => warmingEmoteImages.get(`${peer.id}:${peer.chat.token || ''}:${id}`)).filter(Boolean));
    const bytes = fs.readFileSync(filename);
    return Promise.all(pendingPeers.map(peer => {
      const key = `${peer.id}:${peer.chat.token || ''}:${id}`;
      const pending = service.sendSignalEmoteImage(id, bytes, [peer.id])
        .then(() => { warmEmoteImages.add(key); emoteImageRetryAfter.delete(key); })
        .catch(error => { emoteImageRetryAfter.set(key, Date.now() + 10000); console.warn('[lan-signals] 自定义表情后台同步失败:', error.message); throw error; })
        .finally(() => warmingEmoteImages.delete(key));
      warmingEmoteImages.set(key, pending);
      return pending;
    }));
  }

  function warmAllWheelImages() {
    for (const item of wheelEmotes) if (item.type === 'image') warmWheelImageForPeers(item.id).catch(error => console.warn('[lan-signals] 自定义表情后台同步失败:', error.message));
  }

  function wheelEmoteDetails() {
    return wheelEmotes.map(item => ({ ...item, ...(item.type === 'image' ? { preview: wheelImageData(item.id) } : {}) }));
  }

  function validSettingsOwner(event) {
    const owner = BrowserWindow.fromWebContents(event.sender);
    return owner === panel || getMainWindows().includes(owner);
  }

  function commitWheelEmotes(event, input) {
    if (!validSettingsOwner(event)) return { error: '窗口不可用' };
    if (!Array.isArray(input)) return { error: '表情列表无效' };
    const next = normalizeWheelEmotes(input, false);
    if (!next.length || next.length !== input.length || next.length > 8) return { error: '轮盘需要 1–8 个有效且不重复的表情' };
    for (const item of next) if (item.type === 'image' && !fs.existsSync(wheelImagePath(item.id) || '')) return { error: '本地表情图片已丢失，请重新添加' };
    try {
      const previousImageIds = wheelEmotes.filter(item => item.type === 'image').map(item => item.id);
      saveSettings({ wheelEmotes: next }); wheelEmotes = next;
      const retained = new Set(next.filter(item => item.type === 'image').map(item => item.id));
      for (const id of previousImageIds) if (!retained.has(id)) { const filename = wheelImagePath(id); if (filename) { try { fs.rmSync(filename, { force: true }); } catch {} } }
      publishState();
      warmAllWheelImages();
      return { ok: true, emotes: wheelEmoteDetails() };
    } catch (error) { return { error: `保存轮盘表情失败：${error.message}` }; }
  }

  async function addWheelImage(event) {
    if (!validSettingsOwner(event)) return { error: '窗口不可用' };
    if (wheelEmotes.length >= 8) return { error: '轮盘最多放 8 个表情' };
    if (!dialog || !nativeImage) return { error: '本机图片选择器不可用' };
    const owner = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(owner, { title: '添加轮盘表情图片', properties: ['openFile'], filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }] });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const filename = result.filePaths[0], stat = await fs.promises.stat(filename);
    if (stat.size < 1 || stat.size > 10 * 1024 * 1024) return { error: '请选择不超过 10 MB 的图片' };
    const source = nativeImage.createFromPath(filename);
    if (source.isEmpty()) return { error: '无法读取这张图片' };
    const { width, height } = source.getSize();
    if (width < 1 || height < 1 || width > 12000 || height > 12000 || width * height > 40000000) return { error: '图片尺寸过大' };
    const scale = Math.min(128 / width, 128 / height, 1), resized = source.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), quality: 'best' });
    const bytes = resized.toPNG();
    if (!bytes.length || bytes.length > 512 * 1024) return { error: '处理后的表情图片仍超过 512 KB' };
    const id = crypto.createHash('sha256').update(bytes).digest('hex');
    if (wheelEmotes.some(item => item.type === 'image' && item.id === id)) return { error: '这张图片已经添加到轮盘' };
    try {
      if (peerChat?.service) await peerChat.service.storeSignalEmoteImage(id, bytes);
      else {
        const directory = path.join(app.getPath('userData'), 'lan-peer-chat', 'signal-emotes');
        await fs.promises.mkdir(directory, { recursive: true }); await fs.promises.writeFile(path.join(directory, `${id}.png`), bytes, { flag: 'wx' });
      }
      const name = path.basename(filename).replace(/[\u0000-\u001f]/g, '').slice(0, 48) || '本地图片';
      const next = [...wheelEmotes, { type: 'image', id, name }];
      const saved = commitWheelEmotes(event, next);
      return saved.ok ? saved : { error: saved.error };
    } catch (error) { return { error: `添加表情图片失败：${error.message}` }; }
  }

  function closeWheel() {
    wheelReady = false;
    const current = wheelWindow;
    wheelWindow = null;
    if (current && !current.isDestroyed()) current.close();
  }

  function updateWheelSelection(index) {
    const count = pointWheel === 'emote' ? wheelEmotes.length : PINGS.length;
    wheelSelection = Math.max(0, Math.min(count - 1, index));
    if (wheelReady && wheelWindow && !wheelWindow.isDestroyed()) {
      wheelWindow.webContents.executeJavaScript(`window.updateWheel(${wheelSelection})`).catch(() => {});
    }
  }

  function showWheel(kind, x, y) {
    closeWheel();
    const point = displayPointForPhysical(x, y);
    const choices = kind === 'emote' ? wheelEmotes.map(item => ({ ...item, emoji: item.emoji || '', label: item.type === 'image' ? item.name : '表情', image: item.type === 'image' ? wheelImageData(item.id) : '', color: '#6ca6ff' })) : PINGS;
    const nodes = choices.map((item, index) => {
      const angle = index * Math.PI * 2 / choices.length - Math.PI / 2;
      const left = Math.round(110 + Math.cos(angle) * 73 - 25);
      const top = Math.round(110 + Math.sin(angle) * 73 - 25);
      const icon = item.image ? `<img alt="" src="${item.image}">` : `<span>${escapeHtml(item.emoji)}</span>`;
      return `<div class="choice" data-index="${index}" style="left:${left}px;top:${top}px;--accent:${item.color}">${icon}<small>${escapeHtml(item.label)}</small></div>`;
    }).join('');
    const heading = kind === 'emote' ? '选择表情' : '选择信号';
    const html = `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{position:fixed;inset:0;margin:0;width:220px;height:220px;overflow:hidden!important;scrollbar-width:none!important;overscroll-behavior:none;background:transparent;color:#eef8ff;font:12px "Microsoft YaHei",system-ui}::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}.wheel{position:relative;width:220px;height:220px;border:1px solid #7d9ba077;border-radius:50%;background:radial-gradient(circle,#14232cf5 0,#0d1921ed 64%,#101b22c9 100%);box-shadow:0 12px 36px #0009,0 0 24px #42e2c033}.center{position:absolute;left:68px;top:68px;width:84px;height:84px;border:1px solid #38515a;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:#12232bec;color:#a9c2ca}.center strong{color:#e8fbff;font-size:12px}.center small{margin-top:5px;font-size:9px}.choice{position:absolute;width:50px;height:50px;border:1px solid #66808c77;border-radius:14px;background:#172832f2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;transition:transform .08s,border-color .08s,background .08s,box-shadow .08s}.choice span{font-size:19px;line-height:22px}.choice img{width:30px;height:30px;object-fit:contain}.choice small{max-width:48px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:8px;color:#b4c6cc}.choice.active{z-index:2;transform:scale(1.14);border-color:var(--accent);background:color-mix(in srgb,var(--accent) 25%,#14232c);box-shadow:0 0 18px color-mix(in srgb,var(--accent) 60%,transparent),inset 0 0 10px color-mix(in srgb,var(--accent) 24%,transparent)}.hint{position:absolute;left:0;right:0;bottom:7px;text-align:center;color:#9cb5be;font-size:9px;letter-spacing:.2px}</style><div class="wheel"><div class="center"><strong>${heading}</strong><small>松开按键发送</small></div>${nodes}<div class="hint">移动方向选择</div></div><script>window.updateWheel=i=>document.querySelectorAll('.choice').forEach((node,index)=>node.classList.toggle('active',index===i));window.updateWheel(0)</script>`;
    const win = new BrowserWindow({
      x: Math.round(point.screenX - 110), y: Math.round(point.screenY - 110), width: 220, height: 220,
      frame: false, transparent: true, backgroundColor: '#00000000', resizable: false,
      movable: false, focusable: false, skipTaskbar: true, hasShadow: false, show: false,
      useContentSize: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    wheelWindow = win;
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setIgnoreMouseEvents(true);
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    win.once('ready-to-show', () => {
      if (wheelWindow !== win || win.isDestroyed()) return;
      wheelReady = true;
      win.showInactive();
      updateWheelSelection(wheelSelection);
    });
    win.once('closed', () => { if (wheelWindow === win) wheelWindow = null; wheelReady = false; });
  }

  function displayPoint(signal) {
    const displays = screen.getAllDisplays().sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
    const display = displays[Math.min(displays.length - 1, Math.max(0, signal.display || 0))] || screen.getPrimaryDisplay();
    const area = display.bounds;
    const x = Math.round(area.x + signal.x * area.width);
    const y = Math.round(area.y + signal.y * area.height);
    return { x: Math.max(area.x, Math.min(area.x + area.width - 184, x - 92)), y: Math.max(area.y, Math.min(area.y + area.height - 150, y - 72)) };
  }

  function showSignal(signal, local = false) {
    const kind = signal.kind === 'emote' ? 'emote' : 'ping';
    const isAdminSender = local ? isAdminAccount : ADMIN_ACCOUNT_IDS.has(String(signal.senderId || '').toLowerCase());
    if (kind === 'emote' && hideEmotesOnThisDevice && !isAdminSender) return;
    const index = Math.max(0, Math.min(PINGS.length - 1, Number(signal.choice) || 0));
    const selectedEmote = wheelEmotes[Math.max(0, Math.min(wheelEmotes.length - 1, Number(signal.choice) || 0))] || DEFAULT_EMOTES[0];
    const image = kind === 'emote' && signal.imageHash ? wheelImageData(signal.imageHash) : '';
    const emoji = kind === 'emote' ? (singleEmoji(signal.emoji) || selectedEmote.emoji || '') : '';
    const item = kind === 'ping' ? PINGS[index] : { emoji, image, label: '表情', color: '#6ca6ff' };
    const point = displayPoint(signal);
    const title = local ? '我' : escapeHtml(signal.name || '局域网成员');
    const icon = item.image ? `<img src="${item.image}" alt="">` : escapeHtml(item.emoji || '');
    const html = '<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{position:fixed;inset:0;margin:0;width:184px;height:116px;overflow:hidden!important;scrollbar-width:none!important;overscroll-behavior:none;background:transparent;font:14px Microsoft YaHei,system-ui;color:#eef8ff}::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}.bubble{width:184px;padding:12px 14px;border:0;border-radius:0;background:transparent;box-shadow:none;text-align:center;animation:pop .18s ease-out}.icon{height:49px;font-size:44px;line-height:1.1;filter:drop-shadow(0 2px 6px #0009)}.icon img{width:48px;height:48px;object-fit:contain;filter:drop-shadow(0 2px 6px #0009)}.label{margin-top:5px;font-weight:700;text-shadow:0 2px 5px #000b}.name{margin-top:6px;color:#d7e1e8;font-size:11px;text-shadow:0 2px 5px #000b}@keyframes pop{from{opacity:0;transform:scale(.75)}to{opacity:1;transform:scale(1)}}</style><div class="bubble"><div class="icon">' + icon + '</div><div class="label">' + escapeHtml(item.label || '') + '</div><div class="name">' + title + '</div></div>';
    const win = new BrowserWindow({
      x: point.x, y: point.y, width: 184, height: 116, frame: false, transparent: true,
      backgroundColor: '#00000000', resizable: false, movable: false, focusable: false,
      skipTaskbar: true, hasShadow: false, show: false, useContentSize: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    signalWindows.set(win, kind);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setIgnoreMouseEvents(true);
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    win.once('ready-to-show', () => { if (!win.isDestroyed()) win.showInactive(); });
    const timer = setTimeout(() => { if (!win.isDestroyed()) win.close(); }, 2800);
    win.once('closed', () => { clearTimeout(timer); signalWindows.delete(win); });
  }

  async function sendGesture(kind, x, y) {
    const index = selectionForPoint(x, y);
    const at = primaryScreenPoint(x, y);
    const selected = kind === 'emote' ? wheelEmotes[index] : null;
    let emote = {};
    if (selected?.type === 'image') {
      try {
        emote = { imageHash: selected.id };
        // 本机立即显示；图片已在添加时和好友上线时预同步，首次同步则在后台完成后发给好友。
        showSignal({ kind, choice: index, ...emote, x: at.x, y: at.y, display: at.display }, true);
        await warmWheelImageForPeers(selected.id);
      } catch (error) { console.warn('[lan-signals] 自定义表情图片发送失败:', error.message); return; }
    } else if (selected?.emoji) emote = { emoji: selected.emoji, legacyCompatible: selected.emoji === DEFAULT_EMOTES[index]?.emoji };
    if (signals.sendSignal(kind, String(index), at.x, at.y, at.display, emote) && selected?.type !== 'image') showSignal({ kind, choice: index, ...emote, x: at.x, y: at.y, display: at.display }, true);
  }

  function startHook() {
    if (process.platform !== 'win32' || hook || shuttingDown) return;
    const exe = helperPath();
    if (!fs.existsSync(exe)) {
      console.warn('[lan-signals] Input hook missing:', exe);
      return;
    }
    const child = spawnProcess(exe, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    hook = child;
    let carry = '';
    child.stdout.on('data', chunk => {
      carry += chunk.toString('utf8');
      let newline;
      while ((newline = carry.indexOf('\n')) >= 0) {
        const line = carry.slice(0, newline).trim();
        carry = carry.slice(newline + 1);
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        if (!shortcutEnabled && ['wheelOpen', 'wheelMove', 'wheelRelease'].includes(event.type)) continue;
        if (event.type === 'ready') child.stdin.write(JSON.stringify({
          type: 'config', trigger: 'alt', triggerVk: 0, clickPing: false, gameCheck: false, holdToOpen: true,
          emoteTrigger: 'ctrl', emoteTriggerVk: 0, emoteClick: false, dragThresholdPx: 9,
          toggleMods: 0, toggleVk: 0, enabled: shortcutEnabled
        }) + '\n');
        if (event.type === 'wheelOpen' || event.type === 'wheelMove') {
          if (event.type === 'wheelOpen') {
            startPoint = { x: event.x, y: event.y };
            pointWheel = event.wheel === 'emote' ? 'emote' : 'ping';
            updateWheelSelection(0);
            showWheel(pointWheel, event.x, event.y);
          }
          latestPoint = { x: event.x, y: event.y };
          pointWheel = event.wheel === 'emote' ? 'emote' : 'ping';
          if (startPoint) updateWheelSelection(selectionForPoint(event.x, event.y));
        }
        if (event.type === 'wheelRelease') {
          const end = { x: event.x, y: event.y };
          closeWheel();
          if (startPoint && (Math.abs(end.x - startPoint.x) + Math.abs(end.y - startPoint.y) >= 12)) sendGesture(pointWheel, end.x, end.y).catch(error => console.warn('[lan-signals] Gesture send failed:', error.message));
          startPoint = latestPoint = null;
        }
        if (event.type === 'cancel') { closeWheel(); startPoint = latestPoint = null; }
        if (event.type === 'error') console.warn('[lan-signals] Hook:', event.message);
      }
    });
    child.stderr.on('data', chunk => console.warn('[lan-signals] Hook:', chunk.toString('utf8').trim()));
    child.on('error', error => { console.warn('[lan-signals] Hook failed:', error.message); if (hook === child) hook = null; });
    child.on('exit', () => { if (hook === child) hook = null; });
  }

  signals.on('signal', signal => showSignal(signal));
  signals.on('errorText', message => console.warn('[lan-signals]', message));
  signals.on('state', () => { publishState(); warmAllWheelImages(); });

  ipcMain.handle('lan-signals:open', event => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner || !getMainWindows().includes(owner)) return { error: '窗口不可用' };
    if (panel && !panel.isDestroyed()) { panel.show(); panel.focus(); publishPanelState(true); return { ok: true, existing: true }; }
    panel = new BrowserWindow({
      width: 430, height: 600, minWidth: 380, minHeight: 420, title: '局域网信号',
      parent: owner, modal: false, show: false, backgroundColor: '#111a20', autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'lan-signal-panel-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    panel.once('ready-to-show', () => panel && !panel.isDestroyed() && panel.show());
    panel.once('closed', () => { panel = null; publishPanelState(false); });
    publishPanelState(true);
    panel.loadFile(path.join(__dirname, 'lan-signal-panel.html'));
    return { ok: true };
  });
  ipcMain.handle('lan-signals:state', event => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (owner !== panel && !getMainWindows().includes(owner)) return null;
    return currentState();
  });
  ipcMain.handle('lan-signals:copy-account-id', event => {
    if (!validSettingsOwner(event)) return { error: '窗口不可用' };
    try { clipboard.writeText(signals.peer); return { ok: true }; }
    catch (error) { return { error: `复制账户 ID 失败：${error.message}` }; }
  });
  ipcMain.handle('lan-signals:get-wheel-emotes', event => validSettingsOwner(event) ? wheelEmoteDetails() : []);
  ipcMain.handle('lan-signals:set-wheel-emotes', (event, emotes) => commitWheelEmotes(event, emotes));
  ipcMain.handle('lan-signals:add-wheel-image', async event => { try { return await addWheelImage(event); } catch (error) { return { error: `添加表情图片失败：${error.message}` }; } });
  ipcMain.handle('lan-signals:set-name', (event, name) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (owner !== panel && !getMainWindows().includes(owner)) return { error: '窗口不可用' };
    const clean = String(name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 32);
    if (!clean) return { error: '昵称不能为空' };
    try {
      saveSettings({ name: clean, shortcutEnabled });
      signals.setName(clean);
      return { ok: true, name: clean };
    } catch (error) { return { error: `昵称保存失败：${error.message}` }; }
  });
  ipcMain.handle('lan-signals:set-shortcut-enabled', (event, enabled) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (owner !== panel && !getMainWindows().includes(owner)) return { error: '窗口不可用' };
    if (typeof enabled !== 'boolean') return { error: '开关状态无效' };
    try {
      saveSettings({ shortcutEnabled: enabled });
      shortcutEnabled = enabled;
      if (hook && !hook.killed) {
        hook.stdin.write(JSON.stringify({ type: 'config', enabled }) + '\n');
      }
      if (!enabled) {
        closeWheel();
        startPoint = latestPoint = null;
      }
      const value = currentState();
      if (panel && !panel.isDestroyed()) panel.webContents.send('lan-signals:state', value);
      for (const win of getMainWindows()) if (!win.isDestroyed()) win.webContents.send('lan-signals:state', value);
      return { ok: true, shortcutEnabled };
    } catch (error) { return { error: `快捷键设置保存失败：${error.message}` }; }
  });
  ipcMain.handle('lan-signals:set-hide-emotes', (event, enabled) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (owner !== panel && !getMainWindows().includes(owner)) return { error: '窗口不可用' };
    if (isAdminAccount) return { ok: true, hideEmotesOnThisDevice: false, ignored: true };
    if (typeof enabled !== 'boolean') return { error: '开关状态无效' };
    try {
      saveSettings({ hideEmotesOnThisDevice: enabled });
      hideEmotesOnThisDevice = enabled;
      if (enabled) {
        for (const [win, kind] of signalWindows) if (kind === 'emote' && !win.isDestroyed()) win.close();
      }
      const value = currentState();
      if (panel && !panel.isDestroyed()) panel.webContents.send('lan-signals:state', value);
      for (const win of getMainWindows()) if (!win.isDestroyed()) win.webContents.send('lan-signals:state', value);
      return { ok: true, hideEmotesOnThisDevice };
    } catch (error) { return { error: `本机表情显示设置保存失败：${error.message}` }; }
  });

  return {
    start() {
      signals.start();
      if (process.platform === 'win32') startHook();
    },
    stop() {
      shuttingDown = true;
      signals.stop();
      const child = hook;
      hook = null;
      if (child && !child.killed) {
        try { child.stdin.write('{"type":"shutdown"}\n'); child.stdin.end(); } catch {}
        setTimeout(() => { try { child.kill(); } catch {} }, 700).unref();
      }
      closeWheel();
      if (panel && !panel.isDestroyed()) panel.close();
    },
    setPeerChat(value) { peerChat = value; peerChat.service.migrateLocalIdentity(previousDeviceIds); peerChat.onChanged(publishState); publishState(); warmAllWheelImages(); },
    isPanelSender(event) { return !!panel && !panel.isDestroyed() && panel.webContents === event.sender; },
    signal: signals
  };
}

module.exports = { registerLanSignals, wheelIndexForVector };


