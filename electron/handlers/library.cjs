function registerLibraryHandlers({ joinTeamLibrary, ipcMain, readJson, settingsFile, fs, indexFile, backupLibrary, readLibrary, reconcileLibraryRecycleState, ensurePhysicalLayout, writeJson, publicLibrary, selectFolder, enqueueLibraryMutation, initializeLibrary, libraryMutationQueue, openKnownLibrary, recentLibraryRecords, readSettings, forgetLibrary, session, BrowserWindow, redact, requireRole, path, assetsDir, importPaths, notifyLibraryChanged, detachAIFlowFolderConnections, createAIFlowMappings, cancelAIFlowTransfersForShutdown, saveSettings, publishAIFlowLiveWake, closeLibraryReadStreams, moveToRecycleBin, shell, storedAssetPath, syncPhysicalFolders, createReferenceBoard, crypto, normalizeReferenceBoards, updateReferenceBoard, NEW_DOCUMENTS, readableAssetFilename, blankDocumentBuffer, hashFile, queueAssetsForLiveSync, saveTextDocument, textEditorWindows, app, dialog, migrateAssetFilename, clipboard, runtimeState, electronDirectory }) {
ipcMain.handle('library:current', () => { if(runtimeState.deletingLibrary)return null; const saved = readJson(settingsFile()); if (!runtimeState.libraryPath && saved?.libraryPath && fs.existsSync(indexFile(saved.libraryPath))) runtimeState.libraryPath = saved.libraryPath; backupLibrary(); const data=readLibrary();const restoredIds=reconcileLibraryRecycleState(data);if(data){ensurePhysicalLayout(data);writeJson(indexFile(runtimeState.libraryPath),data)}const library=publicLibrary(data);return library?{...library,restoredCount:restoredIds.length}:library; });

ipcMain.handle('library:create', async () => { const root = await selectFolder('选择或新建 Nest 资源库文件夹'); return root ? enqueueLibraryMutation(()=>initializeLibrary(root), null) : null; });

ipcMain.handle('library:open', async () => { const root = await selectFolder('打开小旺仔资源库'); if (!root) return null; return libraryMutationQueue(async()=>{ const joined = await joinTeamLibrary(root); const library = openKnownLibrary(root); return joined.error && library && !library.error ? { ...library, joinNotice: joined.error } : library; }); });

ipcMain.handle('library:recent', () => recentLibraryRecords());

ipcMain.handle('library:switch-recent', (_, id) => libraryMutationQueue(async () => {
  const record = recentLibraryRecords().find(item => item.id === String(id || ''));
  if (!record) return { error: '这个资源库不在最近列表中' };
  const joined = await joinTeamLibrary(record.path);
  const library = openKnownLibrary(record.path);
  return joined.error && library && !library.error ? { ...library, joinNotice: joined.error } : library;
}));

ipcMain.handle('library:forget-recent', (_, id) => {
  const record = recentLibraryRecords().find(item => item.id === String(id || ''));
  if (!record) return recentLibraryRecords();
  if (record.current) return { error: '当前资源库不能从列表中移除' };
  const settings = readSettings();
  writeJson(settingsFile(), { ...settings, recentLibraries: forgetLibrary(settings.recentLibraries, record.id), libraryPath: runtimeState.libraryPath });
  return recentLibraryRecords();
});

ipcMain.handle('library:clear-cache-reload', async event => {
  try {
    await session.defaultSession.clearCache();
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) setImmediate(() => { if (!win.isDestroyed()) win.webContents.reload(); });
    return { ok: true };
  } catch (error) { return { error: `清除缓存失败：${redact(error.message)}` }; }
});

