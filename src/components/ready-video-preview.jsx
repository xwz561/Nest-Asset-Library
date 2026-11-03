import React, {useEffect, useRef, useState} from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import {mountVideo} from '../ready-media-lifecycle.cjs';
export function ReadyVideoPreview({asset,style,onSize,persistControls=false}) {
 const ref=useRef(null),sizeRef=useRef(onSize),ratioRef=useRef(0),[error,setError]=useState('');sizeRef.current=onSize;
 useEffect(()=>{setError('');ratioRef.current=0;const element=document.createElement('video');element.className=`video-js vjs-big-play-centered${persistControls?' vjs-controls-always-visible':''}`;element.setAttribute('playsinline','');ref.current.appendChild(element);
 const fitToStage=()=>{if(!persistControls||!ratioRef.current)return;const shell=ref.current?.parentElement,stage=shell?.parentElement;if(!shell||!stage)return;const maxWidth=Math.min(1100,stage.clientWidth*.92,Math.max(1,stage.clientHeight-24)*ratioRef.current);shell.style.width=`${maxWidth}px`;};
 const syncSize=(w,h)=>{sizeRef.current?.(w,h);if(w>0&&h>0){ratioRef.current=w/h;fitToStage();}};
 window.addEventListener('resize',fitToStage);
 const cleanup=mountVideo({videojs,element,asset,onError:setError,onSize:syncSize,persistControls});
 return ()=>{window.removeEventListener('resize',fitToStage);cleanup();element.remove()};},[asset.id,asset.url,asset.type,persistControls]);
 return <div className="ready-video-preview" style={style}><div ref={ref}/>{error&&<p role="status">视频预览不可用：{error}</p>}</div>;
}
