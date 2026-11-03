import React, {useEffect, useRef, useState} from 'react';
import WaveSurfer from 'wavesurfer.js';
import {Pause, Play} from 'lucide-react';
import {Button} from '../ready-ui.jsx';
import {mountWaveform} from '../ready-media-lifecycle.cjs';
import {audioPreviewManager} from '../audio-preview-manager.js';
export function ReadyAudioPreview({asset, state, style}) {
 const ref=useRef(null),[error,setError]=useState('');
 useEffect(()=>{setError(''); const cleanup=mountWaveform({WaveSurfer,manager:audioPreviewManager,container:ref.current,asset,onError:setError});
 return ()=>{cleanup();if(audioPreviewManager.getState().id===asset.id)audioPreviewManager.stop()};},[asset.id,asset.url]);
 const active=state.id===asset.id, duration=active?state.duration:0, current=active?state.currentTime:0;
 const time=n=>new Date(Math.max(0,n||0)*1000).toISOString().slice(14,19);
 return <div className="ready-audio-preview" style={style}><div ref={ref}/>{(error|| (active&&state.error))&&<p role="status">{error?`音频波形预览不可用：${error}`:state.error}</p>}
 <div className="ready-media-controls"><Button className={`ready-audio-play${active&&state.playing?' is-playing':''}`} onClick={()=>audioPreviewManager.toggle(asset)} aria-label={active&&state.playing?'暂停':'播放'} title={active&&state.playing?'暂停':'播放'}>{active&&state.playing?<Pause size={16} fill="currentColor" strokeWidth={0}/>:<Play size={16} fill="currentColor" strokeWidth={0} className="ready-audio-play-icon"/>}</Button>
 <span>{time(current)} / {time(duration)}</span><input type="range" aria-label="播放进度" min="0" max="1000" value={duration?Math.round(current/duration*1000):0} onChange={e=>audioPreviewManager.seek(asset,Number(e.target.value)/1000)}/>
 <input type="range" aria-label="音量" min="0" max="1" step="0.05" value={state.volume} onChange={e=>audioPreviewManager.setVolume(Number(e.target.value))}/></div></div>;
}
