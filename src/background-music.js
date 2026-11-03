const priorityBackgroundMusicUrl = new URL("./assets/background-music-priority.mp3", import.meta.url).href;
const backgroundMusicUrl = new URL("./assets/background-music.mp3", import.meta.url).href;

export const BACKGROUND_MUSIC_STORAGE_KEY = "nest-background-music-enabled";
export const BACKGROUND_MUSIC_VOLUME_STORAGE_KEY = "nest-background-music-volume";
export const BACKGROUND_MUSIC_DEFAULT_VOLUME = 0.3;
export const BACKGROUND_MUSIC_TRACKS = [priorityBackgroundMusicUrl, backgroundMusicUrl];

export function backgroundMusicEnabledFromStorage(storage = globalThis.localStorage) {
  try { return storage?.getItem(BACKGROUND_MUSIC_STORAGE_KEY) !== "false"; }
  catch { return true; }
}

export function normalizeBackgroundMusicVolume(value) {
  const volume = Number(value);
  return Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : BACKGROUND_MUSIC_DEFAULT_VOLUME;
}

export function backgroundMusicVolumeFromStorage(storage = globalThis.localStorage) {
  try {
    const stored = storage?.getItem(BACKGROUND_MUSIC_VOLUME_STORAGE_KEY);
    return stored == null || stored === "" ? BACKGROUND_MUSIC_DEFAULT_VOLUME : normalizeBackgroundMusicVolume(stored);
  }
  catch { return BACKGROUND_MUSIC_DEFAULT_VOLUME; }
}

export function createBackgroundMusic({
  audioUrls = BACKGROUND_MUSIC_TRACKS,
  initialVolume = BACKGROUND_MUSIC_DEFAULT_VOLUME,
  audioFactory = (url) => new Audio(url),
} = {}) {
  const tracks = Array.isArray(audioUrls) ? audioUrls.filter(Boolean) : [];
  let audio = null;
  let playing = false;
  let trackIndex = 0;
  let volume = normalizeBackgroundMusicVolume(initialVolume);

  const player = () => {
    if (audio) return audio;
    const url = tracks[trackIndex];
    if (!url) return null;
    const current = audioFactory(url);
    if (!current) return null;
    audio = current;
    current.loop = false;
    current.preload = "auto";
    current.volume = volume;
    const playNextTrack = () => {
      if (audio !== current || !playing || tracks.length < 2) return;
      trackIndex = (trackIndex + 1) % tracks.length;
      audio = null;
      void start();
    };
    if (typeof current.addEventListener === "function") current.addEventListener("ended", playNextTrack);
    else current.onended = playNextTrack;
    return current;
  };

  async function start() {
    const current = player();
    if (!current) return false;
    try {
      await current.play();
      if (audio === current) playing = true;
      return true;
    } catch {
      if (audio === current) playing = false;
      return false;
    }
  }

  return {
    start,
    pause() {
      audio?.pause();
      playing = false;
      return true;
    },
    setVolume(value) {
      volume = normalizeBackgroundMusicVolume(value);
      if (audio) audio.volume = volume;
      return volume;
    },
    getVolume() { return volume; },
    isPlaying() { return playing; },
  };
}

export const backgroundMusic = createBackgroundMusic();
