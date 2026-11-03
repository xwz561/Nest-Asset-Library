function registerFriendToolsHandlers({ ipcMain, BrowserWindow, petMainWindows, app, path, fs, spawn, shell, runtimeState, electronDirectory, platform = process.platform, homeDirectory = require('os').homedir() }) {
// Mineradio 有官方 Mac 版（作者已把仓库改名为 Mineradio-paused）。Mac 上不打包它：已安装就直接打开，没装就打开下载页。
const MINERADIO_MAC_DOWNLOAD='https://github.com/XxHuberrr/Mineradio-paused/releases';
const openMacMineradio=async()=>{
  const installed=['/Applications/Mineradio.app',path.join(homeDirectory,'Applications','Mineradio.app')].find(candidate=>fs.existsSync(candidate));
  if(installed){const failure=await shell.openPath(installed);return failure?{error:`Mineradio 启动失败：${failure}`}:{ok:true,launched:installed};}
  await shell.openExternal(MINERADIO_MAC_DOWNLOAD);
  return{ok:true,downloadPage:MINERADIO_MAC_DOWNLOAD};
};
ipcMain.handle('friend-tools:open-mineradio', async event => {
  const parent=BrowserWindow.fromWebContents(event.sender);
  if(!parent||!petMainWindows.has(parent))return{error:'友商工具集只能从素材库主窗口打开'};
  if(platform==='darwin')return openMacMineradio();
  if(platform!=='win32')return{error:'Mineradio 便携版目前仅支持 Windows x64'};
  const toolDir=app.isPackaged
    ? path.join(process.resourcesPath,'friend-tools','mineradio')
    : path.join(app.getAppPath(),'build','friend-tools','mineradio');
  const executable=path.join(toolDir,'Mineradio.exe');
  if(!fs.existsSync(executable))return{error:'安装包中缺少 Mineradio，请重新安装素材库'};
  try {
    const child=spawn(executable,[],{cwd:toolDir,detached:true,stdio:'ignore',windowsHide:false});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});
    child.unref();
    return{ok:true};
  }catch(error){return{error:`Mineradio 启动失败：${error.message}`}}
});

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

ipcMain.handle('friend-tools:open-hongguo', async event => {
  const parent=BrowserWindow.fromWebContents(event.sender);
  if(!parent||!petMainWindows.has(parent))return{error:'友商工具集只能从素材库主窗口打开'};
  if(process.platform!=='win32')return{error:'红果桌面版目前仅支持 Windows x64'};
  try {
    const isHongguoShortcut=file=>/^(?:红果|hongguo)/i.test(path.basename(file,path.extname(file)))&&/\.lnk$/i.test(file);
    const searchShortcuts=(root,depth=0)=>{
      if(!root||depth>5||!fs.existsSync(root))return[];
      let entries=[];
      try{entries=fs.readdirSync(root,{withFileTypes:true})}catch{return[]}
      const found=[];
      for(const entry of entries){
        const file=path.join(root,entry.name);
        if(entry.isFile()&&isHongguoShortcut(file))found.push(file);
        else if(entry.isDirectory()&&!entry.isSymbolicLink()&&depth<5)found.push(...searchShortcuts(file,depth+1));
      }
      return found;
    };
    const shortcutRoots=[
      path.join(app.getPath('appData'),'Microsoft','Windows','Start Menu','Programs'),
      path.join(process.env.ProgramData||'','Microsoft','Windows','Start Menu','Programs'),
      app.getPath('desktop')
    ];
    const shortcut=shortcutRoots.flatMap(root=>searchShortcuts(root)).sort((a,b)=>a.length-b.length)[0];
    if(shortcut){
      const error=await shell.openPath(shortcut);
      if(error)throw new Error(`无法启动已安装的红果桌面版：${error}`);
      return{ok:true,mode:'launch'};
    }
    const installer=app.isPackaged
      ? path.join(process.resourcesPath,'friend-tools','hongguo-1.0.13-windows-x86_64-setup.exe')
      : path.join(app.getAppPath(),'build','friend-tools','hongguo-1.0.13-windows-x86_64-setup.exe');
    if(!fs.existsSync(installer))return{error:'安装包中缺少红果桌面版安装程序，请重新安装素材库'};
    const child=spawn(installer,[],{cwd:path.dirname(installer),detached:true,stdio:'ignore',windowsHide:false});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});
    child.unref();
    return{ok:true,mode:'installer'};
  }catch(error){return{error:`红果桌面版打开失败：${error.message}`}}
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
