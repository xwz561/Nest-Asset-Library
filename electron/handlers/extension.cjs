function registerExtensionHandlers({ ipcMain, path, app, fs, spawn, clipboard, shell, prepareBrowserExtension }) {
ipcMain.handle('extension:prepare', async (_, browser) => {const macApplications='/Applications',choices={chrome:{name:'Google Chrome',url:'chrome://extensions',paths:process.platform==='darwin'?[path.join(macApplications,'Google Chrome.app','Contents','MacOS','Google Chrome')]:[path.join(process.env.PROGRAMFILES||'', 'Google','Chrome','Application','chrome.exe'),path.join(process.env['PROGRAMFILES(X86)']||'', 'Google','Chrome','Application','chrome.exe'),path.join(process.env.LOCALAPPDATA||'', 'Google','Chrome','Application','chrome.exe')]},edge:{name:'Microsoft Edge',url:'edge://extensions',paths:process.platform==='darwin'?[path.join(macApplications,'Microsoft Edge.app','Contents','MacOS','Microsoft Edge')]:[path.join(process.env['PROGRAMFILES(X86)']||'', 'Microsoft','Edge','Application','msedge.exe'),path.join(process.env.PROGRAMFILES||'', 'Microsoft','Edge','Application','msedge.exe')]}};const choice=choices[browser];if(!choice)return{ok:false,error:'不支持的浏览器'};const source=app.isPackaged?path.join(process.resourcesPath,'app.asar.unpacked','browser-extension'):path.join(app.getAppPath(),'browser-extension'),target=path.join(app.getPath('userData'),'Nest 网页采集器');try{if(!fs.existsSync(path.join(source,'manifest.json')))throw new Error('安装包中缺少网页采集扩展，请安装最新版本');await fs.promises.rm(target,{recursive:true,force:true});await fs.promises.cp(source,target,{recursive:true});const exe=choice.paths.find(p=>p&&fs.existsSync(p));if(!exe)return{ok:false,error:`没有检测到 ${choice.name}`,path:target};spawn(exe,[choice.url],{detached:true,stdio:'ignore'}).unref();clipboard.writeText(target);shell.showItemInFolder(path.join(target,'manifest.json'));return{ok:true,browser:choice.name,path:target}}catch(error){return{ok:false,error:error.message}}});

ipcMain.removeHandler('extension:prepare');

ipcMain.handle('extension:prepare', (_, browser) => prepareBrowserExtension(browser));

ipcMain.handle('extension:open-manager', async (_, browser) => {
  const choices = {
    chrome: { name: 'Google Chrome', url: 'chrome://extensions', paths: [path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')] },
    edge: { name: 'Microsoft Edge', url: 'edge://extensions', paths: [path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'), path.join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe')] },
  };
  const choice = choices[browser];
  if (!choice) return { ok: false, error: '不支持的浏览器' };
  const executable = choice.paths.find(item => item && fs.existsSync(item));
  if (!executable) return { ok: false, error: `没有检测到 ${choice.name}` };
  try {
    spawn(executable, ['--new-window', choice.url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return { ok: true, mode: 'uninstall', browser: choice.name };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});
}
module.exports = { registerExtensionHandlers };
