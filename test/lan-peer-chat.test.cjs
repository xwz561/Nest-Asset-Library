const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { LanPeerChat } = require('../electron/lan-peer-chat.cjs');
const { LanSignals } = require('../electron/lan-signals.cjs');

class TestSignals extends EventEmitter {
  constructor(name) { super(); this.name = name; this.peer = crypto.randomUUID(); this.peers = new Map(); }
  setChatInfo(info) { this.chat = info; this.emit('state'); }
}
const waitFor = async condition => { const deadline = Date.now() + 5000; while (!condition()) { if (Date.now() > deadline) throw new Error('Timed out'); await new Promise(resolve => setTimeout(resolve, 25)); } };
async function setup(t, names = ['甲', '乙', '丙']) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-peer-chat-'));
  const clients = names.map(name => new LanPeerChat({ directory: path.join(root, name), signals: new TestSignals(name), port: 0, host: '127.0.0.1' }));
  t.after(async () => { await Promise.all(clients.map(client => client.stop())); fs.rmSync(root, { recursive: true, force: true }); });
  for (const client of clients) await client.start();
  const discover = () => { for (const client of clients) { client.signals.peers.clear(); for (const other of clients) if (other !== client) client.signals.peers.set(other.signals.peer, { id: other.signals.peer, name: other.signals.name, ip: '127.0.0.1', chat: other.info() }); client.signals.emit('state'); } };
  discover(); return { root, clients, discover };
}

test('direct text is private, retries are idempotent, unread counts and history survive restart', async t => {
  const { clients: [a, b, c], root } = await setup(t);
  const id = crypto.randomUUID(); await a.sendText(b.signals.peer, '只发给乙', id); await a.sendText(b.signals.peer, '只发给乙', id);
  assert.equal(a.snapshot().messages.length, 1); assert.equal(b.snapshot().messages.length, 1); assert.equal(c.snapshot().messages.length, 0);
  assert.equal(b.snapshot().peers.find(peer => peer.id === a.signals.peer).unread, 1);
  b.read(a.signals.peer); assert.equal(b.snapshot().peers.find(peer => peer.id === a.signals.peer).unread, 0);
  const persisted = JSON.parse(fs.readFileSync(path.join(root, '乙', 'history.json'), 'utf8')); assert.equal(persisted.messages[0].text, '只发给乙');
  const restored = new LanPeerChat({ directory: b.directory, signals: new TestSignals('乙'), port: 0, host: '127.0.0.1' });
  assert.equal(restored.snapshot().messages[0].id, id); assert.equal(restored.data.read[a.signals.peer], 1); await restored.stop();
});

test('reading a private message returns a durable read receipt to the sender', async t => {
  const { clients: [a, b] } = await setup(t, ['甲', '乙']);
  const id = crypto.randomUUID();
  await a.sendText(b.signals.peer, '请确认已读', id);
  b.read(a.signals.peer);
  await waitFor(() => a.data.messages.find(message => message.id === id)?.read === true);
  assert.equal(b.data.pendingReadReceipts[a.signals.peer], undefined);
  assert.equal(a.snapshot().messages.find(message => message.id === id).read, true);
});

test('read receipts remain queued while the sender is offline and deliver on return', async t => {
  const { clients: [a, b] } = await setup(t, ['甲', '乙']);
  const id = crypto.randomUUID();
  await a.sendText(b.signals.peer, '离线回执', id);
  const senderPeer = b.signals.peers.get(a.signals.peer);
  b.signals.peers.delete(a.signals.peer);
  b.read(a.signals.peer);
  assert.deepEqual(b.data.pendingReadReceipts[a.signals.peer], [id]);
  b.signals.peers.set(a.signals.peer, senderPeer);
  b.signals.emit('state');
  await waitFor(() => a.data.messages.find(message => message.id === id)?.read === true);
  assert.equal(b.data.pendingReadReceipts[a.signals.peer], undefined);
});

