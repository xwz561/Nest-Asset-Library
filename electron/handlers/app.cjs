function registerAppHandlers({ ipcMain, spawn, path, app, shell, BrowserWindow, inspectorWindows, screen, inspectorBounds, animateWindowBounds }) {
ipcMain.handle('app:open-recycle-bin',async()=>{try{if(process.platform==='win32'){const child=spawn('explorer.exe',['shell:RecycleBinFolder'],{detached:true,stdio:'ignore',windowsHide:false});child.unref();return{ok:true}}const target=path.join(app.getPath('home'),'.Trash'),error=await shell.openPath(target);return error?{error}:{ok:true}}catch(error){return{error:error.message}}});

ipcMain.handle('app:open-bug-feedback', event => {try{const parent=BrowserWindow.fromWebContents(event.sender);const existing=BrowserWindow.getAllWindows().find(win=>win.__nestBugFeedback);if(existing){existing.show();existing.focus();return{ok:true}}const win=new BrowserWindow({width:1080,height:760,minWidth:720,minHeight:520,title:'小旺仔素材库 · Bug 反馈',parent:parent||undefined,icon:path.join(app.getAppPath(),'build','icon.png'),backgroundColor:'#15191e',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});win.__nestBugFeedback=true;win.loadURL('https://docs.qq.com/form/page/DV2JNUUd3cEVqSHZt');win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:/.test(url)){win.loadURL(url);return{action:'deny'}}return{action:'deny'}});return{ok:true}}catch(error){return{error:`无法打开 Bug 反馈：${error.message}`}}});

ipcMain.handle('app:set-fullscreen',(event,enabled)=>{const win=BrowserWindow.fromWebContents(event.sender);if(!win||win.isDestroyed())return{error:'窗口不可用'};win.setFullScreen(Boolean(enabled));return{ok:true,fullscreen:win.isFullScreen()}});

ipcMain.handle('app:set-inspector-open',(event,open,width=350,options={})=>{
 const win=BrowserWindow.fromWebContents(event.sender);if(!win||win.isDestroyed())return{error:'窗口不可用'};
 const immediate=Boolean(options?.immediate);let record=inspectorWindows.get(win);
 if(open){
  if(record?.open)return{ok:true,added:record.added};
  const preserveWindowMode=win.isMaximized()||win.isFullScreen();
  if(preserveWindowMode){record={open:true,base:win.getBounds(),added:0,preserveWindowMode:true,animation:null};inspectorWindows.set(win,record);return{ok:true,added:0,preserveWindowMode:true}}
  const base=win.getBounds(),workArea=screen.getDisplayMatching(base).workArea,target=inspectorBounds(base,workArea,Math.max(280,Math.min(460,Number(width)||350)));
  record={open:true,base,added:target.added,preserveWindowMode:false,animation:null};inspectorWindows.set(win,record);
  if(immediate)win.setBounds(target,false);else animateWindowBounds(win,target);
  return{ok:true,added:target.added,preserveWindowMode:false};
 }
 if(!record?.open)return{ok:true,added:0};if(record.animation)clearTimeout(record.animation);record.open=false;
 if(record.preserveWindowMode){inspectorWindows.delete(win);return{ok:true,added:0}}
 const closeTarget=record.base;
 if(immediate){win.setBounds(closeTarget,false);inspectorWindows.delete(win)}else{animateWindowBounds(win,closeTarget);setTimeout(()=>{inspectorWindows.delete(win)},260)}
 return{ok:true,added:0};
});

ipcMain.handle('app:window-control',(event,action)=>{const win=BrowserWindow.fromWebContents(event.sender);if(!win||win.isDestroyed())return{error:'窗口不可用'};if(action==='minimize')win.minimize();else if(action==='maximize')win.isMaximized()?win.unmaximize():win.maximize();else if(action==='close')win.close();else return{error:'未知窗口操作'};return{ok:true,maximized:!win.isDestroyed()&&win.isMaximized()}});

ipcMain.handle('app:set-title-bar-colors',(event,colors={})=>{const win=BrowserWindow.fromWebContents(event.sender);if(process.platform!=='win32'||!win||win.isDestroyed())return{ok:true};const validColor=value=>/^#[0-9a-f]{6,8}$/i.test(String(value||''));if(!validColor(colors.background)||!validColor(colors.symbols))return{error:'标题栏颜色无效'};win.setTitleBarOverlay({color:colors.background,symbolColor:colors.symbols,height:44});return{ok:true,native:true}});


ipcMain.handle('app:open-update', async (_, url) => {try{if(!/^https:\/\/github\.com\//i.test(String(url)))return{error:'更新地址无效'};await shell.openExternal(url);return{ok:true}}catch(error){return{error:`无法打开更新地址：${error.message}`}}});


}
module.exports = { registerAppHandlers };
