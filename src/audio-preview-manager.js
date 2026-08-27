const EMPTY_STATE={id:null,mode:null,playing:false,currentTime:0,duration:0,volume:1};

export function createAudioPreviewManager({createAudio=()=>new Audio(),setTimer=setTimeout,clearTimer=clearTimeout,hoverDelay=400,previewLimit=30}={}){
  let audio=null,timer=null,pendingId=null,state={...EMPTY_STATE},previewStartedAt=0;
  const listeners=new Set();
  const publish=patch=>{state={...state,...patch};for(const listener of listeners)listener(state)};
  const ensureAudio=()=>{if(audio)return audio;audio=createAudio();audio.preload='metadata';audio.addEventListener('loadedmetadata',()=>publish({duration:Number.isFinite(audio.duration)?audio.duration:0}));audio.addEventListener('timeupdate',()=>{const currentTime=audio.currentTime||0;if(state.mode==='hover'&&currentTime-previewStartedAt>=previewLimit){stop();return}publish({currentTime,duration:Number.isFinite(audio.duration)?audio.duration:state.duration})});audio.addEventListener('play',()=>publish({playing:true}));audio.addEventListener('pause',()=>publish({playing:false}));audio.addEventListener('ended',()=>stop());audio.addEventListener('volumechange',()=>publish({volume:audio.volume}));return audio};
  const cancelPending=()=>{if(timer!==null)clearTimer(timer);timer=null;pendingId=null};
  const resetAudio=()=>{if(!audio)return;audio.pause();try{audio.currentTime=0}catch{}audio.removeAttribute?.('src');audio.load?.()};
  const stop=()=>{cancelPending();resetAudio();publish({...EMPTY_STATE,volume:audio?.volume??state.volume})};
  const sourceOf=item=>item?.url||item?.src||'';
  const start=(item,mode)=>{cancelPending();const player=ensureAudio(),source=sourceOf(item);if(!source)return Promise.resolve();if(state.id!==item.id||player.src!==source){player.pause();player.src=source;try{player.currentTime=0}catch{}}previewStartedAt=player.currentTime||0;publish({id:item.id,mode,playing:false,currentTime:player.currentTime||0,duration:Number.isFinite(player.duration)?player.duration:0,volume:player.volume});return Promise.resolve(player.play()).catch(()=>publish({playing:false}))};
  const hover=item=>{if(state.id===item.id&&state.mode==='hover'&&state.playing)return;cancelPending();if(state.mode==='hover')stop();pendingId=item.id;timer=setTimer(()=>{timer=null;pendingId=null;start(item,'hover')},hoverDelay)};
  const leave=id=>{if(pendingId===id)cancelPending();if(state.id===id&&state.mode==='hover')stop()};
  const openFull=item=>start(item,'full');
  const prepareFull=item=>{cancelPending();const player=ensureAudio(),source=sourceOf(item);player.pause();if(state.id!==item.id||player.src!==source){player.src=source;try{player.currentTime=0}catch{}}publish({id:item.id,mode:'full',playing:false,currentTime:player.currentTime||0,duration:Number.isFinite(player.duration)?player.duration:0,volume:player.volume})};
  const toggle=item=>state.id===item.id&&state.mode==='full'&&state.playing?(ensureAudio().pause(),Promise.resolve()):start(item,'full');
  const seek=(item,ratio)=>{const player=ensureAudio();const apply=()=>{const duration=Number.isFinite(player.duration)?player.duration:0;if(duration>0){player.currentTime=Math.max(0,Math.min(1,ratio))*duration;publish({currentTime:player.currentTime,duration})}};if(state.id!==item.id||state.mode!=='full'){player.src=sourceOf(item);publish({id:item.id,mode:'full',playing:false,currentTime:0,duration:0});player.addEventListener('loadedmetadata',apply,{once:true})}else apply()};
  const setVolume=value=>{const player=ensureAudio();player.volume=Math.max(0,Math.min(1,value));publish({volume:player.volume})};
  return {hover,leave,openFull,prepareFull,toggle,seek,setVolume,stop,getState:()=>state,subscribe(listener){listeners.add(listener);listener(state);return()=>listeners.delete(listener)},getAudio:()=>audio};
}

export const audioPreviewManager=createAudioPreviewManager();
