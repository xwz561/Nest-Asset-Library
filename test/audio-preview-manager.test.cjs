const test=require('node:test');
const assert=require('node:assert/strict');

class FakeAudio{
  constructor(){this.src='';this.currentTime=0;this.duration=120;this.volume=1;this.paused=true;this.listeners=new Map();this.playCount=0;this.pauseCount=0}
  addEventListener(name,fn){const list=this.listeners.get(name)||[];list.push(fn);this.listeners.set(name,list)}
  emit(name){for(const fn of this.listeners.get(name)||[])fn()}
  play(){this.paused=false;this.playCount++;this.emit('play');return Promise.resolve()}
  pause(){this.paused=true;this.pauseCount++;this.emit('pause')}
  removeAttribute(name){if(name==='src')this.src=''}
  load(){}
}

test('hover waits, leaving before delay never plays',async()=>{const {createAudioPreviewManager}=await import('../src/audio-preview-manager.js');let task;const audio=new FakeAudio(),manager=createAudioPreviewManager({createAudio:()=>audio,setTimer:fn=>(task=fn,1),clearTimer:()=>{task=null}});manager.hover({id:'a',url:'a.wav'});assert.equal(audio.playCount,0);manager.leave('a');assert.equal(task,null);assert.equal(audio.playCount,0)});

test('A to B stops A immediately and only B starts after delay',async()=>{const {createAudioPreviewManager}=await import('../src/audio-preview-manager.js');let task;const audio=new FakeAudio(),manager=createAudioPreviewManager({createAudio:()=>audio,setTimer:fn=>(task=fn,1),clearTimer:()=>{task=null}});manager.hover({id:'a',url:'a.wav'});task();assert.equal(manager.getState().id,'a');manager.hover({id:'b',url:'b.wav'});assert.equal(manager.getState().id,null);assert.equal(audio.paused,true);assert.equal(audio.playCount,1);task();assert.equal(manager.getState().id,'b');assert.equal(audio.playCount,2)});

test('full player uses same audio and hover cannot overlap',async()=>{const {createAudioPreviewManager}=await import('../src/audio-preview-manager.js');let task;const audio=new FakeAudio(),manager=createAudioPreviewManager({createAudio:()=>audio,setTimer:fn=>(task=fn,1),clearTimer:()=>{task=null}});manager.hover({id:'a',url:'a.wav'});task();manager.prepareFull({id:'b',url:'b.wav'});assert.equal(manager.getAudio(),audio);assert.equal(manager.getState().mode,'full');assert.equal(manager.getState().playing,false);await manager.toggle({id:'b',url:'b.wav'});assert.equal(manager.getState().playing,true);assert.equal(audio.src,'b.wav');manager.stop();assert.equal(manager.getState().id,null)});

test('hover preview stops at configured time limit',async()=>{const {createAudioPreviewManager}=await import('../src/audio-preview-manager.js');let task;const audio=new FakeAudio(),manager=createAudioPreviewManager({createAudio:()=>audio,setTimer:fn=>(task=fn,1),clearTimer:()=>{task=null},previewLimit:5});manager.hover({id:'a',url:'a.wav'});task();audio.currentTime=5.1;audio.emit('timeupdate');assert.equal(manager.getState().id,null);assert.equal(audio.paused,true)});

test('clicking the waveform seeks to that position and starts playback',async()=>{const {createAudioPreviewManager}=await import('../src/audio-preview-manager.js');const audio=new FakeAudio(),manager=createAudioPreviewManager({createAudio:()=>audio});manager.playAt({id:'a',url:'a.wav'},.25);audio.emit('loadedmetadata');assert.equal(audio.currentTime,30);assert.equal(audio.playCount,1);assert.equal(manager.getState().playing,true)});

test('opening full controls preserves playback started from the card',async()=>{const {createAudioPreviewManager}=await import('../src/audio-preview-manager.js');const audio=new FakeAudio(),manager=createAudioPreviewManager({createAudio:()=>audio});manager.playAt({id:'a',url:'a.wav'},.5);audio.emit('loadedmetadata');manager.prepareFull({id:'a',url:'a.wav'});assert.equal(audio.currentTime,60);assert.equal(audio.paused,false);assert.equal(manager.getState().mode,'full');assert.equal(manager.getState().playing,true)});
