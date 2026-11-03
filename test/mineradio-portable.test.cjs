const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {EventEmitter}=require('node:events');
const {registerFriendToolsHandlers}=require('../electron/handlers/friend-tools.cjs');

function fixture({trusted=true,missing=false,fail=false}={}) {
  const handlers=new Map(),calls=[],parent={},state={calendarWindow:null};
  registerFriendToolsHandlers({
    ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},BrowserWindow:{fromWebContents:()=>parent},
    petMainWindows:new Set(trusted?[parent]:[]),app:{isPackaged:false,getAppPath:()=>path.resolve(__dirname,'..')},
    path,fs:{existsSync:()=>!missing},shell:{},runtimeState:state,electronDirectory:'unused',
    spawn:(file,args,options)=>{calls.push({file,args,options});const child=new EventEmitter();child.unref=()=>{calls[0].unref=true;};queueMicrotask(()=>child.emit(fail?'error':'spawn',new Error('simulated failure')));return child;},
  });
  return {launch:()=>handlers.get('friend-tools:open-mineradio')({sender:{}}),calls};
}
test('Mineradio launches the complete portable executable directly without an installer',{skip:process.platform!=='win32'&&'Windows-only bundled executable'},async()=>{
  const f=fixture();assert.equal((await f.launch()).ok,true);
  assert.match(f.calls[0].file,/friend-tools[\\/]mineradio[\\/]Mineradio\.exe$/);
  assert.equal(f.calls[0].options.cwd,path.dirname(f.calls[0].file));
  assert.deepEqual(f.calls[0].args,[]);assert.equal(f.calls[0].unref,true);
  assert.doesNotMatch(f.calls[0].file,/-Setup\.exe/i);
});
test('Mineradio refuses untrusted renderer windows',{skip:process.platform!=='win32'&&'Windows-only handler behavior'},async()=>{
  const f=fixture({trusted:false});assert.ok((await f.launch()).error);assert.equal(f.calls.length,0);
});
test('Mineradio reports a missing bundled executable without spawning',{skip:process.platform!=='win32'&&'Windows-only bundled executable'},async()=>{
  const f=fixture({missing:true});assert.ok((await f.launch()).error);assert.equal(f.calls.length,0);
});
test('Mineradio surfaces process startup errors',{skip:process.platform!=='win32'&&'Windows-only process launch'},async()=>{
  assert.match((await fixture({fail:true}).launch()).error,/simulated failure/);
});
test('Windows packaging includes the entire Mineradio runtime and its license and source',{skip:process.platform!=='win32'&&'Windows-only package resources'},()=>{
  const root=path.resolve(__dirname,'..'),pkg=require('../package.json');
  assert.ok(pkg.build.win.extraResources.some(r=>r.from==='build/friend-tools/mineradio'&&r.to==='friend-tools/mineradio'));
  const dir=path.join(root,'build','friend-tools','mineradio');
  for(const file of ['Mineradio.exe','ffmpeg.dll','icudtl.dat','locales/en-US.pak','resources/app/desktop/main.js','resources/app/server.js','resources/app/LICENSE','resources/app/NOTICE.md','resources/app/node_modules/ws/package.json']) assert.equal(fs.existsSync(path.join(dir,file)),true,file);
  assert.match(fs.readFileSync(path.join(dir,'resources/app/LICENSE'),'utf8'),/GNU GENERAL PUBLIC LICENSE/);
});
