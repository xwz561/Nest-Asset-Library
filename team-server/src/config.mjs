import path from 'node:path';

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

export function loadConfig() {
  const host = String(process.env.TEAM_HOST || '127.0.0.1').trim();
  const port = Number(process.env.TEAM_PORT || 43180);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('TEAM_PORT 必须在 1024 到 65535 之间');
  const root = path.resolve(required('TEAM_LIBRARY_ROOT'));
  const databaseUrl = required('TEAM_DATABASE_URL');
  const certificate = process.env.TEAM_TLS_CERT ? path.resolve(process.env.TEAM_TLS_CERT) : '';
  const privateKey = process.env.TEAM_TLS_KEY ? path.resolve(process.env.TEAM_TLS_KEY) : '';
  const lanBound = !['127.0.0.1', '::1', 'localhost'].includes(host.toLowerCase());
  if (Boolean(certificate) !== Boolean(privateKey)) throw new Error('TEAM_TLS_CERT 和 TEAM_TLS_KEY 必须同时设置');
  if (lanBound && !certificate) throw new Error('服务绑定到局域网地址时必须配置 TLS 证书和私钥');
  const maxUploadBytes = Number(process.env.TEAM_MAX_UPLOAD_BYTES || 100 * 1024 * 1024 * 1024);
  if (!Number.isSafeInteger(maxUploadBytes) || maxUploadBytes < 1) throw new Error('TEAM_MAX_UPLOAD_BYTES 无效');
  return {
    host,
    port,
    root,
    databaseUrl,
    certificate,
    privateKey,
    maxUploadBytes,
    bootstrapUsername: String(process.env.TEAM_BOOTSTRAP_USERNAME || '').trim(),
    bootstrapDisplayName: String(process.env.TEAM_BOOTSTRAP_DISPLAY_NAME || '').trim(),
    bootstrapPassword: String(process.env.TEAM_BOOTSTRAP_PASSWORD || ''),
    bootstrapLibraryName: String(process.env.TEAM_BOOTSTRAP_LIBRARY_NAME || '').trim(),
  };
}