ipcMain.handle('library:merge', async event => {
  const currentRoot = runtimeState.libraryPath;
  const current = readLibrary();
  if (!currentRoot || !current) return { error: '请先打开要接收素材的资源库' };
  if (!requireRole(current, 'editor')) return { error: '权限不足' };
  const sourceRoot = await selectFolder('选择要合并进当前库的其它资源库');
  if (!sourceRoot) return { ...publicLibrary(current), importCanceled: true };
  if (!fs.existsSync(indexFile(sourceRoot))) return { error: '所选文件夹不是小旺仔资源库' };
  if (path.resolve(sourceRoot).toLowerCase() === path.resolve(currentRoot).toLowerCase()) return { error: '不能把当前资源库合并到自身' };
  const sourceData = readJson(indexFile(sourceRoot));
  const sourceAssets = assetsDir(sourceRoot);
  if (!sourceData || !fs.existsSync(sourceAssets)) return { error: '来源资源库缺少有效的素材目录' };
  const inputs = (await fs.promises.readdir(sourceAssets)).map(name => path.join(sourceAssets, name));
  const report = progress => { if (!event.sender.isDestroyed()) event.sender.send('library:import-progress', { ...progress, merge: true }); };
  return enqueueLibraryMutation(async () => {
    const result = await importPaths(inputs, null, {
      preserveFolders: true,
      onProgress: report,
      metadataForPath: () => ({ provider: '资源库合并', sourceLibrary: String(sourceData.name || path.basename(sourceRoot)), mergedAt: Date.now() }),
    });
    if (result && !result.error) notifyLibraryChanged(readLibrary());
    return result;
  });
});

ipcMain.handle('library:delete-library', async (_, confirmationName) => libraryMutationQueue(async () => {
  const root = runtimeState.libraryPath;
  const data = readLibrary();
  if (!root || !data) return { error: '当前没有可删除的素材库' };
  if (!requireRole(data, 'admin')) return { error: '只有素材库管理员可以删除整个素材库' };
  const resolved = path.resolve(root);
  if (resolved === path.parse(resolved).root || !fs.existsSync(indexFile(resolved))) return { error: '为保护磁盘根目录，无法删除该位置' };
  const expectedName = String(data.name || path.basename(resolved));
  if (String(confirmationName || '').trim() !== expectedName) return { error: '确认名称不匹配，未删除素材库' };
  runtimeState.deletingLibrary = true;
  // Persist the disconnected state before recycling, including the copy that
  // may later be restored from the recycle bin.
  try {
    detachAIFlowFolderConnections(data);
    data.aiFlowLiveSync = { version: 2, pendingUploads: [], pendingMoves: [], pendingDeletes: [] };
    data.aiFlowMappings = createAIFlowMappings();
    writeJson(indexFile(resolved), data);
    cancelAIFlowTransfersForShutdown();
    runtimeState.extensionImportTarget = null;
    runtimeState.libraryPath = null;
    saveSettings();
    publishAIFlowLiveWake();
    await closeLibraryReadStreams();
    await moveToRecycleBin(resolved, { trashItem: shell.trashItem });
  } catch (error) {
    runtimeState.libraryPath = fs.existsSync(indexFile(resolved)) ? resolved : null;
    saveSettings();
    if (runtimeState.libraryPath) notifyLibraryChanged(readLibrary());
    return { error: `无法移入系统回收站：${error.message}（Flow 同步已停止）` };
  } finally {
    runtimeState.deletingLibrary = false;
  }
  runtimeState.libraryPath = null;
  runtimeState.extensionImportTarget = null;
  runtimeState.pendingAIFlowAssetLink = null;
  runtimeState.pendingAIFlowUpload = null;
  runtimeState.pendingAIFlowReferenceAttachment = null;
  saveSettings();
  publishAIFlowLiveWake();
  return { ok: true, name: expectedName };
}));

ipcMain.handle('library:health', () => {const data=readLibrary();if(!data)return null;const missing=data.assets.filter(a=>!a.file||!fs.existsSync(storedAssetPath(a.file))).map(a=>({id:a.id,name:a.name,file:a.file||''}));return{missing,total:data.assets.length,backupDir:path.join(runtimeState.libraryPath,'.nest-backups')}});

