function registerPluginsHandlers({ ipcMain, readSettings, scanPlugins, path, app, writeJson, settingsFile, fs, shell, runtimeState }) {
ipcMain.handle('plugins:list',()=>{const settings=readSettings();return scanPlugins(path.join(app.getPath('userData'),'plugins'),settings.enabledPluginIds||[])});

ipcMain.handle('plugins:set-enabled',(_,id,enabled)=>{const settings=readSettings(),plugins=scanPlugins(path.join(app.getPath('userData'),'plugins'),settings.enabledPluginIds||[]),plugin=plugins.find(item=>item.id===id&&item.valid);if(!plugin)return{error:'插件不存在或清单无效'};const ids=new Set(settings.enabledPluginIds||[]);enabled?ids.add(id):ids.delete(id);writeJson(settingsFile(),{...settings,enabledPluginIds:[...ids],libraryPath: runtimeState.libraryPath});return{ok:true,plugins:scanPlugins(path.join(app.getPath('userData'),'plugins'),[...ids])}});

ipcMain.handle('plugins:open-folder',async()=>{const target=path.join(app.getPath('userData'),'plugins');fs.mkdirSync(target,{recursive:true});const error=await shell.openPath(target);return error?{error}:{ok:true}});
}
module.exports = { registerPluginsHandlers };
