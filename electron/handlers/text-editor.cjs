function registerTextEditorHandlers({ ipcMain, BrowserWindow, textEditorWindows, readLibrary, path, storedAssetPath, fs, requireRole, saveTextDocument, notifyLibraryChanged }) {
ipcMain.handle('text-editor:load', async event => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const id = win?.__textDocumentId;
  if (!id || textEditorWindows.get(id) !== win) return { error: 'TXT 编辑窗口不可用' };
  const data = readLibrary();
  if (!data) return { error: '请先打开资源库' };
  const asset = data.assets.find(item => item.id === id);
  if (!asset || path.extname(asset.file || '').toLowerCase() !== '.txt') return { error: '文档不存在或已被删除' };
  const target = storedAssetPath(asset.file);
  if (!fs.existsSync(target)) return { error: '文档原文件不存在' };
  const text = (await fs.promises.readFile(target, 'utf8')).replace(/^\uFEFF/, '');
  win.__textEditorPendingText = text;
  return { ok: true, name: asset.name || asset.originalName, text, canEdit: requireRole(data, 'editor') };
});

ipcMain.handle('text-editor:save', async (event, value) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const id = win?.__textDocumentId;
  if (!id || textEditorWindows.get(id) !== win) return { error: 'TXT 编辑窗口不可用' };
  const text = String(value ?? '');
  win.__textEditorPendingText = text;
  const result = await saveTextDocument(id, text);
  if (result?.error) return result;
  win.__textEditorDirty = false;
  notifyLibraryChanged(result.library);
  return result;
});
}
module.exports = { registerTextEditorHandlers };
