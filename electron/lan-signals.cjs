const dgram = require('node:dgram');
const os = require('node:os');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

const PORT = 47483;
const ROOM = 'nest-asset-library-lan-v1';
const MAX_PACKET = 1024;
const PRESENCE_MS = 2500;
const EXPIRE_MS = 20000;
const RATE_WINDOW_MS = 1000;
const MAX_EVENTS_PER_PEER = 8;

function localIPv4(address) {
  const ip = String(address || '').replace(/^::ffff:/, '');
  return /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || /^127\./.test(ip);
}

function interfaceIPv4Addresses() {
  const addresses = new Set();
  for (const rows of Object.values(os.networkInterfaces())) {
    for (const row of rows || []) {
      if (row.family === 'IPv4') addresses.add(row.address);
    }
  }
  return addresses;
}

function broadcastTargets() {
  const targets = new Set(['255.255.255.255']);
  for (const rows of Object.values(os.networkInterfaces())) {
    for (const row of rows || []) {
      if (row.family !== 'IPv4' || row.internal) continue;
      const ip = row.address.split('.').map(Number);
      const mask = row.netmask.split('.').map(Number);
      targets.add(ip.map((n, i) => ((n & mask[i]) | (~mask[i] & 255))).join('.'));
    }
  }
  return [...targets];
}

