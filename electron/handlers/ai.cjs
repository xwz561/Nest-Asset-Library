function registerAiHandlers({ ipcMain, publicAISettings, saveAISettings, redact, aiRouter, aiTasks, readLibrary, readAIUsage, runAIRequest, enqueueLibraryMutation, readAISettings, validatePlan, migrateAssetFilename, syncPhysicalFolders, crypto, writeJson, indexFile, publicLibrary, runtimeState }) {
ipcMain.handle('ai:settings',()=>publicAISettings());

ipcMain.handle('ai:save-settings',(_,settings)=>{try{return{ok:true,settings:saveAISettings(settings)}}catch(error){return{error:redact(error.message)}}});

ipcMain.handle('ai:test-provider',async(_,providerId)=>{try{return await aiRouter().get(providerId).testConnection()}catch(error){return{error:redact(error.message)}}});

ipcMain.handle('ai:task',(_,id)=>aiTasks.get(id)||null);

ipcMain.handle('ai:tasks',()=>aiTasks.list());

ipcMain.handle('ai:cancel-task',(_,id)=>({ok:aiTasks.cancel(id)}));

ipcMain.handle('ai:pause-task',(_,id)=>({ok:aiTasks.pause(id)}));

ipcMain.handle('ai:resume-task',(_,id)=>({ok:aiTasks.resume(id)}));

ipcMain.handle('ai:retry-task',(_,id)=>({id:aiTasks.retry(id)}));

ipcMain.handle('ai:audit',()=>{const data=readLibrary();return(data?.aiAudit||[]).slice(-100).reverse()});

ipcMain.handle('ai:usage',()=>readAIUsage());

ipcMain.handle('ai:start-task',(_,operation,payload={})=>{try{const id=aiTasks.create(({signal,progress})=>runAIRequest(operation,payload,progress,signal),{operation,total:1});return{id}}catch(error){return{error:redact(error.message)}}});

ipcMain.handle('ai:execute-plan',(_,rawPlan,confirmed=false)=>enqueueLibraryMutation(()=>{const data=readLibrary();if(!data)return{error:'请先打开资源库'};try{const settings=readAISettings(),context={assets:data.assets,folders:data.folders},plan=validatePlan(rawPlan,context,settings);if(plan.actions.some(action=>action.requiresConfirmation)&&!confirmed)return{requiresConfirmation:true,plan};const before=[];for(const action of plan.actions){const ids=action.assetIds||[action.assetId].filter(Boolean);for(const id of ids){const asset=data.assets.find(item=>item.id===id);if(!asset)continue;before.push({id,name:asset.name,file:asset.file,folderId:asset.folderId||null,tags:[...(asset.tags||[])],tagSources:{...(asset.tagSources||{})},note:asset.note||'',favorite:!!asset.favorite});if(action.tool==='add_tags'){asset.tags=[...new Set([...(asset.tags||[]),...(action.tags||[])])];asset.tagSources={...(asset.tagSources||{}),...Object.fromEntries((action.tags||[]).map(tag=>[tag,'ai']))}}else if(action.tool==='remove_tags'){asset.tags=(asset.tags||[]).filter(tag=>!(action.tags||[]).includes(tag));for(const tag of action.tags||[])delete asset.tagSources?.[tag]}else if(action.tool==='update_note')asset.note=String(action.note||'');else if(action.tool==='favorite_asset')asset.favorite=Boolean(action.favorite);else if(action.tool==='move_asset'||action.tool==='bulk_move')asset.folderId=action.targetFolderId||null;else if(action.tool==='rename_asset'||action.tool==='bulk_rename'){const name=String(action.newName||action.names?.[id]||'').trim();if(name){migrateAssetFilename(data,asset,name);asset.name=name}}asset.modifiedAt=Date.now()}}
    if(plan.actions.some(action=>['move_asset','bulk_move','rename_asset','bulk_rename'].includes(action.tool)))syncPhysicalFolders(runtimeState.libraryPath,data);const audit={id:crypto.randomUUID(),kind:plan.kind||'AI 操作',providerId:plan.providerId||settings.defaultProviderId,createdAt:Date.now(),actions:plan.actions,before,status:'completed'};data.aiAudit=[...(data.aiAudit||[]),audit].slice(-300);writeJson(indexFile(runtimeState.libraryPath),data);return{ok:true,library:publicLibrary(data),audit}
  }catch(error){return{error:redact(error.message)}}}));

ipcMain.handle('ai:undo',(_,auditId)=>enqueueLibraryMutation(()=>{const data=readLibrary();if(!data)return{error:'请先打开资源库'};const audit=(data.aiAudit||[]).find(item=>item.id===auditId);if(!audit||audit.status==='undone')return{error:'该操作不可撤销或已经撤销'};try{for(const snapshot of audit.before||[]){const asset=data.assets.find(item=>item.id===snapshot.id);if(!asset)continue;if(asset.name!==snapshot.name)migrateAssetFilename(data,asset,snapshot.name);Object.assign(asset,snapshot,{id:asset.id,modifiedAt:Date.now()})}syncPhysicalFolders(runtimeState.libraryPath,data);audit.status='undone';audit.undoneAt=Date.now();writeJson(indexFile(runtimeState.libraryPath),data);return{ok:true,library:publicLibrary(data),audit}}catch(error){return{error:`撤销失败：${redact(error.message)}`}}}));
}
module.exports = { registerAiHandlers };
