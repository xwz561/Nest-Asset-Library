const INVALID_NAME = /[<>:"/\\|?*\u0000-\u001f]/g;

function cleanDisplayName(value) {
  return String(value || '').replace(INVALID_NAME, ' ').replace(/\s+/g, ' ').replace(/[. ]+$/g, '').trim().slice(0, 180) || '未命名素材';
}

function renderBatchName(template, asset, index, folders = []) {
  const folder = folders.find(item => item.id === asset.folderId);
  const values = {
    name: asset.name || '未命名素材',
    index: String(index + 1).padStart(Math.max(2, String(index + 1).length), '0'),
    folder: folder?.name || '未分类',
    tag: asset.tags?.[0] || '无标签',
  };
  const source = String(template || '').trim() || '{name}_{index}';
  return cleanDisplayName(source.replace(/\{(name|index|folder|tag)\}/g, (_, key) => values[key]));
}

function buildBatchRenamePlan(ids, assets, folders, template) {
  const byId = new Map((assets || []).map(asset => [asset.id, asset]));
  return [...new Set(Array.isArray(ids) ? ids : [])]
    .map(id => byId.get(id))
    .filter(Boolean)
    .map((asset, index) => ({ id: asset.id, oldName: asset.name, newName: renderBatchName(template, asset, index, folders) }));
}

module.exports = { buildBatchRenamePlan, cleanDisplayName, renderBatchName };
