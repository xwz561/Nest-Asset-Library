const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { startChatServer, MAX_FILE } = require('../electron/lan-chat-server.cjs');
const { serverUrl, registerChat } = require('../electron/lan-chat-client.cjs');
test('拒绝公网、域名伪装、重定向入口和非法服务器地址', () => {
  for (const value of ['http://8.8.8.8:43127', 'http://10.example.com', 'http://192.168.1.2@evil.com', 'https://192.168.1.2', 'http://192.168.1.2/path']) assert.throws(() => serverUrl(value));
  assert.equal(serverUrl('http://192.168.1.2:43127'), 'http://192.168.1.2:43127');
});
test('损坏的聊天记录不会阻止服务启动', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-chat-corrupt-server-'));
  fs.writeFileSync(path.join(directory, 'history.json'), Buffer.from('PK\x03\x04附件数据'));
  const server = await startChatServer({ directory, host: '127.0.0.1', port: 0 });
  t.after(async () => { await new Promise(r => server.close(r)); fs.rmSync(directory, { recursive: true, force: true }); });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '恢复用户' }) });
  assert.equal(response.status, 200);
  assert.equal(fs.readdirSync(directory).some(name => name.startsWith('history.json.corrupt-')), true);
});
test('三人聊天、私聊附件隔离、幂等重试、昵称恢复、重启持久化', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-chat-test-'));
  let server = await startChatServer({ directory, host: '127.0.0.1', port: 0 });
  t.after(async () => { await new Promise(r => server.close(r)); fs.rmSync(directory, { recursive: true }); });
  let base = `http://127.0.0.1:${server.address().port}`;
  const call = async (route, body, user, headers = {}) => { const res = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user.token}` } : {}), ...headers }, body: body && JSON.stringify(body) }); return { status: res.status, data: await res.json() }; };
  const download = async (id, user) => { const res = await fetch(base + '/file/' + id, { headers: { Authorization: `Bearer ${user.token}` } }); return { status: res.status, data: Buffer.from(await res.arrayBuffer()) }; };
  const a = (await call('/join', { name: '甲' })).data, b = (await call('/join', { name: '乙' })).data, c = (await call('/join', { name: '丙' })).data;
  assert.equal((await call('/join', { name: '甲' })).status, 400);
  assert.equal((await call('/join', { name: '网页' }, null, { Origin: 'http://evil.example' })).status, 403);
  assert.equal((await call('/poll')).status, 401);
  const publicMessage = { to: 'public', text: '办公室公告', requestId: crypto.randomUUID() };
  const first = await call('/send', publicMessage, a);
  assert.equal((await call('/send', publicMessage, a)).data.id, first.data.id);
  const lateJoiner = (await call('/join', { name: '迟到的同事' })).data;
  assert.equal(lateJoiner.messages.some(message => message.text === '办公室公告'), true);
  await call('/leave', {}, lateJoiner);
  const bytes = Buffer.from('中文附件\0测试');
  const privateMessage = (await call('/send', { to: b.id, text: '仅乙可见', requestId: crypto.randomUUID(), file: { name: '素材.txt', data: bytes.toString('base64') } }, a)).data;
  assert.equal((await call('/poll', null, b)).data.messages.length, 2);
  assert.equal((await call('/poll', null, c)).data.messages.length, 1);
  assert.equal((await call('/file/' + privateMessage.file.id, null, c)).status, 404);
  assert.deepEqual((await download(privateMessage.file.id, b)).data, bytes);
  assert.equal((await call('/poll', null, b)).data.users.filter(u => u.online).length, 3);
  await call('/leave', {}, c);
  assert.equal((await call('/poll', null, b)).data.users.find(u => u.id === c.id).online, false);
  await new Promise(r => server.close(r)); server = await startChatServer({ directory, host: '127.0.0.1', port: 0 }); base = `http://127.0.0.1:${server.address().port}`;
  const reusedNickname = (await call('/join', { name: '甲' })).data;
  assert.notEqual(reusedNickname.id, a.id);
  const restored = (await call('/join', { name: '乙', secret: b.secret })).data;
  assert.equal(restored.id, b.id); assert.equal((await call('/poll', null, restored)).data.messages.length, 2);
  assert.deepEqual((await download(privateMessage.file.id, restored)).data, bytes);
});
test('Electron IPC 客户端保存本机历史、发送素材、下载及重连', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-chat-ipc-'));
  const server = await startChatServer({ directory: path.join(directory, 'server'), host: '127.0.0.1', port: 0 });
  t.after(async () => { await new Promise(r => server.close(r)); fs.rmSync(directory, { recursive: true }); });
  const asset = path.join(directory, 'asset.txt'), saved = path.join(directory, 'saved.txt'); fs.writeFileSync(asset, '实际素材文件');
  const makeClient = folder => { const handlers = {}; registerChat({ app: { getPath: () => path.join(directory, folder), on: () => {} }, ipcMain: { handle: (key, handler) => { handlers[key.slice(5)] = input => handler({}, input); } }, dialog: { showSaveDialog: async () => ({ filePath: saved }), showOpenDialog: async () => ({ filePaths: [asset] }) }, getAssetPath: id => id === 'asset-1' ? asset : null }); return handlers; };
  const a = makeClient('a'), b = makeClient('b'), url = `http://127.0.0.1:${server.address().port}`;
  const identity = await a.join({ url, name: '素材甲' }); await b.join({ url, name: '素材乙' });
  assert.equal((await a.assets({ to: 'public', ids: ['asset-1'] })).sent, 1);
  const late = await makeClient('late').join({ url, name: '后加入的同事' });
  assert.equal(late.messages.length, 1);
  assert.equal(late.messages[0].file.name, 'asset.txt');
  const corruptClient = makeClient('corrupt');
  const corruptIdentity = await corruptClient.join({ url, name: '缓存恢复用户' });
  await corruptClient.leave();
  const corruptCache = path.join(directory, 'corrupt', 'lan-chat', crypto.createHash('sha256').update(url + corruptIdentity.id).digest('hex') + '.json');
  fs.writeFileSync(corruptCache, Buffer.from('PK\x03\x04附件数据'));
  const recovered = await makeClient('corrupt').join({ url, name: '缓存恢复用户' });
  assert.equal(recovered.messages.some(message => message.file?.name === 'asset.txt'), true);
  assert.equal(fs.readdirSync(path.dirname(corruptCache)).some(name => name.includes('.json.corrupt-')), true);
  let result = await b.poll(); assert.equal(result.messages.length, 1);
  const savedResult = await b.download({ id: result.messages[0].file.id }); assert.equal(savedResult.filePath, saved); assert.equal(fs.readFileSync(saved, 'utf8'), '实际素材文件');
  const lossless = path.join(directory, 'lossless-source.bin'), sourceBytes = Buffer.from([0, 255, 12, 0, 127, 64, 19]);
  fs.writeFileSync(lossless, sourceBytes);
  assert.equal((await a.drop({ to: 'public', files: [lossless] })).sent, 1);
  result = await b.poll();
  const dropped = result.messages.find(message => message.file?.name === 'lossless-source.bin');
  assert.ok(dropped);
  await b.download({ id: dropped.file.id });
  assert.deepEqual(fs.readFileSync(saved), sourceBytes);
  await b.read({ room: 'public' }); await b.leave();
  const resumed = await makeClient('b').join({ url, name: '素材乙' }); assert.equal(resumed.messages.length, 2); assert.equal(resumed.read.public, 2);
  await a.leave(); assert.equal((await makeClient('a').join({ url, name: '素材甲' })).id, identity.id);
  assert.match((await a.send({ text: '断开' })).error, /先加入/);
});

