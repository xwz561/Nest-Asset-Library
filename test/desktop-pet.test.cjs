const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
test('pet settings accept the silver kitten and keep unknown IDs on the default pet',()=>{const {normalizePetSettings}=require('../electron/desktop-pet.cjs');assert.equal(normalizePetSettings({petId:'silver-kitten'}).petId,'silver-kitten');assert.equal(normalizePetSettings({petId:'not-a-real-pet'}).petId,'maid-deepseek-whale');});
test('pet settings constrain scale and keep unrelated data out',()=>{const {normalizePetSettings}=require('../electron/desktop-pet.cjs');const {hunger,hungerScale,hungerUpdatedAt,petId,...core}=normalizePetSettings({enabled:true,size:500,throwEnabled:false,autonomyEnabled:false,libraryPath:'real'});assert.deepEqual(core,{enabled:true,size:200,throwEnabled:false,autonomyEnabled:false});assert.equal(hunger,10);assert.equal(hungerScale,10);assert.ok(Number.isFinite(hungerUpdatedAt));assert.equal(petId,'maid-deepseek-whale');assert.equal(normalizePetSettings({size:NaN}).size,100);assert.equal(normalizePetSettings({size:-1}).size,50);assert.equal(normalizePetSettings({}).autonomyEnabled,true);});
test('pet window boundary follows the visible character crop',()=>{const {petWindowSize}=require('../electron/desktop-pet.cjs');assert.deepEqual(petWindowSize(50),{width:51,height:62});assert.deepEqual(petWindowSize(100),{width:102,height:124});assert.deepEqual(petWindowSize(200),{width:204,height:248});});
test('pet window uses only dedicated QA settings and closes without disabling saved preference',()=>{const {createPetController}=require('../electron/desktop-pet.cjs');const temp=fs.mkdtempSync(path.join(os.tmpdir(),'Nest-Pet-QA-'));assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep));try{const handlers=new Map(),windows=[];class Window extends EventEmitter{constructor(options){super();this.options=options;this.webContents={send(){},setWindowOpenHandler(){},on(){}};this.bounds={x:0,y:0,width:options.width,height:options.height};windows.push(this)}loadFile(){return Promise.resolve()}setPosition(x,y){this.bounds.x=x;this.bounds.y=y}getPosition(){return[this.bounds.x,this.bounds.y]}getBounds(){return this.bounds}setBounds(b){Object.assign(this.bounds,b)}setSize(w,h){this.bounds.width=w;this.bounds.height=h}isDestroyed(){return!!this.dead}destroy(){this.dead=true;this.emit('closed')}showInactive(){}setAlwaysOnTop(){}setSkipTaskbar(){}}
const screen={getPrimaryDisplay:()=>({workArea:{x:-1920,y:0,width:1920,height:1080}}),getDisplayNearestPoint:()=>({workArea:{x:-1920,y:0,width:1920,height:1080}}),getCursorScreenPoint:()=>({x:-100,y:400}),on(){},removeListener(){}};const controller=createPetController({app:{getPath:()=>temp,getAppPath:()=>process.cwd()},BrowserWindow:Window,screen,ipcMain:{handle:(k,v)=>handlers.set(k,v)},isTrustedSender:e=>e.sender==='main'});
assert.equal(controller.get().enabled,false);controller.update({enabled:true,size:200,throwEnabled:false});assert.equal(windows.length,1);assert.equal(windows[0].options.transparent,true);assert.equal(windows[0].options.webPreferences.nodeIntegration,false);assert.ok(windows[0].bounds.x>=-1920&&windows[0].bounds.x+windows[0].bounds.width<=0);assert.throws(()=>handlers.get('pet:update')({sender:'external'},{enabled:false}),/sender/);controller.shutdown();assert.equal(windows[0].dead,true);assert.equal(JSON.parse(fs.readFileSync(path.join(temp,'pet-settings.json'))).enabled,true);assert.deepEqual(fs.readdirSync(temp),['pet-settings.json']);
}finally{fs.rmSync(temp,{recursive:true,force:true});}});

