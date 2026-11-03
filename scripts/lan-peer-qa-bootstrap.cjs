const { app } = require('electron');
const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const path = require('node:path');
if (!process.env.NEST_QA_PROFILE) throw new Error('Peer chat QA requires an isolated profile');
app.setPath('userData', process.env.NEST_QA_PROFILE); app.setAppPath(path.resolve(__dirname, '..'));
app.getVersion = () => require('../package.json').version;
class IsolatedSignals extends EventEmitter {
  constructor() { super(); this.peer = crypto.randomUUID(); this.name = '隔离测试本机'; this.peers = new Map(); this.status = 'off'; }
  start() { this.status = 'online'; this.emit('state', this.snapshot()); }
  stop() { this.status = 'off'; this.peers.clear(); this.emit('state', this.snapshot()); }
  snapshot() { return { id: this.peer, name: this.name, status: this.status, peers: [...this.peers.values()].map(peer => ({ id: peer.id, name: peer.name, canChat: !!peer.chat })) }; }
  setName(name) { this.name = name; this.emit('state', this.snapshot()); return true; }
  setChatInfo(value) { this.chat = value; this.emit('state', this.snapshot()); }
  sendSignal() { return false; }
}
const signalsModule = require('../electron/lan-signal-runtime.cjs'), registerSignals = signalsModule.registerLanSignals;
signalsModule.registerLanSignals = options => registerSignals({ ...options, signalsInstance: new IsolatedSignals(), spawnProcess: () => { const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = { write() {}, end() {} }; child.kill = () => {}; return child; } });
const transportModule = require('../electron/lan-peer-chat.cjs'), PeerTransport = transportModule.LanPeerChat;
transportModule.LanPeerChat = class IsolatedPeerChat extends PeerTransport { constructor(options) { super({ ...options, host: '127.0.0.1', port: 0 }); } };
const peerModule = require('../electron/lan-peer-chat-runtime.cjs'), registerPeer = peerModule.registerPeerChat;
peerModule.registerPeerChat = options => { const runtime = registerPeer(options); global.__nestPeerChatQA = runtime; return runtime; };
const updaterModule = require('../electron/update-controller.cjs'), registerUpdater = updaterModule.registerUpdateController;
updaterModule.registerUpdateController = options => { const runtime = registerUpdater(options); global.__nestUpdaterQA = runtime; return runtime; };
require('../electron/main.cjs');
