const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');

class FakeAudio{
  constructor(){this.src='';this.currentTime=0;this.duration=100;this.volume=1;this.paused=true;this.listeners=new Map();this.playCount=0;this.loadCount=0}
  addEventListener(name,fn,opts){const list=this.listeners.get(name)||[];list.push({fn,once:opts?.once});this.listeners.set(name,list)}
  emit(name){const list=this.listeners.get(name)||[];this.listeners.set(name,list.filter(item=>!item.once));for(const item of list)item.fn()}
  play(){this.paused=false;this.playCount++;this.emit('play');return Promise.resolve()}
  pause(){this.paused=true;this.emit('pause')}
  removeAttribute(name){if(name==='src')this.src=''}
  load(){this.loadCount++}
}
const make=(extra={})=>{
  const audio=new FakeAudio();let clock=1000;const timers=new Map();let id=0;
  const mod=import('../src/audio-preview-manager.js').then(({createAudioPreviewManager})=>createAudioPreviewManager({
    createAudio:()=>audio,now:()=>clock,raf:null,
    setTimer:(fn,ms)=>{timers.set(++id,{fn,ms});return id},clearTimer:key=>timers.delete(key),...extra}));
  const fire=()=>{const list=[...timers.entries()];timers.clear();for(const [,t] of list)t.fn()};
  return mod.then(manager=>({manager,audio,timers,fire,advance:ms=>{clock+=ms}}));
};
const A={id:'a',url:'a.wav'};

test('pointer movement while playing seeks instead of restarting playback',async()=>{
  const {manager,audio,fire,advance}=await make();
  manager.hoverAt(A,.1);fire();audio.emit('loadedmetadata');
  assert.equal(audio.currentTime,10);assert.equal(audio.playCount,1);
  advance(100);manager.hoverAt(A,.6);
  assert.equal(audio.currentTime,60);
  assert.equal(audio.playCount,1,'must not call play() again');
  assert.equal(manager.getState().playing,true);
});

test('rapid pointer moves are throttled and the latest position wins',async()=>{
  const {manager,audio,timers,fire,advance}=await make({scrubInterval:50});
  manager.hoverAt(A,.1);fire();audio.emit('loadedmetadata');
  advance(100);manager.hoverAt(A,.2);assert.equal(audio.currentTime,20);
  advance(10);manager.hoverAt(A,.3);advance(10);manager.hoverAt(A,.4);
  assert.equal(audio.currentTime,20,'moves inside the interval are deferred');
  assert.equal(timers.size,1,'only one trailing seek is scheduled');
  fire();assert.equal(audio.currentTime,40);
});

test('moving the pointer before the audio has loaded starts at the latest position',async()=>{
  const {manager,audio,fire}=await make();
  manager.hoverAt(A,.1);fire();
  manager.hoverAt(A,.8);
  audio.emit('loadedmetadata');
  assert.equal(audio.currentTime,80);
  assert.equal(audio.playCount,1);
});

test('hover delay counts from first entry, continuous movement does not keep resetting it',async()=>{
  const {manager,timers,advance}=await make({hoverDelay:120});
  manager.hoverAt(A,.1);const first=[...timers.values()][0].ms;
  advance(80);manager.hoverAt(A,.2);const second=[...timers.values()][0].ms;
  assert.equal(first,120);assert.equal(second,40);
});

test('preload loads metadata without playing, then hover starts at once at the pointer position',async()=>{
  const {manager,audio,fire}=await make();
  manager.preload(A);
  assert.equal(audio.src,'a.wav');assert.equal(audio.playCount,0);assert.equal(audio.loadCount,1);
  audio.emit('loadedmetadata');
  manager.hoverAt(A,.5);fire();
  assert.equal(audio.currentTime,50);assert.equal(audio.playCount,1);
  assert.equal(audio.loadCount,1,'already loaded, must not reload');
});

test('leaving the card pauses but keeps the loaded audio for instant re-entry',async()=>{
  const {manager,audio,fire}=await make();
  manager.hoverAt(A,.3);fire();audio.emit('loadedmetadata');
  manager.leave('a');
  assert.equal(audio.paused,true);assert.equal(manager.getState().id,null);
  assert.equal(audio.src,'a.wav');
  const loads=audio.loadCount;
  manager.hoverAt(A,.7);fire();
  assert.equal(audio.currentTime,70);assert.equal(audio.paused,false);assert.equal(audio.loadCount,loads);
});

test('scrubbing to a new position restarts the 30 second preview limit',async()=>{
  const {manager,audio,fire,advance}=await make({previewLimit:30});
  manager.hoverAt(A,.1);fire();audio.emit('loadedmetadata');
  audio.currentTime=39;audio.emit('timeupdate');assert.equal(manager.getState().id,'a');
  advance(100);manager.hoverAt(A,.8);
  audio.currentTime=85;audio.emit('timeupdate');
  assert.equal(manager.getState().id,'a','limit counts from the latest seek');
});

test('moving to another card switches immediately and the old one stops',async()=>{
  const {manager,audio,fire}=await make();
  manager.hoverAt(A,.5);fire();audio.emit('loadedmetadata');
  manager.hoverAt({id:'b',url:'b.wav'},.2);
  assert.equal(manager.getState().id,null);assert.equal(audio.paused,true);
  fire();audio.emit('loadedmetadata');
  assert.equal(manager.getState().id,'b');assert.equal(audio.currentTime,20);
});

test('audio card shows a pointer guide, preloads on enter and drives a smooth playhead',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','src','components','media.jsx'),'utf8');
  assert.match(source,/audioPreviewManager\.preload\(asset\)/);
  assert.match(source,/audio-scrub-guide/);
  assert.match(source,/requestAnimationFrame\(tick\)/);
  const css=fs.readFileSync(path.join(__dirname,'..','src','ui-refresh.css'),'utf8');
  assert.match(css,/\.audio-scrub-guide/);
});

test('opening the full player right after leaving the same card does not leave sound playing',async()=>{
  const {manager,audio,fire}=await make();
  manager.hoverAt(A,.3);fire();audio.emit('loadedmetadata');
  manager.leave('a');
  manager.prepareFull(A);
  assert.equal(audio.paused,true);assert.equal(manager.getState().playing,false);assert.equal(audio.currentTime,0);
});

test('setVolume still changes the element volume after a fade has run',async()=>{
  const {manager,audio,fire}=await make();
  manager.hoverAt(A,.3);fire();audio.emit('loadedmetadata');
  manager.leave('a');
  manager.setVolume(.4);
  assert.equal(audio.volume,.4);
});

test('seeking a file that was just auditioned applies without waiting for metadata again',async()=>{
  const {manager,audio,fire}=await make();
  manager.hoverAt(A,.3);fire();audio.emit('loadedmetadata');
  manager.leave('a');
  manager.seek(A,.5);
  assert.equal(audio.currentTime,50);
});
