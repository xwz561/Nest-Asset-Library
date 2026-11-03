import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants, createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { authenticate, bootstrap, createUser, login, normalizeUsername, revokeSession } from './auth.mjs';
import { createDatabase, initializeDatabase, transaction } from './database.mjs';
import { loadConfig } from './config.mjs';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const UUID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const changes = new EventEmitter();
changes.setMaxListeners(0);
const loginAttempts = new Map();
const MIME = new Map([
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'], ['.gif', 'image/gif'], ['.webp', 'image/webp'], ['.avif', 'image/avif'],
  ['.mp4', 'video/mp4'], ['.mov', 'video/quicktime'], ['.m4v', 'video/mp4'], ['.webm', 'video/webm'],
  ['.mp3', 'audio/mpeg'], ['.wav', 'audio/wav'], ['.flac', 'audio/flac'], ['.m4a', 'audio/mp4'],
  ['.pdf', 'application/pdf'], ['.txt', 'text/plain'], ['.md', 'text/markdown'], ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.svg', 'image/svg+xml'], ['.bmp', 'image/bmp'], ['.ico', 'image/x-icon'], ['.tif', 'image/tiff'], ['.tiff', 'image/tiff'],
  ['.ogg', 'audio/ogg'], ['.oga', 'audio/ogg'], ['.opus', 'audio/ogg'], ['.aac', 'audio/aac'], ['.aif', 'audio/aiff'], ['.aiff', 'audio/aiff'],
  ['.mkv', 'video/x-matroska'], ['.avi', 'video/x-msvideo'], ['.json', 'application/json'], ['.csv', 'text/csv'], ['.zip', 'application/zip'],
]);

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(response, status, value, headers = {}) {
  const body = JSON.stringify(value);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body), ...headers });
  response.end(body);
}

async function readJson(request, maxBytes = 1024 * 1024) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new HttpError(413, '请求内容过大');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw new HttpError(400, 'JSON 请求格式无效'); }
}

function requireId(value, label = '编号') {
  if (!UUID.test(String(value || ''))) throw new HttpError(400, `${label}无效`);
  return String(value);
}

function decodeHeader(value, fallback = '') {
  try { return Buffer.from(String(value || ''), 'base64url').toString('utf8'); }
  catch { return fallback; }
}

function safeDisplayName(value) {
  const name = String(value || '').normalize('NFC').replace(/[\u0000-\u001f\/:*?"<>|]/g, '_').trim().slice(0, 240);
  if (!name || name === '.' || name === '..') throw new HttpError(400, '文件名无效');
  return name;
}

function encodeHeaderFilename(value) {
  return encodeURIComponent(value).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function publicFolder(row) {
  return { id: row.id, name: row.name, parentId: row.parent_id, createdAt: new Date(row.created_at).getTime(), modifiedAt: new Date(row.updated_at).getTime() };
}

function publicAsset(row) {
  return {
    ...(row.metadata || {}), id: row.id, name: row.display_name, file: row.storage_key, folderId: row.folder_id,
    size: Number(row.byte_size), type: row.content_type, sha256: row.sha256,
    hasThumbnail: Boolean(row.thumbnail_key), thumbnailVersion: row.thumbnail_at ? new Date(row.thumbnail_at).getTime() : 0,
    createdAt: new Date(row.created_at).getTime(), modifiedAt: new Date(row.updated_at).getTime(),
  };
}

async function recordChange(client, libraryId, actorId, kind, objectId, payload = {}) {
  const updated = await client.query('UPDATE libraries SET revision=revision+1 WHERE id=$1 AND deleted_at IS NULL RETURNING revision', [libraryId]);
  if (!updated.rowCount) throw new HttpError(404, '团队素材库不存在');
  const revision = String(updated.rows[0].revision);
  await client.query('INSERT INTO library_changes(library_id,revision,actor_id,kind,object_id,payload) VALUES($1,$2,$3,$4,$5,$6)', [libraryId, revision, actorId, kind, objectId, payload]);
  return { libraryId, revision, kind, objectId, payload };
}

async function lockLibrary(client, libraryId) {
  const locked = await client.query('SELECT id FROM libraries WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [libraryId]);
  if (!locked.rowCount) throw new HttpError(404, '团队素材库不存在');
}

async function membership(pool, user, libraryId, minimum = 'editor') {
  const result = await pool.query(
    `SELECT l.id,l.name,l.root_path,l.owner_id,l.revision,m.role
       FROM libraries l JOIN memberships m ON m.library_id=l.id
      WHERE l.id=$1 AND m.user_id=$2 AND l.deleted_at IS NULL`,
    [libraryId, user.id],
  );
  const library = result.rows[0];
  if (!library) throw new HttpError(403, '你没有访问此团队素材库的权限');
  if (minimum === 'admin' && library.role !== 'admin') throw new HttpError(403, '只有团队素材库管理员可以执行此操作');
  return library;
}

async function requireUser(pool, request) {
  const user = await authenticate(pool, request);
  if (!user) throw new HttpError(401, '登录已过期，请重新登录');
  return user;
}

function storagePath(library, key) {
  const parts = String(key || '').split('/');
  if (parts.length !== 3 || parts[0] !== 'objects' || !/^[\da-f]{2}$/.test(parts[1]) || !UUID.test(parts[2])) throw new HttpError(400, '素材存储编号无效');
  const root = path.resolve(library.root_path);
  const target = path.resolve(root, ...parts);
  if (!target.startsWith(root + path.sep)) throw new HttpError(400, '素材路径越界');
  return target;
}

const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
const THUMBNAIL_TYPES = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']]);

function thumbnailPath(library, key) {
  const parts = String(key || '').split('/');
  if (parts.length !== 3 || parts[0] !== 'thumbs' || !/^[\da-f]{2}$/.test(parts[1]) || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\.(?:jpg|png|webp)$/i.test(parts[2])) throw new HttpError(400, '缩略图存储编号无效');
  const root = path.resolve(library.root_path);
  const target = path.resolve(root, ...parts);
  if (!target.startsWith(root + path.sep)) throw new HttpError(400, '缩略图路径越界');
  return target;
}

function thumbnailType(buffer) {
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length > 12 && buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return '';
}

async function readBody(request, maxBytes) {
  const chunks = [];
  let bytes = 0;
  // 超限时继续把剩余内容读掉（最多再读 64MB）再返回 413，避免直接断开连接让客户端只看到“连接被重置”
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes <= maxBytes) chunks.push(chunk);
    else if (bytes > maxBytes + 64 * 1024 * 1024) { request.destroy(); throw new HttpError(413, '缩略图过大'); }
  }
  if (bytes > maxBytes) throw new HttpError(413, '缩略图过大');
  return Buffer.concat(chunks);
}

// 永久删除一批素材/文件夹对应的 NAS 文件（数据库记录已在事务里删除；文件删除失败只记日志，不影响结果）
async function removeStoredFiles(library, assetRows) {
  let freed = 0;
  for (const row of assetRows) {
    try { await fs.rm(storagePath(library, row.storage_key), { force: true }); freed += Number(row.byte_size) || 0; }
    catch (error) { console.warn('[team-library] 无法删除素材文件', row.id, error.message); }
    if (row.thumbnail_key) {
      try { await fs.rm(thumbnailPath(library, row.thumbnail_key), { force: true }); }
      catch (error) { console.warn('[team-library] 无法删除缩略图', row.id, error.message); }
    }
  }
  return freed;
}

function cursorEncode(row) {
  const time = row.cursor_time || new Date(row.created_at).toISOString();
  return Buffer.from(JSON.stringify({ time, id: row.id })).toString('base64url');
}

function cursorDecode(value) {
  if (!value) return null;
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!UUID.test(cursor.id) || !Number.isFinite(Date.parse(cursor.time))) throw new Error();
    return cursor;
  } catch { throw new HttpError(400, '分页游标无效'); }
}