test('streamed files are cached on the recipient, do not leak local paths, and emit progress', async t => {
  const { clients: [a, b, c], root } = await setup(t);
  const file = path.join(root, '原始素材.bin'), bytes = crypto.randomBytes(3 * 1024 * 1024); fs.writeFileSync(file, bytes);
  const progress = []; b.on('progress', value => progress.push(value));
  await a.sendFile(b.signals.peer, file, '好友素材.bin');
  const message = b.snapshot().messages.at(-1); assert.equal(message.file.name, '好友素材.bin'); assert.equal(message.file.size, bytes.length);
  assert.equal(Object.hasOwn(message, 'localPath'), false); assert.equal(c.snapshot().messages.length, 0);
  assert.deepEqual(fs.readFileSync(b.file(message.file.id).path), bytes);
  fs.unlinkSync(file); assert.deepEqual(fs.readFileSync(b.file(message.file.id).path), bytes, 'recipient owns a copy after sender deletes the original');
  assert.ok(progress.some(value => value.direction === 'receive' && value.loaded > 0)); assert.equal(progress.at(-1).finished, true);
});

test('offline file queue survives restart and sends automatically when the friend returns', async t => {
  const { clients: [a, b], root } = await setup(t, ['甲', '乙']);
  const file = path.join(root, 'offline.bin'), bytes = crypto.randomBytes(256 * 1024); fs.writeFileSync(file, bytes);
  a.signals.peers.delete(b.signals.peer); a.signals.emit('state');
  const queued = await a.queueFile(b.signals.peer, file, '离线附件.bin');
  const saved = a.outboxPath(queued.id); assert.deepEqual(fs.readFileSync(saved), bytes); assert.equal(a.snapshot().outbox.length, 1);
  fs.unlinkSync(file);
  await a.stop();
  const restored = new LanPeerChat({ directory: a.directory, signals: a.signals, port: 0, host: '127.0.0.1' }); t.after(() => restored.stop());
  await restored.start();
  restored.signals.peers.set(b.signals.peer, { id: b.signals.peer, name: '乙', ip: '127.0.0.1', chat: b.info() });
  b.signals.peers.set(restored.signals.peer, { id: restored.signals.peer, name: '甲', ip: '127.0.0.1', chat: restored.info() });
  restored.signals.emit('state'); b.signals.emit('state');
  await waitFor(() => restored.data.outbox.length === 0 && b.data.messages.some(message => message.file?.name === '离线附件.bin'));
  const received = b.data.messages.find(message => message.file?.name === '离线附件.bin');
  assert.deepEqual(fs.readFileSync(b.file(received.file.id).path), bytes);
  assert.equal(fs.existsSync(saved), false);
});

test('same-name returning friend merges old identity, chat history, unread state and queued files', async t => {
  const { clients: [a, b], root } = await setup(t, ['甲', '乙']);
  const oldId = crypto.randomUUID(), oldMessageId = crypto.randomUUID(), source = path.join(root, 'identity-queue.bin');
  fs.writeFileSync(source, 'must reach the current identity');
  a.signals.peers.delete(b.signals.peer); a.data.contacts[b.signals.peer] = undefined;
  delete a.data.contacts[b.signals.peer];
  a.data.contacts[oldId] = { name: '乙', avatar: '' };
  a.append({ id: oldMessageId, from: oldId, to: a.signals.peer, text: '旧身份的聊天记录', time: Date.now() });
  a.data.read[oldId] = 0;
  const queued = await a.queueFile(oldId, source, '旧身份排队附件.bin');

  a.signals.peers.set(b.signals.peer, { id: b.signals.peer, name: '乙', ip: '127.0.0.1', chat: b.info() });
  b.signals.peers.set(a.signals.peer, { id: a.signals.peer, name: '甲', ip: '127.0.0.1', chat: a.info() });
  a.signals.emit('state'); b.signals.emit('state');
  await waitFor(() => a.data.outbox.length === 0 && b.data.messages.some(message => message.file?.name === '旧身份排队附件.bin'));

  assert.equal(a.data.peerAliases[oldId], b.signals.peer);
  assert.equal(a.data.contacts[oldId], undefined);
  assert.equal(a.data.messages.find(message => message.id === oldMessageId).from, b.signals.peer);
  assert.equal(a.data.outbox.some(item => item.id === queued.id), false);
  assert.equal(a.snapshot().peers.filter(peer => peer.name === '乙').length, 1);
  assert.equal(a.resolvePeerId(oldId), b.signals.peer);
});

