import React, {lazy, Suspense} from 'react';
const AudioPreview=lazy(()=>import('./components/ready-audio-preview.jsx').then(module=>({default:module.ReadyAudioPreview})));
const VideoPreview=lazy(()=>import('./components/ready-video-preview.jsx').then(module=>({default:module.ReadyVideoPreview})));
const loading=<p role="status">正在加载预览…</p>;
export function ReadyAudioPreview(props){return <Suspense fallback={loading}><AudioPreview {...props}/></Suspense>;}
export function ReadyVideoPreview(props){return <Suspense fallback={loading}><VideoPreview {...props}/></Suspense>;}
