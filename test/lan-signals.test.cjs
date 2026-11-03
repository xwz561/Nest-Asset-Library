const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LanSignals } = require('../electron/lan-signals.cjs');
const { registerLanSignals, wheelIndexForVector } = require('../electron/lan-signal-runtime.cjs');

const ROOM = 'nest-asset-library-lan-v1';

test('radial gesture wheel maps drag directions to the eight visible choices', () => {
  assert.deepEqual([
    wheelIndexForVector(0, -100), wheelIndexForVector(100, -100),
    wheelIndexForVector(100, 0), wheelIndexForVector(100, 100),
    wheelIndexForVector(0, 100), wheelIndexForVector(-100, 100),
    wheelIndexForVector(-100, 0), wheelIndexForVector(-100, -100)
  ], [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('global hold-key events open the visible wheel, highlight a direction, and send on key release', { skip: process.platform !== 'win32' && 'Windows-only global shortcut hook' }, () => {
  const owner = { webContents: { send() {} }, isDestroyed: () => false };
  const settingsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-lan-hotkey-'));
  class FakeWindow extends EventEmitter {
    static instances = [];
    static fromWebContents(sender) { return sender === owner.webContents ? owner : null; }
    constructor(options) {
      super(); this.options = options; this.destroyed = false; this.scripts = []; this.url = '';
      this.webContents = { executeJavaScript: script => { this.scripts.push(script); return Promise.resolve(); }, send() {} };
      FakeWindow.instances.push(this);
    }
    setAlwaysOnTop() {}
    setIgnoreMouseEvents() {}
    loadURL(url) { this.url = url; }
    showInactive() { this.shown = true; }
    isDestroyed() { return this.destroyed; }
    close() { this.destroyed = true; this.emit('closed'); }
  }
  class FakeChild extends EventEmitter {
    constructor() { super(); this.stdout = new EventEmitter(); this.stderr = new EventEmitter(); this.stdin = { writes: [], write: value => this.stdin.writes.push(value), end() {} }; }
  }
  const child = new FakeChild();
  const sent = [];
  const ipcHandlers = new Map();
  const fakeSignals = Object.assign(new EventEmitter(), {
    start() {}, stop() {}, snapshot() { return { status: 'online', peers: [] }; },
    sendSignal(...args) { sent.push(args); return true; }
  });
  const display = { id: 1, scaleFactor: 1, bounds: { x: 0, y: 0, width: 2560, height: 1440 } };
  const runtime = registerLanSignals({
    app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => settingsRoot }, BrowserWindow: FakeWindow,
    ipcMain: { handle(key, handler) { ipcHandlers.set(key, handler); } }, screen: { getAllDisplays: () => [display], getPrimaryDisplay: () => display },
    getMainWindows: () => [owner], signalsInstance: fakeSignals, spawnProcess: () => child
  });
  runtime.start();
  child.stdout.emit('data', Buffer.from('{"type":"ready"}\n'));
  assert.match(child.stdin.writes[0], /"trigger":"alt"/);
  assert.match(child.stdin.writes[0], /"holdToOpen":true/);
  assert.match(child.stdin.writes[0], /"enabled":true/);
  child.stdout.emit('data', Buffer.from('{"type":"wheelOpen","x":500,"y":400,"wheel":"ping"}\n{"type":"wheelMove","x":600,"y":400,"wheel":"ping"}\n'));
  const wheel = FakeWindow.instances[0];
  const wheelHtml = decodeURIComponent(wheel.url.slice(wheel.url.indexOf(',') + 1));
  assert.match(wheelHtml, /选择信号/);
  assert.match(wheelHtml, /危险/);
  assert.match(wheelHtml, /松开按键发送/);
  assert.match(wheelHtml, /移动方向选择/);
  assert.equal(wheel.options.focusable, false);
  wheel.emit('ready-to-show');
  assert.equal(wheel.shown, true);
  child.stdout.emit('data', Buffer.from('{"type":"wheelMove","x":600,"y":400,"wheel":"ping"}\n'));
  assert.ok(wheel.scripts.some(script => script.includes('updateWheel(2)')));
  child.stdout.emit('data', Buffer.from('{"type":"wheelRelease","x":600,"y":400,"wheel":"ping"}\n'));
  assert.equal(wheel.destroyed, true);
  assert.equal(sent[0][0], 'ping');
  assert.equal(sent[0][1], '2');
  assert.equal(FakeWindow.instances.length, 2); // local confirmation toast after send
  const toastHtml = decodeURIComponent(FakeWindow.instances[1].url.slice(FakeWindow.instances[1].url.indexOf(',') + 1));
  assert.match(toastHtml, /box-sizing:border-box/);
  assert.match(toastHtml, /overflow:hidden!important/);
  assert.match(toastHtml, /background:transparent/);
  assert.match(toastHtml, /border:0;border-radius:0/);
  assert.match(toastHtml, /box-shadow:none/);
  const setShortcutEnabled = ipcHandlers.get('lan-signals:set-shortcut-enabled');
  assert.deepEqual(setShortcutEnabled({ sender: owner.webContents }, false), { ok: true, shortcutEnabled: false });
  assert.match(child.stdin.writes.at(-1), /"enabled":false/);
  const countBeforeDisabledEvent = FakeWindow.instances.length;
  child.stdout.emit('data', Buffer.from('{"type":"wheelOpen","x":700,"y":500,"wheel":"emote"}\n'));
  assert.equal(FakeWindow.instances.length, countBeforeDisabledEvent);
  assert.deepEqual(setShortcutEnabled({ sender: owner.webContents }, true), { ok: true, shortcutEnabled: true });
  assert.match(child.stdin.writes.at(-1), /"enabled":true/);
  runtime.stop();
  fs.rmSync(settingsRoot, { recursive: true, force: true });
});

test('custom LAN nickname changes are announced immediately and reject blanks', () => {
  const local = new LanSignals({ displayName: 'WindowsUser' });
  const sent = [];
  local.status = 'online';
  local.targets = ['255.255.255.255'];
  local.socket = { send: (data, port, host) => sent.push({ packet: JSON.parse(data), port, host }) };
  let state;
  local.on('state', value => { state = value; });
  assert.equal(local.setName('剪辑电脑'), true);
  assert.equal(state.name, '剪辑电脑');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].packet.type, 'presence');
  assert.equal(sent[0].packet.name, '剪辑电脑');
  assert.equal(local.setName('   '), false);
  assert.equal(local.name, '剪辑电脑');
});

test('LAN panel nickname setting persists locally and rejects non-window senders', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-lan-name-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  class FakeWindow extends EventEmitter {
    static instances = [];
    static fromWebContents(sender) { return FakeWindow.instances.find(win => win.webContents === sender) || null; }
    constructor() { super(); this.destroyed = false; this.webContents = { send() {} }; FakeWindow.instances.push(this); }
    loadFile() {}
    show() {}
    focus() {}
    isDestroyed() { return this.destroyed; }
    close() { this.destroyed = true; this.emit('closed'); }
  }
  const handlers = new Map();
  const mainWindow = new FakeWindow();
  const fakeSignals = Object.assign(new EventEmitter(), {
    name: 'WindowsUser',
    start() {}, stop() {}, snapshot() { return { status: 'online', name: this.name, peers: [] }; },
    setName(name) { this.name = name; return true; }
  });
  const runtime = registerLanSignals({
    app: { getPath: () => root, isPackaged: false, getAppPath: () => process.cwd() },
    BrowserWindow: FakeWindow, ipcMain: { handle: (key, handler) => handlers.set(key, handler) },
    screen: {}, getMainWindows: () => [mainWindow], signalsInstance: fakeSignals
  });
  const open = handlers.get('lan-signals:open');
  assert.equal((await open({ sender: mainWindow.webContents })).ok, true);
  const panel = FakeWindow.instances.at(-1);
  const save = handlers.get('lan-signals:set-name');
  const setShortcutEnabled = handlers.get('lan-signals:set-shortcut-enabled');
  assert.deepEqual(save({ sender: { id: 'foreign' } }, '冒名者'), { error: '窗口不可用' });
  assert.deepEqual(setShortcutEnabled({ sender: { id: 'foreign' } }, false), { error: '窗口不可用' });
  assert.deepEqual(save({ sender: panel.webContents }, '剪辑电脑'), { ok: true, name: '剪辑电脑' });
  assert.deepEqual(setShortcutEnabled({ sender: panel.webContents }, false), { ok: true, shortcutEnabled: false });
  assert.equal(fakeSignals.name, '剪辑电脑');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'lan-signal-settings.json'), 'utf8')), { name: '剪辑电脑', shortcutEnabled: false });
  const panelState = await handlers.get('lan-signals:state')({ sender: panel.webContents });
  assert.equal(panelState.name, '剪辑电脑'); assert.equal(panelState.status, 'online'); assert.deepEqual(panelState.peers, []); assert.equal(panelState.shortcutEnabled, false); assert.equal(panelState.hideEmotesOnThisDevice, false);
  assert.deepEqual(setShortcutEnabled({ sender: panel.webContents }, true), { ok: true, shortcutEnabled: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'lan-signal-settings.json'), 'utf8')), { name: '剪辑电脑', shortcutEnabled: true });
  runtime.stop();
});

