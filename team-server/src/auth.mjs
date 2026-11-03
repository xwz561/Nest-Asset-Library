import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import { transaction } from './database.mjs';

const scrypt = promisify(scryptCallback);
// 会话 14 天滑动续期：每天使用就不会过期，连续 14 天不用才需要重新登录。
const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const RENEW_AFTER_MS = 60 * 60 * 1000;

export function normalizeUsername(value) {
  const username = String(value || '').normalize('NFKC').trim();
  if (!username || username.length > 80 || /[\u0000-\u001f]/.test(username)) throw new Error('账号需为 1 到 80 个字符');
  return { username, key: username.toLocaleLowerCase('zh-CN') };
}

export async function passwordRecord(password) {
  const value = String(password || '');
  if (value.length < 10 || value.length > 256) throw new Error('密码长度需为 10 到 256 个字符');
  const salt = randomBytes(16);
  const hash = await scrypt(value, salt, 64, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return { salt: salt.toString('base64url'), hash: Buffer.from(hash).toString('base64url') };
}

async function passwordMatches(password, salt, expected) {
  const actual = Buffer.from(await scrypt(String(password || ''), Buffer.from(salt, 'base64url'), 64, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }));
  const target = Buffer.from(expected, 'base64url');
  return actual.length === target.length && timingSafeEqual(actual, target);
}

export function tokenDigest(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export async function createUser(client, { username, displayName, password, role = 'editor' }) {
  const normalized = normalizeUsername(username);
  const name = String(displayName || normalized.username).trim().slice(0, 80);
  if (!name) throw new Error('成员名称不能为空');
  const record = await passwordRecord(password);
  const id = randomUUID();
  const result = await client.query(
    `INSERT INTO users(id, username, username_key, display_name, password_salt, password_hash)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING id,username,display_name,created_at`,
    [id, normalized.username, normalized.key, name, record.salt, record.hash],
  );
  return { ...result.rows[0], role };
}

export async function login(pool, username, password) {
  const normalized = normalizeUsername(username);
  const result = await pool.query(
    `SELECT id,username,display_name,password_salt,password_hash FROM users
     WHERE username_key=$1 AND disabled_at IS NULL`,
    [normalized.key],
  );
  const user = result.rows[0];
  if (!user || !(await passwordMatches(password, user.password_salt, user.password_hash))) throw new Error('账号或密码错误');
  pool.query('DELETE FROM sessions WHERE expires_at<now()').catch(() => {});
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await pool.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)', [tokenDigest(token), user.id, expiresAt]);
  return { token, expiresAt: expiresAt.toISOString(), user: { id: user.id, username: user.username, displayName: user.display_name } };
}

export async function authenticate(pool, request) {
  const authorization = String(request.headers.authorization || '');
  const match = /^Bearer ([A-Za-z\d_-]{40,100})$/.exec(authorization);
  if (!match) return null;
  const result = await pool.query(
    `SELECT u.id,u.username,u.display_name,s.expires_at
       FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND u.disabled_at IS NULL`,
    [tokenDigest(match[1])],
  );
  const user = result.rows[0];
  if (!user) return null;
  let expiresAt = user.expires_at;
  if (new Date(expiresAt).getTime() - Date.now() < TOKEN_TTL_MS - RENEW_AFTER_MS) {
    expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    pool.query('UPDATE sessions SET expires_at=$2 WHERE token_hash=$1', [tokenDigest(match[1]), expiresAt]).catch(() => {});
  }
  return { id: user.id, username: user.username, displayName: user.display_name, expiresAt };
}

export async function revokeSession(pool, request) {
  const authorization = String(request.headers.authorization || '');
  const match = /^Bearer ([A-Za-z\d_-]{40,100})$/.exec(authorization);
  if (match) await pool.query('DELETE FROM sessions WHERE token_hash=$1', [tokenDigest(match[1])]);
}

export async function bootstrap(pool, config) {
  const count = await pool.query('SELECT count(*)::int AS count FROM users');
  if (count.rows[0].count > 0) return false;
  if (!config.bootstrapUsername || !config.bootstrapPassword || !config.bootstrapLibraryName) {
    throw new Error('首次启动前请设置 TEAM_BOOTSTRAP_USERNAME、TEAM_BOOTSTRAP_PASSWORD 和 TEAM_BOOTSTRAP_LIBRARY_NAME');
  }
  const { username } = normalizeUsername(config.bootstrapUsername);
  const libraryId = randomUUID();
  const user = await transaction(pool, async client => {
    const created = await createUser(client, { username, displayName: config.bootstrapDisplayName || username, password: config.bootstrapPassword, role: 'admin' });
    await client.query('INSERT INTO libraries(id,name,root_path,owner_id) VALUES($1,$2,$3,$4)', [libraryId, config.bootstrapLibraryName, path.join(config.root, libraryId), created.id]);
    await client.query('INSERT INTO memberships(library_id,user_id,role) VALUES($1,$2,$3)', [libraryId, created.id, 'admin']);
    return created;
  });
  return { id: user.id, libraryId, username: user.username };
}