ipcMain.handle('library:storage-info',()=>{if(!runtimeState.libraryPath)return null;try{const root=path.parse(runtimeState.libraryPath).root||runtimeState.libraryPath,stat=fs.statfsSync(root),total=Number(stat.blocks)*Number(stat.bsize),free=Number(stat.bavail)*Number(stat.bsize);return{root,total,free,used:Math.max(0,total-free)}}catch(error){return{error:error.message}}});

ipcMain.handle('library:repair', () => enqueueLibraryMutation(()=>{const data=readLibrary();if(!data)return null;backupLibrary();data.folders=Array.isArray(data.folders)?data.folders:[];data.assets=(Array.isArray(data.assets)?data.assets:[]).filter(a=>a?.id&&a?.file&&(a.trashedAt||fs.existsSync(storedAssetPath(a.file)))).map(a=>({...a,tags:Array.isArray(a.tags)?a.tags:[]}));syncPhysicalFolders(runtimeState.libraryPath,data);writeJson(indexFile(runtimeState.libraryPath),data);return publicLibrary(data)}));

ipcMain.handle('library:create-reference-board', (_, input = {}) => enqueueLibraryMutation(()=>{const data=readLibrary();if(!data)return null;try{const board=createReferenceBoard(input,data.assets,{id:crypto.randomUUID()});data.referenceBoards=normalizeReferenceBoards([...(data.referenceBoards||[]),board],data.assets);writeJson(indexFile(runtimeState.libraryPath),data);return{board,library:publicLibrary(data)}}catch(error){return{error:`无法新建参考板：${error.message}`}}}));

ipcMain.handle('library:update-reference-board', (_, id, changes = {}) => enqueueLibraryMutation(()=>{const data=readLibrary();if(!data)return null;const current=(data.referenceBoards||[]).find(board=>board.id===String(id||''));if(!current)return{error:'参考板不存在或已被删除'};const board=updateReferenceBoard(current,changes,data.assets);data.referenceBoards=(data.referenceBoards||[]).map(item=>item.id===board.id?board:item);writeJson(indexFile(runtimeState.libraryPath),data);return{board,library:publicLibrary(data)}}));

ipcMain.handle('library:delete-reference-board', (_, id) => enqueueLibraryMutation(()=>{const data=readLibrary();if(!data)return null;const before=(data.referenceBoards||[]).length;data.referenceBoards=(data.referenceBoards||[]).filter(board=>board.id!==String(id||''));if(before===data.referenceBoards.length)return{error:'参考板不存在或已被删除'};writeJson(indexFile(runtimeState.libraryPath),data);return{ok:true,library:publicLibrary(data)}}));

ipcMain.handle('library:create-document', (_, kind, folderId = null) => enqueueLibraryMutation(async () => {
  const data = readLibrary();
  if (!data) return { error: '请先打开资源库' };
  if (!requireRole(data, 'editor')) return { error: '当前用户没有新建文档的权限' };
  if (folderId && !data.folders.some(folder => folder.id === folderId)) return { error: '目标文件夹不存在或已被删除' };
  const spec = NEW_DOCUMENTS[String(kind || '')];
  if (!spec) return { error: '不支持的文档类型' };
  let target;
  try {
    const file = readableAssetFilename(data, spec.baseName, spec.extension);
    target = path.join(assetsDir(runtimeState.libraryPath), file);
    const content = await blankDocumentBuffer(kind);
    await fs.promises.writeFile(target, content, { flag: 'wx' });
    const stat = await fs.promises.stat(target);
    const asset = {
      id: crypto.randomUUID(), file, name: path.basename(file, spec.extension), originalName: file,
      type: spec.type, size: stat.size, width: 0, height: 0, tags: [], favorite: false,
      note: '', rating: 0, folderId: folderId || null, hash: await hashFile(target),
      documentText: '', documentFormat: spec.format, createdAt: Date.now(), modifiedAt: Date.now(),
    };
    data.assets.unshift(asset);
    syncPhysicalFolders(runtimeState.libraryPath, data);
    const queuedForAIFlow = queueAssetsForLiveSync(data, [asset]);
    writeJson(indexFile(runtimeState.libraryPath), data);
    if (queuedForAIFlow) publishAIFlowLiveWake();
    return { ok: true, asset: publicLibrary(data).assets.find(item => item.id === asset.id), library: publicLibrary(data) };
  } catch (error) {
    if (target) await fs.promises.rm(target, { force: true }).catch(() => {});
    return { error: `新建${spec.label}失败：${error.message}` };
  }
}));