test('聊天服务重启导致令牌失效时，客户端会回到重新加入状态', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-chat-expired-token-'));
  let server = await startChatServer({ directory: path.join(directory, 'server'), host: '127.0.0.1', port: 0 });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(directory, { recursive: true, force: true }); });
  const handlers = {};
  registerChat({
    app: { getPath: () => path.join(directory, 'client'), on: () => {} },
    ipcMain: { handle: (key, handler) => { handlers[key.slice(5)] = input => handler({}, input); } },
    dialog: {},
    getAssetPath: () => null,
  });
  const port = server.address().port;
  await handlers.join({ url: `http://127.0.0.1:${port}`, name: '重连用户' });
  await new Promise(resolve => server.close(resolve));
  server = await startChatServer({ directory: path.join(directory, 'server'), host: '127.0.0.1', port });
  const expired = await handlers.poll();
  assert.equal(expired.connected, false);
  assert.match(expired.error, /连接已失效/);
});

test('LAN 聊天附件上限为 10 GB，原始上传接口按字节流保存', async t => {
  assert.equal(MAX_FILE, 10 * 1024 * 1024 * 1024);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-chat-stream-'));
  const server = await startChatServer({ directory, host: '127.0.0.1', port: 0 });
  t.after(async () => { await new Promise(r => server.close(r)); fs.rmSync(directory, { recursive: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const join = async name => { const response = await fetch(base + '/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }); return response.json(); };
  const a = await join('流式甲'), b = await join('流式乙');
  const bytes = crypto.randomBytes(1024 * 1024 + 37);
  const response = await fetch(base + '/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${a.token}`, 'x-nest-to': b.id, 'x-nest-request-id': crypto.randomUUID(), 'x-nest-file-name': encodeURIComponent('无损流.bin'), 'content-length': String(bytes.length) },
    body: bytes,
    duplex: 'half',
  });
  assert.equal(response.status, 200);
  const message = await response.json();
  const received = await fetch(base + '/file/' + message.file.id, { headers: { Authorization: `Bearer ${b.token}` } });
  assert.equal(received.status, 200);
  assert.equal(Number(received.headers.get('content-length')), bytes.length);
  assert.deepEqual(Buffer.from(await received.arrayBuffer()), bytes);
});
