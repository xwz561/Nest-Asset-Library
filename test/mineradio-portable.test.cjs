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

// ---------- macOS：用 Mineradio 官方 Mac 版（不打包进安装包） ----------
function macFixture({ installed = [], openPathError = '', platform = 'darwin' } = {}) {
  const handlers = new Map(), opened = [], external = [], spawned = [], parent = {};
  registerFriendToolsHandlers({
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, BrowserWindow: { fromWebContents: () => parent },
    petMainWindows: new Set([parent]), app: { isPackaged: true, getAppPath: () => '/app' }, path: path.posix,
    fs: { existsSync: (p) => installed.includes(p) },
    shell: { openPath: async (p) => { opened.push(p); return openPathError; }, openExternal: async (u) => { external.push(u); } },
    spawn: (...args) => { spawned.push(args); throw new Error('should not spawn on macOS'); },
    runtimeState: {}, electronDirectory: 'unused', platform, homeDirectory: '/Users/edy',
  });
  return { launch: () => handlers.get('friend-tools:open-mineradio')({ sender: {} }), opened, external, spawned };
}

test('macOS：已安装 Mineradio.app 时直接打开（应用程序 或 ~/应用程序）', async () => {
  for (const app of ['/Applications/Mineradio.app', '/Users/edy/Applications/Mineradio.app']) {
    const f = macFixture({ installed: [app] });
    const result = await f.launch();
    assert.equal(result.ok, true);
    assert.equal(result.launched, app);
    assert.deepEqual(f.opened, [app]);
    assert.deepEqual([f.external.length, f.spawned.length], [0, 0]);
  }
});

test('macOS：没装 Mineradio 时打开官方 Mac 版下载页', async () => {
  const f = macFixture();
  const result = await f.launch();
  assert.equal(result.ok, true);
  assert.equal(result.downloadPage, 'https://github.com/XxHuberrr/Mineradio-paused/releases');
  assert.deepEqual(f.external, ['https://github.com/XxHuberrr/Mineradio-paused/releases']);
  assert.equal(f.opened.length, 0);
});

test('macOS：打开失败时把原因告诉用户；Linux 仍提示不支持', async () => {
  const fail = await macFixture({ installed: ['/Applications/Mineradio.app'], openPathError: 'App is damaged' }).launch();
  assert.match(fail.error, /App is damaged/);
  const linux = macFixture({ platform: 'linux' });
  assert.match((await linux.launch()).error, /仅支持 Windows/);
  assert.deepEqual([linux.opened.length, linux.external.length], [0, 0]);
});

test('Mac 上工具集按钮可以点开；Windows 专用的工具标"仅 Windows 可用"并置灰', () => {
  const root = path.resolve(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.jsx'), 'utf8');
  const dialog = fs.readFileSync(path.join(root, 'src', 'components', 'friend-tools-dialog.jsx'), 'utf8');
  assert.match(main, /disabled=\{!\["win32", "darwin"\]\.includes\(window\.nestDesktop\.platform\)\}/);
  assert.match(main, /platform=\{window\.nestDesktop\?\.platform\}/);
  for (const launcher of ['launchCursorPicker', 'launchHongguo', 'launchDepthVideoConverter']) {
    assert.match(dialog, new RegExp(`disabled=\{busy \|\| windowsOnly\} title=\{onlyOnWindows \|\| undefined\} onClick=\{${launcher}\}`));
  }
  assert.match(dialog, /disabled=\{busy\} onClick=\{launchMineradio\}/, 'Mineradio 在 Mac 上可点');
  assert.match(dialog, /仅 Windows 可用/);
});
