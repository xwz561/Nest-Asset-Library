const test = require('node:test');
const assert = require('node:assert/strict');
const { validateManifest } = require('../electron/plugin-registry.cjs');
const { runMcpTool } = require('../electron/mcp-tools.cjs');

test('plugin manifests reject arbitrary filesystem permissions', () => {
  assert.match(validateManifest({ id: 'unsafe.plugin', name: 'Unsafe', version: '1.0.0', permissions: ['filesystem.full'] }).error, /不支持/);
  assert.match(validateManifest({ id: 'legacy.collection-plugin', name: 'Legacy', version: '1.0.0', permissions: ['collections.read'] }).error, /不支持/);
});

test('MCP tools enforce declared permissions', () => {
  const data = { assets: [{ id: 'a', name: 'Hero', tags: [] }], folders: [] };
  assert.match(runMcpTool(data, 'library_search_assets', { query: 'hero' }, []).error, /缺少权限/);
  assert.equal(runMcpTool(data, 'library_search_assets', { query: 'hero' }, ['library.read']).assets.length, 1);
});

test('MCP exposes only read-only real library tools', () => {
  const data = { assets: [{ id: 'a', name: 'Hero', folderId: 'physical' }], folders: [{ id: 'physical', name: '实拍素材', parentId: null }] };
  assert.deepEqual(runMcpTool(data, 'library_list_folders', {}, ['library.read']).folders, [{ id: 'physical', name: '实拍素材', parentId: null }]);
  assert.match(runMcpTool(data, 'library_create_collection', { name: 'AI 选片' }, ['library.read']).error, /未知/);
});
