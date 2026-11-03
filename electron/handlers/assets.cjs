function registerAssetsHandlers({ ipcMain, enqueueLibraryMutation, readLibrary, reconcileLibraryRecycleState, publicLibrary, openAssetFile, storedAssetPath, fs, shell, migrateAssetFilename, writeJson, indexFile, spawn, clipboard, dialog, path, readableAssetFilename, crypto, syncPhysicalFolders, queueAIFlowMovesForAsset, removePendingLiveUploads, queueAssetsForLiveSync, publishAIFlowLiveWake, buildBatchRenamePlan, moveToRecycleBin, detachAIFlowAssetConnections, markAssetsTrashed, runtimeState }) {
ipcMain.handle('library:reconcile-recycled-assets', () => enqueueLibraryMutation(()=>{const data=readLibrary();if(!data)return null;const restoredIds=reconcileLibraryRecycleState(data);return{...publicLibrary(data),restoredCount:restoredIds.length}}));

ipcMain.handle('library:open-asset', async (_, id) => openAssetFile(readLibrary()?.assets.find(a=>a.id===id),{resolvePath:storedAssetPath,exists:fs.existsSync,openPath:shell.openPath}));

ipcMain.handle('library:reveal-asset', (_, id, migrate = false) => enqueueLibraryMutation(()=>{const data=readLibrary(),asset=data?.assets.find(a=>a.id===id);if(!asset)return{error:'素材不存在或已被删除'};try{if(migrate&&migrateAssetFilename(data,asset))writeJson(indexFile(runtimeState.libraryPath),data);shell.showItemInFolder(storedAssetPath(asset.file));return{ok:true,library:publicLibrary(data)}}catch(error){return{error:`无法在资源管理器中显示：${error.message}`}}}));

ipcMain.handle('library:copy-asset', async (_, id) => {const asset=readLibrary()?.assets.find(a=>a.id===id);if(!asset)return{error:'素材不存在或已被删除'};try{const file=storedAssetPath(asset.file);if(!fs.existsSync(file))return{error:'素材原文件不存在'};if(process.platform==='win32'){const encoded=Buffer.from(file,'utf8').toString('base64');const script=`Add-Type -AssemblyName System.Windows.Forms;$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'));$files=New-Object System.Collections.Specialized.StringCollection;$files.Add($p)>$null;[Windows.Forms.Clipboard]::SetFileDropList($files)`;await new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-STA','-NoProfile','-NonInteractive','-Command',script],{windowsHide:true});let error='';child.stderr.on('data',chunk=>error+=chunk);child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(error.trim()||`PowerShell exited with code ${code}`)))})}else clipboard.writeText(file);return{ok:true,kind:'file'}}catch(error){return{error:`复制文件失败：${error.message}`}}});

ipcMain.handle('library:export-asset', async (_, id) => {const asset=readLibrary()?.assets.find(a=>a.id===id);if(!asset)return{error:'素材不存在或已被删除'};try{const result=await dialog.showSaveDialog({title:'导出原始文件',defaultPath:asset.originalName||`${asset.name}${path.extname(asset.file)}`});if(result.canceled||!result.filePath)return{canceled:true};await fs.promises.copyFile(storedAssetPath(asset.file),result.filePath);return{ok:true,filePath:result.filePath}}catch(error){return{error:`导出失败：${error.message}`}}});

ipcMain.handle('library:duplicate-asset', (_, id) => enqueueLibraryMutation(async()=>{const data=readLibrary();if(!data)return null;const asset=data.assets.find(a=>a.id===id);if(!asset)return{error:'素材不存在或已被删除'};try{const ext=path.extname(asset.file),name=`${asset.name} 副本`,file=readableAssetFilename(data,name,ext);await fs.promises.copyFile(storedAssetPath(asset.file),storedAssetPath(file));data.assets.unshift({...asset,id:crypto.randomUUID(),file,name,originalName:file,favorite:false,createdAt:Date.now(),modifiedAt:Date.now()});writeJson(indexFile(runtimeState.libraryPath),data);return publicLibrary(data)}catch(error){return{error:`复制素材失败：${error.message}`}}}));

ipcMain.handle('library:update-asset', (_, id, changes) => enqueueLibraryMutation(() => {
  const data = readLibrary();
  if (!data) return null;
  const asset = data.assets.find(item => item.id === id);
  if (!asset) return publicLibrary(data);
  try {
    const previousFolderId = asset.folderId;
    const nextName = String(changes?.name ?? asset.name).trim() || asset.name;
    if (nextName !== asset.name) migrateAssetFilename(data, asset, nextName);
    Object.assign(asset, changes, { id: asset.id, file: asset.file, name: nextName, modifiedAt: Date.now() });
    if (Array.isArray(changes?.tags)) asset.tagSources = Object.fromEntries(changes.tags.map(tag => [tag, 'user']));
    if (changes && 'folderId' in changes) {
      syncPhysicalFolders(runtimeState.libraryPath, data);
      const move = queueAIFlowMovesForAsset(data, asset, previousFolderId);
      if (move.linked) removePendingLiveUploads(data, [asset.id]);
      else queueAssetsForLiveSync(data, [asset]);
      publishAIFlowLiveWake();
    }
    writeJson(indexFile(runtimeState.libraryPath), data);
    return publicLibrary(data);
  } catch (error) {
    return { error: `重命名文件失败：${error.message}` };
  }
}));

ipcMain.handle('library:batch-update', (_, ids, changes) => enqueueLibraryMutation(() => {
  const data = readLibrary();
  if (!data) return null;
  if (changes?.folderId && !data.folders.some(folder => folder.id === changes.folderId)) return { error: '目标文件夹不存在或已被删除' };
  const selected = new Set(Array.isArray(ids) ? ids : []);
  const previousFolders = new Map(data.assets.filter(asset => selected.has(asset.id)).map(asset => [asset.id, asset.folderId]));
  data.assets = data.assets.map(asset => {
    if (!selected.has(asset.id)) return asset;
    const tags = changes.addTag ? [...new Set([...(asset.tags || []), changes.addTag])] : (changes.tags || asset.tags);
    const tagSources = Array.isArray(changes.tags)
      ? Object.fromEntries(tags.map(tag => [tag, 'user']))
      : { ...(asset.tagSources || {}), ...(changes.addTag ? { [changes.addTag]: 'user' } : {}) };
    return { ...asset, ...changes, id: asset.id, file: asset.file, tags, tagSources, modifiedAt: Date.now() };
  });
  if (changes.addTag) data.assets = data.assets.map(asset => { const { addTag, ...rest } = asset; return rest; });
  if (Object.prototype.hasOwnProperty.call(changes || {}, 'folderId')) {
    syncPhysicalFolders(runtimeState.libraryPath, data);
    for (const asset of data.assets.filter(item => selected.has(item.id))) {
      const move = queueAIFlowMovesForAsset(data, asset, previousFolders.get(asset.id));
      if (move.linked) removePendingLiveUploads(data, [asset.id]);
      else queueAssetsForLiveSync(data, [asset]);
    }
    publishAIFlowLiveWake();
  }
  writeJson(indexFile(runtimeState.libraryPath), data);
  return publicLibrary(data);
}));

ipcMain.handle('library:batch-rename', (_, ids, template) => enqueueLibraryMutation(()=>{const data=readLibrary();if(!data)return null;const plan=buildBatchRenamePlan(ids,data.assets,data.folders,template);if(!plan.length)return{error:'没有可重命名的素材'};const changed=[];try{for(const item of plan){const asset=data.assets.find(candidate=>candidate.id===item.id);if(!asset)continue;const before={asset,file:asset.file,originalName:asset.originalName,name:asset.name};migrateAssetFilename(data,asset,item.newName);asset.name=item.newName;asset.modifiedAt=Date.now();changed.push(before)}syncPhysicalFolders(runtimeState.libraryPath,data);writeJson(indexFile(runtimeState.libraryPath),data);return publicLibrary(data)}catch(error){for(const before of changed.reverse()){try{const current=storedAssetPath(before.asset.file),original=storedAssetPath(before.file);if(current!==original&&fs.existsSync(current)&&!fs.existsSync(original)){fs.mkdirSync(path.dirname(original),{recursive:true});fs.renameSync(current,original)}}catch{}Object.assign(before.asset,{file:before.file,originalName:before.originalName,name:before.name})}return{error:`批量重命名失败：${error.message}`}}}));

ipcMain.handle('library:batch-delete', (_, ids) => enqueueLibraryMutation(async()=>{
  const data=readLibrary();if(!data)return null;
  const selected=new Set(Array.isArray(ids)?ids:[]),removed=new Set(),errors=[];let detachedAIFlowLinks=0;
  for(const asset of data.assets.filter(item=>selected.has(item.id)&&!item.trashedAt)){
    try{
      const target=storedAssetPath(asset.file);if(fs.existsSync(target))await moveToRecycleBin(target,{trashItem:shell.trashItem});
      detachedAIFlowLinks+=detachAIFlowAssetConnections(data,asset).mappings;
      if(markAssetsTrashed(data.assets,[asset.id]))removed.add(asset.id);
    }catch(error){errors.push(asset.name+': '+error.message)}
  }
  syncPhysicalFolders(runtimeState.libraryPath,data);data.lastDelete={removed:removed.size,detachedAIFlowLinks,errors,finishedAt:Date.now()};
  writeJson(indexFile(runtimeState.libraryPath),data);if(removed.size)publishAIFlowLiveWake();return publicLibrary(data);
}));

ipcMain.handle('library:delete-asset', (_, id) => enqueueLibraryMutation(async()=>{
  const data=readLibrary();if(!data)return null;const asset=data.assets.find(a=>a.id===id);if(!asset||asset.trashedAt)return publicLibrary(data);
  try{
    const target=storedAssetPath(asset.file);if(fs.existsSync(target))await moveToRecycleBin(target,{trashItem:shell.trashItem});
    const detachedAIFlowLinks=detachAIFlowAssetConnections(data,asset).mappings;
    markAssetsTrashed(data.assets,[asset.id]);syncPhysicalFolders(runtimeState.libraryPath,data);writeJson(indexFile(runtimeState.libraryPath),data);publishAIFlowLiveWake();
    return{...publicLibrary(data),detachedAIFlowLinks};
  }catch(error){return{error:'无法将“'+asset.name+'”移入回收站：'+error.message}}
}));
}
module.exports = { registerAssetsHandlers };