ipcMain.handle('library:save-text-document', (_, id, value) => saveTextDocument(id, value));

ipcMain.handle('library:open-text-editor', async (event, id) => {
  const data = readLibrary();
  if (!data) return { error: '请先打开资源库' };
  const asset = data.assets.find(item => item.id === id);
  if (!asset || path.extname(asset.file || '').toLowerCase() !== '.txt') return { error: 'TXT 文档不存在或格式不受支持' };
  const existing = textEditorWindows.get(asset.id);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return { ok: true, existing: true };
  }
  const parent = BrowserWindow.fromWebContents(event.sender);
  const win = new BrowserWindow({
    width: 900, height: 720, minWidth: 520, minHeight: 360,
    title: asset.name || asset.originalName || '文本文档',
    icon: path.join(app.getAppPath(), 'build', 'icon.png'),
    backgroundColor: '#20242b', show: false, autoHideMenuBar: true,
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    webPreferences: {
      preload: path.join(electronDirectory, 'text-editor-preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  win.__textDocumentId = asset.id;
  win.__textEditorDirty = false;
  win.__textEditorPendingText = String(asset.documentText || '');
  win.__textEditorPromptOpen = false;
  win.__textEditorAllowClose = false;
  textEditorWindows.set(asset.id, win);
  win.once('ready-to-show', () => { if (!win.isDestroyed()) { win.show(); win.focus(); } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('close', event => {
    if (win.__textEditorAllowClose || !win.__textEditorDirty) return;
    event.preventDefault();
    if (win.__textEditorPromptOpen) return;
    win.__textEditorPromptOpen = true;
    void dialog.showMessageBox(win, {
      type: 'warning', title: '文档尚未保存', message: '此 TXT 文档有未保存的修改。',
      buttons: ['保存并关闭', '不保存', '继续编辑'], defaultId: 0, cancelId: 2,
    }).then(async ({ response }) => {
      win.__textEditorPromptOpen = false;
      if (win.isDestroyed() || response === 2) return;
      if (response === 0) {
        const result = await saveTextDocument(asset.id, win.__textEditorPendingText);
        if (result?.error) {
          await dialog.showMessageBox(win, { type: 'error', title: '保存失败', message: result.error, buttons: ['返回编辑'] });
          return;
        }
        notifyLibraryChanged(result.library);
      }
      win.__textEditorDirty = false;
      win.__textEditorAllowClose = true;
      if (!win.isDestroyed()) win.close();
    }).catch(() => { win.__textEditorPromptOpen = false; });
  });
  win.on('closed', () => { if (textEditorWindows.get(asset.id) === win) textEditorWindows.delete(asset.id); });
  try {
    await win.loadFile(path.join(electronDirectory, 'text-editor.html'));
    return { ok: true };
  } catch (error) {
    if (!win.isDestroyed()) win.close();
    return { error: `无法打开 TXT 编辑窗口：${error.message}` };
  }
});

ipcMain.handle('library:copy-path', (_, id) => enqueueLibraryMutation(()=>{const data=readLibrary(),asset=data?.assets.find(a=>a.id===id);if(!asset)return{error:'素材不存在或已被删除'};try{if(migrateAssetFilename(data,asset))writeJson(indexFile(runtimeState.libraryPath),data);clipboard.writeText(storedAssetPath(asset.file));return{ok:true,library:publicLibrary(data)}}catch(error){return{error:`无法复制路径：${error.message}`}}}));
}
module.exports = { registerLibraryHandlers };
