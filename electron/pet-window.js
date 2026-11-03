const api=window.nestPet;
const video=document.getElementById('pet');
const sprite=document.getElementById('pet-sprite');
const hitbox=document.getElementById('pet-hitbox');
const reaction=document.getElementById('reaction');
const hungerHearts=document.getElementById('hunger-hearts');
let gesture=null,moving=false,lastMove=0,reactionTimer=null,recoveryTimer=null,hungerHeartTimer=null,previousHunger=10;
let fileDragDepth=0;
const kittenCanvas=document.getElementById('kitten');
let rig=null,rigRenderer=null,kitten=false,kittenImage=null,dragLastX=null,dragLastAt=0;
let selectedPet='maid-deepseek-whale',spriteState='idle',spriteFrame=0,spriteGazeFrame=null,spriteLoop=true,spriteLastFrameAt=0,spriteRaf=0;
const WALK_START=2,WALK_END=3.35,HEART_PATH='M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
const SPRITES={
 'liu-hai-buddy':{src:'../dist/pets/wangzai-buddies/liu-hai.png',label:'刘海小伙伴'},
 'glasses-buddy':{src:'../dist/pets/wangzai-buddies/glasses.png',label:'眼镜小伙伴'},
 'silver-kitten':{src:'../dist/pets/silver-kitten/spritesheet-extended-final.png',label:'银渐层小猫'},
};
const ANIMATIONS={
 idle:{row:0,frames:6,frameDurations:[2200,100,160,100,2000,1200]},walkRight:{row:1,frames:8,frameMs:160},walkLeft:{row:2,frames:8,frameMs:160},
 waving:{row:3,frames:4,frameMs:260},jumping:{row:4,frames:5,frameMs:220},failed:{row:5,frames:8,frameMs:230},
 sleep:{row:6,frames:6,frameMs:320},running:{row:7,frames:6,frameMs:175},review:{row:8,frames:6,frameMs:300},
};

const heartRects=Array.from({length:5},(_,index)=>{
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('hunger-heart');
 const base=document.createElementNS(svg.namespaceURI,'path');base.setAttribute('d',HEART_PATH);base.classList.add('heart-base');
 const defs=document.createElementNS(svg.namespaceURI,'defs'),clip=document.createElementNS(svg.namespaceURI,'clipPath');
 clip.setAttribute('id',`hunger-fill-clip-${index}`);clip.setAttribute('clipPathUnits','userSpaceOnUse');
 const rect=document.createElementNS(svg.namespaceURI,'rect');rect.setAttribute('x','0');rect.setAttribute('y','0');rect.setAttribute('width','24');rect.setAttribute('height','24');clip.append(rect);defs.append(clip);
 const fill=document.createElementNS(svg.namespaceURI,'path');fill.setAttribute('d',HEART_PATH);fill.setAttribute('clip-path',`url(#hunger-fill-clip-${index})`);fill.classList.add('heart-fill');
 svg.append(base,defs,fill);hungerHearts.append(svg);return rect;
});

const updateHunger=(value,instant=false)=>{
 const amount=Math.max(0,Math.min(10,Number.isFinite(Number(value))?Number(value):10)),previous=previousHunger;
 if(amount<previous){hungerHearts.classList.add('visible');clearTimeout(hungerHeartTimer);hungerHeartTimer=setTimeout(()=>hungerHearts.classList.remove('visible'),2600);}
 heartRects.forEach((rect,index)=>rect.setAttribute('width',String(24*Math.max(0,Math.min(1,(amount-index*2)/2)))));
 hungerHearts.setAttribute('aria-label',`饥饿值：${amount}/10`);document.body.classList.toggle('hungry',amount<=4);
 if(amount>0)document.body.classList.remove('starving','fallen');
 else if(previous>0){document.body.classList.remove('fallen');if(instant||window.matchMedia('(prefers-reduced-motion: reduce)').matches){document.body.classList.remove('starving');document.body.classList.add('fallen');}else document.body.classList.add('starving');}
 if(previous>0&&amount===0)showReaction('好饿…','hungry-reaction');else if(previous>4&&amount<=4)showReaction('肚子饿了…','hungry-reaction');
 if(kitten&&rig)rig.setHunger(amount,instant);
 previousHunger=amount;
};

