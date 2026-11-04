function registerFriendToolsHandlers({ ipcMain, BrowserWindow, petMainWindows, app, path, fs, spawn, shell, runtimeState, electronDirectory, platform = process.platform, homeDirectory = require('os').homedir() }) {
ipcMain.handle('friend-tools:open-cursor-picker', async event => {
  const parent=BrowserWindow.fromWebContents(event.sender);
  if(!parent||!petMainWindows.has(parent))return{error:'友商工具集只能从素材库主窗口打开'};
  if(process.platform!=='win32')return{error:'macOS 指针管家目前仅支持 Windows'};
  const executable=app.isPackaged
    ? path.join(process.resourcesPath,'friend-tools','macOS-CursorPicker-Final.exe')
    : path.join(app.getAppPath(),'build','friend-tools','macOS-CursorPicker-Final.exe');
  if(!fs.existsSync(executable))return{error:'安装包中缺少 macOS 指针管家，请重新安装最新版本'};
  try {
    const child=spawn(executable,[],{cwd:path.dirname(executable),detached:true,stdio:'ignore',windowsHide:false});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});
    child.unref();
    return{ok:true};
  } catch(error) {
    return{error:`启动 macOS 指针管家失败：${error.message}`};
  }
});

ipcMain.handle('friend-tools:open-depth-video-converter', async event => {
  const parent=BrowserWindow.fromWebContents(event.sender);
  if(!parent||!petMainWindows.has(parent))return{error:'友商工具集只能从素材库主窗口打开'};
  if(process.platform!=='win32')return{error:'深度视频转换器目前仅支持 Windows x64'};
  const toolDir=app.isPackaged
    ? path.join(process.resourcesPath,'friend-tools','depth-video-converter')
    : path.join(app.getAppPath(),'build','friend-tools');
  const executable=path.join(toolDir,'DepthVideoConverterV2.exe');
  const model=path.join(toolDir,'depth-anything-v2-small-quantized.onnx');
  if(!fs.existsSync(executable))return{error:'安装包中缺少深度视频转换器，请重新安装素材库'};
  if(!fs.existsSync(model))return{error:'安装包中缺少 ONNX 深度模型，请重新安装素材库'};
  try {
    const child=spawn(executable,[],{cwd:toolDir,detached:true,stdio:'ignore',windowsHide:false});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});
    child.unref();
    return{ok:true};
  }catch(error){return{error:`深度视频转换器启动失败：${error.message}`}}
});

ipcMain.handle('calendar:open', async event => {
  const parent=BrowserWindow.fromWebContents(event.sender);
  if(!parent||!petMainWindows.has(parent))return{error:'日历只能从素材库主窗口打开'};
  if(runtimeState.calendarWindow&&!runtimeState.calendarWindow.isDestroyed()){
    if(runtimeState.calendarWindow.isMinimized())runtimeState.calendarWindow.restore();
    runtimeState.calendarWindow.show();runtimeState.calendarWindow.focus();
    return{ok:true,existing:true};
  }
  const page=path.join(app.getAppPath(),'dist','calendar','index.html');
  if(!fs.existsSync(page))return{error:'日历页面未随安装包打包，请重新构建'};
  const win=new BrowserWindow({width:780,height:860,title:'老黄历',parent,frame:false,transparent:true,hasShadow:false,backgroundColor:'#00000000',resizable:false,webPreferences:{preload:path.join(electronDirectory,'calendar-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  runtimeState.calendarWindow=win;
  win.once('closed',()=>{if(runtimeState.calendarWindow===win)runtimeState.calendarWindow=null;});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  try{await win.loadURL('nest-calendar://app/index.html');return{ok:true}}catch(error){if(!win.isDestroyed())win.close();return{error:`日历打开失败：${error.message}`}}
});

ipcMain.handle('calendar:close', event => {
  const owner=BrowserWindow.fromWebContents(event.sender);
  if(!owner||owner!==runtimeState.calendarWindow)return{error:'日历窗口不可用'};
  owner.close();return{ok:true};
});
}
module.exports = { registerFriendToolsHandlers };
