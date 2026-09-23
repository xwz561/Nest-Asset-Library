const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isIP } = require('node:net');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const MAX_FILE = 10 * 1024 * 1024 * 1024;
const MAX_LEGACY_FILE = 25 * 1024 * 1024;
const MAX_JSON_BODY = Math.ceil(MAX_LEGACY_FILE * 1.4) + 16384;
function readChatState(file) {
  const empty = { users: [], messages: [] };
  if (!fs.existsSync(file)) return empty;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { users: Array.isArray(parsed?.users) ? parsed.users : [], messages: Array.isArray(parsed?.messages) ? parsed.messages : [] };
  } catch {
    // Preserve an invalid local record for recovery instead of preventing the
    // host from starting when a binary file was written there by an old build.
    try { fs.renameSync(file, `${file}.corrupt-${Date.now()}`); } catch {}
    return empty;
  }
}
function privateAddress(address) {
  const ip = String(address).replace(/^::ffff:/, '');
  return ip === '::1' || (isIP(ip) === 4 && (/^127\./.test(ip) || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', chunk => { size += chunk.length; if (size > MAX_JSON_BODY) { reject(new Error('消息内容过大；附件请使用文件上传')); req.destroy(); } else chunks.push(chunk); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch { reject(new Error('请求格式错误')); } });
    req.on('error', reject);
  });
}
function uploadFilename(value) {
  try { return path.basename(decodeURIComponent(String(value || '附件'))).replace(/[\u0000-\u001f\\/:*?"<>|]/g, '_').slice(0, 180) || '附件'; }
  catch { return '附件'; }
}
async function saveUpload(req, destination) {
  let size = 0;
  const meter = new Transform({ transform(chunk, encoding, done) { size += chunk.length; if (size > MAX_FILE) return done(new Error('单个文件最多 10 GB')); done(null, chunk); } });
  await pipeline(req, meter, fs.createWriteStream(destination, { flags: 'wx' }));
  return size;
}
async function startChatServer({ directory, host = '0.0.0.0', port = 43127 }) {
  fs.mkdirSync(path.join(directory, 'files'), { recursive: true });
  const database = path.join(directory, 'history.json');
  const state = readChatState(database);
  const persist = () => { fs.writeFileSync(database + '.tmp', JSON.stringify(state)); fs.renameSync(database + '.tmp', database); };
  const sessions = new Map();
  const visible = (m, id) => m.to === 'public' || m.to === id || m.from === id;
  const usersSnapshot = () => state.users.map(u => ({ id: u.id, name: u.name, online: [...sessions.values()].some(session => session.id === u.id && Date.now() - session.seen < 15000) }));
  const cursor = () => state.messages.at(-1)?.seq || 0;
  const server = http.createServer(async (req, res) => {
    const reply = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      if (!privateAddress(req.socket.remoteAddress) || req.headers.origin) return reply(403, { error: '仅允许局域网桌面客户端' });
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'POST' && url.pathname === '/join') {
        const input = await readBody(req); const name = String(input.name || '').trim().slice(0, 32);
        if (!name) throw new Error('请输入昵称');
        let user = state.users.find(u => u.secret === input.secret);
        const nicknameInUse = state.users.some(u => u.name === name && u !== user && [...sessions.values()].some(session => session.id === u.id && Date.now() - session.seen < 60000));
        if (nicknameInUse) throw new Error('昵称正在被在线用户使用，请换一个昵称');
        if (!user) { user = { id: crypto.randomUUID(), secret: crypto.randomBytes(32).toString('hex'), name }; state.users.push(user); }
        user.name = name; persist();
        const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, { id: user.id, seen: Date.now() });
        // Hydrate the room before the first poll. A new desktop has no local
        // cursor, so this makes prior public attachments appear immediately.
        const messages = state.messages.filter(message => visible(message, user.id)).slice(-300);
        return reply(200, { id: user.id, secret: user.secret, token, messages, users: usersSnapshot(), cursor: cursor() });
      }
      const token = (req.headers.authorization || '').replace(/^Bearer /, '');
      const session = sessions.get(token);
      if (!session) return reply(401, { error: '连接已失效，请重新加入' });
      session.seen = Date.now();
      if (req.method === 'POST' && url.pathname === '/leave') { sessions.delete(token); return reply(200, { ok: true }); }
      if (req.method === 'GET' && url.pathname === '/poll') {
        const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
        const messages = state.messages.filter(m => m.seq > after && visible(m, session.id)).slice(0, 300);
        return reply(200, { messages, users: usersSnapshot(), cursor: messages.length === 300 ? messages.at(-1).seq : cursor() });
      }
      if (req.method === 'POST' && url.pathname === '/upload') {
        const to = String(req.headers['x-nest-to'] || 'public');
        const requestId = String(req.headers['x-nest-request-id'] || '');
        if (to !== 'public' && !state.users.some(u => u.id === to)) throw new Error('同事不存在');
        const duplicate = state.messages.find(m => m.from === session.id && m.requestId === requestId);
        if (duplicate) return reply(200, duplicate);
        if (!/^[\w-]{8,80}$/.test(requestId)) throw new Error('缺少消息编号');
        const declaredSize = Number(req.headers['content-length'] || 0);
        if (!Number.isFinite(declaredSize) || declaredSize < 1 || declaredSize > MAX_FILE) throw new Error('单个文件需在 1 字节到 10 GB 之间');
        const file = { id: crypto.randomUUID(), name: uploadFilename(req.headers['x-nest-file-name']), size: 0 };
        const temporary = path.join(directory, 'files', `.${file.id}.upload`), target = path.join(directory, 'files', file.id);
        try {
          file.size = await saveUpload(req, temporary);
          if (!file.size) throw new Error('文件为空');
          fs.renameSync(temporary, target);
          const message = { seq: (state.messages.at(-1)?.seq || 0) + 1, id: crypto.randomUUID(), requestId, from: session.id, to, text: '', file, time: new Date().toISOString() };
          state.messages.push(message);
          try { persist(); } catch (error) { state.messages.pop(); fs.rmSync(target, { force: true }); throw error; }
          return reply(200, message);
        } catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
      }
      if (req.method === 'POST' && url.pathname === '/send') {
        const input = await readBody(req); const to = String(input.to || 'public');
        if (to !== 'public' && !state.users.some(u => u.id === to)) throw new Error('同事不存在');
        const duplicate = state.messages.find(m => m.from === session.id && m.requestId === input.requestId);
        if (duplicate) return reply(200, duplicate);
        if (!/^[\w-]{8,80}$/.test(input.requestId || '')) throw new Error('缺少消息编号');
        const message = { seq: (state.messages.at(-1)?.seq || 0) + 1, id: crypto.randomUUID(), requestId: input.requestId, from: session.id, to, text: String(input.text || '').slice(0, 8000), time: new Date().toISOString() };
        if (input.file) {
          const bytes = Buffer.from(String(input.file.data || ''), 'base64');
          if (!bytes.length || bytes.length > MAX_LEGACY_FILE) throw new Error('旧版客户端单个文件最多 25 MB，请升级后发送大文件');
          message.file = { id: crypto.randomUUID(), name: path.basename(String(input.file.name || '附件')).slice(0, 180), size: bytes.length };
          fs.writeFileSync(path.join(directory, 'files', message.file.id), bytes);
        }
        if (!message.text.trim() && !message.file) throw new Error('消息不能为空');
        state.messages.push(message);
        try { persist(); } catch (error) { state.messages.pop(); if (message.file) fs.unlinkSync(path.join(directory, 'files', message.file.id)); throw error; }
        return reply(200, message);
      }
      if (req.method === 'GET' && url.pathname.startsWith('/file/')) {
        const id = url.pathname.slice(6); const message = state.messages.find(m => m.file?.id === id && visible(m, session.id));
        if (!message) return reply(404, { error: '附件不存在或无权读取' });
        const target = path.join(directory, 'files', id), stat = fs.statSync(target);
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(stat.size), 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(message.file.name)}`, 'Cache-Control': 'no-store' });
        return pipeline(fs.createReadStream(target), res);
      }
      reply(404, { error: '接口不存在' });
    } catch (error) { if (!res.headersSent && !res.destroyed) reply(400, { error: error.message }); }
  });
  server.requestTimeout = 0;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  const cleanup = setInterval(() => { for (const [key, value] of sessions) if (Date.now() - value.seen > 60000) sessions.delete(key); }, 30000); cleanup.unref();
  server.on('close', () => clearInterval(cleanup));
  return server;
}
module.exports = { startChatServer, privateAddress, MAX_FILE };
if (require.main === module) startChatServer({ directory: process.env.NEST_CHAT_DATA || path.join(process.env.LOCALAPPDATA || process.cwd(), 'XWZ-LanChat'), port: Number(process.env.NEST_CHAT_PORT || 43127) }).then(server => console.log(`聊天服务已启动，端口 ${server.address().port}；按 Ctrl+C 停止。`)).catch(error => { console.error(error.message); process.exitCode = 1; });
