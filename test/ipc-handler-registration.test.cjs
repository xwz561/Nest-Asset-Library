const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const expected=require('./fixtures/ipc-channels.json');
function dependencies(file, overrides={}) {
  const header=fs.readFileSync(file,'utf8').match(/^function \w+\(\{ ([^}]+) \}\)/);
  return {...Object.fromEntries(header[1].split(',').map(n=>[n.trim(),()=>{}])),...overrides};
}
test('IPC domain registration preserves every existing channel and adds automatic update settings',t=>{
  const channels=new Map();const ipcMain={handle(name,fn){assert.equal(channels.has(name),false,`duplicate ${name}`);channels.set(name,fn);},removeHandler(name){assert.equal(channels.delete(name),true,`missing override ${name}`);}};
  const dir=path.resolve(__dirname,'../electron/handlers');
  for(const entry of fs.readdirSync(dir).filter(n=>n.endsWith('.cjs'))){const file=path.join(dir,entry);Object.values(require(file))[0](dependencies(file,{ipcMain}));}
  const directory=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'nest-update-ipc-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const controller=require('../electron/update-controller.cjs').registerUpdateController({app:{getPath:()=>directory,getVersion:()=> '3.0.41',isPackaged:false},ipcMain:{...ipcMain,on(){}},net:{fetch:async()=>{throw new Error('network unavailable in isolated registration test');}},getMainWindows:()=>[]});t.after(()=>controller.stop());
  assert.deepEqual([...channels.keys()].sort(),[...expected,'app:auto-update-state','app:set-auto-update'].sort());
});
test('library IPC reads and changes the live shared library state instead of a copied snapshot',()=>{
  const file=path.resolve(__dirname,'../electron/handlers/library.cjs');const channels=new Map();let currentRoot=null;
  const runtimeState={get libraryPath(){return currentRoot;},set libraryPath(value){currentRoot=value;},deletingLibrary:false};
  require(file).registerLibraryHandlers(dependencies(file,{
    ipcMain:{handle:(name,fn)=>channels.set(name,fn)},runtimeState,
    readJson:()=>({libraryPath:'first-library'}),settingsFile:()=>'settings',indexFile:root=>root+'/index',
    fs:{existsSync:()=>true},readLibrary:()=>({path:currentRoot,assets:[],folders:[]}),
    reconcileLibraryRecycleState:()=>[],publicLibrary:data=>data,
  }));
  assert.equal(channels.get('library:current')().path,'first-library');
  assert.equal(currentRoot,'first-library');currentRoot='second-library';
  assert.equal(channels.get('library:current')().path,'second-library');
});
