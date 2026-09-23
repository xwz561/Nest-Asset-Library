const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { startChatServer, privateAddress, MAX_FILE } = require('./lan-chat-server.cjs');
const MAX_PREVIEW_FILE = 25 * 1024 * 1024;
const MAX_CACHED_MESSAGES = 2_000;
function serverUrl(value) {
  const url = new URL(String(value));
  if (url.protocol !== 'http:' || !privateAddress(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('请填写局域网 IPv4 地址，例如 http://192.168.1.20:43127');
  return url.origin;
}
function registerChat({ app, ipcMain, dialog, getAssetPath }) {
  let server, connection, cache, busy = false;
  const root = () => path.join(app.getPath('userData'), 'lan-chat');
  const profileFile = () => path.join(root(), 'profiles.json');
  const read = (file, fallback) => {
    if (!fs.existsSync(file)) return fallback;
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
    } catch {
      // A file attachment must never block chat if an old build left binary
      // data in a profile or message cache. Keep it separately for recovery.
      try { fs.renameSync(file, `${file}.corrupt-${Date.now()}`); } catch {}
      return fallback;
    }
  };
  const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(value)); fs.renameSync(file + '.tmp', file); };
  const request = async (route, body) => {
    if (!connection) throw new Error('请先加入聊天');
    const response = await fetch(connection.url + route, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${connection.token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000), redirect: 'error' });
    const value = await response.json(); if (!response.ok) throw new Error(value.error || '连接失败'); return value;
  };
  const mergeMessages = (saved, incoming) => {
    const messages = new Map();
    for (const message of [...(Array.isArray(saved) ? saved : []), ...(Array.isArray(incoming) ? incoming : [])]) messages.set(message.id, message);
    return [...messages.values()].sort((left, right) => left.seq - right.seq).slice(-MAX_CACHED_MESSAGES);
  };
  const snapshot = () => ({ connected: !!connection, id: connection?.id, url: connection?.url, name: connection?.name, ...(cache || { messages: [], users: [], read: {} }) });
  const saveCache = () => { if (connection) write(connection.cacheFile, cache); };
  const sendFile = async (filename, to) => {
    const stat = fs.statSync(filename); if (!stat.isFile() || stat.size > MAX_FILE || !stat.size) throw new Error('单个文件需在 1 字节到 10 GB 之间');
    const response = await fetch(connection.url + '/upload', { method: 'POST', headers: { Authorization: `Bearer ${connection.token}`, 'x-nest-to': String(to || 'public'), 'x-nest-request-id': crypto.randomUUID(), 'x-nest-file-name': encodeURIComponent(path.basename(filename)), 'content-length': String(stat.size) }, body: fs.createReadStream(filename), duplex: 'half', redirect: 'error' });
    const value = await response.json(); if (!response.ok) throw new Error(value.error || '文件发送失败'); return value;
  };
  const sendFiles = async (files, to) => {
    const sent = [];
    for (const file of files) {
      try { await sendFile(file, to); sent.push(path.basename(file)); }
      catch (error) { throw new Error(`已发送 ${sent.length} 个文件；${path.basename(file)}：${error.message}`); }
    }
    return { sent: sent.length };
  };
  const handlers = {
    status: () => snapshot(),
    host: async () => {
      if (!server) server = await startChatServer({ directory: path.join(root(), 'server') });
      return { addresses: Object.values(os.networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal && privateAddress(i.address)).map(i => `http://${i.address}:43127`), directory: path.join(root(), 'server') };
    },
    stop: async () => { if (server) { await new Promise(resolve => server.close(resolve)); server = null; } return { ok: true }; },
    join: async ({ url, name }) => {
      url = serverUrl(url); const profiles = read(profileFile(), {});
      const response = await fetch(url + '/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, secret: profiles[url]?.secret }), signal: AbortSignal.timeout(10000), redirect: 'error' });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      if (connection) await request('/leave', {}).catch(() => {});
      profiles[url] = { secret: result.secret }; write(profileFile(), profiles);
      connection = { url, name, token: result.token, id: result.id, cacheFile: path.join(root(), crypto.createHash('sha256').update(url + result.id).digest('hex') + '.json') };
      const saved = read(connection.cacheFile, { messages: [], users: [], cursor: 0, read: {} });
      cache = {
        messages: mergeMessages(saved.messages, result.messages),
        users: Array.isArray(result.users) ? result.users : saved.users,
        cursor: Number.isFinite(result.cursor) ? result.cursor : (saved.cursor || 0),
        read: saved.read || {},
      };
      saveCache(); return snapshot();
    },
    poll: async () => {
      if (!connection) return snapshot();
      try {
        const result = await request('/poll?after=' + (cache.cursor || 0));
        cache.messages = mergeMessages(cache.messages, result.messages);
        cache.users = result.users;
        cache.cursor = result.cursor;
        saveCache();
        return snapshot();
      } catch (error) {
        if (/连接已失效/.test(String(error.message || ''))) {
          connection = null;
          return { ...snapshot(), error: '连接已失效，请重新加入' };
        }
        throw error;
      }
    },
    read: ({ room }) => { if (connection) { cache.read[room] = cache.cursor; saveCache(); } return snapshot(); },
    leave: async () => { if (connection) await request('/leave', {}).catch(() => {}); connection = null; return snapshot(); },
    send: ({ to, text, requestId }) => request('/send', { to, text, requestId }),
    files: async ({ to }) => { const result = await dialog.showOpenDialog({ title: '发送聊天附件（单个最多 10 GB）', properties: ['openFile', 'multiSelections'] }); return sendFiles(result.filePaths, to); },
    drop: async ({ to, files }) => sendFiles(Array.isArray(files) ? files : [], to),
    assets: async ({ to, ids }) => { if (!Array.isArray(ids) || !ids.length || ids.length > 50) throw new Error('请选择 1–50 个素材'); let sent = 0; for (const id of ids) { try { const file = getAssetPath(id); if (!file) throw new Error('素材不存在'); await sendFile(file, to); sent++; } catch (error) { throw new Error(`已发送 ${sent} 个素材；${error.message}`); } } return { sent }; },
    download: async ({ id, preview }) => {
      if (!connection) throw new Error('请先加入聊天');
      const file = cache?.messages?.find(message => message.file?.id === id)?.file;
      if (!file) throw new Error('附件不存在');
      if (preview && !/\.(png|jpe?g|gif|webp)$/i.test(file.name)) throw new Error('不支持预览此格式');
      if (!preview) { const result = await dialog.showSaveDialog({ defaultPath: path.basename(file.name), title: '保存聊天附件' }); if (result.canceled || !result.filePath) return { ok: false }; const response = await fetch(connection.url + '/file/' + encodeURIComponent(id), { headers: { Authorization: `Bearer ${connection.token}` }, redirect: 'error' }); if (!response.ok) { const value = await response.json(); throw new Error(value.error || '下载失败'); } await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(result.filePath)); return { ok: true, filePath: result.filePath }; }
      const response = await fetch(connection.url + '/file/' + encodeURIComponent(id), { headers: { Authorization: `Bearer ${connection.token}` }, redirect: 'error' }); if (!response.ok) { const value = await response.json(); throw new Error(value.error || '下载失败'); }
      const size = Number(response.headers.get('content-length') || 0); if (!Number.isFinite(size) || size > MAX_PREVIEW_FILE) throw new Error('图片超过 25 MB，无法在聊天中预览；请保存附件查看');
      const ext = path.extname(file.name).slice(1).toLowerCase(), bytes = Buffer.from(await response.arrayBuffer()); return { dataUrl: `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${bytes.toString('base64')}` };
    },
  };
  for (const [name, handler] of Object.entries(handlers)) ipcMain.handle('chat:' + name, async (_, input) => {
    if (busy) return { error: '上一项聊天操作尚未完成，请稍后再试' };
    busy = true; try { return await handler(input || {}); } catch (error) { return { error: error.message }; } finally { busy = false; }
  });
  app.on('before-quit', () => { server?.close(); });
}
module.exports = { registerChat, serverUrl };
