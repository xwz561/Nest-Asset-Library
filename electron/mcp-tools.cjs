const TOOL_DEFINITIONS = [
  { name: 'library_search_assets', description: '按名称或标签搜索素材', permission: 'library.read' },
  { name: 'library_list_folders', description: '列出真实文件夹', permission: 'library.read' },
];

function runMcpTool(data, name, args = {}, permissions = []) {
  const definition = TOOL_DEFINITIONS.find(tool => tool.name === name);
  if (!definition) return { error: '未知 MCP 工具' };
  if (!permissions.includes(definition.permission)) return { error: `缺少权限：${definition.permission}` };
  if (name === 'library_search_assets') {
    const query = String(args.query || '').trim().toLowerCase();
    return { assets: (data.assets || []).filter(asset => !query || String(asset.name).toLowerCase().includes(query) || (asset.tags || []).some(tag => String(tag).toLowerCase().includes(query))).slice(0, Math.min(500, Math.max(1, Number(args.limit) || 100))).map(asset => ({ id: asset.id, name: asset.name, type: asset.type, folderId: asset.folderId || null, tags: asset.tags || [] })) };
  }
  if (name === 'library_list_folders') return { folders: (data.folders || []).map(({ id, name, parentId }) => ({ id, name, parentId: parentId || null })) };
  return { error: '工具尚未实现' };
}

module.exports = { TOOL_DEFINITIONS, runMcpTool };