test('dragging samples the native cursor without renderer move round trips',async()=>{
 const {createPetController}=require('../electron/desktop-pet.cjs');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'Nest-Pet-QA-'));
 assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep));
 try{
  const handlers=new Map();let cursor={x:500,y:400},win;
  class Window extends EventEmitter{constructor(options){super();this.webContents={send(){},setWindowOpenHandler(){},on(){}};this.bounds={x:0,y:0,width:options.width,height:options.height};win=this}loadFile(){return Promise.resolve()}setPosition(x,y){this.bounds.x=x;this.bounds.y=y}getPosition(){return[this.bounds.x,this.bounds.y]}getBounds(){return this.bounds}setBounds(b){Object.assign(this.bounds,b)}setSize(w,h){this.bounds.width=w;this.bounds.height=h}isDestroyed(){return!!this.dead}destroy(){this.dead=true;this.emit('closed')}showInactive(){}}
  const workArea={x:0,y:0,width:1920,height:1080};
  const screen={getPrimaryDisplay:()=>({workArea}),getDisplayNearestPoint:()=>({workArea}),getCursorScreenPoint:()=>cursor,on(){}};
  const controller=createPetController({app:{getPath:()=>temp},BrowserWindow:Window,screen,ipcMain:{handle:(key,value)=>handlers.set(key,value)},isTrustedSender:()=>false});
  controller.update({enabled:true,throwEnabled:false});win.setPosition(300,300);
  await handlers.get('pet:drag-start')({sender:win.webContents});
  cursor={x:620,y:460};
  await new Promise(resolve=>setTimeout(resolve,45));
  assert.deepEqual(win.getPosition(),[420,360]);
  await handlers.get('pet:drag-end')({sender:win.webContents});
  controller.shutdown();
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});

test('desktop pet context menu feeds, sleeps, walks, interacts, and can pause autonomous activity',()=>{
 const {createPetController}=require('../electron/desktop-pet.cjs');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'Nest-Pet-QA-'));
 try{
  const handlers=new Map(),actions=[],menus=[];let win;
  class Window extends EventEmitter{constructor(options){super();this.webContents={send:(channel,value)=>{if(channel==='pet:action')actions.push(value.action)},setWindowOpenHandler(){},on(){}};this.bounds={x:0,y:0,width:options.width,height:options.height};win=this}loadFile(){return Promise.resolve()}setPosition(x,y){this.bounds.x=x;this.bounds.y=y}getPosition(){return[this.bounds.x,this.bounds.y]}getBounds(){return this.bounds}setBounds(b){Object.assign(this.bounds,b)}setSize(w,h){this.bounds.width=w;this.bounds.height=h}setBounds(b){Object.assign(this.bounds,b)}isDestroyed(){return!!this.dead}destroy(){this.dead=true;this.emit('closed')}showInactive(){}};
  const Menu={buildFromTemplate:items=>{menus.push(items);return{popup(){}}}};
  const area={x:0,y:0,width:1000,height:800},screen={getPrimaryDisplay:()=>({workArea:area}),getDisplayNearestPoint:()=>({workArea:area}),getCursorScreenPoint:()=>({x:100,y:100}),on(){}};
  const controller=createPetController({app:{getPath:()=>temp},BrowserWindow:Window,Menu,screen,ipcMain:{handle:(key,value)=>handlers.set(key,value)},isTrustedSender:()=>false});
  controller.update({enabled:true});win.emit('ready-to-show');
  assert.deepEqual(handlers.get('pet:menu')({sender:win.webContents}),{ok:true});
  const items=menus[0];assert.deepEqual(items.filter(item=>item.label).map(item=>item.label),['端上点心（投喂文件或文件夹…）','行礼问候','召唤海洋伙伴','巡视房间','牵小猫去散步','小憩片刻','摸摸头','暂停女仆值班']);
  for(const item of items.filter(item=>item.click&&!/投喂/.test(item.label)))item.click();
  assert.ok(actions.includes('emote'));assert.ok(actions.includes('animals'));assert.ok(actions.includes('sleep'));assert.ok(actions.includes('walk'));assert.ok(actions.includes('leash-walk'));assert.ok(actions.includes('interact'));
  assert.equal(controller.get().autonomyEnabled,false);assert.equal(JSON.parse(fs.readFileSync(path.join(temp,'pet-settings.json'))).autonomyEnabled,false);
  controller.shutdown();
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