const setSpriteFrame=(frame)=>{
 const animation=ANIMATIONS[spriteState]||ANIMATIONS.idle;
 const looking=spriteState==='idle'&&spriteGazeFrame!==null;
 const column=looking?spriteGazeFrame%8:Math.max(0,Math.min(animation.frames-1,frame));
 const row=looking?(spriteGazeFrame<8?9:10):animation.row;
 sprite.style.backgroundPosition=`${column/7*100}% ${row/10*100}%`;
};
const advanceSprite=(now)=>{
 const animation=ANIMATIONS[spriteState]||ANIMATIONS.idle;
 const frameDelay=animation.frameDurations?.[spriteFrame]||animation.frameMs;
 if(now-spriteLastFrameAt>=frameDelay){spriteLastFrameAt=now;if(spriteFrame<animation.frames-1)spriteFrame++;else if(spriteLoop)spriteFrame=0;else{setSpriteAnimation('idle',true);return;}setSpriteFrame(spriteFrame);}
 spriteRaf=requestAnimationFrame(advanceSprite);
};
const setSpriteAnimation=(name,loop=true,force=false)=>{
 const next=ANIMATIONS[name]?name:'idle';
 if(!force&&spriteState===next&&spriteLoop===loop)return;
 cancelAnimationFrame(spriteRaf);spriteRaf=0;spriteState=next;spriteFrame=0;spriteGazeFrame=null;spriteLoop=loop;spriteLastFrameAt=performance.now();
 setSpriteFrame(0);spriteRaf=requestAnimationFrame(advanceSprite);
};
const stopKitten=()=>{kitten=false;if(rigRenderer)rigRenderer.stop();document.body.classList.remove('kitten-pet');};
const startKitten=()=>{
 if(!window.KittenMotion||!kittenCanvas)return false;
 if(!rig)rig=window.KittenMotion.createController();
 const begin=()=>{
  if(selectedPet!=='silver-kitten')return;
  if(!rigRenderer)rigRenderer=window.KittenMotion.createRenderer(kittenCanvas,kittenImage,rig);
  kitten=true;document.body.classList.add('kitten-pet');document.body.classList.remove('sprite-pet');
  rig.setHunger(previousHunger,true);rigRenderer.start();
 };
 if(kittenImage&&kittenImage.complete&&kittenImage.naturalWidth){begin();return true;}
 kittenImage=new Image();kittenImage.onload=begin;
 // 加载失败时退回原来的精灵图播放，保证小猫不会消失
 kittenImage.onerror=()=>{if(selectedPet==='silver-kitten'){kitten=false;sprite.style.backgroundImage=`url("${SPRITES['silver-kitten'].src}")`;document.body.classList.remove('kitten-pet');document.body.classList.add('sprite-pet');setSpriteAnimation(previousHunger<=0?'failed':'idle',true,true);}};
 kittenImage.src=SPRITES['silver-kitten'].src;
 return true;
};
const setCharacter=(petId)=>{
 selectedPet=SPRITES[petId]?petId:'maid-deepseek-whale';
 const isSprite=selectedPet!=='maid-deepseek-whale';
 stopKitten();
 document.body.classList.toggle('sprite-pet',isSprite);document.body.classList.remove('pet-wide');
 if(selectedPet==='silver-kitten'&&startKitten()){video.pause();video.classList.remove('walking','wide');cancelAnimationFrame(spriteRaf);spriteRaf=0;document.body.classList.remove('sprite-pet');return;}
 video.classList.remove('walking','wide');video.style.setProperty('--facing-scale','1');
 if(isSprite){video.pause();sprite.style.backgroundImage=`url("${SPRITES[selectedPet].src}")`;sprite.setAttribute('aria-label',SPRITES[selectedPet].label);setSpriteAnimation(previousHunger<=0?'failed':'idle',true,true);}
 else{cancelAnimationFrame(spriteRaf);spriteRaf=0;play('idle');}
};
const play=(name,loop=true)=>{
 if(selectedPet!=='maid-deepseek-whale'){
  const mapping={idle:'idle',walk:'running',sleep:'sleep',animals:'waving',hello:'waving',interact:'waving',drag:'jumping',feed:'waving',failed:'failed',wake:'waving'};
  const spriteName=mapping[name]||'idle';sprite.classList.toggle('walking',name==='walk');sprite.style.setProperty('--facing-scale','1');setSpriteAnimation(spriteName,loop);return;
 }
 const src='../dist/pets/maid-deepseek-whale/'+encodeURIComponent(name)+'.webm';
 video.classList.remove('walking','wide');video.style.setProperty('--facing-scale','1');
 if(video.getAttribute('src')!==src)video.src=src;video.loop=loop;video.play().catch(()=>{});
};
const walk=(direction=0)=>{
 if(selectedPet!=='maid-deepseek-whale'){
  sprite.classList.add('walking');sprite.style.setProperty('--facing-scale','1');setSpriteAnimation(direction>0?'walkRight':'walkLeft',true);return;
 }
 playWhaleWalk(direction);
};
// 女仆走路视频（只播走路循环段）；牵小猫散步时即使当前桌宠是小猫也会用到。
const playWhaleWalk=(direction=0)=>{
 const src='../dist/pets/maid-deepseek-whale/walk.webm';video.classList.add('walking');video.style.setProperty('--facing-scale',direction>0?'-1':'1');video.loop=false;
 if(video.getAttribute('src')!==src){video.src=src;video.addEventListener('loadedmetadata',()=>{if(video.classList.contains('walking')){video.currentTime=WALK_START;video.play().catch(()=>{});}}, {once:true});}
 else{if(video.currentTime<WALK_START||video.currentTime>=WALK_END)video.currentTime=WALK_START;video.play().catch(()=>{});}
};
const lookAtPointer=(event)=>{
 if(kitten&&rig){const b=hitbox.getBoundingClientRect();rig.lookAt((Math.atan2(event.clientY-(b.top+b.height*0.35),event.clientX-(b.left+b.width/2))*180/Math.PI+360)%360);return;}
 if(selectedPet==='maid-deepseek-whale'||spriteState!=='idle')return;
 const bounds=hitbox.getBoundingClientRect(),dx=event.clientX-(bounds.left+bounds.width/2),dy=event.clientY-(bounds.top+bounds.height/2);
 const degrees=(Math.atan2(dy,dx)*180/Math.PI+360)%360;spriteGazeFrame=Math.round(degrees/22.5)%16;setSpriteFrame(spriteFrame);
};
const showReaction=(text,kind='',duration=2400)=>{clearTimeout(reactionTimer);reaction.textContent=text;reaction.className='visible '+kind;if(duration)reactionTimer=setTimeout(()=>{reaction.className='';},duration);};
const showFood=food=>{
 clearTimeout(reactionTimer);reaction.replaceChildren();const image=food?.preview?document.createElement('img'):null;
 if(image){image.className='food-preview';image.src=food.preview;image.alt='';reaction.append(image);}
 const icon=food?.type==='folder'?'📁':food?.type==='image'?'🖼️':'📄',label=document.createElement('span');label.textContent=`${image?'':icon+' '}${food?.name||'本地项目'} 好吃！`;
 reaction.append(label);reaction.className='visible eating';reactionTimer=setTimeout(()=>{reaction.className='';},4000);
};
const EMOTES={
 curtsy:{text:'欢迎回来，主人～',whale:'hello'},
 groom:{text:'舔舔爪子～',kitten:'groom'},
 stretch:{text:'🐾 伸——',kitten:'stretch'},
 pounce:{text:'喵！',kitten:'pounce'},
 meow:{text:'喵～',kitten:'meow'},
 beg:{text:'要抱抱～',kitten:'beg'},
 wave:{text:'👋 嗨！',sprite:['waving',false]},
 jump:{text:'嘿！',sprite:['jumping',false]},
 phone:{text:'📱 刷刷刷…',sprite:['review',true]},
 'push-glasses':{text:'🤓 推推眼镜',sprite:['waving',false]},
 read:{text:'📖 专心读书中',sprite:['review',true]},
};
const playEmote=name=>{
 const e=EMOTES[name];if(!e)return;
 if(kitten&&rig){if(e.kitten)rig.emote(e.kitten);else rig.interact();}
 else if(selectedPet==='maid-deepseek-whale')play(e.whale||'hello',false);
 else if(e.sprite){sprite.classList.remove('walking');setSpriteAnimation(e.sprite[0],e.sprite[1]);}
 else play('hello',false);
 if(e.text)showReaction(e.text);
};
// ---------- 女仆牵小猫散步：播放 dist/pets/maid-leash-kitten 的 24 帧素材（规格见 pet-leash.js） ----------
const leashCanvas=document.getElementById('leash-canvas');
let leash=null,leashFrames=null;
const loadLeashFrames=()=>{
 if(!leashFrames&&window.PetLeash)leashFrames=Array.from({length:window.PetLeash.FRAMES},(_,i)=>{const img=new Image();img.decoding='async';img.src=window.PetLeash.frameUrl(i);return img;});
 return leashFrames||[];
};
const frameReady=img=>Boolean(img&&img.complete&&img.naturalWidth);
const drawLeashFrame=(now)=>{
 if(!leash)return;
 const A=window.PetLeash,frames=loadLeashFrames();
 // 第一帧加载好之前继续显示原来的桌宠，避免窗口闪空白；加载好后从第 0 帧开始计时。
 if(!leash.started){if(!frameReady(frames[0])){leash.raf=requestAnimationFrame(drawLeashFrame);return;}leash.started=true;leash.start=now;document.body.classList.add('leash-walk');}
 const img=frames[A.frameAt(now-leash.start)];
 if(frameReady(img)){
  const dpr=Math.max(1,Math.min(3,window.devicePixelRatio||1));
  const w=Math.max(1,Math.round(leashCanvas.clientWidth*dpr)),h=Math.max(1,Math.round(leashCanvas.clientHeight*dpr));
  if(leashCanvas.width!==w||leashCanvas.height!==h){leashCanvas.width=w;leashCanvas.height=h;}
  const ctx=leash.ctx,c=A.CROP;
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);
  // 素材朝右走；向左走时整幅水平镜像
  if(leash.dir<0){ctx.translate(w,0);ctx.scale(-1,1);}
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(img,c.x,c.y,c.w,c.h,0,0,w,h);
 }
 leash.raf=requestAnimationFrame(drawLeashFrame);
};
const startLeash=(direction)=>{
 if(!window.PetLeash||!leashCanvas)return false;
 endLeash();
 loadLeashFrames();
 leash={dir:direction<0?-1:1,start:0,started:false,raf:0,ctx:leashCanvas.getContext('2d')};
 if(selectedPet==='maid-deepseek-whale')video.pause();
 leash.raf=requestAnimationFrame(drawLeashFrame);
 showReaction(selectedPet==='silver-kitten'?'🐾 跟主人出门啦～':'🐾 带小猫散步～','',2800);
 return true;
};
function endLeash(){
 if(!leash)return;
 cancelAnimationFrame(leash.raf);leash=null;
 document.body.classList.remove('leash-walk');
 if(selectedPet==='maid-deepseek-whale')play('idle');
 if(kitten&&rig)rig.idle();
}
const act=({action,direction=0,food,hunger,instant=false,recoveringFromCollapse=false,petId,emote}={})=>{
 // 散步途中收到别的动作（拖动、切换桌宠、饿晕等）就先收起牵绳，回到单只桌宠。
 if(leash&&action!=='leash-walk'&&!(action==='status'&&Number(hunger)>0))endLeash();
 if(action==='leash-walk'){if(!startLeash(direction))walk(direction);return;}
 if(action==='character'){setCharacter(petId);return;}
 if(action==='emote'){playEmote(emote);return;}
 if(action==='refuse'){if(kitten&&rig)rig.interact();showReaction('好饿…先喂我点吃的吧');return;}
 if(kitten&&rig){
  if(action==='status'){updateHunger(hunger,instant);return;}
  if(action==='animals'){rig.interact('wave');showReaction('👋','',0);return;}
  if(action==='sleep'){rig.sleep();showReaction('💤','',0);return;}
  if(action==='feed'){const rescued=previousHunger<=0;updateHunger(hunger);showFood(food);if(!rescued)rig.feed();return;}
  if(action==='walk'){rig.walk(direction);showReaction('🚶 散步中','',0);return;}
  if(action==='wake'){rig.wake();showReaction('早上好！');return;}
  if(action==='interact'){rig.interact();showReaction('❤️ 嘿嘿');return;}
  rig.idle();reaction.className='';return;
 }
 if(action==='status'){updateHunger(hunger,instant);if(selectedPet!=='maid-deepseek-whale'){if(Number(hunger)<=0)play('failed',true);else if(spriteState==='failed')play('idle');}return;}
 if(action==='animals'){
  if(selectedPet==='maid-deepseek-whale'){document.body.classList.add('pet-wide');video.classList.add('wide');const src='../dist/pets/maid-deepseek-whale/'+encodeURIComponent('动物环绕')+'.webm';video.classList.remove('walking');video.style.setProperty('--facing-scale','1');if(video.getAttribute('src')!==src)video.src=src;video.loop=false;video.play().catch(()=>{});reaction.className='';}
  else{play('waving',true);showReaction('👋','',0);}
 }else if(action==='sleep'){play('sleep');showReaction('💤','',0);}
 else if(action==='feed'){
  if(recoveringFromCollapse||selectedPet!=='maid-deepseek-whale'){document.body.classList.add('recovering');clearTimeout(recoveryTimer);recoveryTimer=setTimeout(()=>document.body.classList.remove('recovering'),950);}
  updateHunger(hunger);play(selectedPet==='maid-deepseek-whale'?'idle':'waving');showFood(food);
 }else if(action==='walk'){walk(direction);showReaction('🚶 散步中','',0);}
 else if(action==='wake'){play('hello',false);showReaction('早上好！');}
 else if(action==='interact'){play('hello',false);showReaction('❤️ 嘿嘿');}
 else{play('idle');reaction.className='';}
};

