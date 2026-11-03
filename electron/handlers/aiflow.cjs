function registerAiflowHandlers({ ipcMain, publicAIFlowSettingsWithSessionStatus, redact, saveAIFlowSettings, readAIFlowSessionStatus, readAIFlowSettings, openAIFlowLogin, BrowserWindow, logoutAIFlowSession, enqueueLibraryMutation, readLibrary, detachAIFlowFolderConnections, writeJson, indexFile, notifyLibraryChanged, publicLibrary, aiFlowClient, rememberAIFlowScan, listLocalAssets, importAIFlowServer, importAIFlowLocal, beginAIFlowAssetLink, cancelAIFlowAssetLink, unlinkAIFlowAssetLink, beginAIFlowExtensionUpload, beginAIFlowFolderExtensionUpload, collectorPermission, setRootLiveSync, collectFolderSubtreeIds, queueAssetsForLiveSync, listAIFlowServerVideos, runtimeState }) {
ipcMain.handle('aiflow:settings',async()=>{try{return await publicAIFlowSettingsWithSessionStatus()}catch(error){return{error:redact(error.message)}}});

ipcMain.handle('aiflow:save-settings',async(_,input={})=>{try{saveAIFlowSettings(input);return{ok:true,settings:await publicAIFlowSettingsWithSessionStatus()}}catch(error){return{error:redact(error.message)}}});

ipcMain.handle('aiflow:auth-status',async()=>{try{return await readAIFlowSessionStatus(readAIFlowSettings().baseUrl)}catch(error){return{authenticated:false,account:null,error:redact(error.message)}}});

ipcMain.handle('aiflow:sign-in',async event=>{try{const settings=readAIFlowSettings();if(settings.authMode!=='session')return{error:'请先选择“账号登录”'};const status=await readAIFlowSessionStatus(settings.baseUrl);if(status.authenticated)return{ok:true,account:status.account,settings:await publicAIFlowSettingsWithSessionStatus()};const result=await openAIFlowLogin(BrowserWindow.fromWebContents(event.sender),settings.baseUrl);return result?.ok?{...result,settings:await publicAIFlowSettingsWithSessionStatus()}:result}catch(error){return{error:redact(error.message)}}});

ipcMain.handle('aiflow:sign-out',async()=>{try{await logoutAIFlowSession(readAIFlowSettings().baseUrl);runtimeState.pendingAIFlowAssetLink=null;runtimeState.pendingAIFlowUpload=null;runtimeState.pendingAIFlowReferenceAttachment=null;let library=null,detached={roots:0,folders:0};if(runtimeState.libraryPath){library=await enqueueLibraryMutation(()=>{const data=readLibrary();if(!data)return null;detached=detachAIFlowFolderConnections(data);writeJson(indexFile(runtimeState.libraryPath),data);notifyLibraryChanged(data);return publicLibrary(data)})}return{ok:true,settings:await publicAIFlowSettingsWithSessionStatus(),library,detached}}catch(error){return{error:redact(error.message)}}});

ipcMain.handle('aiflow:test-connection',async()=>{try{const client=aiFlowClient(),result=await client.testConnection();if(client.authMode==='session'&&result.account)runtimeState.aiFlowAuthState={baseUrl:client.baseUrl,user:result.account,authenticatedAt:Date.now()};return result}catch(error){return{error:redact(error.message)}}});

ipcMain.handle('aiflow:list-server-videos',async()=>{try{const client=aiFlowClient();let account=null;if(client.authMode==='session'){const status=await readAIFlowSessionStatus(client.baseUrl);if(!status.authenticated)return{error:'请先登录 AI Flow 账号'};account=status.account}const videos=await client.listCompletedVideos();return rememberAIFlowScan('server',videos,{baseUrl:client.baseUrl,authMode:client.authMode,accountId:account?.id||'',sourceLabel:client.authMode==='session'?'AI Flow 已登录账号':'AI Flow 服务'})}catch(error){return{error:redact(error.message)}}});

ipcMain.handle('aiflow:list-local-videos',async()=>{try{const settings=readAIFlowSettings(),result=await listLocalAssets(settings.localRoot);return rememberAIFlowScan('local',result.assets,{root:result.root,scanned:result.scanned,truncated:result.truncated,sourceLabel:'本机 AI Flow 素材'})}catch(error){return{error:redact(error.message)}}});

ipcMain.handle('aiflow:import-server-videos',async(event,scanId,ids,folderId)=>{const report=progress=>{if(!event.sender.isDestroyed())event.sender.send('library:import-progress',progress)};try{return await importAIFlowServer(scanId,ids,folderId,report)}catch(error){return{error:redact(error.message)}}});

ipcMain.handle('aiflow:import-local-videos',async(event,scanId,ids,folderId)=>{const report=progress=>{if(!event.sender.isDestroyed())event.sender.send('library:import-progress',progress)};try{return await importAIFlowLocal(scanId,ids,folderId,report)}catch(error){return{error:redact(error.message)}}});

ipcMain.handle('aiflow:begin-asset-link',async(_,assetId)=>{try{return await beginAIFlowAssetLink(assetId)}catch(error){return{error:redact(error.message)}}});

ipcMain.handle('aiflow:cancel-asset-link',async(_,assetId)=>{try{return await cancelAIFlowAssetLink(assetId)}catch(error){return{error:redact(error.message)}}});

ipcMain.handle('aiflow:unlink-asset-link',async(_,assetId,mappingId)=>{try{return await unlinkAIFlowAssetLink(assetId,mappingId)}catch(error){return{error:redact(error.message)}}});

ipcMain.handle('aiflow:begin-extension-upload',async(_,assetIds,options)=>{try{return beginAIFlowExtensionUpload(assetIds,null,options)}catch(error){return{error:redact(error.message)}}});

ipcMain.handle('aiflow:begin-folder-extension-upload',async(_,folderId)=>{try{return beginAIFlowFolderExtensionUpload(folderId)}catch(error){return{error:redact(error.message)}}});

ipcMain.handle('aiflow:set-live-sync',async(_,folderId,enabled)=>{try{return await enqueueLibraryMutation(()=>{const data=collectorPermission();const result=setRootLiveSync(data,folderId,enabled);let queued=0;if(result.enabled){const ids=collectFolderSubtreeIds(data.folders,result.folder.id);queued=queueAssetsForLiveSync(data,data.assets.filter(asset=>ids.has(asset.folderId)))}writeJson(indexFile(runtimeState.libraryPath),data);notifyLibraryChanged(data);return{ok:true,enabled:result.enabled,folderName:result.folder.name,queued,library:publicLibrary(data)}})}catch(error){return{error:redact(error.message)}}});

ipcMain.removeHandler('aiflow:list-server-videos');

ipcMain.handle('aiflow:list-server-videos', async (_, options = {}) => {
  try {
    return await listAIFlowServerVideos(options);
  } catch (error) {
    return { error: redact(error.message) };
  }
});
}
module.exports = { registerAiflowHandlers };
