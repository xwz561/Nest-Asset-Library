const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { app, ipcMain, protocol, BrowserWindow, shell } = require('electron');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-delete-integration-'));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-delete-profile-'));
process.env.NEST_USER_DATA_DIR = profile;
fs.mkdirSync(path.join(root,'assets'));
fs.writeFileSync(path.join(root,'assets','large.wav'), Buffer.alloc(8*1024*1024));
fs.writeFileSync(path.join(root,'.nest-library.json'),JSON.stringify({version:1,name:path.basename(root),assets:[],folders:[{id:'flow',name:'FLOW',aiFlowRootSync:{liveSync:true,serverOrigin:'http://127.0.0.1:9999',projectId:'1'}}],tags:[],aiFlowLiveSync:{pendingUploads:[],pendingMoves:[],pendingDeletes:[]}}));
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({libraryPath:root,profile:{id:"test-owner",name:"test"}}));
const handlers = new Map();
const originalHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (name, fn) => { handlers.set(name,fn); originalHandle(name,fn); };
let assetHandler;
const originalProtocol = protocol.handle.bind(protocol);
protocol.handle = (scheme, fn) => { if(scheme==='nest')assetHandler=fn; return originalProtocol(scheme,fn); };
const recycle = require('../electron/recycle-bin.cjs');
const actualRecycle = recycle.moveToRecycleBin;
let simulateFailure = true;
recycle.moveToRecycleBin = async (target, options) => {
 assert.equal(handlers.get('library:current')(), null, 'library must detach before recycle');
 const snapshot=JSON.parse(fs.readFileSync(path.join(target,'.nest-library.json')));
 assert.ok(snapshot.folders.every(folder=>!folder.aiFlowRootSync&&!folder.aiFlowFolderSync));
 assert.deepEqual(snapshot.aiFlowLiveSync.pendingMoves,[]);
 if(simulateFailure)throw new Error('simulated recycle failure');
 return actualRecycle(target,options);
};
require('../electron/main.cjs');
app.whenReady().then(async()=>{
 try {
  fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({libraryPath:root,profile:{id:'test-owner',name:'test'}}));
  const library=handlers.get('library:current')();
  assert.equal(library.path,root);
  const response=assetHandler(new Request('nest://asset/large.wav'));
  assert.equal(response.status,200);
  const failed=await handlers.get('library:delete-library')(null,path.basename(root));
  assert.ok(failed.error);
  assert.ok(fs.existsSync(root));
  assert.equal(handlers.get('library:current')().path,root);
  simulateFailure=false;
  const result=await handlers.get('library:delete-library')(null,path.basename(root));
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(fs.existsSync(root),false);
  assert.equal(handlers.get('library:current')(),null);
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'settings.json'))).libraryPath,null);
  console.log('PASS real Electron deletion with open media response, linked Flow folder, and settings reload');
  app.exit(0);
 }catch(error){console.error(error);app.exit(1);}
});
setTimeout(()=>{console.error('integration timeout');app.exit(2)},30000).unref();


