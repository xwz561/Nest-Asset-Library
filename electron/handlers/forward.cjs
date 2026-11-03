function registerForwardHandlers({ ipcMain, runtimeState, recentLibraryRecords, joinTeamLibrary, currentProfile }) {
  // 把当前素材库里选中的素材/文件夹复制到另一个素材库（只复制，不动来源库）。
  // 目标只能是“最近打开的素材库”列表里的库，渲染进程不能传任意路径。
  const { forwardToLibrary, describeLibrary } = require('../library-forward.cjs');
  let running = false;
  const targetRoot = id => recentLibraryRecords().find(item => item.id === String(id || '') && !item.current)?.path || null;

  ipcMain.handle('library:forward-info', (_event, targetId) => {
    const root = targetRoot(targetId);
    if (!root) return { error: '这个素材库不在最近列表中' };
    return describeLibrary(root, currentProfile());
  });

  ipcMain.handle('library:forward', async (event, input = {}) => {
    if (running) return { error: '正在转发中，请等当前这次完成' };
    const sourceRoot = runtimeState.libraryPath;
    if (!sourceRoot) return { error: '请先打开素材库' };
    const root = targetRoot(input.targetId);
    if (!root) return { error: '这个素材库不在最近列表中' };
    const ids = value => (Array.isArray(value) ? value : []).map(String).slice(0, 20000);
    running = true;
    try {
      return await forwardToLibrary({
        sourceRoot, targetRoot: root, assetIds: ids(input.assetIds), folderIds: ids(input.folderIds),
        targetFolderId: input.targetFolderId ? String(input.targetFolderId) : null,
        me: currentProfile(), join: dir => joinTeamLibrary(dir),
        onProgress: progress => { if (!event.sender.isDestroyed()) event.sender.send('library:forward-progress', progress); },
      });
    } catch (error) {
      return { error: `转发失败：${error.message}` };
    } finally { running = false; }
  });
}
module.exports = { registerForwardHandlers };
