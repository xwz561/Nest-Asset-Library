// 音频试听管理器：整个应用共用一个 <audio>，保证同一时间只有一处在播放。
//
// 卡片“悬停试听”的行为（对标 Eagle）：
//  1. 鼠标进入波形卡片，在鼠标所在位置起播（不是从头开始）；
//  2. 起播后鼠标左右移动，播放位置实时跟随（节流 seek，不会停了再重来）；
//  3. 鼠标移出立即淡出并停止，但已加载的音频保留，再次悬停同一素材几乎零延迟；
//  4. 鼠标刚进入卡片时就预加载元数据，起播不用等网络/磁盘。
const EMPTY_STATE = { id: null, mode: null, playing: false, currentTime: 0, duration: 0, volume: 1, error: '' };
const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const finitePositive = value => Number.isFinite(value) && value > 0;

export function createAudioPreviewManager({
  createAudio = () => new Audio(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  now = () => Date.now(),
  raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame.bind(globalThis) : null,
  hoverDelay = 120,
  previewLimit = 30,
  scrubInterval = 50,
  fadeInMs = 70,
  fadeOutMs = 60,
} = {}) {
  let audio = null;
  let timer = null;
  let pendingId = null;
  let scrubTimer = null;
  let pendingScrub = null;
  let lastScrubAt = 0;
  let state = { ...EMPTY_STATE };
  let previewStartedAt = 0;
  let playRequest = 0;
  let loadedSource = '';
  let hoverRatio = 0;
  let pendingSince = 0;
  let awaitingMetadata = false;
  let userVolume = 1;
  let rampId = 0;
  let rampActive = false;
  const listeners = new Set();
  const publish = patch => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  };
  const sourceOf = item => item?.url || item?.src || '';
  const playError = error => (error?.name === 'NotSupportedError' ? '音频格式或编码不受支持' : '音频播放失败，请检查文件是否可读取');

  const ensureAudio = () => {
    if (audio) return audio;
    audio = createAudio();
    userVolume = Number.isFinite(audio.volume) ? audio.volume : 1;
    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', () => publish({ duration: Number.isFinite(audio.duration) ? audio.duration : 0, error: '' }));
    audio.addEventListener('error', () => {
      const code = audio.error?.code;
      const detail = code === 3 ? '文件编码无法解码' : code === 4 ? '格式或编码不受支持' : '文件读取失败';
      publish({ playing: false, error: `音频${detail}` });
    });
    audio.addEventListener('timeupdate', () => {
      const currentTime = audio.currentTime || 0;
      if (state.mode === 'hover' && currentTime - previewStartedAt >= previewLimit) {
        stop();
        return;
      }
      publish({ currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : state.duration });
    });
    audio.addEventListener('play', () => publish({ playing: true, error: '' }));
    audio.addEventListener('pause', () => publish({ playing: false }));
    audio.addEventListener('ended', () => stop());
    // 淡入淡出期间元素音量会变，对外始终只暴露用户设置的音量
    audio.addEventListener('volumechange', () => publish({ volume: userVolume }));
    return audio;
  };

  const cancelPending = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
    pendingId = null;
  };
  const cancelScrub = () => {
    if (scrubTimer !== null) clearTimer(scrubTimer);
    scrubTimer = null;
    pendingScrub = null;
  };

  // 音量淡入/淡出：只在有 requestAnimationFrame 的真实环境里生效，用来消除起播/停止时的“啪”声。
  const ramp = (from, to, ms, done) => {
    if (!raf || !audio || ms <= 0) {
      if (audio) audio.volume = to * userVolume;
      done?.();
      return;
    }
    const id = ++rampId;
    rampActive = true;
    const startedAt = now();
    audio.volume = from * userVolume;
    const step = () => {
      if (id !== rampId || !audio) return;
      const k = Math.min(1, (now() - startedAt) / ms);
      audio.volume = (from + (to - from) * k) * userVolume;
      if (k < 1) raf(step);
      else {
        rampActive = false;
        done?.();
      }
    };
    raf(step);
  };
  const restoreVolume = () => {
    rampId++;
    rampActive = false;
    if (audio) audio.volume = userVolume;
  };

  const resetAudio = () => {
    if (!audio) return;
    rampId++;
    rampActive = false;
    audio.pause();
    try { audio.currentTime = 0; } catch {}
    audio.removeAttribute?.('src');
    audio.load?.();
    loadedSource = '';
    audio.volume = userVolume;
  };
  // 彻底停止并卸载音频（切换筛选、窗口失焦等）
  const stop = () => {
    playRequest++;
    awaitingMetadata = false;
    cancelPending();
    cancelScrub();
    resetAudio();
    publish({ ...EMPTY_STATE, volume: userVolume });
  };
  // 仅暂停（鼠标移出卡片）：保留已加载的音频，下次悬停同一素材无需重新加载
  const halt = () => {
    const request = ++playRequest;
    awaitingMetadata = false;
    cancelPending();
    cancelScrub();
    publish({ ...EMPTY_STATE, volume: userVolume });
    if (!audio) return;
    const finish = () => {
      if (request !== playRequest) return; // 期间又开始了新的播放，不要把它暂停掉
      audio.pause();
      restoreVolume();
    };
    if (audio.paused) finish();
    else ramp(1, 0, fadeOutMs, finish);
  };

  const attach = (player, source) => {
    if (loadedSource === source) return false;
    player.pause();
    player.src = source;
    loadedSource = source;
    return true;
  };
  const isReady = (player, source) => loadedSource === source && finitePositive(player.duration);

  const start = (item, mode) => {
    cancelPending();
    cancelScrub();
    const request = ++playRequest;
    awaitingMetadata = false;
    const player = ensureAudio();
    const source = sourceOf(item);
    if (!source) return Promise.resolve();
    const changed = attach(player, source);
    if (changed || state.id !== item.id) {
      try { player.currentTime = 0; } catch {}
    }
    previewStartedAt = player.currentTime || 0;
    publish({ id: item.id, mode, playing: false, error: '', currentTime: player.currentTime || 0, duration: Number.isFinite(player.duration) ? player.duration : 0, volume: userVolume });
    if (mode === 'hover') ramp(0, 1, fadeInMs);
    else restoreVolume();
    return Promise.resolve(player.play()).catch(error => {
      if (request === playRequest) publish({ playing: false, error: playError(error) });
    });
  };

  const startAt = (item, ratio, mode) => {
    cancelPending();
    cancelScrub();
    const request = ++playRequest;
    const player = ensureAudio();
    const source = sourceOf(item);
    if (!source) return;
    const apply = () => {
      if (request !== playRequest) return;
      awaitingMetadata = false;
      const duration = Number.isFinite(player.duration) ? player.duration : 0;
      const target = mode === 'hover' ? hoverRatio : ratio; // 加载期间鼠标可能又移动了，用最新位置
      if (duration > 0) player.currentTime = clamp01(target) * duration;
      previewStartedAt = player.currentTime || 0;
      publish({ id: item.id, mode, playing: false, error: '', currentTime: player.currentTime || 0, duration, volume: userVolume });
      if (mode === 'hover') ramp(0, 1, fadeInMs);
      else restoreVolume();
      Promise.resolve(player.play()).catch(error => {
        if (request === playRequest) publish({ playing: false, error: playError(error) });
      });
    };
    if (isReady(player, source)) {
      apply(); // 已预加载好：立即在目标位置起播
      return;
    }
    if (attach(player, source)) {
      awaitingMetadata = true;
      publish({ id: item.id, mode, playing: false, error: '', currentTime: 0, duration: 0, volume: userVolume });
      player.addEventListener('loadedmetadata', apply, { once: true });
      player.load?.();
    } else {
      // 已经在加载同一个文件，等元数据到位即可
      awaitingMetadata = true;
      publish({ id: item.id, mode, playing: false, error: '', currentTime: 0, duration: 0, volume: userVolume });
      player.addEventListener('loadedmetadata', apply, { once: true });
    }
  };

  // 鼠标进入卡片时预加载元数据（不播放），之后 hoverAt 可以立即在任意位置起播。
  const preload = item => {
    const source = sourceOf(item);
    if (!source || state.id !== null) return;
    const player = ensureAudio();
    if (loadedSource === source) return;
    player.pause();
    player.src = source;
    loadedSource = source;
    player.load?.();
  };

  const hover = item => {
    if (state.id === item.id && state.mode === 'hover' && state.playing) return;
    cancelPending();
    if (state.mode === 'hover') stop();
    pendingId = item.id;
    pendingSince = now();
    timer = setTimer(() => {
      timer = null;
      pendingId = null;
      start(item, 'hover');
    }, hoverDelay);
  };

  const scrubNow = () => {
    scrubTimer = null;
    const job = pendingScrub;
    pendingScrub = null;
    if (!job || !audio) return;
    if (state.id !== job.item.id || state.mode !== 'hover') return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (duration <= 0) return;
    const target = clamp01(job.ratio) * duration;
    if (Math.abs((audio.currentTime || 0) - target) < 0.03) return;
    lastScrubAt = now();
    audio.currentTime = target;
    previewStartedAt = target; // 鼠标一直在动就一直播，30 秒上限从最近一次定位重新计
    publish({ currentTime: target, duration });
    if (audio.paused) Promise.resolve(audio.play()).catch(error => publish({ playing: false, error: playError(error) }));
  };

  // 悬停在波形上：未播放时延迟起播；已在播放同一素材时，鼠标移动立即（节流）改变播放位置。
  const hoverAt = (item, ratio) => {
    hoverRatio = ratio;
    if (state.id === item.id && state.mode === 'hover' && loadedSource === sourceOf(item)) {
      cancelPending();
      if (awaitingMetadata) return; // 还在加载：起播时会直接用最新的鼠标位置
      pendingScrub = { item, ratio };
      const wait = scrubInterval - (now() - lastScrubAt);
      if (wait <= 0) {
        if (scrubTimer !== null) { clearTimer(scrubTimer); scrubTimer = null; }
        scrubNow();
      } else if (scrubTimer === null) {
        scrubTimer = setTimer(scrubNow, wait);
      }
      return;
    }
    // 鼠标进入后的等待时间从“第一次进入”算起：持续移动不会不停地重置等待，
    // 到点后按鼠标最新的位置起播。
    const keepSince = pendingId === item.id ? pendingSince : now();
    cancelPending();
    if (state.mode === 'hover' && state.id !== item.id) stop();
    pendingId = item.id;
    pendingSince = keepSince;
    const wait = Math.max(0, hoverDelay - (now() - keepSince));
    timer = setTimer(() => {
      timer = null;
      pendingId = null;
      startAt(item, hoverRatio, 'hover');
    }, wait);
  };

  const leave = id => {
    if (pendingId === id) cancelPending();
    if (state.id === id && state.mode === 'hover') halt();
  };
  const openFull = item => start(item, 'full');
  const prepareFull = item => {
    cancelPending();
    cancelScrub();
    const player = ensureAudio();
    const source = sourceOf(item);
    const same = state.id === item.id && loadedSource === source;
    playRequest++; // 作废悬停淡出等待中的“暂停”
    if (!same) {
      player.pause();
      attach(player, source);
      try { player.currentTime = 0; } catch {}
    }
    restoreVolume();
    publish({ id: item.id, mode: 'full', playing: same && state.playing, error: '', currentTime: player.currentTime || 0, duration: Number.isFinite(player.duration) ? player.duration : 0, volume: userVolume });
  };
  const toggle = item => (state.id === item.id && state.playing ? (ensureAudio().pause(), Promise.resolve()) : start(item, 'full'));
  const playAt = (item, ratio) => startAt(item, ratio, 'full');
  const seek = (item, ratio) => {
    const player = ensureAudio();
    const apply = () => {
      const duration = Number.isFinite(player.duration) ? player.duration : 0;
      if (duration > 0) {
        player.currentTime = clamp01(ratio) * duration;
        publish({ currentTime: player.currentTime, duration });
      }
    };
    if (state.id !== item.id || state.mode !== 'full') {
      const changed = attach(player, sourceOf(item));
      publish({ id: item.id, mode: 'full', playing: false, currentTime: 0, duration: 0 });
      // 同一文件已经加载过（例如刚悬停试听过）就不会再触发 loadedmetadata，直接定位
      if (!changed && finitePositive(player.duration)) apply();
      else player.addEventListener('loadedmetadata', apply, { once: true });
    } else apply();
  };
  const seekBy = (item, seconds) => {
    const player = ensureAudio();
    if (state.id !== item.id || state.mode !== 'full') prepareFull(item);
    const duration = Number.isFinite(player.duration) ? player.duration : 0;
    const next = Math.max(0, Math.min(duration || Infinity, (player.currentTime || 0) + Number(seconds || 0)));
    player.currentTime = next;
    publish({ currentTime: next, duration });
  };
  const setVolume = value => {
    const player = ensureAudio();
    userVolume = Math.max(0, Math.min(1, value));
    if (!rampActive) player.volume = userVolume; // 淡入淡出进行中时，下一帧会按新音量继续
    publish({ volume: userVolume });
  };

  return {
    hover,
    hoverAt,
    preload,
    leave,
    openFull,
    prepareFull,
    toggle,
    playAt,
    seek,
    seekBy,
    setVolume,
    stop,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    getAudio: () => audio,
  };
}

export const audioPreviewManager = createAudioPreviewManager();
