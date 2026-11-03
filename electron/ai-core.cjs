const crypto = require('crypto');

const RISK = {
  search_assets: 'LOW', get_asset: 'LOW', get_selected_assets: 'LOW', get_current_folder: 'LOW', get_folder_tree: 'LOW',
  find_similar_assets: 'LOW', find_duplicate_assets: 'LOW', add_tags: 'MEDIUM', remove_tags: 'MEDIUM', update_note: 'MEDIUM',
  favorite_asset: 'MEDIUM', create_folder: 'HIGH', rename_asset: 'HIGH', move_asset: 'HIGH', bulk_move: 'HIGH',
  bulk_rename: 'HIGH', delete_asset: 'CRITICAL', overwrite_file: 'CRITICAL',
};
const V1_TOOLS = new Set(['add_tags', 'remove_tags', 'update_note', 'favorite_asset', 'move_asset', 'bulk_move', 'rename_asset', 'bulk_rename']);
const riskFor = name => RISK[name] || 'CRITICAL';
const needsConfirmation = (name, { allowLowRisk = false } = {}) => {
  const risk = riskFor(name);
  return risk === 'HIGH' || risk === 'CRITICAL' || (risk === 'MEDIUM' && !allowLowRisk);
};

function validatePlan(plan, context, settings = {}) {
  if (!plan || !Array.isArray(plan.actions)) throw new Error('AI 操作计划无效');
  const knownAssets = new Set(context.assets.map(item => item.id));
  const knownFolders = new Set(context.folders.map(item => item.id));
  return {
    ...plan,
    id: plan.id || crypto.randomUUID(),
    createdAt: plan.createdAt || Date.now(),
    actions: plan.actions.map(action => {
      if (!V1_TOOLS.has(action.tool)) throw new Error('操作计划包含 V1 禁止或尚未支持的工具');
      if (action.assetId && !knownAssets.has(action.assetId)) throw new Error(`素材不存在：${action.assetId}`);
      if (action.assetIds?.some(id => !knownAssets.has(id))) throw new Error('操作计划包含不存在的素材');
      if (action.targetFolderId && !knownFolders.has(action.targetFolderId)) throw new Error('操作计划包含不存在的目标文件夹');
      return { ...action, risk: riskFor(action.tool), requiresConfirmation: needsConfirmation(action.tool, settings) };
    }),
  };
}

function createAITaskManager({ concurrency = 2 } = {}) {
  const tasks = new Map();
  const queue = [];
  let running = 0;
  const snapshot = task => task && ({
    id: task.id, status: task.status, createdAt: task.createdAt, startedAt: task.startedAt,
    finishedAt: task.finishedAt, completed: task.completed, total: task.total, error: task.error,
    result: task.result, meta: task.meta, attempts: task.attempts,
  });
  const emit = task => task.listeners.forEach(listener => listener(snapshot(task)));
  const drain = () => {
    while (running < concurrency && queue.length) {
      const task = queue.shift();
      if (!task || task.status !== 'queued') continue;
      running += 1;
      task.status = 'running';
      task.startedAt = Date.now();
      task.attempts += 1;
      emit(task);
      Promise.resolve()
        .then(() => { if (task.pauseRequested) throw new Error('paused'); return task.run({ signal: task.controller.signal, progress: (completed, total) => { task.completed = completed; task.total = total; emit(task); } }); })
        .then(result => { if (task.pauseRequested) task.status = 'paused'; else { task.result = result; task.status = 'completed'; } })
        .catch(error => {
          if (task.pauseRequested) task.status = 'paused';
          else if (task.controller.signal.aborted) task.status = 'cancelled';
          else { task.error = error.message; task.status = 'failed'; }
        })
        .finally(() => {
          running -= 1;
          if (!task.pauseRequested) task.finishedAt = Date.now();
          task.pauseRequested = false;
          emit(task);
          drain();
        });
    }
  };
  const create = (run, meta = {}) => {
    const task = { id: crypto.randomUUID(), status: 'queued', createdAt: Date.now(), completed: 0, total: meta.total || 0, meta, run, controller: new AbortController(), listeners: new Set(), attempts: 0, pauseRequested: false };
    tasks.set(task.id, task); queue.push(task); drain(); return task.id;
  };
  return {
    create,
    cancel(id) { const task = tasks.get(id); if (!task || ['completed', 'failed', 'cancelled'].includes(task.status)) return false; task.pauseRequested = false; task.controller.abort(); task.status = 'cancelled'; task.finishedAt = Date.now(); emit(task); return true; },
    pause(id) { const task = tasks.get(id); if (!task || !['queued', 'running'].includes(task.status)) return false; task.pauseRequested = true; task.status = task.status === 'running' ? 'pausing' : 'paused'; if (!task.controller.signal.aborted) task.controller.abort(); emit(task); return true; },
    resume(id) { const task = tasks.get(id); if (!task || task.status !== 'paused') return false; task.pauseRequested = false; task.controller = new AbortController(); task.status = 'queued'; task.error = undefined; task.finishedAt = undefined; queue.push(task); emit(task); drain(); return true; },
    retry(id) { const task = tasks.get(id); if (!task || !['failed', 'cancelled'].includes(task.status)) return null; return create(task.run, { ...task.meta, retryOf: id }); },
    subscribe(id, listener) { const task = tasks.get(id); if (!task) return () => {}; task.listeners.add(listener); listener(snapshot(task)); return () => task.listeners.delete(listener); },
    get: id => snapshot(tasks.get(id)),
    list: () => [...tasks.values()].map(snapshot),
  };
}

function buildAIContext(library, { folderId = null, selectedIds = [], query = '', filter = '全部素材' } = {}) {
  const folders = library?.folders || [], assets = library?.assets || [], folder = folders.find(item => item.id === folderId) || null, selected = new Set(selectedIds);
  return { library: { name: library?.name || '' }, folder: folder ? { id: folder.id, name: folder.name, parentId: folder.parentId || null } : null, folderPath: folderPath(folders, folderId), selectedAssets: assets.filter(item => selected.has(item.id)).map(safeAsset), query: String(query || ''), filter: String(filter || ''), folders: folders.map(({ id, name, parentId }) => ({ id, name, parentId })), assets: assets.map(safeAsset) };
}
function safeAsset(asset) { return { id: asset.id, name: asset.name, type: asset.type, size: asset.size, width: asset.width, height: asset.height, tags: asset.tags || [], note: asset.note || '', favorite: Boolean(asset.favorite), folderId: asset.folderId || null, createdAt: asset.createdAt }; }
function folderPath(folders, id) { const parts = [], seen = new Set(); let current = folders.find(item => item.id === id); while (current && !seen.has(current.id)) { seen.add(current.id); parts.unshift(current.name); current = folders.find(item => item.id === current.parentId); } return parts; }

module.exports = { RISK, riskFor, needsConfirmation, validatePlan, createAITaskManager, buildAIContext, safeAsset, folderPath };
