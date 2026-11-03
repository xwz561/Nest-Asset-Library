const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { privateAddress, MAX_FILE } = require('./lan-chat-server.cjs');

const PEER_CHAT_PORT = 43128;
const MAX_SIGNAL_EMOTE_BYTES = 512 * 1024;
const UUID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const validAvatar = value => typeof value === 'string' && value.length <= 100000 && /^data:image\/png;base64,[A-Za-z\d+/]+={0,2}$/.test(value);
const avatarVersion = value => value ? crypto.createHash('sha256').update(value).digest('hex').slice(0, 16) : '';
const cleanName = value => String(value || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 32) || '素材库用户';
const cleanFilename = value => path.basename(String(value || '附件').replace(/\\/g, '/')).replace(/[\u0000-\u001f/:*?"<>|]/g, '_').slice(0, 180) || '附件';
function deliveryErrorMessage(error) {
  const causes = [];
  const visit = value => {
    if (!value || causes.includes(value)) return;
    causes.push(value);
    if (Array.isArray(value.errors)) value.errors.forEach(visit);
    if (value.cause) visit(value.cause);
  };
  visit(error);
  const codes = [...new Set(causes.map(value => value.code).filter(Boolean))];
  const code = codes[0];
  const detail = causes.find(value => value.address || value.port);
  const address = detail ? ` (${[detail.address, detail.port].filter(Boolean).join(':')})` : '';
  const guidance = {
    ECONNREFUSED: '好友设备拒绝连接，请确认对方素材库仍在运行，并检查 Windows 防火墙。',
    ETIMEDOUT: '连接好友超时，请检查双方是否仍在同一局域网以及防火墙设置。',
    EHOSTUNREACH: '当前网络无法到达好友设备，请检查局域网连接。',
    ENETUNREACH: '当前设备没有到好友所在网络的路由，请检查局域网连接。',
    ECONNRESET: '连接被好友设备中断，请确认对方素材库仍在运行。',
    EADDRNOTAVAIL: '好友广播的连接地址当前不可用，请等待好友重新上线。',
  }[code];
  if (guidance) return `${guidance}${address} [${code}]`;
  const message = String(error?.message || error || '未知错误').slice(0, 240);
  if (message === 'fetch failed') return code ? `网络请求失败 [${code}]${address}` : '网络请求失败（系统未提供错误码）；请检查好友设备和局域网连接。';
  return message;
}

async function readJSON(request, limit = 65536) {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error('消息内容过大');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('消息格式无效'); }
}

class LanPeerChat extends EventEmitter {
  constructor({ directory, signals, host = '0.0.0.0', port = PEER_CHAT_PORT }) {
    super();
    this.directory = directory; this.signals = signals; this.host = host; this.port = port;
    this.signalEmotesDirectory = path.join(directory, 'signal-emotes');
    fs.mkdirSync(this.signalEmotesDirectory, { recursive: true });
    this.server = null; this.error = ''; this.token = crypto.randomBytes(24).toString('hex');
    this.transfers = new Map(); this.controllers = new Map(); this.profileRequests = new Set(); this.profileRetries = new Map(); this.readReceiptRequests = new Set(); this.readReceiptRetries = new Map();
    this.outboxDirectory = path.join(directory, 'outbox'); fs.mkdirSync(this.outboxDirectory, { recursive: true });
    this.outboxRunning = false; this.outboxTimer = null;
    this.activeKey = ''; this.stopped = false; this.receiving = new Set();
    fs.mkdirSync(path.join(directory, 'files'), { recursive: true });
    this.historyFile = path.join(directory, 'history.json');
    try { this.data = JSON.parse(fs.readFileSync(this.historyFile, 'utf8')); } catch { this.data = {}; }
    this.data.messages = Array.isArray(this.data.messages) ? this.data.messages : [];
    this.data.contacts = this.data.contacts && typeof this.data.contacts === 'object' ? this.data.contacts : {};
    this.data.read = this.data.read && typeof this.data.read === 'object' ? this.data.read : {};
    this.data.peerAliases = this.data.peerAliases && typeof this.data.peerAliases === 'object' ? Object.fromEntries(Object.entries(this.data.peerAliases).filter(([from, to]) => UUID.test(from) && UUID.test(to) && from !== to)) : {};
    this.normalizePeerAliases();
    this.data.pendingReadReceipts = this.data.pendingReadReceipts && typeof this.data.pendingReadReceipts === 'object' ? this.data.pendingReadReceipts : {};
    for (const [peerId, ids] of Object.entries(this.data.pendingReadReceipts)) {
      const canonical = this.resolvePeerId(peerId);
      this.data.pendingReadReceipts[canonical] = [...new Set([...(this.data.pendingReadReceipts[canonical] || []), ...(Array.isArray(ids) ? ids.filter(id => UUID.test(id)) : [])])].slice(-1000);
      if (canonical !== peerId) delete this.data.pendingReadReceipts[peerId];
    }
    this.data.receivedReadReceiptIds = Array.isArray(this.data.receivedReadReceiptIds) ? [...new Set(this.data.receivedReadReceiptIds.filter(id => UUID.test(id)))].slice(-1000) : [];
    this.data.outbox = Array.isArray(this.data.outbox) ? this.data.outbox.filter(item => item && UUID.test(item.id || '') && UUID.test(item.peerId || '') && typeof item.name === 'string' && Number.isSafeInteger(item.size) && item.size > 0) : [];
    this.data.outboxMessages = Array.isArray(this.data.outboxMessages) ? this.data.outboxMessages.filter(item => item && UUID.test(item.id || '') && UUID.test(item.peerId || '') && typeof item.text === 'string' && item.text.trim() && item.text.length <= 8000) : [];
    for (const item of this.data.outboxMessages) {
      item.peerId = this.resolvePeerId(item.peerId);
      if (!this.data.messages.some(message => message.id === item.id && message.from === this.signals.peer)) this.data.messages.push({ id: item.id, from: this.signals.peer, to: item.peerId, text: item.text, time: item.createdAt || Date.now(), pending: true, deliveryError: item.lastError || '', seq: 0 });
    }
    this.avatar = validAvatar(this.data.avatar) ? this.data.avatar : '';
    this.presenceListener = () => this.refreshPeers().catch(error => { this.error = `聊天记录保存失败：${error.message}`; this.notify(); });
    signals.on('state', this.presenceListener);
  }

  persist() {
    this.data.avatar = this.avatar;
    const temporary = this.historyFile + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(this.data));
    fs.renameSync(temporary, this.historyFile);
  }

  info() { return this.server ? { version: 1, port: this.port, token: this.token, avatarVersion: avatarVersion(this.avatar), signalEmotesVersion: 1 } : null; }
  profile() { return { id: this.signals.peer, name: cleanName(this.signals.name), avatar: this.avatar }; }
  profileFor(id) { id = this.resolvePeerId(id); return id === this.signals.peer ? this.profile() : this.data.contacts[id] || {}; }
  resolvePeerId(peerId) {
    let current = String(peerId || ''), hops = 0;
    while (UUID.test(current) && this.data.peerAliases[current] && hops++ < 32) current = this.data.peerAliases[current];
    return current;
  }
  normalizePeerAliases() {
    for (const oldId of Object.keys(this.data.peerAliases)) {
      const canonical = this.resolvePeerId(oldId);
      if (canonical === oldId) delete this.data.peerAliases[oldId];
      else this.data.peerAliases[oldId] = canonical;
    }
  }
  mergePeerIdentity(oldId, newId) {
    oldId = this.resolvePeerId(oldId); newId = this.resolvePeerId(newId);
    if (oldId === newId || !UUID.test(oldId) || !UUID.test(newId)) return false;
    const oldContact = this.data.contacts[oldId] || {}, newContact = this.data.contacts[newId] || {};
    this.data.contacts[newId] = { ...oldContact, ...newContact, name: newContact.name || oldContact.name || '' };
    delete this.data.contacts[oldId];
    for (const message of this.data.messages) {
      if (message.from === oldId) message.from = newId;
      if (message.to === oldId) message.to = newId;
    }
    if (this.data.read[oldId] !== undefined) this.data.read[newId] = Math.max(this.data.read[newId] || 0, this.data.read[oldId] || 0);
    delete this.data.read[oldId];
    if (Array.isArray(this.data.pendingReadReceipts[oldId])) {
      this.data.pendingReadReceipts[newId] = [...new Set([...(this.data.pendingReadReceipts[newId] || []), ...this.data.pendingReadReceipts[oldId]])].slice(-1000);
      delete this.data.pendingReadReceipts[oldId];
    }
    for (const entry of this.data.outbox) if (entry.peerId === oldId) entry.peerId = newId;
    for (const entry of this.data.outboxMessages) if (entry.peerId === oldId) entry.peerId = newId;
    for (const transfer of this.transfers.values()) if (transfer.peerId === oldId) transfer.peerId = newId;
    for (const [alias, canonical] of Object.entries(this.data.peerAliases)) if (canonical === oldId) this.data.peerAliases[alias] = newId;
    this.data.peerAliases[oldId] = newId;
    this.normalizePeerAliases();
    return true;
  }
  migrateLocalIdentity(previousIds = []) {
    const oldIds = new Set(previousIds.filter(id => UUID.test(String(id || '')) && id !== this.signals.peer));
    if (!oldIds.size) return { ok: true, migrated: 0 };
    let migrated = 0;
    for (const message of this.data.messages) {
      if (oldIds.has(message.from)) { message.from = this.signals.peer; migrated++; }
      if (oldIds.has(message.to)) { message.to = this.signals.peer; migrated++; }
    }
    if (migrated) { this.persist(); this.notify(); }
    return { ok: true, migrated };
  }
  snapshot() {
    const online = new Map([...this.signals.peers.values()].map(peer => [peer.id, peer]));
    const contacts = { ...this.data.contacts };
    for (const peer of online.values()) contacts[peer.id] = { ...contacts[peer.id], name: peer.name };
    const peers = Object.entries(contacts).map(([id, contact]) => ({ id, name: contact.name, avatar: contact.avatar || '', online: online.has(id), canChat: !!online.get(id)?.chat, unread: this.data.messages.filter(message => message.from === id && message.seq > (this.data.read[id] || 0)).length }));
    peers.sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, 'zh-CN'));
    return { ...this.profile(), ready: !!this.server, error: this.error, peers, peerAliases: { ...this.data.peerAliases }, read: this.data.read, messages: this.data.messages.map(({ localPath, archive, ...message }) => ({ ...message, ...(archive ? { archive: { libraryName: archive.libraryName, assetId: archive.assetId, relativePath: archive.relativePath } } : {}) })), transfers: [...this.transfers.values()], outbox: this.data.outbox.map(({ id, peerId, name, size, createdAt, lastError }) => ({ id, peerId, name, size, createdAt, lastError: lastError || '' })) };
  }
  notify() { this.emit('state', this.snapshot()); }
  read(peerId) {
    peerId = this.resolvePeerId(peerId);
    const previous = this.data.read[peerId] || 0, cursor = this.data.messages.at(-1)?.seq || 0;
    const ids = this.data.messages.filter(message => message.from === peerId && message.to === this.signals.peer && message.seq > previous && message.seq <= cursor).map(message => message.id);
    if (ids.length) this.data.pendingReadReceipts[peerId] = [...new Set([...(this.data.pendingReadReceipts[peerId] || []), ...ids])].slice(-1000);
    this.data.read[peerId] = cursor; this.persist(); this.notify();
    if (this.data.pendingReadReceipts[peerId]?.length) this.sendReadReceipts(peerId).catch(() => { this.readReceiptRetries.set(peerId, Date.now() + 15000); });
    return { ok: true };
  }
  async sendReadReceipts(peerId) {
    peerId = this.resolvePeerId(peerId);
    const pending = this.data.pendingReadReceipts[peerId] || [];
    if (!pending.length) return { ok: true, sent: 0 };
    const endpoint = this.endpoint(peerId), ids = pending.slice(0, 100);
    const response = await fetch(endpoint.url + '/read', { method: 'POST', headers: { ...endpoint.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ to: peerId, ids }), signal: AbortSignal.timeout(10000), redirect: 'error' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '已读回执发送失败');
    const acknowledged = new Set(ids);
    this.data.pendingReadReceipts[peerId] = pending.filter(id => !acknowledged.has(id));
    if (!this.data.pendingReadReceipts[peerId].length) delete this.data.pendingReadReceipts[peerId];
    this.readReceiptRetries.delete(peerId);
    this.persist(); this.notify();
    if (this.data.pendingReadReceipts[peerId]?.length) return this.sendReadReceipts(peerId);
    return { ok: true, sent: ids.length };
  }
  setAvatar(value) { if (value && !validAvatar(value)) throw new Error('头像图片无效'); this.avatar = value || ''; this.persist(); this.signals.setChatInfo(this.info()); this.notify(); }

  emoteImagePath(hash) { return /^[\da-f]{64}$/i.test(String(hash || '')) ? path.join(this.signalEmotesDirectory, `${hash.toLowerCase()}.png`) : null; }
  async storeSignalEmoteImage(hash, bytes) {
    if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > MAX_SIGNAL_EMOTE_BYTES || crypto.createHash('sha256').update(bytes).digest('hex') !== String(hash || '').toLowerCase()) throw new Error('自定义表情图片无效');
    const target = this.emoteImagePath(hash);
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    await fs.promises.writeFile(temporary, bytes, { flag: 'wx' });
    try { await fs.promises.rename(temporary, target); }
    catch (error) {
      if (!['EEXIST', 'EPERM'].includes(error.code) || !fs.existsSync(target)) { await fs.promises.rm(temporary, { force: true }); throw error; }
      const existing = await fs.promises.readFile(target);
      await fs.promises.rm(temporary, { force: true });
      if (crypto.createHash('sha256').update(existing).digest('hex') !== String(hash).toLowerCase()) throw new Error('已缓存的表情图片校验失败');
    }
    return target;
  }

  async sendSignalEmoteImage(hash, bytes, targetPeerIds = null) {
    const targets = Array.isArray(targetPeerIds) ? new Set(targetPeerIds) : null;
    const peers = [...this.signals.peers.values()].filter(peer => peer.chat?.signalEmotesVersion === 1 && (!targets || targets.has(peer.id)));
    if (targets && peers.length !== targets.size) throw new Error('好友已离线或尚未支持自定义表情图片');
    const results = await Promise.allSettled(peers.map(async peer => {
      const endpoint = this.endpoint(peer.id), response = await fetch(`${endpoint.url}/signal-emotes/${hash}`, { method: 'PUT', headers: { ...endpoint.headers, 'Content-Type': 'image/png', 'Content-Length': String(bytes.length) }, body: bytes, duplex: 'half', signal: AbortSignal.timeout(10000), redirect: 'error' });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || '发送自定义表情图片失败');
    }));
    const failed = results.filter(result => result.status === 'rejected');
    if (failed.length) throw new Error(`自定义表情图片未能传给 ${failed.length} 台在线电脑，请先更新对方素材库`);
    return { sent: peers.length };
  }

  async start() {
    if (this.server) return;
    this.stopped = false;
    const server = http.createServer((request, response) => { this.receive(request, response).catch(error => { if (!response.headersSent && !response.destroyed) this.reply(response, 400, { error: error.message }); }); });
    server.requestTimeout = 0;
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(this.port, this.host, resolve); });
    server.on('error', error => { this.error = error.message; this.notify(); });
    this.server = server; this.port = server.address().port; this.error = '';
    this.signals.setChatInfo(this.info()); await this.refreshPeers(); this.notify();
  }

  async stop() {
    this.stopped = true;
    if (this.outboxTimer) clearTimeout(this.outboxTimer);
    this.outboxTimer = null;
    this.signals.removeListener('state', this.presenceListener);
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
    const server = this.server; this.server = null;
    this.signals.setChatInfo(null);
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }

  endpoint(peerId) {
    peerId = this.resolvePeerId(peerId);
    if (!this.server) throw new Error(this.error || '局域网私聊服务尚未就绪');
    const peer = this.signals.peers.get(peerId);
    if (!peer) throw new Error('好友已离线，请等对方重新打开素材库');
    if (!peer.chat) throw new Error('好友需要更新素材库才能使用私聊与传文件');
    if (!privateAddress(peer.ip) || !Number.isInteger(peer.chat.port)) throw new Error('好友连接地址无效');
    return { peer, url: `http://${peer.ip}:${peer.chat.port}`, headers: { authorization: `Bearer ${peer.chat.token}`, 'x-nest-from': this.signals.peer, 'x-nest-from-name': encodeURIComponent(cleanName(this.signals.name)) } };
  }

  async refreshPeers() {
    if (this.stopped) return;
    const peers = [...this.signals.peers.values()];
    let merged = false;
    const onlineIds = new Set(peers.map(peer => peer.id));
    const sameNameOnlineCount = new Map();
    for (const peer of peers) {
      const name = cleanName(peer.name);
      sameNameOnlineCount.set(name, (sameNameOnlineCount.get(name) || 0) + 1);
    }
    for (const peer of peers) {
      const name = cleanName(peer.name);
      if (sameNameOnlineCount.get(name) !== 1) continue;
      const newId = this.resolvePeerId(peer.id);
      for (const [oldId, contact] of Object.entries(this.data.contacts)) {
        if (oldId === newId || onlineIds.has(oldId) || this.resolvePeerId(oldId) !== oldId || cleanName(contact.name) !== name) continue;
        merged = this.mergePeerIdentity(oldId, newId) || merged;
      }
    }
    const key = this.signals.name + ':' + peers.map(peer => `${peer.id}:${peer.name}:${!!peer.chat}:${peer.chat?.avatarVersion || ''}`).sort().join('|');
    let changed = key !== this.activeKey || merged; this.activeKey = key;
    for (const peer of peers) {
      const peerId = this.resolvePeerId(peer.id), contact = this.data.contacts[peerId];
      if (!contact || contact.name !== peer.name) { this.data.contacts[peerId] = { ...contact, name: peer.name }; changed = true; }
      if (peer.chat && (!contact || contact.avatarVersion !== peer.chat.avatarVersion) && !this.profileRequests.has(peer.id) && Date.now() > (this.profileRetries.get(peer.id) || 0)) {
        this.profileRequests.add(peer.id);
        this.fetchProfile(peer.id).catch(() => { this.profileRetries.set(peer.id, Date.now() + 5000); }).finally(() => this.profileRequests.delete(peer.id));
      }
      if (peer.chat && this.data.pendingReadReceipts[peerId]?.length && !this.readReceiptRequests.has(peerId) && Date.now() > (this.readReceiptRetries.get(peerId) || 0)) {
        this.readReceiptRequests.add(peerId);
        this.sendReadReceipts(peerId).catch(() => { this.readReceiptRetries.set(peerId, Date.now() + 15000); }).finally(() => this.readReceiptRequests.delete(peerId));
      }
    }
    if (changed) { this.persist(); this.notify(); }
    this.processOutbox().catch(error => { this.error = `待发送内容处理失败：${error.message}`; this.notify(); });
  }

  outboxPath(id) { return UUID.test(String(id || '')) ? path.join(this.outboxDirectory, id) : null; }

  async queueFile(peerId, filename, displayName, id = crypto.randomUUID()) {
    peerId = this.resolvePeerId(peerId);
    if (!UUID.test(String(peerId || '')) || (!this.signals.peers.has(peerId) && !this.data.contacts[peerId])) throw new Error('请选择已记录的好友');
    if (!UUID.test(String(id)) || this.data.outbox.some(item => item.id === id)) throw new Error('待发送文件编号无效');
    const stat = await fs.promises.stat(filename);
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_FILE) throw new Error('单个文件需在 1 字节到 10 GB 之间');
    const name = cleanFilename(displayName || path.basename(filename));
    const destination = this.outboxPath(id), temporary = `${destination}.part`, controller = new AbortController();
    const progress = { id, peerId, name, total: stat.size, loaded: 0, direction: 'queue' };
    const meter = new Transform({ transform: (chunk, encoding, done) => { progress.loaded += chunk.length; this.transfer({ ...progress }); done(null, chunk); } });
    this.controllers.set(id, controller); this.transfer(progress, true);
    try {
      await pipeline(fs.createReadStream(filename, { signal: controller.signal }), meter, fs.createWriteStream(temporary, { flags: 'wx', signal: controller.signal }), { signal: controller.signal });
      await fs.promises.rename(temporary, destination);
      const entry = { id, peerId, name, size: stat.size, createdAt: Date.now(), lastError: '', nextAttemptAt: 0 };
      this.data.outbox.push(entry);
      try { this.persist(); } catch (error) { this.data.outbox.pop(); await fs.promises.rm(destination, { force: true }); throw error; }
      this.notify();
      this.processOutbox().catch(error => { this.error = `待发送文件处理失败：${error.message}`; this.notify(); });
      return { id, queued: true };
    } catch (error) {
      await fs.promises.rm(temporary, { force: true }).catch(() => {});
      await fs.promises.rm(destination, { force: true }).catch(() => {});
      if (controller.signal.aborted) throw new Error('已取消排队');
      throw error;
    } finally { this.controllers.delete(id); this.finishTransfer(id); }
  }

  scheduleOutboxRetry(delay = 15000) {
    if (this.stopped || this.outboxTimer || (!this.data.outbox.length && !this.data.outboxMessages.length)) return;
    this.outboxTimer = setTimeout(() => { this.outboxTimer = null; this.processOutbox().catch(error => { this.error = `待发送内容处理失败：${error.message}`; this.notify(); }); }, delay);
    this.outboxTimer.unref?.();
  }

  async processOutbox() {
    if (this.stopped || this.outboxRunning || !this.server) return;
    this.outboxRunning = true;
    let retryNeeded = false;
    try {
      for (const entry of [...this.data.outbox]) {
        if (this.stopped) break;
        const current = this.data.outbox.find(item => item.id === entry.id);
        if (!current) continue;
        if ((current.nextAttemptAt || 0) > Date.now()) { retryNeeded = true; continue; }
        const peer = this.signals.peers.get(current.peerId);
        if (!peer?.chat) continue;
        const source = this.outboxPath(current.id);
        if (!source || !fs.existsSync(source)) {
          current.lastError = '待发送文件副本不存在'; current.nextAttemptAt = 0; this.persist(); this.notify(); continue;
        }
        current.lastError = ''; this.persist(); this.notify();
        try {
          await this.sendFile(current.peerId, source, current.name, { id: current.id, queued: true });
          const index = this.data.outbox.findIndex(item => item.id === current.id);
          if (index >= 0) { this.data.outbox.splice(index, 1); this.persist(); await fs.promises.rm(source, { force: true }); this.notify(); }
        } catch (error) {
          const pending = this.data.outbox.find(item => item.id === current.id);
          if (!pending) continue;
          pending.lastError = error.message === '文件发送已取消' || error.message === '已取消排队' ? '' : error.message;
          pending.nextAttemptAt = Date.now() + 15000; retryNeeded = true;
          this.persist(); this.notify();
        }
      }
      for (const entry of [...this.data.outboxMessages]) {
        if (this.stopped) break;
        const current = this.data.outboxMessages.find(item => item.id === entry.id);
        if (!current) continue;
        if ((current.nextAttemptAt || 0) > Date.now()) { retryNeeded = true; continue; }
        if (!this.signals.peers.get(current.peerId)?.chat) continue;
        try {
          await this.deliverText(current.peerId, current.text, current.id);
          const index = this.data.outboxMessages.findIndex(item => item.id === current.id);
          if (index >= 0) this.data.outboxMessages.splice(index, 1);
          const message = this.data.messages.find(item => item.id === current.id && item.from === this.signals.peer);
          if (message) { message.pending = false; message.deliveryError = ''; message.deliveredAt = Date.now(); }
          this.persist(); this.notify();
        } catch (error) {
          const pending = this.data.outboxMessages.find(item => item.id === current.id);
          if (!pending) continue;
          pending.lastError = deliveryErrorMessage(error);
          pending.nextAttemptAt = Date.now() + 15000; retryNeeded = true;
          const message = this.data.messages.find(item => item.id === current.id && item.from === this.signals.peer);
          if (message) message.deliveryError = pending.lastError;
          this.persist(); this.notify();
        }
      }
    } finally {
      this.outboxRunning = false;
      const ready = [...this.data.outbox, ...this.data.outboxMessages].some(item => (item.nextAttemptAt || 0) <= Date.now() && this.signals.peers.get(item.peerId)?.chat);
      if (retryNeeded) this.scheduleOutboxRetry(); else if (ready) this.scheduleOutboxRetry(1000);
    }
  }

  async cancelQueued(id) {
    const entry = this.data.outbox.find(item => item.id === id);
    if (!entry) return false;
    const controller = this.controllers.get(id); controller?.abort();
    const index = this.data.outbox.findIndex(item => item.id === id);
    if (index >= 0) this.data.outbox.splice(index, 1);
    this.persist(); await fs.promises.rm(this.outboxPath(id), { force: true });
    if (!this.data.outbox.length && this.outboxTimer) { clearTimeout(this.outboxTimer); this.outboxTimer = null; }
    this.notify();
    return true;
  }

  async fetchProfile(peerId) {
    peerId = this.resolvePeerId(peerId);
    const endpoint = this.endpoint(peerId);
    const response = await fetch(endpoint.url + '/profile', { headers: endpoint.headers, signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (!response.ok) throw new Error('读取好友头像失败');
    if (Number(response.headers.get('content-length')) > 110000) throw new Error('好友头像过大');
    const value = await readJSON(response.body, 110000);
    if (this.stopped || value.id !== peerId) return;
    const avatar = validAvatar(value.avatar) ? value.avatar : '';
    this.data.contacts[peerId] = { name: this.signals.peers.get(peerId)?.name || cleanName(value.name), avatar, avatarVersion: avatarVersion(avatar) };
    this.persist(); this.notify();
  }

  reply(response, status, value) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); }
  authenticate(request) {
    if (request.headers.origin || !privateAddress(request.socket.remoteAddress) || request.headers.authorization !== `Bearer ${this.token}`) throw new Error('仅允许同一局域网的素材库好友');
    const peerId = String(request.headers['x-nest-from'] || '');
    if (!UUID.test(peerId) || peerId === this.signals.peer) throw new Error('发送方身份无效');
    // The target's rotating room presence token authenticates the receiver.
    // Sender discovery is UDP and can be asymmetric or briefly stale, so do
    // not reject an otherwise authenticated private-LAN request just because
    // this device has not yet observed that sender's latest broadcast.
    const known = this.signals.peers.get(peerId);
    const address = String(request.socket.remoteAddress).replace(/^::ffff:/, '');
    if (known) return { ...known, ip: address };
    const encodedName = String(request.headers['x-nest-from-name'] || '');
    let senderName = encodedName;
    try { senderName = decodeURIComponent(encodedName); } catch {}
    const name = cleanName(senderName || this.data.contacts[peerId]?.name);
    if (!this.data.contacts[peerId]) { this.data.contacts[peerId] = { name }; this.persist(); this.notify(); }
    return { id: peerId, name, ip: address, chat: null };
  }

  append(message) {
    message.from = this.resolvePeerId(message.from); message.to = this.resolvePeerId(message.to);
    if (this.data.messages.some(old => old.id === message.id && old.from === message.from)) return;
    if (message.from === this.signals.peer && this.data.receivedReadReceiptIds.includes(message.id)) {
      message.read = true;
      this.data.receivedReadReceiptIds = this.data.receivedReadReceiptIds.filter(id => id !== message.id);
    }
    message.seq = (this.data.messages.at(-1)?.seq || 0) + 1;
    this.data.messages.push(message);
    try { this.persist(); } catch (error) { this.data.messages.pop(); throw error; }
    this.notify(); this.emit('message', { ...message, localPath: undefined });
  }

  transfer(value, force = false) {
    const old = this.transfers.get(value.id);
    this.transfers.set(value.id, value);
    if (force || !old || Date.now() - (old.notifiedAt || 0) > 200) { value.notifiedAt = Date.now(); this.emit('progress', value); }
    else value.notifiedAt = old.notifiedAt;
  }
  finishTransfer(id) { this.transfers.delete(id); this.emit('progress', { id, finished: true }); }

  async receive(request, response) {
    let peer;
    try { peer = this.authenticate(request); } catch (error) { request.resume(); return this.reply(response, 403, { error: error.message }); }
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/profile') return this.reply(response, 200, this.profile());
    if (request.method === 'POST' && url.pathname === '/message') {
      const input = await readJSON(request);
      if (!UUID.test(input.id || '') || input.to !== this.signals.peer || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 8000) throw new Error('聊天消息无效');
      this.append({ id: input.id, from: peer.id, to: this.signals.peer, text: input.text, time: Date.now() });
      return this.reply(response, 200, { ok: true, id: input.id });
    }
    if (request.method === 'POST' && url.pathname === '/read') {
      const input = await readJSON(request, 16384);
      if (input.to !== this.signals.peer || !Array.isArray(input.ids) || input.ids.length < 1 || input.ids.length > 100 || input.ids.some(id => !UUID.test(id))) throw new Error('已读回执无效');
      const senderId = this.resolvePeerId(peer.id), ids = new Set(input.ids); let changed = false;
      for (const message of this.data.messages) {
        if (ids.has(message.id) && message.from === this.signals.peer && this.resolvePeerId(message.to) === senderId && !message.read) { message.read = true; changed = true; }
      }
      const found = new Set(this.data.messages.filter(message => ids.has(message.id) && message.from === this.signals.peer && this.resolvePeerId(message.to) === senderId).map(message => message.id));
      let pendingChanged = false;
      for (const id of ids) if (!found.has(id) && !this.data.receivedReadReceiptIds.includes(id)) { this.data.receivedReadReceiptIds.push(id); pendingChanged = true; }
      if (this.data.receivedReadReceiptIds.length > 1000) { this.data.receivedReadReceiptIds.splice(0, this.data.receivedReadReceiptIds.length - 1000); pendingChanged = true; }
      if (changed || pendingChanged) { this.persist(); this.notify(); }
      return this.reply(response, 200, { ok: true, count: found.size });
    }
    const emoteImageMatch = /^\/signal-emotes\/([\da-f]{64})$/i.exec(url.pathname);
    if (request.method === 'PUT' && emoteImageMatch) {
      const hash = emoteImageMatch[1].toLowerCase(), size = Number(request.headers['content-length']);
      if (request.headers['content-type'] !== 'image/png' || !Number.isSafeInteger(size) || size < 1 || size > MAX_SIGNAL_EMOTE_BYTES) { request.resume(); throw new Error('自定义表情图片需为 PNG 且不超过 512 KB'); }
      const chunks = []; let loaded = 0;
      for await (const chunk of request) { loaded += chunk.length; if (loaded > size || loaded > MAX_SIGNAL_EMOTE_BYTES) throw new Error('自定义表情图片大小不符'); chunks.push(chunk); }
      const bytes = Buffer.concat(chunks);
      if (bytes.length !== size || crypto.createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error('自定义表情图片校验失败');
      await this.storeSignalEmoteImage(hash, bytes);
      return this.reply(response, 200, { ok: true });
    }
    if (request.method === 'POST' && url.pathname === '/file') {
      const id = String(request.headers['x-nest-message-id'] || '');
      const size = Number(request.headers['content-length']);
      if (!UUID.test(id) || !Number.isSafeInteger(size) || size < 1 || size > MAX_FILE) { request.resume(); throw new Error('单个文件需在 1 字节到 10 GB 之间'); }
      if (this.data.messages.some(message => message.id === id && message.from === peer.id)) { request.resume(); return this.reply(response, 200, { ok: true, id }); }
      if (this.receiving.has(id)) { request.resume(); throw new Error('此文件正在接收'); }
      this.receiving.add(id);
      let name; try { name = cleanFilename(decodeURIComponent(String(request.headers['x-nest-file-name'] || '附件'))); } catch { name = '附件'; }
      const fileId = crypto.randomUUID(); const target = path.join(this.directory, 'files', fileId); const temporary = target + '.part';
      const progress = { id, peerId: peer.id, name, total: size, loaded: 0, direction: 'receive' };
      const hash = crypto.createHash('sha256');
      const meter = new Transform({ transform: (chunk, encoding, done) => { progress.loaded += chunk.length; if (progress.loaded > size) return done(new Error('接收文件大小不符')); hash.update(chunk); this.transfer({ ...progress }); done(null, chunk); } });
      this.transfer(progress, true);
      try {
        await pipeline(request, meter, fs.createWriteStream(temporary, { flags: 'wx' }));
        if (progress.loaded !== size) throw new Error('文件未完整接收');
        await fs.promises.rename(temporary, target);
        this.append({ id, from: peer.id, to: this.signals.peer, text: '', time: Date.now(), file: { id: fileId, name, size, sha256: hash.digest('hex') }, localPath: target });
        this.reply(response, 200, { ok: true, id });
      } catch (error) { await fs.promises.rm(temporary, { force: true }); await fs.promises.rm(target, { force: true }); throw error; }
      finally { this.receiving.delete(id); this.finishTransfer(id); }
      return;
    }
    request.resume(); this.reply(response, 404, { error: '接口不存在' });
  }

  async sendText(peerId, text, id = crypto.randomUUID()) {
    peerId = this.resolvePeerId(peerId);
    if (!UUID.test(id) || typeof text !== 'string' || !text.trim() || text.length > 8000) throw new Error('请输入 1–8000 字的消息');
    if (this.data.messages.some(message => message.id === id && message.from === this.signals.peer)) return { ok: true };
    if (!this.data.contacts[peerId] && !this.signals.peers.has(peerId)) throw new Error('请选择已记录的好友');
    const pending = { id, peerId, text, createdAt: Date.now(), lastError: '', nextAttemptAt: 0 };
    this.data.outboxMessages.push(pending);
    try { this.persist(); } catch (error) { this.data.outboxMessages.pop(); throw error; }
    try { this.append({ id, from: this.signals.peer, to: peerId, text, time: Date.now(), pending: true }); }
    catch (error) { this.data.outboxMessages = this.data.outboxMessages.filter(item => item.id !== id); this.persist(); throw error; }
    this.processOutbox().catch(error => { this.error = `待发送内容处理失败：${error.message}`; this.notify(); });
    return { ok: true, queued: true, id };
  }

  async deliverText(peerId, text, id) {
    const endpoint = this.endpoint(peerId);
    const response = await fetch(endpoint.url + '/message', { method: 'POST', headers: { ...endpoint.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ id, to: peerId, text }), signal: AbortSignal.timeout(15000), redirect: 'error' });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || '消息发送失败');
    return { ok: true, id };
  }

  async sendFile(peerId, filename, displayName, { id = crypto.randomUUID(), queued = false } = {}) {
    peerId = this.resolvePeerId(peerId);
    const endpoint = this.endpoint(peerId); const stat = await fs.promises.stat(filename);
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_FILE) throw new Error('单个文件需在 1 字节到 10 GB 之间');
    const name = cleanFilename(displayName || path.basename(filename));
    const controller = new AbortController(); this.controllers.set(id, controller);
    const progress = { id, peerId, name, total: stat.size, loaded: 0, direction: 'send', queued };
    const source = fs.createReadStream(filename);
    const meter = new Transform({ transform: (chunk, encoding, done) => { progress.loaded += chunk.length; this.transfer({ ...progress }); done(null, chunk); } });
    source.on('error', error => meter.destroy(error)); source.pipe(meter); this.transfer(progress, true);
    try {
      const response = await fetch(endpoint.url + '/file', { method: 'POST', headers: { ...endpoint.headers, 'content-length': String(stat.size), 'x-nest-message-id': id, 'x-nest-file-name': encodeURIComponent(name) }, body: meter, duplex: 'half', signal: controller.signal, redirect: 'error' });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || '文件发送失败');
      this.append({ id, from: this.signals.peer, to: peerId, text: '', time: Date.now(), file: { id, name, size: stat.size }, localPath: filename });
      return { ok: true, id };
    } catch (error) { if (controller.signal.aborted) throw new Error('文件发送已取消'); throw error; }
    finally { source.destroy(); meter.destroy(); this.controllers.delete(id); this.finishTransfer(id); }
  }

  cancel(id) {
    const controller = this.controllers.get(id), queued = this.data.outbox.some(item => item.id === id);
    if (queued) { this.cancelQueued(id).catch(error => { this.error = `取消排队失败：${error.message}`; this.notify(); }); return { ok: true }; }
    if (controller) controller.abort();
    return { ok: !!controller };
  }
  updateMessage(id, changes) { const message = this.data.messages.find(item => item.id === id); if (!message) return; Object.assign(message, changes); this.persist(); this.notify(); }
  file(id) { const message = this.data.messages.find(message => message.file?.id === id); const filename = message?.archive && this.resolveArchivedFile ? this.resolveArchivedFile(message.archive) : message?.localPath; if (!filename || !fs.existsSync(filename)) throw new Error('附件文件已不存在'); return { ...message.file, path: filename }; }
}

module.exports = { LanPeerChat, PEER_CHAT_PORT, validAvatar, avatarVersion, cleanFilename };