updateHunger(10);api.onAction(act);api.get().then(settings=>{if(settings?.petId)setCharacter(settings.petId);if(settings?.petId==='silver-kitten'||settings?.petId==='maid-deepseek-whale')loadLeashFrames();if(Number.isFinite(Number(settings?.hunger)))updateHunger(settings.hunger,true);}).catch(()=>{});
const finishBodyAnimation=e=>{if(e.animationName==='weak-droop'&&document.body.classList.contains('starving')){document.body.classList.remove('starving');document.body.classList.add('fallen');}if(e.animationName==='recover-rise')document.body.classList.remove('recovering');};
video.addEventListener('animationend',finishBodyAnimation);sprite.addEventListener('animationend',finishBodyAnimation);
video.addEventListener('timeupdate',()=>{if(video.classList.contains('walking')&&video.currentTime>=WALK_END)video.currentTime=WALK_START;});
video.addEventListener('ended',()=>{if(video.classList.contains('wide')){video.classList.remove('wide');document.body.classList.remove('pet-wide');}if(!video.classList.contains('walking'))play('idle');});
video.addEventListener('error',()=>{video.setAttribute('aria-label','宠物动画加载失败，请重新打开宠物');});
hitbox.addEventListener('contextmenu',e=>{e.preventDefault();api.menu();});
hitbox.addEventListener('pointerdown',async e=>{if(e.button!==0)return;gesture={x:e.clientX,y:e.clientY,id:e.pointerId};moving=false;hitbox.setPointerCapture(e.pointerId);await api.dragStart();});
hitbox.addEventListener('pointermove',e=>{if(!gesture){lookAtPointer(e);return;}const distance=Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y);if(distance>3)moving=true;if(!moving)return;if(performance.now()-lastMove<8)return;const moveAt=performance.now();if(kitten&&rig){rig.dragMove(dragLastX===null?0:e.screenX-dragLastX,dragLastX===null?16:moveAt-dragLastAt);dragLastX=e.screenX;dragLastAt=moveAt;lastMove=moveAt;return;}lastMove=moveAt;play('drag');});
hitbox.addEventListener('pointerleave',()=>{if(kitten&&rig)rig.lookAt(null);if(spriteState==='idle'&&spriteGazeFrame!==null){spriteGazeFrame=null;setSpriteFrame(spriteFrame);}});
const finish=async e=>{if(!gesture)return;const dragged=moving;gesture=null;if(hitbox.hasPointerCapture(e.pointerId))hitbox.releasePointerCapture(e.pointerId);await api.dragEnd();if(dragged){dragLastX=null;if(kitten&&rig)rig.dragEnd();else act({action:'idle'});}else api.interact('interact');};
hitbox.addEventListener('pointerup',finish);hitbox.addEventListener('pointercancel',finish);
const hasFilePayload=event=>Array.from(event.dataTransfer?.types||[]).includes('Files')||Boolean(event.dataTransfer?.files?.length);
const clearFileDrop=()=>{fileDragDepth=0;document.body.classList.remove('file-drop-active');};
document.addEventListener('dragenter',event=>{if(!hasFilePayload(event))return;event.preventDefault();fileDragDepth++;document.body.classList.add('file-drop-active');},true);
document.addEventListener('dragover',event=>{if(!hasFilePayload(event))return;event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';},true);
document.addEventListener('dragleave',event=>{if(!hasFilePayload(event)||fileDragDepth===0)return;fileDragDepth=Math.max(0,fileDragDepth-1);if(fileDragDepth===0)clearFileDrop();},true);
document.addEventListener('drop',event=>{if(!hasFilePayload(event))return;event.preventDefault();clearFileDrop();},true);
api.onFeedDropResult(result=>{if(result?.error)showReaction(result.error);});