function packet(peer, seq, body = {}) {
  return Buffer.from(JSON.stringify({ room: ROOM, peer, seq, at: Date.now(), ...body }));
}

test('LAN discovery accepts private-network peers and emits their names', () => {
  const local = new LanSignals({ displayName: '本机' });
  local.socket = {};
  let state;
  local.on('state', value => { state = value; });

  local.receive(packet('peer-a', 1, { type: 'presence', name: '剪辑电脑' }), { address: '192.168.1.22' });
  assert.equal(state.peers.length, 1);
  assert.equal(state.peers[0].name, '剪辑电脑');
  assert.equal(state.peers[0].id, 'peer-a');
});

test('LAN discovery ignores other instances on this computer while listing remote computers', () => {
  const local = new LanSignals({ displayName: '本机新昵称' });
  local.socket = {};
  local.localAddresses = new Set(['192.168.1.10']);
  local.receive(packet('same-computer-app', 1, { type: 'presence', name: '旧昵称' }), { address: '192.168.1.10' });
  assert.equal(local.snapshot().peers.length, 0);

  local.receive(packet('remote-computer', 1, { type: 'presence', name: '远端电脑' }), { address: '192.168.1.22' });
  assert.deepEqual(local.snapshot().peers.map(peer => peer.name), ['远端电脑']);
});

