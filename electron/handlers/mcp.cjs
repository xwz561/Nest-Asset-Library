function registerMcpHandlers({ ipcMain, path, app, runtimeState }) {
ipcMain.handle('mcp:config',()=>runtimeState.libraryPath?{command:process.execPath,args:[path.join(app.getAppPath(),'electron','mcp-server.cjs'),`--library=${runtimeState.libraryPath}`,'--permissions=library.read'],env:{ELECTRON_RUN_AS_NODE:'1'}}:{error:'请先打开资源库'});
}
module.exports = { registerMcpHandlers };