test('same-name records are not auto-merged while multiple matching devices are online', async t => {
  const { clients: [a] } = await setup(t, ['甲']);
  const oldId = crypto.randomUUID(), firstId = crypto.randomUUID(), secondId = crypto.randomUUID();
  a.data.contacts[oldId] = { name: '重名好友' };
  a.signals.peers.set(firstId, { id: firstId, name: '重名好友', ip: '127.0.0.1', chat: null });
  a.signals.peers.set(secondId, { id: secondId, name: '重名好友', ip: '127.0.0.1', chat: null });
  await a.refreshPeers();
  assert.equal(a.data.contacts[oldId].name, '重名好友');
  assert.equal(a.data.peerAliases[oldId], undefined);
});

test('canceling an offline queued file removes its private copy and prevents later delivery', async t => {
  const { clients: [a, b] } = await setup(t, ['甲', '乙']);
  const file = path.join(a.directory, 'cancel-offline.bin'); fs.writeFileSync(file, '待取消附件');
  a.signals.peers.delete(b.signals.peer); a.signals.emit('state');
  const queued = await a.queueFile(b.signals.peer, file, '待取消附件.bin'), saved = a.outboxPath(queued.id);
  assert.equal(a.cancel(queued.id).ok, true);
  await waitFor(() => !fs.existsSync(saved));
  assert.equal(a.snapshot().outbox.length, 0);
  a.signals.peers.set(b.signals.peer, { id: b.signals.peer, name: '乙', ip: '127.0.0.1', chat: b.info() }); a.signals.emit('state');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(b.data.messages.length, 0);
});

test('queued retries reuse the message ID and do not duplicate a file already accepted by the friend', async t => {
  const { clients: [a, b], root } = await setup(t, ['甲', '乙']);
  const file = path.join(root, 'retry.bin'), bytes = Buffer.from('一次发送即可'); fs.writeFileSync(file, bytes);
  const id = crypto.randomUUID(), received = path.join(b.directory, 'files', 'prior-copy'); fs.writeFileSync(received, bytes);
  b.append({ id, from: a.signals.peer, to: b.signals.peer, text: '', time: Date.now(), file: { id: 'prior-copy', name: '相同附件.bin', size: bytes.length }, localPath: received });
  await a.queueFile(b.signals.peer, file, '相同附件.bin', id);
  await waitFor(() => a.data.outbox.length === 0 && a.data.messages.some(message => message.id === id));
  assert.equal(b.data.messages.filter(message => message.id === id).length, 1);
  assert.equal(a.data.messages.filter(message => message.id === id).length, 1);
});

test('offline queue handles the 50-file batch limit and preserves every payload', async t => {
  const { clients: [a, b], root } = await setup(t, ['甲', '乙']);
  a.signals.peers.delete(b.signals.peer); a.signals.emit('state');
  const expected = new Map();
  for (let index = 0; index < 50; index++) {
    const name = `批次-${index}.bin`, file = path.join(root, name), bytes = crypto.randomBytes(4096 + index);
    fs.writeFileSync(file, bytes); expected.set(name, bytes);
    await a.queueFile(b.signals.peer, file, name);
  }
  assert.equal(a.snapshot().outbox.length, 50);
  a.signals.peers.set(b.signals.peer, { id: b.signals.peer, name: '乙', ip: '127.0.0.1', chat: b.info() });
  b.signals.peers.set(a.signals.peer, { id: a.signals.peer, name: '甲', ip: '127.0.0.1', chat: a.info() });
  a.signals.emit('state'); b.signals.emit('state');
  await waitFor(() => a.data.outbox.length === 0 && b.data.messages.filter(message => message.from === a.signals.peer && message.file).length === 50);
  for (const message of b.data.messages.filter(item => item.from === a.signals.peer && item.file)) assert.deepEqual(fs.readFileSync(b.file(message.file.id).path), expected.get(message.file.name));
});