test('LAN panel lists the current computer with its saved nickname and hides scrollbar chrome', () => {
  const html = fs.readFileSync(path.join(__dirname, '../electron/lan-signal-panel.html'), 'utf8');
  const script = fs.readFileSync(path.join(__dirname, '../electron/lan-signal-panel.js'), 'utf8');
  assert.match(script, /peerRow\(value, true\)/);
  assert.match(html, /scrollbar-width:none/);
  assert.match(html, /::-webkit-scrollbar\{display:none/);
  assert.match(html, /0 台在线电脑/);
});
test('LAN discovery rejects malformed, stale, foreign, and non-private packets', () => {
  const local = new LanSignals();
  local.socket = {};
  let states = 0;
  local.on('state', () => states++);

  local.receive(Buffer.from('{'), { address: '192.168.1.22' });
  local.receive(packet('peer-a', 1, { type: 'presence', name: '外网' }), { address: '8.8.8.8' });
  local.receive(Buffer.from(JSON.stringify({ room: 'other-room', type: 'presence', peer: 'peer-b', seq: 1, at: Date.now(), name: '其他房间' })), { address: '10.0.0.3' });
  local.receive(packet('peer-c', 1, { type: 'presence', name: '过期', at: Date.now() - 60000 }), { address: '172.16.0.4' });

  assert.equal(states, 0);
  assert.equal(local.snapshot().peers.length, 0);
});

test('LAN peer presence tolerates short UDP heartbeat gaps before marking a friend offline', () => {
  const signals = new LanSignals({ displayName: '本机' });
  const originalNow = Date.now, now = 100000;
  try {
    Date.now = () => now;
    signals.peers.set('peer-1', { id: 'peer-1', name: '好友', seenAt: now - 10000, seq: 1 });
    signals.expire();
    assert.equal(signals.peers.has('peer-1'), true, 'a short heartbeat gap should not cause an offline flicker');
    signals.peers.get('peer-1').seenAt = now - 20001;
    signals.expire();
    assert.equal(signals.peers.has('peer-1'), false, 'a genuinely absent peer should eventually be removed');
  } finally { Date.now = originalNow; }
});

test('valid signals emit once, while unknown senders and excess-rate packets are ignored', () => {
  const local = new LanSignals();
  local.socket = {};
  const events = [];
  local.on('signal', event => events.push(event));
  local.receive(packet('peer-a', 1, { type: 'presence', name: '另一台电脑' }), { address: '10.0.0.2' });

  local.receive(packet('peer-unknown', 1, { type: 'signal', kind: 'ping', choice: '2', x: 0.5, y: 0.6 }), { address: '10.0.0.3' });
  for (let seq = 2; seq <= 12; seq++) {
    local.receive(packet('peer-a', seq, { type: 'signal', kind: 'emote', choice: '3', x: 0.5, y: 0.6 }), { address: '10.0.0.2' });
  }

  assert.equal(events.length, 8);
  assert.equal(events[0].kind, 'emote');
  assert.equal(events[0].choice, '3');
  assert.equal(events[0].name, '另一台电脑');
});

test('sendSignal requires an online LAN socket and clamps coordinates before broadcasting', () => {
  const local = new LanSignals();
  assert.equal(local.sendSignal('ping', '1', 0.5, 0.5), false);

  const sent = [];
  local.status = 'online';
  local.targets = ['255.255.255.255'];
  local.peers.set('peer-a', { id: 'peer-a', name: 'peer', ip: '10.0.0.2', seq: 1, seenAt: Date.now() });
  local.socket = { send: (data, port, host) => sent.push({ data: JSON.parse(data), port, host }) };

  assert.equal(local.sendSignal('emote', '4', 2, -1, 3), true);
  assert.equal(local.sendSignal('unknown', '4', 0, 0), false);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map(item => item.host), ['255.255.255.255', '10.0.0.2']);
  assert.equal(sent[0].data.kind, 'emote');
  assert.equal(sent[0].data.x, 1);
  assert.equal(sent[0].data.y, 0);
  assert.equal(sent[0].data.display, 3);
});
