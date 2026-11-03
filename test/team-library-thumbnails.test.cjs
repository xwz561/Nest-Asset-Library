const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { registerTeamLibraryRuntime } = require('../electron/team-library-runtime.cjs');

const LIB = '11111111-2222-3333-4444-555555555555';
const ASSET = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

async function harness(respond) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'team-runtime-'));
  await fs.promises.writeFile(path.join(dir, 'team-library-connection.json'), JSON.stringify({
    baseUrl: 'https://team.example:43180', libraryId: LIB, username: 'li', encryptedToken: Buffer.from('tok-123').toString('base64'),
  }));
  const handlers = new Map(), calls = [];
  let protocolHandler = null;
  registerTeamLibraryRuntime({
    app: { getPath: () => dir, whenReady: () => Promise.resolve() },
    dialog: {},
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    net: { fetch: async (url, options = {}) => { calls.push({ url, options }); return respond(url, options); }, request: () => { throw new Error('unused'); } },
    protocol: { handle: (scheme, fn) => { protocolHandler = fn; } },
    safeStorage: { isEncryptionAvailable: () => true, decryptString: buffer => buffer.toString(), encryptString: text => Buffer.from(text) },
  });
  await new Promise(resolve => setImmediate(resolve));
  return { handlers, calls, getProtocol: () => protocolHandler, invoke: (name, ...args) => handlers.get(name)({}, ...args) };
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('上传缩略图：以二进制 PUT 到资产缩略图接口并带登录令牌', async () => {
  const h = await harness(() => json({ ok: true, thumbnailVersion: 2 }));
  const data = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const result = await h.invoke('team-library:put-thumbnail', ASSET, data);
  assert.equal(result.thumbnailVersion, 2);
  const call = h.calls[0];
  assert.equal(call.url, `https://team.example:43180/v1/libraries/${LIB}/assets/${ASSET}/thumbnail`);
  assert.equal(call.options.method, 'PUT');
  assert.equal(call.options.headers.Authorization, 'Bearer tok-123');
  assert.equal(call.options.headers['Content-Type'], 'application/octet-stream');
  assert.deepEqual([...call.options.body], [...data]);
});

test('上传缩略图：拒绝空内容和超过 2MB 的内容，且不发请求', async () => {
  const h = await harness(() => json({}));
  await assert.rejects(h.invoke('team-library:put-thumbnail', ASSET, new Uint8Array(0)), /为空/);
  await assert.rejects(h.invoke('team-library:put-thumbnail', ASSET, new Uint8Array(2 * 1024 * 1024 + 1)), /2MB/);
  await assert.rejects(h.invoke('team-library:put-thumbnail', ASSET, 'text'), /为空/);
  assert.equal(h.calls.length, 0);
});

test('永久删除与清空回收站走管理员回收站接口', async () => {
  const h = await harness(() => json({ ok: true }));
  await h.invoke('team-library:purge', 'asset', ASSET);
  await h.invoke('team-library:purge', 'folder', 'f/1');
  await h.invoke('team-library:empty-trash');
  assert.deepEqual(h.calls.map(c => [c.options.method, c.url.replace('https://team.example:43180', '')]), [
    ['DELETE', `/v1/libraries/${LIB}/trash/asset/${ASSET}`],
    ['DELETE', `/v1/libraries/${LIB}/trash/folder/f%2F1`],
    ['DELETE', `/v1/libraries/${LIB}/trash`],
  ]);
});

test('登录过期（401）时状态返回 needsLogin 并保留账号和服务器地址', async () => {
  const h = await harness(() => json({ error: '登录已过期' }, 401));
  const status = await h.invoke('team-library:status');
  assert.equal(status.connected, true);
  assert.equal(status.online, false);
  assert.equal(status.needsLogin, true);
  assert.equal(status.username, 'li');
  assert.equal(status.serverUrl, 'https://team.example:43180');
});

test('网络故障不会被当成登录过期', async () => {
  const h = await harness(() => { throw new Error('getaddrinfo ENOTFOUND'); });
  const status = await h.invoke('team-library:status');
  assert.equal(status.online, false);
  assert.ok(!status.needsLogin);
});

test('teamasset 协议：?thumb 取缩略图，否则取原文件，并透传 etag', async () => {
  const h = await harness(() => new Response('x', { status: 200, headers: { 'content-type': 'image/jpeg', etag: '"v3"' } }));
  const handler = h.getProtocol();
  const thumb = await handler({ url: `teamasset://${LIB}/${ASSET}?thumb=3`, headers: new Headers(), signal: undefined });
  const full = await handler({ url: `teamasset://${LIB}/${ASSET}`, headers: new Headers(), signal: undefined });
  assert.equal(thumb.headers.get('etag'), '"v3"');
  assert.equal(full.status, 200);
  assert.ok(h.calls[0].url.endsWith(`/assets/${ASSET}/thumbnail`));
  assert.ok(h.calls[1].url.endsWith(`/assets/${ASSET}/content`));
  const wrongLibrary = await handler({ url: `teamasset://99999999-2222-3333-4444-555555555555/${ASSET}`, headers: new Headers() });
  assert.equal(wrongLibrary.status, 404);
});

test('缩略图队列：同一素材只处理一次，并发不超过上限', async () => {
  const { createThumbnailQueue } = await import('../src/team-thumbnails.js');
  let active = 0, peak = 0; const done = [];
  const queue = createThumbnailQueue(async asset => { active += 1; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 5)); active -= 1; done.push(asset.id); }, { concurrency: 2 });
  for (const id of ['a', 'b', 'c', 'd', 'a', 'b']) queue.add({ id });
  assert.equal(queue.add({ id: 'c' }), false);
  assert.equal(queue.add({}), false);
  while (queue.size) await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(done.sort(), ['a', 'b', 'c', 'd']);
  assert.equal(peak, 2);
});

test('缩略图队列：worker 失败不会卡住后续任务，clear 后可重新加入', async () => {
  const { createThumbnailQueue } = await import('../src/team-thumbnails.js');
  const done = [];
  const queue = createThumbnailQueue(async asset => { if (asset.id === 'bad') throw new Error('boom'); done.push(asset.id); }, { concurrency: 1 });
  queue.add({ id: 'bad' }); queue.add({ id: 'ok' });
  while (queue.size) await new Promise(r => setTimeout(r, 2));
  assert.deepEqual(done, ['ok']);
  queue.clear();
  assert.equal(queue.add({ id: 'ok' }), true);
});

test('thumbnailKind 只接受可生成缩略图的类型并限制大小', async () => {
  const { thumbnailKind } = await import('../src/team-thumbnails.js');
  assert.ok(thumbnailKind({ type: 'image/png', size: 1000 }));
  assert.ok(thumbnailKind({ type: 'video/mp4', size: 5e9 }));
  assert.ok(!thumbnailKind({ type: 'image/png', size: 90 * 1024 * 1024 }));
  assert.ok(!thumbnailKind({ type: 'application/pdf', size: 10 }));
});