class LanSignals extends EventEmitter {
  constructor({ name = os.userInfo().username, displayName = name, peer } = {}) {
    super();
    this.peer = /^[\da-f-]{36}$/i.test(String(peer || '')) ? peer : crypto.randomUUID();
    this.session = crypto.randomUUID();
    this.chat = null;
    this.defaultName = String(name || '素材库用户').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 32) || '素材库用户';
    this.name = String(displayName || name || '素材库用户').replace(/[\u0000-\u001f]/g, '').slice(0, 32);
    this.socket = null;
    this.timer = null;
    this.peers = new Map();
    this.rates = new Map();
    this.status = 'off';
    this.targets = [];
    this.localAddresses = interfaceIPv4Addresses();
    this.sequence = 0;
  }

  start() {
    if (this.socket) return;
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.socket = socket;
    socket.on('error', error => {
      if (socket !== this.socket) return;
      this.stop();
      this.setStatus('unavailable');
      this.emit('errorText', String(error.message || '局域网信号端口不可用'));
    });
    socket.on('message', (buffer, remote) => this.receive(buffer, remote));
    socket.bind(PORT, '0.0.0.0', () => {
      if (socket !== this.socket) return;
      socket.setBroadcast(true);
      this.targets = broadcastTargets();
      this.localAddresses = interfaceIPv4Addresses();
      this.setStatus('online');
      this.announce();
      this.timer = setInterval(() => {
        this.targets = broadcastTargets();
        this.localAddresses = interfaceIPv4Addresses();
        this.expire();
        this.announce();
      }, PRESENCE_MS);
    });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      try { socket.close(); } catch {}
    }
    this.peers.clear();
    this.rates.clear();
    this.setStatus('off');
  }

  snapshot() {
    return { id: this.peer, room: '局域网房间', status: this.status, name: this.name, peers: [...this.peers.values()].map(p => ({ id: p.id, name: p.name, seenAt: p.seenAt, canChat: !!p.chat })) };
  }

  setChatInfo(value) { this.chat = value; this.announce(); this.emit('state', this.snapshot()); }

  setName(value) {
    const name = String(value || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 32);
    if (!name) return false;
    this.name = name;
    this.announce();
    this.emit('state', this.snapshot());
    return true;
  }

  sendSignal(kind, choice, x, y, display = 0, emote = {}) {
    if (this.status !== 'online') return false;
    if (!['ping', 'emote'].includes(kind)) return false;
    const body = {
      kind,
      choice: String(choice || '').slice(0, 24),
      x: Math.max(0, Math.min(1, Number(x) || 0)),
      y: Math.max(0, Math.min(1, Number(y) || 0)),
      display: Math.max(0, Math.min(15, Number(display) || 0))
    };
    if (kind === 'emote' && /^[\da-f]{64}$/i.test(String(emote?.imageHash || ''))) body.imageHash = String(emote.imageHash).toLowerCase();
    else if (kind === 'emote' && typeof emote?.emoji === 'string' && emote.emoji.length <= 32) body.emoji = emote.emoji;
    const packet = this.packet('signal', body);
    const customEmote = kind === 'emote' && (!!body.imageHash || !!body.emoji);
    if (customEmote) {
      const capable = [...this.peers.values()].filter(peer => peer.chat?.signalEmotesVersion === 1);
      for (const peer of capable) this.socket.send(packet, PORT, peer.ip, () => {});
      // Older releases only understand the built-in wheel slot. Send that
      // fallback for every legacy peer so custom emoji and image selections
      // still arrive as a visible built-in emote instead of disappearing.
      const legacyPeers = [...this.peers.values()].filter(peer => peer.chat?.signalEmotesVersion !== 1);
      if (legacyPeers.length) {
        const fallbackPacket = this.packet('signal', { kind, choice: body.choice, x: body.x, y: body.y, display: body.display });
        for (const peer of legacyPeers) this.socket.send(fallbackPacket, PORT, peer.ip, () => {});
      }
    } else {
      this.broadcast(packet);
      for (const peer of this.peers.values()) this.socket.send(packet, PORT, peer.ip, () => {});
    }
    return true;
  }

  announce() {
    if (this.status !== 'online') return;
    this.broadcast(this.packet('presence', { name: this.name, ...(this.chat ? { chat: this.chat } : {}) }));
  }

  packet(type, body) {
    return Buffer.from(JSON.stringify({ room: ROOM, type, peer: this.peer, session: this.session, seq: ++this.sequence, at: Date.now(), ...body }));
  }

  broadcast(packet) {
    const socket = this.socket;
    if (!socket) return;
    for (const host of this.targets) socket.send(packet, PORT, host, () => {});
  }

  receive(buffer, remote) {
    if (!this.socket || buffer.length > MAX_PACKET || !localIPv4(remote.address)) return;
    const senderAddress = String(remote.address || '').replace(/^::ffff:/, '');
    if (this.localAddresses.has(senderAddress)) return;
    let msg;
    try { msg = JSON.parse(buffer.toString('utf8')); } catch { return; }
    if (!msg || msg.room !== ROOM || msg.peer === this.peer || typeof msg.peer !== 'string' || msg.peer.length > 64) return;
    if (!Number.isSafeInteger(msg.seq) || !Number.isFinite(msg.at) || Math.abs(Date.now() - msg.at) > 30000) return;
    const old = this.peers.get(msg.peer);
    const newSession = msg.type === 'presence' && typeof msg.session === 'string' && msg.session.length <= 64 && msg.session !== old?.session;
    if (msg.type === 'presence') {
      // Presence and signal packets share a sender counter, but UDP can reorder them.
      // A newer presence must not make a delayed ping look like a replay.
      if (old && !newSession && msg.seq <= (old.presenceSeq || 0)) return;
      if (typeof msg.name !== 'string') return;
      const chat = msg.chat?.version === 1 && Number.isInteger(msg.chat.port) && msg.chat.port >= 1024 && msg.chat.port <= 65535 && /^[\da-f]{48}$/.test(msg.chat.token || '') && /^([\da-f]{16})?$/.test(msg.chat.avatarVersion || '')
        ? { version: 1, port: msg.chat.port, token: msg.chat.token, avatarVersion: msg.chat.avatarVersion || '', ...(msg.chat.signalEmotesVersion === 1 ? { signalEmotesVersion: 1 } : {}) } : null;
      this.peers.set(msg.peer, { id: msg.peer, name: msg.name.replace(/[\u0000-\u001f]/g, '').slice(0, 32) || '素材库用户', presenceSeq: msg.seq, signalSeq: newSession ? 0 : (old?.signalSeq || 0), session: msg.session, seenAt: Date.now(), ip: remote.address, chat });
      this.emit('state', this.snapshot());
      return;
    }
    if (msg.type !== 'signal' || !old || msg.session !== old.session || !['ping', 'emote'].includes(msg.kind) || msg.seq <= (old.signalSeq || 0)) return;
    if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y) || msg.x < 0 || msg.x > 1 || msg.y < 0 || msg.y > 1) return;
    const now = Date.now();
    const rate = this.rates.get(msg.peer) || { at: now, count: 0 };
    if (now - rate.at >= RATE_WINDOW_MS) { rate.at = now; rate.count = 0; }
    if (++rate.count > MAX_EVENTS_PER_PEER) return;
    this.rates.set(msg.peer, rate);
    old.signalSeq = msg.seq;
    old.seenAt = now;
    const imageHash = /^[\da-f]{64}$/i.test(String(msg.imageHash || '')) ? String(msg.imageHash).toLowerCase() : '';
    const emoji = typeof msg.emoji === 'string' && msg.emoji.length <= 32 ? msg.emoji : '';
    this.emit('signal', { senderId: msg.peer, kind: msg.kind, choice: String(msg.choice || '').slice(0, 24), ...(imageHash ? { imageHash } : {}), ...(emoji ? { emoji } : {}), x: msg.x, y: msg.y, display: Number(msg.display) || 0, name: old.name, address: remote.address });
  }

  expire() {
    const cutoff = Date.now() - EXPIRE_MS;
    let changed = false;
    for (const [id, peer] of this.peers) {
      if (peer.seenAt < cutoff) { this.peers.delete(id); changed = true; }
    }
    for (const [id, rate] of this.rates) if (rate.at < cutoff) this.rates.delete(id);
    if (changed) this.emit('state', this.snapshot());
  }

  setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.emit('state', this.snapshot());
  }
}

module.exports = { LanSignals, PORT };