test('avatar and nickname updates sync via peer profiles while legacy peers stay visible', async t => {
  const { clients: [a, b], discover } = await setup(t, ['甲', '乙']);
  const avatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=';
  a.setAvatar(avatar); a.signals.name = '改名甲'; discover(); await waitFor(() => b.profileFor(a.signals.peer).avatar === avatar);
  assert.equal(b.snapshot().peers.find(peer => peer.id === a.signals.peer).name, '改名甲');
  a.setAvatar(''); discover(); await waitFor(() => b.profileFor(a.signals.peer).avatar === '');
  b.signals.peers.set('legacy', { id: 'legacy', name: '旧版', ip: '127.0.0.1', chat: null }); b.signals.emit('state');
  assert.equal(b.snapshot().peers.find(peer => peer.id === 'legacy').canChat, false); assert.throws(() => b.endpoint('legacy'), /需要更新/);
  a.signals.peers.delete(b.signals.peer); await assert.rejects(a.sendText(b.signals.peer, '离线'), /已离线/);
});

test('HTTP endpoint rejects browser origins, unknown peers and invalid message IDs', async t => {
  const { clients: [a, b] } = await setup(t, ['甲', '乙']); const endpoint = a.endpoint(b.signals.peer);
  const browser = await fetch(endpoint.url + '/profile', { headers: { ...endpoint.headers, origin: 'http://example.test' } }); assert.equal(browser.status, 403);
  const stranger = await fetch(endpoint.url + '/profile', { headers: { ...endpoint.headers, 'x-nest-from': crypto.randomUUID() } }); assert.equal(stranger.status, 403);
  const invalid = await fetch(endpoint.url + '/message', { method: 'POST', headers: { ...endpoint.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: '../escape', to: b.signals.peer, text: '坏消息' }) }); assert.equal(invalid.status, 400); assert.equal(b.data.messages.length, 0);
});

test('cancelled outgoing files leave no successful message or partial attachment', async t => {
  const { clients: [a, b], root } = await setup(t, ['甲', '乙']); const file = path.join(root, 'cancel.bin'); fs.writeFileSync(file, crypto.randomBytes(8 * 1024 * 1024));
  a.on('progress', value => { if (value.direction === 'send') a.cancel(value.id); });
  await assert.rejects(a.sendFile(b.signals.peer, file), /已取消/); await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(a.data.messages.length, 0); assert.equal(b.data.messages.length, 0); assert.deepEqual(fs.readdirSync(path.join(b.directory, 'files')), []);
});

test('discovery advertises chat capabilities and accepts a restarted stable device session', () => {
  const signals = new LanSignals({ displayName: '本机' }); signals.socket = {}; signals.localAddresses = new Set();
  const packet = (seq, session, chat) => Buffer.from(JSON.stringify({ room: 'nest-asset-library-lan-v1', type: 'presence', peer: 'remote-device', session, seq, at: Date.now(), name: '好友', chat }));
  const chat = { version: 1, port: 43128, token: 'a'.repeat(48), avatarVersion: '' };
  signals.receive(packet(50, 'old-session', chat), { address: '192.168.1.22' }); assert.equal(signals.snapshot().peers[0].canChat, true);
  signals.receive(packet(1, 'new-session', chat), { address: '192.168.1.22' }); assert.equal(signals.peers.get('remote-device').seq, 1);
  assert.equal(Object.hasOwn(signals.snapshot().peers[0], 'chat'), false, 'HTTP session token must not be exposed to renderer snapshots');
});
