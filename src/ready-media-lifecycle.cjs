function message(error) { return error?.message || String(error || '媒体无法读取'); }
function renderRgbWaveform(channels, ctx) {
  const {width, height} = ctx.canvas;
  if (!width || !height || !channels?.length) return;
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, '#ff4d6d');
  gradient.addColorStop(.2, '#ffb020');
  gradient.addColorStop(.4, '#e9ed3a');
  gradient.addColorStop(.6, '#39df76');
  gradient.addColorStop(.8, '#31c9ff');
  gradient.addColorStop(1, '#8b6bff');
  ctx.fillStyle = gradient;
  const length = Math.max(...channels.map(channel => channel.length));
  const step = Math.max(1, Math.ceil(length / width));
  for (let x = 0; x < width; x++) {
    const start = Math.floor((x * length) / width);
    const end = Math.min(length, start + step);
    let peak = 0;
    for (const channel of channels) {
      for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(channel[i] || 0));
    }
    const barHeight = Math.max(1, peak * height);
    ctx.fillRect(x, (height - barHeight) / 2, 1, barHeight);
  }
}
function mountWaveform({WaveSurfer, manager, container, asset, onError}) {
  let player, unsubscribe, disposed = false;
  try {
    manager.prepareFull(asset);
    // Keep WaveSurfer's decoding element separate from the shared playback element.
    // WaveSurfer replaces its media src with a fetched Blob after decoding; sharing
    // that element with the manager can interrupt playback when the preview changes.
    player = WaveSurfer.create({container, url: asset.url, height: 100,
      waveColor: '#69a8ff', progressColor: '#69a8ff', cursorColor: '#d4d7dc',
      renderFunction: renderRgbWaveform,
      normalize: true, interact: true, hideScrollbar: true});
    player.on('interaction', time => {if(!disposed && player.getDuration() > 0) manager.seek(asset, time / player.getDuration());});
    player.on('error', error => {if (!disposed) onError(message(error));});
    const syncPlaybackPosition = state => {
      if (!disposed && state.id === asset.id && player.getDuration() > 0)
        player.setTime(state.currentTime || 0);
    };
    player.on('ready', () => syncPlaybackPosition(manager.getState()));
    unsubscribe = manager.subscribe(syncPlaybackPosition);
    // Retain the original detail-preview behavior: selecting audio starts playback.
    manager.openFull(asset);
  } catch(error) { onError(message(error)); }
  return () => {if(disposed) return; disposed = true; unsubscribe?.(); player?.destroy();};
}
const videoPlaybackState = new Map();
function mountVideo({videojs, element, asset, onError, onSize, persistControls = false, stateStore = videoPlaybackState}) {
  let player, disposed = false;
  try {
    const key = String(asset.id || asset.url || ''), saved = stateStore.get(key);
    player = videojs(element, {controls: true, autoplay: false, preload: 'metadata', inactivityTimeout: persistControls ? 0 : 2500,
      fluid: true, responsive: true,
      controlBar: {playToggle: true, currentTimeDisplay: true, timeDivider: true, durationDisplay: true, progressControl: true, volumePanel: {inline: true}, fullscreenToggle: true},
      sources: [{src: asset.url, type: asset.type || 'video/mp4'}]});
    const remember = () => {
      if (!player) return;
      const volume = player.volume?.();
      stateStore.set(key, {currentTime: Number(player.currentTime?.()) || 0, playing: !player.paused?.(), volume: Number.isFinite(volume) ? volume : 1, muted: Boolean(player.muted?.())});
    };
    player.on('error', () => {if(!disposed) onError(message(player.error()));});
    player.on('loadedmetadata', () => {
      if(disposed) return;
      onSize?.(player.videoWidth(), player.videoHeight());
      if (!saved) return;
      if (Number.isFinite(saved.volume)) player.volume?.(saved.volume);
      player.muted?.(Boolean(saved.muted));
      if (Number.isFinite(saved.currentTime) && saved.currentTime > 0) player.currentTime?.(saved.currentTime);
      if (saved.playing) Promise.resolve(player.play?.()).catch(() => {});
    });
    for (const event of ['timeupdate', 'play', 'pause', 'volumechange', 'fullscreenchange']) player.on(event, () => {if(!disposed) remember();});
    return () => {if(disposed) return; remember(); disposed = true; player?.dispose();};
  } catch(error) {onError(message(error));}
  return () => {if(disposed) return; disposed = true; player?.dispose();};
}
module.exports = {mountWaveform, mountVideo, renderRgbWaveform, videoPlaybackState};
