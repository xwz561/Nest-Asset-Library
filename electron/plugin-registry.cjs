const fs = require('node:fs');
const path = require('node:path');

const ALLOWED_PERMISSIONS = new Set(['library.read']);
const PLUGIN_ID = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function validateManifest(input) {
  if (!input || typeof input !== 'object') return { error: 'manifest 必须是对象' };
  const id = String(input.id || '').trim().toLowerCase();
  const name = String(input.name || '').trim().slice(0, 80);
  const version = String(input.version || '').trim().slice(0, 30);
  const permissions = [...new Set(Array.isArray(input.permissions) ? input.permissions.map(String) : [])];
  if (!PLUGIN_ID.test(id)) return { error: '插件 ID 格式无效' };
  if (!name) return { error: '插件名称不能为空' };
  if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version)) return { error: '插件版本必须使用 semver' };
  const unsupported = permissions.filter(permission => !ALLOWED_PERMISSIONS.has(permission));
  if (unsupported.length) return { error: `不支持的插件权限：${unsupported.join(', ')}` };
  return { manifest: { id, name, version, description: String(input.description || '').slice(0, 300), permissions } };
}

function scanPlugins(root, enabledIds = []) {
  if (!root || !fs.existsSync(root)) return [];
  const enabled = new Set(enabledIds);
  return fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => {
    const manifestPath = path.join(root, entry.name, 'manifest.json');
    try {
      const result = validateManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
      return result.error ? { directory: entry.name, valid: false, error: result.error, enabled: false } : { directory: entry.name, valid: true, enabled: enabled.has(result.manifest.id), ...result.manifest };
    } catch (error) {
      return { directory: entry.name, valid: false, error: error.message, enabled: false };
    }
  });
}

module.exports = { ALLOWED_PERMISSIONS, validateManifest, scanPlugins };
