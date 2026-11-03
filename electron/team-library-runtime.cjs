const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');

function registerTeamLibraryRuntime({ app, dialog, ipcMain, net, protocol, safeStorage }) {
  const connectionFile = () => path.join(app.getPath('userData'), 'team-library-connection.json');
  let cachedConnection = null;
  let loadPromise = null;

  async function readConnection() {
    if (cachedConnection) return cachedConnection;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        const saved = JSON.parse(await fs.promises.readFile(connectionFile(), 'utf8'));
        const token = safeStorage.decryptString(Buffer.from(saved.encryptedToken, 'base64'));
        cachedConnection = { baseUrl: saved.baseUrl, libraryId: saved.libraryId, token, username: saved.username };
        return cachedConnection;
      } catch (error) {
        if (error.code !== 'ENOENT') console.warn('[team-library] saved connection could not be read:', error.message);
        return null;
      } finally { loadPromise = null; }
    })();
    return loadPromise;
  }

  async function saveConnection(connection) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows 安全存储当前不可用，无法安全保存登录状态');
    const encryptedToken = safeStorage.encryptString(connection.token).toString('base64');
    const file = connectionFile(), temporary = `${file}.${process.pid}.tmp`;
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(temporary, JSON.stringify({
      baseUrl: connection.baseUrl, libraryId: connection.libraryId,
      username: connection.username, encryptedToken,
    }), { encoding: 'utf8', mode: 0o600 });
    await fs.promises.rename(temporary, file);
    cachedConnection = connection;
  }

  function normalizedBaseUrl(value) {
    let url;
    try { url = new URL(String(value || '').trim()); }
    catch { throw new Error('服务器地址格式无效'); }
    if (url.username || url.password || url.search || url.hash || !['/', ''].includes(url.pathname)) throw new Error('服务器地址只填写协议、主机和端口');
    const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname.toLowerCase());
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('局域网连接必须使用 HTTPS');
    return url.origin;
  }

  async function request(connection, endpoint, options = {}) {
    const response = await net.fetch(`${connection.baseUrl}${endpoint}`, {
      ...options,
      headers: { Authorization: `Bearer ${connection.token}`, ...(options.headers || {}) },
      signal: options.signal || AbortSignal.timeout(endpoint.endsWith('/changes') ? 25_000 : 60_000),
    });
    if (!response.ok) {
      let message = `服务器请求失败（${response.status}）`;
      try { message = (await response.json()).error || message; } catch {}
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? {} : response.json();
  }

  function sendStreamRequest(url, headers, stream) {
    return new Promise((resolve, reject) => {
      const request = net.request({ url, method: 'POST', redirect: 'error' });
      let settled = false;
      const fail = error => {
        if (settled) return;
        settled = true;
        request.abort();
        reject(error);
      };
      request.on('error', fail);
      stream.on('error', fail);
      request.on('response', response => {
        const chunks = [];
        response.on('data', chunk => {
          chunks.push(chunk);
        });
        response.on('error', fail);
        response.on('end', () => {
          if (settled) return;
          let body;
          try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
          catch { fail(new Error('服务器返回了无效响应')); return; }
          if (response.statusCode < 200 || response.statusCode >= 300) { fail(new Error(body.error || `上传失败（${response.statusCode}）`)); return; }
          settled = true;
          resolve(body);
        });
      });
      for (const [name, value] of Object.entries(headers)) request.setHeader(name, value);
      stream.pipe(request);
    });
  }

  async function requireConnection() {
    const connection = await readConnection();
    if (!connection) throw new Error('尚未连接团队素材库');
    return connection;
  }

  async function connect({ baseUrl, username, password, libraryId }) {
    const origin = normalizedBaseUrl(baseUrl);
    const response = await net.fetch(`${origin}/v1/session`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }), signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `登录失败（${response.status}）`);
    const chosen = body.libraries?.find(item => item.id === libraryId) || body.libraries?.[0];
    if (!chosen) throw new Error('此账号尚未加入团队素材库，请联系管理员');
    const connection = { baseUrl: origin, libraryId: chosen.id, token: body.token, username: body.user?.username || username };
    await saveConnection(connection);
    return { connected: true, username: connection.username, library: chosen, libraries: body.libraries };
  }

  async function status() {
    const connection = await readConnection();
    if (!connection) return { connected: false };
    try {
      const [user, libraries] = await Promise.all([
        request(connection, '/v1/me', { signal: AbortSignal.timeout(5_000) }),
        request(connection, '/v1/libraries', { signal: AbortSignal.timeout(5_000) }),
      ]);
      const library = libraries.libraries.find(item => item.id === connection.libraryId);
      if (!library) return { connected: true, online: false, username: connection.username, serverUrl: connection.baseUrl, error: '账号已无法访问当前素材库' };
      return { connected: true, online: true, username: user.displayName || user.username, serverUrl: connection.baseUrl, library, libraries: libraries.libraries };
    } catch (error) {
      return { connected: true, online: false, needsLogin: error.status === 401 || error.status === 403, username: connection.username, serverUrl: connection.baseUrl, error: error.message };
    }
  }

  ipcMain.handle('team-library:status', status);
  ipcMain.handle('team-library:connect', (_event, input) => connect(input || {}));
  ipcMain.handle('team-library:select', async (_event, libraryId) => {
    const connection = await requireConnection();
    const libraries = await request(connection, '/v1/libraries');
    const chosen = libraries.libraries.find(item => item.id === libraryId);
    if (!chosen) throw new Error('你没有访问此团队素材库的权限');
    await saveConnection({ ...connection, libraryId: chosen.id });
    return chosen;
  });
  ipcMain.handle('team-library:disconnect', async () => {
    const connection = await readConnection();
    try {
      if (connection) await request(connection, '/v1/session', { method: 'DELETE', signal: AbortSignal.timeout(5000) });
    } catch {}
    cachedConnection = null;
    await fs.promises.rm(connectionFile(), { force: true });
    return { connected: false };
  });
  ipcMain.handle('team-library:folders', async () => {
    const c = await requireConnection();
    return request(c, `/v1/libraries/${c.libraryId}/folders`);
  });
  ipcMain.handle('team-library:assets', async (_event, input = {}) => {
    const c = await requireConnection(), query = new URLSearchParams();
    for (const key of ['folderId', 'limit', 'cursor', 'q']) if (input[key] != null && input[key] !== '') query.set(key, String(input[key]));
    return request(c, `/v1/libraries/${c.libraryId}/assets?${query}`);
  });
  ipcMain.handle('team-library:changes', async (_event, after = '0') => {
    const c = await requireConnection();
    return request(c, `/v1/libraries/${c.libraryId}/changes?after=${encodeURIComponent(String(after))}`);
  });
  ipcMain.handle('team-library:create-folder', async (_event, input = {}) => {
    const c = await requireConnection();
    return request(c, `/v1/libraries/${c.libraryId}/folders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  });
  ipcMain.handle('team-library:update-folder', async (_event, id, input = {}) => {
    const c = await requireConnection();
    return request(c, `/v1/libraries/${c.libraryId}/folders/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  });
  ipcMain.handle('team-library:delete-folder', async (_event, id) => {
    const c = await requireConnection();
    return request(c, `/v1/libraries/${c.libraryId}/folders/${encodeURIComponent(id)}`, { method: 'DELETE' });
  });
  ipcMain.handle('team-library:update-asset', async (_event, id, input = {}) => {
    const c = await requireConnection();
    return request(c, `/v1/libraries/${c.libraryId}/assets/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  });
  ipcMain.handle('team-library:delete-asset', async (_event, id) => {
    const c = await requireConnection();
    return request(c, `/v1/libraries/${c.libraryId}/assets/${encodeURIComponent(id)}`, { method: 'DELETE' });
  });
  ipcMain.handle('team-library:restore', async (_event, kind, id) => {
    const c = await requireConnection();
    return request(c, `/v1/libraries/${c.libraryId}/trash/restore/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`, { method: 'POST' });
  });
  ipcMain.handle('team-library:trash', async () => {
    const c = await requireConnection();
    return request(c, `/v1/libraries/${c.libraryId}/trash`);
  });
  ipcMain.handle('team-library:put-thumbnail', async (_event, id, data) => {
    const c = await requireConnection();
    const bytes = data instanceof ArrayBuffer ? Buffer.from(data) : ArrayBuffer.isView(data) ? Buffer.from(data.buffer, data.byteOffset, data.byteLength) : null;
    if (!bytes || !bytes.length) throw new Error('缩略图内容为空');
    if (bytes.length > 2 * 1024 * 1024) throw new Error('缩略图超过 2MB');
    return request(c, `/v1/libraries/${c.libraryId}/assets/${encodeURIComponent(id)}/thumbnail`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes });
  });
  ipcMain.handle('team-library:purge', async (_event, kind, id) => {
    const c = await requireConnection();
    return request(c, `/v1/libraries/${c.libraryId}/trash/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  });
  ipcMain.handle('team-library:empty-trash', async () => {
    const c = await requireConnection();
    return request(c, `/v1/libraries/${c.libraryId}/trash`, { method: 'DELETE' });
  });
  ipcMain.handle('team-library:members', async () => {
    const c = await requireConnection();
    return request(c, `/v1/libraries/${c.libraryId}/members`);
  });
  ipcMain.handle('team-library:add-member', async (_event, input = {}) => {
    const c = await requireConnection();
    return request(c, `/v1/libraries/${c.libraryId}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  });
  ipcMain.handle('team-library:remove-member', async (_event, id) => {
    const c = await requireConnection();
    return request(c, `/v1/libraries/${c.libraryId}/members/${encodeURIComponent(id)}`, { method: 'DELETE' });
  });
  ipcMain.handle('team-library:pick-files', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('team-library:upload', async (event, input = {}) => {
    const c = await requireConnection(), filePaths = Array.isArray(input.filePaths) ? input.filePaths : [];
    const results = [];
    for (let index = 0; index < filePaths.length; index += 1) {
      const filePath = filePaths[index];
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) continue;
      const filename = path.basename(filePath);
      let sent = 0, lastProgressAt = 0;
      if (!event.sender.isDestroyed()) event.sender.send('team-library:upload-progress', { name: filename, fileIndex: index + 1, fileCount: filePaths.length, sent, total: stat.size });
      const fileStream = fs.createReadStream(filePath).pipe(new Transform({ transform(chunk, _encoding, callback) {
        sent += chunk.length;
        const now = Date.now();
        if (!event.sender.isDestroyed() && (now - lastProgressAt >= 250 || sent >= stat.size)) {
          lastProgressAt = now;
          event.sender.send('team-library:upload-progress', { name: filename, fileIndex: index + 1, fileCount: filePaths.length, sent, total: stat.size });
        }
        callback(null, chunk);
      } }));
      const headers = {
        Authorization: `Bearer ${c.token}`,
        'X-Asset-Size': String(stat.size),
        'X-File-Name': Buffer.from(filename, 'utf8').toString('base64url'),
        'X-Asset-Metadata': Buffer.from('{}').toString('base64url'),
        'X-Request-Id': crypto.randomUUID(),
      };
      if (input.folderId) headers['X-Folder-Id'] = input.folderId;
      const body = await sendStreamRequest(`${c.baseUrl}/v1/libraries/${c.libraryId}/uploads`, headers, fileStream);
      results.push(body.asset);
      if (!event.sender.isDestroyed()) event.sender.send('team-library:upload-progress', { name: filename, fileIndex: index + 1, fileCount: filePaths.length, sent: stat.size, total: stat.size });
    }
    if (!event.sender.isDestroyed()) event.sender.send('team-library:upload-progress', null);
    return { assets: results };
  });
  ipcMain.handle('team-library:download', async (_event, input = {}) => {
    const c = await requireConnection(), name = path.basename(String(input.name || '素材'));
    const choice = await dialog.showSaveDialog({ defaultPath: name });
    if (choice.canceled || !choice.filePath) return { canceled: true };
    const response = await net.fetch(`${c.baseUrl}/v1/libraries/${c.libraryId}/assets/${encodeURIComponent(input.id)}/content`, {
      headers: { Authorization: `Bearer ${c.token}` },
    });
    if (!response.ok || !response.body) {
      let message = `下载失败（${response.status}）`;
      try { message = (await response.json()).error || message; } catch {}
      throw new Error(message);
    }
    try { await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(choice.filePath, { flags: 'w' })); }
    catch (error) { await fs.promises.rm(choice.filePath, { force: true }).catch(() => {}); throw error; }
    return { filePath: choice.filePath };
  });

  app.whenReady().then(() => protocol.handle('teamasset', async request => {
      try {
        const url = new URL(request.url), connection = await requireConnection();
        const assetId = url.pathname.split('/').filter(Boolean)[0];
        if (url.hostname !== connection.libraryId || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(assetId || '')) return new Response('Not found', { status: 404 });
        const headers = { Authorization: `Bearer ${connection.token}` };
        const range = request.headers.get('range');
        if (range) headers.Range = range;
        const wantsThumbnail = url.searchParams.has('thumb');
        const upstream = await net.fetch(`${connection.baseUrl}/v1/libraries/${connection.libraryId}/assets/${assetId}/${wantsThumbnail ? 'thumbnail' : 'content'}`, { headers, signal: request.signal });
        const responseHeaders = new Headers({ 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' });
        for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-disposition', 'cache-control', 'etag']) {
          const value = upstream.headers.get(name);
          if (value) responseHeaders.set(name, value);
        }
        return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
      } catch (error) {
        return new Response(error.message || 'Unable to load team asset', { status: 502 });
      }
    })).catch(error => console.error('[team-library] media protocol failed to register:', error.message));
}

module.exports = { registerTeamLibraryRuntime };
