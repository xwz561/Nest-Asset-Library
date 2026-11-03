const fs=require('fs'),path=require('path');
const {petMenuTemplate}=require('./pet-menus.cjs');
// pet-leash.js is shared with the pet window (plain <script>), and the package is ESM,
// so load it the same way the tests load pet-kitten.js instead of require().
const {layout:leashLayout}=(()=>{const sandbox={module:{exports:{}},Math,Number};require('vm').runInNewContext(fs.readFileSync(path.join(__dirname,'pet-leash.js'),'utf8'),sandbox);return sandbox.module.exports;})();
const {estimateReleaseVelocity,trimTrail,throwStep,DEFAULT_PHYSICS}=require('./vendor/dsh-pet-physics.cjs');
const {moveToRecycleBin}=require('./recycle-bin.cjs');
const PET_IDS=new Set(['maid-deepseek-whale','liu-hai-buddy','glasses-buddy','silver-kitten']);
const LEASH_PETS=new Set(['maid-deepseek-whale','silver-kitten']);
const DEFAULT_PET={enabled:false,size:100,throwEnabled:true,autonomyEnabled:true,hunger:10,hungerUpdatedAt:Date.now(),hungerScale:10,petId:'maid-deepseek-whale'};
const PET_MOTION_INTERVAL_MS=8;
const HUNGER_MAX=10;
const HUNGER_DECAY_INTERVAL_MS=60*60*1000;
function normalizePetSettings(value={}){const n=Number(value.size),rawHunger=Number(value.hunger),updatedAt=Number(value.hungerUpdatedAt),legacyScale=value.hungerScale!==HUNGER_MAX;const hunger=Number.isFinite(rawHunger)?Math.max(0,Math.min(legacyScale?100:HUNGER_MAX,rawHunger)):legacyScale?100:HUNGER_MAX;return {enabled:typeof value.enabled==='boolean'?value.enabled:DEFAULT_PET.enabled,size:Number.isFinite(n)?Math.min(200,Math.max(50,Math.round(n))):100,throwEnabled:typeof value.throwEnabled==='boolean'?value.throwEnabled:true,autonomyEnabled:typeof value.autonomyEnabled==='boolean'?value.autonomyEnabled:true,hunger:legacyScale?Math.round(hunger/10):Math.round(hunger),hungerUpdatedAt:legacyScale||!Number.isFinite(updatedAt)||updatedAt<=0?Date.now():updatedAt,hungerScale:HUNGER_MAX,petId:PET_IDS.has(value.petId)?value.petId:DEFAULT_PET.petId};}
function petWindowSize(size=100,petId=DEFAULT_PET.petId){const scale=Math.min(200,Math.max(50,Number(size)||100))/100;return{width:Math.round((petId==='maid-deepseek-whale'?102:114)*scale),height:Math.round(124*scale)};}
function createPetController({app,BrowserWindow,Menu,screen,ipcMain,dialog,shell,nativeImage,isTrustedSender,onChange=()=>{}}){
 const file=path.join(app.getPath('userData'),'pet-settings.json');let settings={...DEFAULT_PET},win=null,drag=null,timer=null,throwState=null,quitting=false,activityTimer=null,walkTimer=null,hungerTimer=null,animalWindowState=null,leashWindowState=null,collapsedWindowState=null,restoreAnimalWindow=()=>{},restoreLeashWindow=()=>{},migratedLegacyHunger=false;
 try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));migratedLegacyHunger=saved?.hungerScale!==HUNGER_MAX;settings=normalizePetSettings(saved);}catch{}
 const get=()=>({...settings});const stop=()=>{if(timer)clearInterval(timer);timer=null;drag=null;throwState=null;};
 const stopActivity=()=>{if(activityTimer)clearTimeout(activityTimer);if(walkTimer)clearInterval(walkTimer);activityTimer=walkTimer=null;restoreAnimalWindow();restoreLeashWindow();};
 const persist=()=>{fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(settings,null,2));fs.renameSync(temp,file);};
 if(migratedLegacyHunger)persist();
 const bounds=()=>{const w=win.getBounds(),area=screen.getDisplayNearestPoint({x:w.x+w.width/2,y:w.y+w.height/2}).workArea;return{minX:area.x,minY:area.y,maxX:Math.max(area.x,area.x+area.width-w.width),maxY:Math.max(area.y,area.y+area.height-w.height)};};
 const sampleDrag=()=>{if(!drag||!win||win.isDestroyed())return false;const p=screen.getCursorScreenPoint(),now=Date.now();drag.trail=trimTrail([...drag.trail,{...p,t:now}],now);win.setPosition(Math.round(drag.origin.x+p.x-drag.cursor.x),Math.round(drag.origin.y+p.y-drag.cursor.y));clamp();return true;};
 const clamp=()=>{if(!win||win.isDestroyed())return;const b=bounds(),p=win.getPosition();win.setPosition(Math.round(Math.max(b.minX,Math.min(b.maxX,p[0]))),Math.round(Math.max(b.minY,Math.min(b.maxY,p[1]))));};
 const setCollapsedWindow=collapsed=>{if(!win||win.isDestroyed())return false;if(collapsed){if(animalWindowState)restoreAnimalWindow();if(leashWindowState)restoreLeashWindow();return true;}if(collapsed){if(collapsedWindowState)return false;if(animalWindowState)restoreAnimalWindow();const b=win.getBounds(),scale=Math.min(200,Math.max(50,Number(settings.size)||100))/100;collapsedWindowState={width:b.width,height:b.height};const width=Math.round(168*scale),height=Math.round(96*scale);win.setBounds({x:Math.round(b.x+(b.width-width)/2),y:Math.round(b.y+b.height-height),width,height});}else{if(!collapsedWindowState)return false;const b=win.getBounds(),saved=collapsedWindowState;collapsedWindowState=null;win.setBounds({x:Math.round(b.x+(b.width-saved.width)/2),y:Math.round(b.y+b.height-saved.height),width:saved.width,height:saved.height});}clamp();return true;};
 restoreLeashWindow=()=>{if(!leashWindowState||!win||win.isDestroyed())return;const saved=leashWindowState;leashWindowState=null;const b=win.getBounds(),l=leashLayout(saved.scale,saved.dir),box=saved.petId==='silver-kitten'?l.kitten:l.whale;win.setBounds({x:Math.round(b.x+box.x+box.w/2-saved.width/2),y:Math.round(b.y+b.height-saved.height),width:saved.width,height:saved.height});clamp();};
 restoreAnimalWindow=()=>{if(!animalWindowState||!win||win.isDestroyed())return;const saved=animalWindowState;animalWindowState=null;win.setSize(saved.width,saved.height);win.setPosition(saved.x,saved.y);clamp();};
 const resetPosition=()=>{if(!win||win.isDestroyed())return;stop();stopActivity();const a=screen.getPrimaryDisplay().workArea,w=win.getBounds();win.setPosition(Math.round(a.x+a.width-w.width-24),Math.round(a.y+a.height-w.height-24));clamp();scheduleActivity();};
 const destroy=()=>{stop();stopActivity();if(win&&!win.isDestroyed())win.destroy();win=null;};
  const sendAction=(action,extra={})=>{if(win&&!win.isDestroyed())win.webContents.send('pet:action',{action,...extra});};
 const refreshHunger=(broadcast=true)=>{const now=Date.now(),elapsed=now-settings.hungerUpdatedAt,steps=Math.floor(elapsed/HUNGER_DECAY_INTERVAL_MS);if(steps<=0)return false;const previous=settings.hunger;settings.hunger=Math.max(0,settings.hunger-steps);settings.hungerUpdatedAt+=steps*HUNGER_DECAY_INTERVAL_MS;persist();if(previous>0&&settings.hunger===0){if(activityTimer)clearTimeout(activityTimer);if(walkTimer)clearInterval(walkTimer);activityTimer=walkTimer=null;setCollapsedWindow(true);}if(broadcast){onChange(get());sendAction('status',{hunger:settings.hunger,instant:previous===0&&settings.hunger===0});}return true;};
 const tickHunger=()=>refreshHunger(true);
 const scheduleActivity=(delay=18000+Math.random()*22000)=>{if(activityTimer)clearTimeout(activityTimer);activityTimer=null;if(!settings.enabled||settings.hunger<=0||!settings.autonomyEnabled||quitting||!win||win.isDestroyed())return;activityTimer=setTimeout(()=>{activityTimer=null;const roll=Math.random();if(roll<0.26)perform('sleep');else if(roll<0.4&&LEASH_PETS.has(settings.petId))perform('leash-walk');else perform('walk');},delay);activityTimer.unref?.();};
  const walk=()=>{if(!win||win.isDestroyed())return;const b=bounds(),[currentX]=win.getPosition(),floorY=Math.max(b.minY,b.maxY-8),x0=Math.round(Math.max(b.minX,Math.min(b.maxX,currentX))),span=b.maxX-b.minX;let x1;if(span<180)x1=x0<b.maxX?b.maxX:b.minX;else{const direction=Math.random()<.5?-1:1,step=280+Math.random()*420,candidate=x0+direction*step;x1=Math.round(candidate<b.minX||candidate>b.maxX?x0-direction*step:Math.max(b.minX,Math.min(b.maxX,candidate)));}if(x1===x0)x1=x0===b.minX?b.maxX:b.minX;win.setPosition(x0,floorY);const direction=Math.sign(x1-x0),distance=Math.abs(x1-x0),duration=Math.max(1500,Math.min(12000,distance/82*1000)),started=Date.now();sendAction('walk',{direction});walkTimer=setInterval(()=>{if(!win||win.isDestroyed()){stopActivity();return;}const progress=Math.min(1,(Date.now()-started)/duration);win.setPosition(Math.round(x0+(x1-x0)*progress),floorY);if(progress>=1){clearInterval(walkTimer);walkTimer=null;sendAction('idle');scheduleActivity();}},32);walkTimer.unref?.();};
 // 女仆牵小猫散步：窗口加宽到能放下两只，朝有空间的一侧慢慢走，走完缩回当前桌宠。
 const leashWalk=()=>{if(!win||win.isDestroyed())return false;const scale=Math.min(200,Math.max(50,Number(settings.size)||100))/100,b0=win.getBounds(),wide=leashLayout(scale,1);leashWindowState={width:b0.width,height:b0.height,petId:settings.petId,scale,dir:1};win.setBounds({x:Math.round(b0.x+b0.width/2-wide.width/2),y:Math.round(b0.y+b0.height-wide.height),width:wide.width,height:wide.height});clamp();const b=bounds(),[cx]=win.getPosition(),x0=Math.round(Math.max(b.minX,Math.min(b.maxX,cx))),floorY=Math.max(b.minY,b.maxY-8),roomRight=b.maxX-x0,roomLeft=x0-b.minX;let dir=Math.random()<.5?-1:1;if((dir>0?roomRight:roomLeft)<160)dir=-dir;const room=dir>0?roomRight:roomLeft;if(room<40){restoreLeashWindow();return false;}const distance=Math.min(room,300+Math.random()*420),x1=Math.round(x0+dir*distance),duration=Math.max(2500,Math.min(16000,distance/62*1000)),started=Date.now();leashWindowState.dir=dir;win.setPosition(x0,floorY);sendAction('leash-walk',{direction:dir});walkTimer=setInterval(()=>{if(!win||win.isDestroyed()){stopActivity();return;}const progress=Math.min(1,(Date.now()-started)/duration);win.setPosition(Math.round(x0+(x1-x0)*progress),floorY);if(progress>=1){clearInterval(walkTimer);walkTimer=null;sendAction('idle');restoreLeashWindow();scheduleActivity();}},32);walkTimer.unref?.();return true;};
 const perform=(action,extra={})=>{
  if(!win||win.isDestroyed())return false;
  if(settings.hunger<=0&&action!=='feed'&&action!=='toggle-autonomy'){sendAction('refuse');return false;}
  if(walkTimer){clearInterval(walkTimer);walkTimer=null;}
  if(activityTimer){clearTimeout(activityTimer);activityTimer=null;}
  if(animalWindowState)restoreAnimalWindow();
  if(leashWindowState)restoreLeashWindow();
  if(action==='animals'){
   if(settings.petId!=='maid-deepseek-whale'){sendAction('animals');activityTimer=setTimeout(()=>{activityTimer=null;if(win&&!win.isDestroyed()){sendAction('idle');scheduleActivity();}},4200);activityTimer.unref?.();return true;}
   const b=win.getBounds(),wideWidth=Math.round(b.height*16/9),[x,y]=win.getPosition();animalWindowState={x,y,width:b.width,height:b.height};win.setSize(wideWidth,b.height);win.setPosition(Math.round(x-(wideWidth-b.width)/2),y);clamp();sendAction('animals');activityTimer=setTimeout(()=>{activityTimer=null;if(win&&!win.isDestroyed()){restoreAnimalWindow();sendAction('idle');scheduleActivity();}},10100);activityTimer.unref?.();return true;
  }
  if(action==='walk'){walk();return true;}
  if(action==='leash-walk'){if(!LEASH_PETS.has(settings.petId)||!leashWalk())walk();return true;}
  if(action==='sleep'){sendAction('sleep');activityTimer=setTimeout(()=>{activityTimer=null;if(win&&!win.isDestroyed()){sendAction('wake');scheduleActivity();}},12000);activityTimer.unref?.();return true;}
  if(action==='feed'){
   refreshHunger(false);const recoveringFromCollapse=settings.hunger===0;settings.hunger=Math.min(HUNGER_MAX,settings.hunger+1);settings.hungerUpdatedAt=Date.now();persist();onChange(get());
   sendAction('feed',{hunger:settings.hunger,food:extra.food,recoveringFromCollapse});
   if(recoveringFromCollapse)setTimeout(()=>{if(win&&!win.isDestroyed()&&settings.hunger>0)setCollapsedWindow(false);},1000).unref?.();
   activityTimer=setTimeout(()=>{activityTimer=null;if(win&&!win.isDestroyed()){sendAction('idle');scheduleActivity();}},4200);activityTimer.unref?.();return true;
  }
  if(action==='emote'){sendAction('emote',{emote:extra.emote});activityTimer=setTimeout(()=>{activityTimer=null;if(win&&!win.isDestroyed()){sendAction('idle');scheduleActivity();}},Math.max(1500,Math.min(12000,Number(extra.duration)||4200)));activityTimer.unref?.();return true;}
  if(action==='interact'||action==='wake'){sendAction(action);scheduleActivity();return true;}
  if(action==='toggle-autonomy'){settings.autonomyEnabled=!settings.autonomyEnabled;persist();onChange(get());if(!settings.autonomyEnabled){stopActivity();sendAction('idle');}else scheduleActivity(1000);return true;}
  return false;
 };
 const feedTarget=async(owner,inputTarget)=>{
  if(!win||win.isDestroyed())return{error:'请先开启桌宠'};
  if(!dialog?.showMessageBox||typeof shell?.trashItem!=='function')return{error:'本地投喂所需的系统文件功能不可用'};
  if(typeof inputTarget!=='string'||!inputTarget||!path.isAbsolute(inputTarget))return{error:'无法识别拖入项目的本地路径'};
  const parent=owner&&!owner.isDestroyed()?owner:win,target=path.resolve(inputTarget),root=path.parse(target).root;
  if(target===root)return{error:'不能投喂整个磁盘'};
  const stat=await fs.promises.lstat(target);
  if(stat.isSymbolicLink()||(!stat.isFile()&&!stat.isDirectory()))return{error:'请选择普通文件、图片或文件夹'};
  const isFolder=stat.isDirectory(),name=path.basename(target)||target;
  let food={name,type:isFolder?'folder':'file'};
  if(!isFolder&&/\.(png|jpe?g|gif|webp|bmp)$/i.test(name)){
   food.type='image';
   if(stat.size<=25*1024*1024&&nativeImage){const image=nativeImage.createFromPath(target);if(!image.isEmpty())food.preview=image.resize({width:64,height:64,quality:'good'}).toDataURL();}
  }
  const answer=await dialog.showMessageBox(parent,{type:'warning',title:'确认投喂并删除源文件',message:`将“${name}”投喂给宠物？`,detail:`投喂后会增加 1 格饥饿值，并将所选${isFolder?'文件夹及其全部内容':'文件'}移入系统回收站。`,buttons:['移入回收站并投喂','取消'],defaultId:1,cancelId:1,noLink:true});
  if(answer.response!==0)return{canceled:true};
  if(!win||win.isDestroyed())return{error:'桌宠已关闭，源文件未删除'};
  await moveToRecycleBin(target,{trashItem:shell.trashItem});
  perform('feed',{food});
  return{ok:true,hunger:settings.hunger,food:{name,type:food.type}};
 };
 const feedFromLocal=async owner=>{
  if(!win||win.isDestroyed())return{error:'请先开启桌宠'};
  if(!dialog?.showOpenDialog||!dialog?.showMessageBox||typeof shell?.trashItem!=='function')return{error:'本地投喂所需的系统文件功能不可用'};
  const parent=owner&&!owner.isDestroyed()?owner:win,picked=await dialog.showOpenDialog(parent,{title:'选择要投喂的本地文件或文件夹',properties:['openFile','openDirectory']});
  if(picked.canceled||!picked.filePaths?.length)return{canceled:true};
  return feedTarget(owner,picked.filePaths[0]);
 };
 const create=()=>{if(win&&!win.isDestroyed())return;const size=petWindowSize(settings.size,settings.petId);win=new BrowserWindow({...size,frame:false,transparent:true,minWidth:1,minHeight:1,resizable:true,thickFrame:false,skipTaskbar:true,alwaysOnTop:true,focusable:false,show:false,title:'小旺仔桌宠',webPreferences:{preload:path.join(__dirname,'pet-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,partition:'nest-pet-local'}});win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.once('ready-to-show',()=>{if(win&&!win.isDestroyed()){if(settings.hunger<=0)setCollapsedWindow(true);win.showInactive();scheduleActivity();sendAction('character',{petId:settings.petId});sendAction('status',{hunger:settings.hunger,instant:settings.hunger<=0});}});win.on('closed',()=>{stop();stopActivity();collapsedWindowState=null;win=null;});resetPosition();win.loadFile(path.join(__dirname,'pet-window.html')).catch(()=>{destroy();});};
 const showForApp=()=>{quitting=false;if(settings.enabled)create();};
 const update=(patch={})=>{stopActivity();if(collapsedWindowState)setCollapsedWindow(false);settings=normalizePetSettings({...settings,...patch});persist();onChange(get());stop();if(settings.enabled&&!quitting){create();const size=petWindowSize(settings.size,settings.petId),b=win.getBounds();win.setBounds({x:b.x+b.width-size.width,y:b.y+b.height-size.height,width:size.width,height:size.height});if(settings.hunger<=0)setCollapsedWindow(true);clamp();win.webContents.send('pet:changed',get());if('petId'in patch)sendAction('character',{petId:settings.petId});if('autonomyEnabled'in patch){if(settings.autonomyEnabled)scheduleActivity(1000);else{stopActivity();sendAction('idle');}}}else destroy();return get();};
 const trusted=(e,petOnly=false)=>{if(petOnly?(!win||e.sender!==win.webContents):!(isTrustedSender(e)||(win&&e.sender===win.webContents)))throw Error('Invalid pet sender');};
 ipcMain.handle('pet:get',e=>{trusted(e);refreshHunger(false);return get();});ipcMain.handle('pet:update',(e,p)=>{trusted(e);return update(p);});ipcMain.handle('pet:reset',e=>{trusted(e);resetPosition();return get();});ipcMain.handle('pet:feed',e=>{trusted(e);return feedFromLocal(BrowserWindow.fromWebContents(e.sender));});ipcMain.handle('pet:feed-dropped',(e,target)=>{trusted(e,true);return feedTarget(BrowserWindow.fromWebContents(e.sender),target);});
 ipcMain.handle('pet:menu',e=>{trusted(e,true);if(!Menu)return{error:'宠物菜单不可用'};const menu=Menu.buildFromTemplate(petMenuTemplate(settings.petId,{settings,perform,feed:()=>feedFromLocal(win).catch(error=>dialog?.showMessageBox(win,{type:'error',title:'投喂失败',message:error.message||'无法投喂所选项目'}))}));menu.popup({window:win});return{ok:true};});
 ipcMain.handle('pet:interact',(e,action)=>{trusted(e,true);return perform(action);});
 ipcMain.handle('pet:drag-start',e=>{trusted(e,true);stop();stopActivity();sendAction('idle');const p=screen.getCursorScreenPoint(),[x,y]=win.getPosition();drag={cursor:p,origin:{x,y},trail:[{...p,t:Date.now()}]};timer=setInterval(()=>{if(!sampleDrag())stop();},PET_MOTION_INTERVAL_MS);timer.unref?.();return true;});
 ipcMain.handle('pet:drag-move',e=>{trusted(e,true);return sampleDrag();});
 ipcMain.handle('pet:drag-end',e=>{trusted(e,true);if(!drag)return false;if(timer)clearInterval(timer);timer=null;sampleDrag();const velocity=settings.throwEnabled?estimateReleaseVelocity(drag.trail,Date.now(),DEFAULT_PHYSICS):null;drag=null;if(!velocity){clamp();scheduleActivity();return false;}const [x,y]=win.getPosition();throwState={x,y,...velocity};let last=Date.now();timer=setInterval(()=>{if(!win||win.isDestroyed()){stop();return;}const now=Date.now();throwState=throwStep(throwState,(now-last)/1000,bounds(),DEFAULT_PHYSICS);last=now;win.setPosition(Math.round(throwState.x),Math.round(throwState.y));if(throwState.atRest){stop();scheduleActivity();}},PET_MOTION_INTERVAL_MS);timer.unref?.();return true;});
 hungerTimer=setInterval(tickHunger,60000);hungerTimer.unref?.();const shutdown=()=>{quitting=true;if(hungerTimer)clearInterval(hungerTimer);hungerTimer=null;destroy();};screen.on('display-metrics-changed',clamp);screen.on('display-removed',clamp);return {get:()=>{refreshHunger(false);return get();},update,showForApp,resetPosition,shutdown,perform};
}
module.exports={DEFAULT_PET,PET_MOTION_INTERVAL_MS,HUNGER_MAX,HUNGER_DECAY_INTERVAL_MS,normalizePetSettings,petWindowSize,createPetController};