function emitChange(change) {
  changes.emit(change.libraryId, change);
}

async function waitForChanges(pool, libraryId, afterRevision, response, request) {
  const select = () => pool.query(
    `SELECT revision,kind,object_id,payload,created_at FROM library_changes
      WHERE library_id=$1 AND revision>$2 ORDER BY revision LIMIT 250`,
    [libraryId, afterRevision],
  );
  let result = await select();
  if (result.rows.length) return result.rows.map(row => ({ revision: String(row.revision), kind: row.kind, objectId: row.object_id, payload: row.payload, createdAt: new Date(row.created_at).getTime() }));
  await new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      changes.removeListener(libraryId, finish);
      response.removeListener('close', finish);
      resolve();
    };
    const timer = setTimeout(finish, 20_000);
    timer.unref?.();
    changes.once(libraryId, finish);
    response.once('close', finish);
    // Close the race where a write commits between the first query and listener registration.
    select().then(next => { if (next.rows.length) finish(); }).catch(finish);
  });
  if (response.destroyed) return [];
  result = await select();
  return result.rows.map(row => ({ revision: String(row.revision), kind: row.kind, objectId: row.object_id, payload: row.payload, createdAt: new Date(row.created_at).getTime() }));
}

function getLoginRateLimit(request) {
  const ip = String(request.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
  const record = loginAttempts.get(ip) || { count: 0, until: 0 };
  if (Date.now() > record.until) { record.count = 0; record.until = Date.now() + 5 * 60_000; }
  if (record.count >= 20) throw new HttpError(429, '登录尝试过多，请五分钟后再试');
  record.count += 1;
  loginAttempts.set(ip, record);
  return ip;
}

async function ensureBootstrap(pool, config) {
  const initial = await bootstrap(pool, config);
  if (initial) console.info(`Created the first team library and administrator account: ${initial.username}`);
  const rows = await pool.query('SELECT root_path FROM libraries WHERE deleted_at IS NULL');
  await fs.mkdir(config.root, { recursive: true });
  for (const row of rows.rows) {
    await fs.mkdir(path.join(row.root_path, '.staging'), { recursive: true });
    await fs.mkdir(path.join(row.root_path, 'objects'), { recursive: true });
    await fs.mkdir(path.join(row.root_path, '.trash'), { recursive: true });
  }
}

async function createApplicationServer(config, pool) {
  const handle = async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://team-library.local');
      const parts = url.pathname.split('/').filter(Boolean).map(part => decodeURIComponent(part));
      if (request.method === 'GET' && url.pathname === '/healthz') {
        await pool.query('SELECT 1');
        try { await fs.access(config.root, fsConstants.R_OK | fsConstants.W_OK); }
        catch { return json(response, 503, { ok: false, service: 'nest-team-library', database: true, storage: false }); }
        return json(response, 200, { ok: true, service: 'nest-team-library', database: true, storage: true });
      }
      if (request.method === 'POST' && url.pathname === '/v1/session') {
        const ip = getLoginRateLimit(request);
        try {
          const body = await readJson(request, 16 * 1024);
          const session = await login(pool, body.username, body.password);
          loginAttempts.delete(ip);
          const libraries = await pool.query(
            `SELECT l.id,l.name,l.revision,l.owner_id,m.role FROM libraries l JOIN memberships m ON m.library_id=l.id
              WHERE m.user_id=$1 AND l.deleted_at IS NULL ORDER BY l.created_at`,
            [session.user.id],
          );
          return json(response, 200, { ...session, libraries: libraries.rows.map(row => ({ id: row.id, name: row.name, ownerId: row.owner_id, revision: String(row.revision), role: row.role })) });
        } catch (error) {
          if (error instanceof HttpError) throw error;
          throw new HttpError(401, '账号或密码错误');
        }
      }

      const user = await requireUser(pool, request);
      if (request.method === 'DELETE' && url.pathname === '/v1/session') {
        await revokeSession(pool, request);
        return json(response, 200, { ok: true });
      }
      if (request.method === 'GET' && url.pathname === '/v1/me') return json(response, 200, { id: user.id, username: user.username, displayName: user.displayName });
      if (request.method === 'GET' && url.pathname === '/v1/libraries') {
        const rows = await pool.query(
          `SELECT l.id,l.name,l.revision,l.owner_id,m.role FROM libraries l JOIN memberships m ON m.library_id=l.id
            WHERE m.user_id=$1 AND l.deleted_at IS NULL ORDER BY l.created_at`,
          [user.id],
        );
        return json(response, 200, { libraries: rows.rows.map(row => ({ id: row.id, name: row.name, ownerId: row.owner_id, revision: String(row.revision), role: row.role })) });
      }
      if (request.method === 'POST' && url.pathname === '/v1/libraries') {
        const admin = await pool.query('SELECT 1 FROM memberships WHERE user_id=$1 AND role=\'admin\' LIMIT 1', [user.id]);
        if (!admin.rowCount) throw new HttpError(403, '只有素材库管理员可以新建团队素材库');
        const body = await readJson(request);
        const name = String(body.name || '').trim().slice(0, 100);
        if (!name) throw new HttpError(400, '素材库名称不能为空');
        const id = randomUUID(), rootPath = path.join(config.root, id);
        await fs.mkdir(path.join(rootPath, '.staging'), { recursive: true });
        await fs.mkdir(path.join(rootPath, 'objects'), { recursive: true });
        await fs.mkdir(path.join(rootPath, '.trash'), { recursive: true });
        await transaction(pool, async client => {
          await client.query('INSERT INTO libraries(id,name,root_path,owner_id) VALUES($1,$2,$3,$4)', [id, name, rootPath, user.id]);
          await client.query('INSERT INTO memberships(library_id,user_id,role) VALUES($1,$2,$3)', [id, user.id, 'admin']);
          await recordChange(client, id, user.id, 'library.created', id, { name });
        });
        emitChange({ libraryId: id });
        return json(response, 201, { id, name, role: 'admin', revision: '1' });
      }

      if (parts[0] !== 'v1' || parts[1] !== 'libraries' || !parts[2]) throw new HttpError(404, '接口不存在');
      const libraryId = requireId(parts[2], '素材库编号');
      const requiredRole = request.method === 'GET' ? 'viewer' : 'editor';
      const library = await membership(pool, user, libraryId, requiredRole);
      const resource = parts[3] || '';

      if (request.method === 'GET' && !resource) {
        return json(response, 200, { id: library.id, name: library.name, ownerId: library.owner_id, revision: String(library.revision), role: library.role });
      }
      if (request.method === 'GET' && resource === 'folders') {
        const result = await pool.query('SELECT * FROM folders WHERE library_id=$1 AND deleted_at IS NULL ORDER BY name_key,id', [libraryId]);
        return json(response, 200, { folders: result.rows.map(publicFolder), revision: String(library.revision) });
      }
      if (request.method === 'GET' && resource === 'changes') {
        const after = String(url.searchParams.get('after') || '0');
        if (!/^\d{1,20}$/.test(after) || BigInt(after) > 9223372036854775807n) throw new HttpError(400, '变更游标无效');
        const results = await waitForChanges(pool, libraryId, after, response, request);
        if (response.destroyed) return;
        const current = await pool.query('SELECT revision FROM libraries WHERE id=$1', [libraryId]);
        return json(response, 200, { changes: results, revision: String(current.rows[0]?.revision || after) });
      }
      if (request.method === 'GET' && resource === 'assets' && !parts[4]) {
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 100)));
        if (!Number.isInteger(limit)) throw new HttpError(400, '分页数量无效');
        const folderIdParam = url.searchParams.get('folderId');
        let where = 'library_id=$1 AND deleted_at IS NULL', values = [libraryId];
        if (folderIdParam === 'root') { where += ' AND folder_id IS NULL'; }
        else if (folderIdParam && folderIdParam !== 'all') { values.push(requireId(folderIdParam, '文件夹编号')); where += ` AND folder_id=$${values.length}`; }
        const query = String(url.searchParams.get('q') || '').trim().slice(0, 200);
        if (query) { values.push(`%${query.replace(/[\\%_]/g, '\\$&')}%`); where += ` AND display_name ILIKE $${values.length} ESCAPE '\\'`; }
        const cursor = cursorDecode(url.searchParams.get('cursor'));
        if (cursor) { values.push(cursor.time, cursor.id); where += ` AND (created_at,id)<($${values.length - 1},$${values.length}::uuid)`; }
        values.push(limit + 1);
        const result = await pool.query(`SELECT *,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time FROM assets WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT $${values.length}`, values);
        const hasMore = result.rows.length > limit, rows = result.rows.slice(0, limit);
        return json(response, 200, { assets: rows.map(publicAsset), nextCursor: hasMore ? cursorEncode(rows.at(-1)) : null, revision: String(library.revision) });
      }
      if (request.method === 'PATCH' && resource === 'assets' && parts[4]) {
        const assetId = requireId(parts[4], '素材编号'), body = await readJson(request, 256 * 1024);
        let change;
        const asset = await transaction(pool, async client => {
          await lockLibrary(client, libraryId);
          const current = await client.query('SELECT * FROM assets WHERE id=$1 AND library_id=$2 AND deleted_at IS NULL FOR UPDATE', [assetId, libraryId]);
          if (!current.rowCount) throw new HttpError(404, '素材不存在或已删除');
          const currentAsset = current.rows[0];
          const displayName = Object.hasOwn(body, 'name') ? safeDisplayName(body.name) : currentAsset.display_name;
          const folderId = Object.hasOwn(body, 'folderId') ? (body.folderId ? requireId(body.folderId, '文件夹编号') : null) : currentAsset.folder_id;
          if (folderId) {
            const folder = await client.query('SELECT id FROM folders WHERE id=$1 AND library_id=$2 AND deleted_at IS NULL FOR UPDATE', [folderId, libraryId]);
            if (!folder.rowCount) throw new HttpError(409, '目标文件夹不存在或已删除');
          }
          const updated = await client.query('UPDATE assets SET display_name=$3,folder_id=$4,updated_at=now() WHERE id=$1 AND library_id=$2 RETURNING *', [assetId, libraryId, displayName, folderId]);
          change = await recordChange(client, libraryId, user.id, 'asset.updated', assetId, { asset: publicAsset(updated.rows[0]) });
          return updated.rows[0];
        });
        emitChange(change);
        return json(response, 200, { asset: publicAsset(asset), revision: change.revision });
      }
      if (request.method === 'DELETE' && resource === 'assets' && parts[4]) {
        const assetId = requireId(parts[4], '素材编号');
        let change;
        await transaction(pool, async client => {
          await lockLibrary(client, libraryId);
          const removed = await client.query('UPDATE assets SET deleted_at=now(),updated_at=now() WHERE id=$1 AND library_id=$2 AND deleted_at IS NULL RETURNING id,display_name', [assetId, libraryId]);
          if (!removed.rowCount) throw new HttpError(404, '素材不存在或已删除');
          change = await recordChange(client, libraryId, user.id, 'asset.deleted', assetId, { name: removed.rows[0].display_name });
        });
        emitChange(change);
        return json(response, 200, { ok: true, revision: change.revision });
      }
      if (request.method === 'GET' && resource === 'members') {
        const result = await pool.query(
          `SELECT u.id,u.username,u.display_name,m.role,m.created_at
             FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.library_id=$1 ORDER BY u.display_name`,
          [libraryId],
        );
        return json(response, 200, { members: result.rows.map(row => ({ id: row.id, username: row.username, name: row.display_name, role: row.role, createdAt: new Date(row.created_at).getTime() })) });
      }
      if (request.method === 'POST' && resource === 'members') {
        await membership(pool, user, libraryId, 'admin');
        const body = await readJson(request, 32 * 1024);
        let normalized;
        try { normalized = normalizeUsername(body.username); }
        catch (error) { throw new HttpError(400, error.message); }
        let change;
        const member = await transaction(pool, async client => {
          await lockLibrary(client, libraryId);
          const role = body.role === 'admin' ? 'admin' : 'editor';
          // 账号已存在（例如曾被移出、或属于另一个素材库）：只把它加入本库，不改它的密码
          const existing = await client.query('SELECT id,username,display_name FROM users WHERE username_key=$1 AND disabled_at IS NULL', [normalized.key]);
          if (existing.rowCount) {
            const row = existing.rows[0];
            const already = await client.query('SELECT 1 FROM memberships WHERE library_id=$1 AND user_id=$2', [libraryId, row.id]);
            if (already.rowCount) throw new HttpError(409, '该账号已在此素材库中');
            await client.query('INSERT INTO memberships(library_id,user_id,role) VALUES($1,$2,$3)', [libraryId, row.id, role]);
            change = await recordChange(client, libraryId, user.id, 'member.created', row.id, { name: row.display_name, role });
            return { id: row.id, username: row.username, display_name: row.display_name, role, existing: true };
          }
          if (String(body.password || '').length < 10 || String(body.password || '').length > 256) throw new HttpError(400, '密码长度需为 10 到 256 个字符');
          const created = await createUser(client, { username: normalized.username, displayName: body.name, password: body.password });
          await client.query('INSERT INTO memberships(library_id,user_id,role) VALUES($1,$2,$3)', [libraryId, created.id, role]);
          change = await recordChange(client, libraryId, user.id, 'member.created', created.id, { name: created.display_name, role });
          return { ...created, role };
        });
        emitChange(change);
        return json(response, 201, { member: { id: member.id, username: member.username, name: member.display_name, role: member.role }, existingAccount: Boolean(member.existing) });
      }
      if (request.method === 'DELETE' && resource === 'members' && parts[4]) {
        await membership(pool, user, libraryId, 'admin');
        const memberId = requireId(parts[4], '成员编号');
        let change;
        await transaction(pool, async client => {
          await lockLibrary(client, libraryId);
          const target = await client.query(
            'SELECT m.user_id,m.role,l.owner_id FROM memberships m JOIN libraries l ON l.id=m.library_id WHERE m.library_id=$1 AND m.user_id=$2 FOR UPDATE',
            [libraryId, memberId],
          );
          if (!target.rowCount) throw new HttpError(404, '成员不存在');
          if (target.rows[0].user_id === target.rows[0].owner_id) throw new HttpError(409, '不能移除素材库所有者');
          if (memberId === user.id) throw new HttpError(409, '不能移除当前登录账号');
          await client.query('DELETE FROM memberships WHERE library_id=$1 AND user_id=$2', [libraryId, memberId]);
          change = await recordChange(client, libraryId, user.id, 'member.deleted', memberId, {});
        });
        emitChange(change);
        return json(response, 200, { ok: true, revision: change.revision });
      }
      if (request.method === 'POST' && resource === 'folders') {
        const body = await readJson(request, 32 * 1024);
        const name = String(body.name || '').normalize('NFC').trim().slice(0, 120);
        if (!name || /[\u0000-\u001f\\/:*?"<>|]/.test(name)) throw new HttpError(400, '文件夹名称无效');
        const parentId = body.parentId ? requireId(body.parentId, '父文件夹编号') : null;
        const id = randomUUID();
        let change;
        const folder = await transaction(pool, async client => {
          await lockLibrary(client, libraryId);
          if (parentId) {
            const parent = await client.query('SELECT id FROM folders WHERE id=$1 AND library_id=$2 AND deleted_at IS NULL FOR UPDATE', [parentId, libraryId]);
            if (!parent.rowCount) throw new HttpError(409, '父文件夹不存在或已删除');
          }
          const created = await client.query('INSERT INTO folders(id,library_id,parent_id,name,name_key,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [id, libraryId, parentId, name, name.toLocaleLowerCase('zh-CN'), user.id]);
          change = await recordChange(client, libraryId, user.id, 'folder.created', id, { folder: publicFolder(created.rows[0]) });
          return created.rows[0];
        });
        emitChange(change);
        return json(response, 201, { folder: publicFolder(folder), revision: change.revision });
      }
      if (request.method === 'PATCH' && resource === 'folders' && parts[4]) {
        const folderId = requireId(parts[4], '文件夹编号'), body = await readJson(request, 32 * 1024);
        let change;
        const folder = await transaction(pool, async client => {
          await lockLibrary(client, libraryId);
          const current = await client.query('SELECT * FROM folders WHERE id=$1 AND library_id=$2 AND deleted_at IS NULL FOR UPDATE', [folderId, libraryId]);
          if (!current.rowCount) throw new HttpError(404, '文件夹不存在或已删除');
          const name = Object.hasOwn(body, 'name')
            ? String(body.name || '').normalize('NFC').trim().slice(0, 120)
            : current.rows[0].name;
          if (!name || /[\u0000-\u001f\\/:*?"<>|]/.test(name)) throw new HttpError(400, '文件夹名称无效');
          const parentId = Object.hasOwn(body, 'parentId')
            ? (body.parentId ? requireId(body.parentId, '父文件夹编号') : null)
            : current.rows[0].parent_id;
          if (parentId) {
            const parent = await client.query('SELECT id FROM folders WHERE id=$1 AND library_id=$2 AND deleted_at IS NULL FOR UPDATE', [parentId, libraryId]);
            if (!parent.rowCount) throw new HttpError(409, '目标文件夹不存在或已删除');
            const descendants = await client.query(
              `WITH RECURSIVE tree(id) AS (SELECT id FROM folders WHERE id=$1 AND library_id=$2 AND deleted_at IS NULL UNION ALL SELECT f.id FROM folders f JOIN tree t ON f.parent_id=t.id WHERE f.library_id=$2 AND f.deleted_at IS NULL) SELECT id FROM tree WHERE id=$3`,
              [folderId, libraryId, parentId],
            );
            if (descendants.rowCount) throw new HttpError(409, '文件夹不能移动到自身或子文件夹');
          }
          const updated = await client.query('UPDATE folders SET name=$3,name_key=$4,parent_id=$5,updated_at=now() WHERE id=$1 AND library_id=$2 RETURNING *', [folderId, libraryId, name, name.toLocaleLowerCase('zh-CN'), parentId]);
          change = await recordChange(client, libraryId, user.id, 'folder.updated', folderId, { folder: publicFolder(updated.rows[0]) });
          return updated.rows[0];
        });
        emitChange(change);
        return json(response, 200, { folder: publicFolder(folder), revision: change.revision });
      }
      if (request.method === 'DELETE' && resource === 'folders' && parts[4]) {
        const folderId = requireId(parts[4], '文件夹编号');
        let change;
        const removed = await transaction(pool, async client => {
          await lockLibrary(client, libraryId);
          const tree = await client.query(
            `WITH RECURSIVE branch(id) AS (SELECT id FROM folders WHERE id=$1 AND library_id=$2 AND deleted_at IS NULL UNION ALL SELECT f.id FROM folders f JOIN branch b ON f.parent_id=b.id WHERE f.library_id=$2 AND f.deleted_at IS NULL) SELECT id FROM branch`,
            [folderId, libraryId],
          );
          const ids = tree.rows.map(row => row.id);
          if (!ids.length) throw new HttpError(404, '文件夹不存在或已删除');
          await client.query('UPDATE folders SET deleted_at=now(),updated_at=now() WHERE library_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL', [libraryId, ids]);
          await client.query('UPDATE assets SET deleted_at=now(),updated_at=now() WHERE library_id=$1 AND folder_id=ANY($2::uuid[]) AND deleted_at IS NULL', [libraryId, ids]);
          change = await recordChange(client, libraryId, user.id, 'folder.deleted', folderId, { folderIds: ids });
          return ids;
        });
        emitChange(change);
        return json(response, 200, { ok: true, removedFolders: removed.length, revision: change.revision });
      }
      if (request.method === 'GET' && resource === 'trash') {
        const result = await pool.query(
          `SELECT id,'folder' AS kind,name AS display_name,parent_id AS folder_id,NULL::bigint AS byte_size,deleted_at FROM folders WHERE library_id=$1 AND deleted_at IS NOT NULL
           UNION ALL
           SELECT id,'asset' AS kind,display_name,folder_id,byte_size,deleted_at FROM assets WHERE library_id=$1 AND deleted_at IS NOT NULL
           ORDER BY deleted_at DESC LIMIT 500`,
          [libraryId],
        );
        return json(response, 200, { entries: result.rows.map(row => ({ id: row.id, kind: row.kind, name: row.display_name, parentId: row.folder_id, size: row.byte_size ? Number(row.byte_size) : 0, deletedAt: new Date(row.deleted_at).getTime() })) });
      }
      if (request.method === 'POST' && resource === 'trash' && parts[4] === 'restore' && parts[5]) {
        const kind = parts[5], objectId = requireId(parts[6], '项目编号');
        if (!['folder', 'asset'].includes(kind)) throw new HttpError(400, '回收站项目类型无效');
        let change;
        await transaction(pool, async client => {
          await lockLibrary(client, libraryId);
          if (kind === 'folder') {
            const folder = await client.query('SELECT id,parent_id FROM folders WHERE id=$1 AND library_id=$2 AND deleted_at IS NOT NULL FOR UPDATE', [objectId, libraryId]);
            if (!folder.rowCount) throw new HttpError(404, '回收站中的文件夹不存在');
            if (folder.rows[0].parent_id) {
              const parent = await client.query('SELECT id FROM folders WHERE id=$1 AND library_id=$2 AND deleted_at IS NULL', [folder.rows[0].parent_id, libraryId]);
              if (!parent.rowCount) throw new HttpError(409, '请先恢复父文件夹');
            }
            const branch = await client.query(
              `WITH RECURSIVE tree(id) AS (SELECT id FROM folders WHERE id=$1 AND library_id=$2 UNION ALL SELECT f.id FROM folders f JOIN tree t ON f.parent_id=t.id WHERE f.library_id=$2) SELECT id FROM tree`,
              [objectId, libraryId],
            );
            const ids = branch.rows.map(row => row.id);
            await client.query('UPDATE folders SET deleted_at=NULL,updated_at=now() WHERE library_id=$1 AND id=ANY($2::uuid[])', [libraryId, ids]);
            await client.query('UPDATE assets SET deleted_at=NULL,updated_at=now() WHERE library_id=$1 AND folder_id=ANY($2::uuid[])', [libraryId, ids]);
            change = await recordChange(client, libraryId, user.id, 'folder.restored', objectId, { folderIds: ids });
          } else {
            const restored = await client.query('UPDATE assets SET deleted_at=NULL,updated_at=now() WHERE id=$1 AND library_id=$2 AND deleted_at IS NOT NULL RETURNING id,folder_id', [objectId, libraryId]);
            if (!restored.rowCount) throw new HttpError(404, '回收站中的素材不存在');
            if (restored.rows[0].folder_id) {
              const folder = await client.query('SELECT id FROM folders WHERE id=$1 AND library_id=$2 AND deleted_at IS NULL', [restored.rows[0].folder_id, libraryId]);
              if (!folder.rowCount) throw new HttpError(409, '请先恢复所在文件夹');
            }
            change = await recordChange(client, libraryId, user.id, 'asset.restored', objectId, {});
          }
        });
        emitChange(change);
        return json(response, 200, { ok: true, revision: change.revision });
      }
      if (request.method === 'PUT' && resource === 'assets' && parts[4] && parts[5] === 'thumbnail') {
        const assetId = requireId(parts[4], '素材编号');
        const body = await readBody(request, THUMBNAIL_MAX_BYTES);
        const contentType = thumbnailType(body);
        if (!body.length || !THUMBNAIL_TYPES.has(contentType)) throw new HttpError(400, '缩略图必须是 JPEG、PNG 或 WebP 图片');
        const found = await pool.query('SELECT thumbnail_key FROM assets WHERE id=$1 AND library_id=$2 AND deleted_at IS NULL', [assetId, libraryId]);
        if (!found.rowCount) throw new HttpError(404, '素材不存在或已删除');
        const key = `thumbs/${assetId.slice(0, 2)}/${assetId}.${THUMBNAIL_TYPES.get(contentType)}`;
        const target = thumbnailPath(library, key), staging = path.join(library.root_path, '.staging', `${assetId}.thumb-${randomUUID()}`);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.mkdir(path.dirname(staging), { recursive: true });
        await fs.writeFile(staging, body, { flag: 'wx' });
        let change;
        try {
          await fs.rename(staging, target);
          const asset = await transaction(pool, async client => {
            await lockLibrary(client, libraryId);
            const updated = await client.query('UPDATE assets SET thumbnail_key=$3,thumbnail_at=now() WHERE id=$1 AND library_id=$2 AND deleted_at IS NULL RETURNING *', [assetId, libraryId, key]);
            if (!updated.rowCount) throw new HttpError(404, '素材不存在或已删除');
            change = await recordChange(client, libraryId, user.id, 'asset.updated', assetId, { asset: publicAsset(updated.rows[0]) });
            return updated.rows[0];
          });
          const previous = found.rows[0].thumbnail_key;
          if (previous && previous !== key) await fs.rm(thumbnailPath(library, previous), { force: true }).catch(() => {});
          emitChange(change);
          return json(response, 200, { asset: publicAsset(asset), revision: change.revision });
        } catch (error) {
          await fs.rm(staging, { force: true }).catch(() => {});
          throw error;
        }
      }
      if (request.method === 'GET' && resource === 'assets' && parts[4] && parts[5] === 'thumbnail') {
        const assetId = requireId(parts[4], '素材编号');
        const result = await pool.query('SELECT thumbnail_key,thumbnail_at FROM assets WHERE id=$1 AND library_id=$2 AND deleted_at IS NULL', [assetId, libraryId]);
        const row = result.rows[0];
        if (!row?.thumbnail_key) throw new HttpError(404, '此素材还没有缩略图');
        const filename = thumbnailPath(library, row.thumbnail_key), stat = await fs.stat(filename);
        const etag = `"${assetId}-${new Date(row.thumbnail_at).getTime()}"`;
        const headers = { ETag: etag, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' };
        if (request.headers['if-none-match'] === etag) { response.writeHead(304, headers); return response.end(); }
        const type = row.thumbnail_key.endsWith('.png') ? 'image/png' : row.thumbnail_key.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
        response.writeHead(200, { ...headers, 'Content-Type': type, 'Content-Length': stat.size });
        try { await pipeline(createReadStream(filename), response); }
        catch { if (!response.destroyed) response.destroy(); }
        return;
      }
      if (request.method === 'DELETE' && resource === 'trash') {
        await membership(pool, user, libraryId, 'admin');
        const kind = parts[4] || '', objectId = parts[5] ? requireId(parts[5], '项目编号') : null;
        if (kind && !['folder', 'asset'].includes(kind)) throw new HttpError(400, '回收站项目类型无效');
        if (kind && !objectId) throw new HttpError(400, '项目编号无效');
        let change, removedAssets = [];
        const counts = await transaction(pool, async client => {
          await lockLibrary(client, libraryId);
          let folderIds = [];
          if (!kind) {
            folderIds = (await client.query('SELECT id FROM folders WHERE library_id=$1 AND deleted_at IS NOT NULL', [libraryId])).rows.map(row => row.id);
            removedAssets = (await client.query('SELECT id,storage_key,byte_size,thumbnail_key FROM assets WHERE library_id=$1 AND deleted_at IS NOT NULL', [libraryId])).rows;
          } else if (kind === 'asset') {
            removedAssets = (await client.query('SELECT id,storage_key,byte_size,thumbnail_key FROM assets WHERE id=$1 AND library_id=$2 AND deleted_at IS NOT NULL', [objectId, libraryId])).rows;
            if (!removedAssets.length) throw new HttpError(404, '回收站中的素材不存在');
          } else {
            const branch = await client.query(
              `WITH RECURSIVE tree(id) AS (SELECT id FROM folders WHERE id=$1 AND library_id=$2 AND deleted_at IS NOT NULL UNION ALL SELECT f.id FROM folders f JOIN tree t ON f.parent_id=t.id WHERE f.library_id=$2) SELECT id FROM tree`,
              [objectId, libraryId],
            );
            folderIds = branch.rows.map(row => row.id);
            if (!folderIds.length) throw new HttpError(404, '回收站中的文件夹不存在');
            const active = await client.query('SELECT 1 FROM folders WHERE library_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL LIMIT 1', [libraryId, folderIds]);
            const activeAssets = await client.query('SELECT 1 FROM assets WHERE library_id=$1 AND folder_id=ANY($2::uuid[]) AND deleted_at IS NULL LIMIT 1', [libraryId, folderIds]);
            if (active.rowCount || activeAssets.rowCount) throw new HttpError(409, '该文件夹内还有未删除的内容，不能永久删除');
            removedAssets = (await client.query('SELECT id,storage_key,byte_size,thumbnail_key FROM assets WHERE library_id=$1 AND folder_id=ANY($2::uuid[])', [libraryId, folderIds])).rows;
          }
          if (removedAssets.length) await client.query('DELETE FROM assets WHERE library_id=$1 AND id=ANY($2::uuid[])', [libraryId, removedAssets.map(row => row.id)]);
          if (folderIds.length) await client.query('DELETE FROM folders WHERE library_id=$1 AND id=ANY($2::uuid[])', [libraryId, folderIds]);
          change = await recordChange(client, libraryId, user.id, 'trash.purged', objectId || libraryId, { kind: kind || 'all', assets: removedAssets.length, folders: folderIds.length });
          return { assets: removedAssets.length, folders: folderIds.length };
        });
        const freedBytes = await removeStoredFiles(library, removedAssets);
        emitChange(change);
        return json(response, 200, { ok: true, removedAssets: counts.assets, removedFolders: counts.folders, freedBytes, revision: change.revision });
      }
      if (request.method === 'POST' && resource === 'uploads') {
        const metadataHeader = request.headers['x-asset-metadata'];
        const bodyMetadata = metadataHeader ? decodeHeader(metadataHeader, '{}') : '{}';
        let metadata;
        try { metadata = JSON.parse(bodyMetadata); } catch { throw new HttpError(400, '素材信息格式无效'); }
        if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new HttpError(400, '素材信息格式无效');
        const displayName = safeDisplayName(decodeHeader(request.headers['x-file-name']));
        const folderId = request.headers['x-folder-id'] ? requireId(request.headers['x-folder-id'], '文件夹编号') : null;
        const requestId = request.headers['x-request-id'] ? requireId(request.headers['x-request-id'], '上传请求编号') : null;
        const declaredSize = request.headers['x-asset-size'] ?? request.headers['content-length'];
        const contentLength = declaredSize == null ? null : Number(declaredSize);
        if (contentLength !== null && (!Number.isSafeInteger(contentLength) || contentLength < 0)) throw new HttpError(400, '素材大小声明无效');
        if (contentLength !== null && contentLength > config.maxUploadBytes) throw new HttpError(413, `单个素材最大支持 ${Math.floor(config.maxUploadBytes / 1024 / 1024)} MB`);
        const prior = requestId ? await pool.query('SELECT * FROM assets WHERE library_id=$1 AND created_by=$2 AND client_request_id=$3', [libraryId, user.id, requestId]) : { rows: [] };
        if (prior.rows[0]) {
          request.resume();
          return json(response, 200, { asset: publicAsset(prior.rows[0]), duplicate: true });
        }
        if (folderId) {
          const folder = await pool.query('SELECT id FROM folders WHERE id=$1 AND library_id=$2 AND deleted_at IS NULL', [folderId, libraryId]);
          if (!folder.rowCount) throw new HttpError(409, '目标文件夹不存在或已删除');
        }
        const assetId = randomUUID();
        const stagingRoot = path.join(library.root_path, '.staging');
        await fs.mkdir(stagingRoot, { recursive: true });
        const stagingPath = path.join(stagingRoot, `${assetId}.upload`);
        const hash = createHash('sha256');
        let received = 0;
        const meter = new Transform({ transform(chunk, _encoding, callback) { received += chunk.length; if (received > config.maxUploadBytes) return callback(new HttpError(413, '素材超过大小上限')); hash.update(chunk); callback(null, chunk); } });
        try {
          await pipeline(request, meter, createWriteStream(stagingPath, { flags: 'wx' }));
          if (contentLength !== null && received !== contentLength) throw new HttpError(400, '上传字节数与声明大小不一致');
          const fileHandle = await fs.open(stagingPath, 'r');
          try { await fileHandle.sync(); } finally { await fileHandle.close(); }
          const extension = path.extname(displayName).toLowerCase();
          // The filename extension, not the uploader's arbitrary header, controls preview MIME.
          const contentType = MIME.get(extension) || 'application/octet-stream';
          const storageKey = `objects/${assetId.slice(0, 2)}/${assetId}`;
          const finalPath = storagePath(library, storageKey);
          await fs.mkdir(path.dirname(finalPath), { recursive: true });
          let change;
          const asset = await transaction(pool, async client => {
            await lockLibrary(client, libraryId);
            const freshMembership = await client.query('SELECT 1 FROM memberships WHERE library_id=$1 AND user_id=$2', [libraryId, user.id]);
            if (!freshMembership.rowCount) throw new HttpError(403, '你已被移出此团队素材库');
            if (folderId) {
              const folder = await client.query('SELECT id FROM folders WHERE id=$1 AND library_id=$2 AND deleted_at IS NULL FOR UPDATE', [folderId, libraryId]);
              if (!folder.rowCount) throw new HttpError(409, '上传期间目标文件夹已删除');
            }
            if (requestId) {
              const existing = await client.query('SELECT * FROM assets WHERE library_id=$1 AND created_by=$2 AND client_request_id=$3', [libraryId, user.id, requestId]);
              if (existing.rows[0]) return { existing: existing.rows[0] };
            }
            await fs.rename(stagingPath, finalPath);
            const result = await client.query(
              `INSERT INTO assets(id,library_id,folder_id,storage_key,display_name,byte_size,content_type,sha256,metadata,client_request_id,created_by)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
              [assetId, libraryId, folderId, storageKey, displayName, received, contentType, hash.digest('hex'), metadata, requestId, user.id],
            );
            change = await recordChange(client, libraryId, user.id, 'asset.created', assetId, { asset: publicAsset(result.rows[0]) });
            return { row: result.rows[0] };
          });
          if (asset.existing) { await fs.rm(stagingPath, { force: true }); return json(response, 200, { asset: publicAsset(asset.existing), duplicate: true }); }
          emitChange(change);
          return json(response, 201, { asset: publicAsset(asset.row), revision: change.revision });
        } catch (error) {
          await fs.rm(stagingPath, { force: true }).catch(() => {});
          const possibleFinal = path.join(library.root_path, 'objects', assetId.slice(0, 2), assetId);
          if (await fs.stat(possibleFinal).then(() => true, () => false)) {
            const registered = await pool.query('SELECT 1 FROM assets WHERE id=$1', [assetId]).catch(() => ({ rowCount: 1 }));
            if (!registered.rowCount) await fs.rm(possibleFinal, { force: true }).catch(() => {});
          }
          throw error;
        }
      }
      if (request.method === 'GET' && resource === 'assets' && parts[5] === 'content') {
        const assetId = requireId(parts[4], '素材编号');
        const result = await pool.query('SELECT * FROM assets WHERE id=$1 AND library_id=$2 AND deleted_at IS NULL', [assetId, libraryId]);
        const row = result.rows[0];
        if (!row) throw new HttpError(404, '素材不存在或已删除');
        const filename = storagePath(library, row.storage_key);
        const stat = await fs.stat(filename);
        const range = request.headers.range;
        let start = 0, end = stat.size - 1, status = 200;
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (!match) return json(response, 416, { error: '请求的文件区间无效' }, { 'Content-Range': `bytes */${stat.size}` });
          if (match[1]) {
            start = Number(match[1]);
            end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
          } else if (match[2] && Number(match[2]) > 0) {
            start = Math.max(stat.size - Number(match[2]), 0);
            end = stat.size - 1;
          } else {
            return json(response, 416, { error: '请求的文件区间无效' }, { 'Content-Range': `bytes */${stat.size}` });
          }
          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) return json(response, 416, { error: '请求的文件区间无效' }, { 'Content-Range': `bytes */${stat.size}` });
          status = 206;
        }
        response.writeHead(status, {
          'Content-Type': row.content_type, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes',
          'Content-Disposition': `inline; filename*=UTF-8''${encodeHeaderFilename(row.display_name)}`,
          'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=60',
          // 素材内容只作为数据提供：即使被直接打开也不会执行其中的脚本
          'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
          ...(status === 206 ? { 'Content-Range': `bytes ${start}-${end}/${stat.size}` } : {}),
        });
        try { await pipeline(createReadStream(filename, { start, end }), response); }
        catch { if (!response.destroyed) response.destroy(); }
        return;
      }
      throw new HttpError(404, '接口不存在');
    } catch (error) {
      if (response.headersSent || response.destroyed) { response.destroy(); return; }
      const status = Number.isInteger(error.status) ? error.status : error.code === '23505' || error.code === '23503' ? 409 : error instanceof URIError ? 400 : 500;
      const duplicateMessage = String(error.constraint || '').includes('folders') ? '此位置已有同名文件夹' : String(error.constraint || '').includes('users') ? '账号已存在' : '已存在同名项目';
      const message = error.code === '23503' ? '此项目仍被其他内容引用，无法删除' : error.code === '23505' ? duplicateMessage : status === 500 ? '团队素材库服务发生错误' : error.message;
      if (status === 500) console.error('[team-library]', error);
      json(response, status, { error: message });
    }
  };

  const server = config.certificate
    ? createHttpsServer({ cert: await fs.readFile(config.certificate), key: await fs.readFile(config.privateKey), minVersion: 'TLSv1.2' }, handle)
    : createHttpServer(handle);
  server.requestTimeout = 0;
  server.headersTimeout = 60_000;
  server.keepAliveTimeout = 10_000;
  return server;
}

async function main() {
  const config = loadConfig();
  await fs.mkdir(config.root, { recursive: true });
  const pool = createDatabase(config.databaseUrl);
  await initializeDatabase(pool);
  await ensureBootstrap(pool, config);
  const server = await createApplicationServer(config, pool);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, resolve);
  });
  console.info(`Nest team library service listening on ${config.host}:${config.port}`);
  const shutdown = async () => {
    server.close();
    await pool.end();
    process.exitCode = 0;
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
