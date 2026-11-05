// Keep only compact peaks, never decoded audio buffers.
// 波形峰值除了放内存，也存到本机（localStorage）：每次打开软件不用再把每个音频完整解码一遍，
// 第一次滚到长音乐时就不会卡（LES-007）。存的只是每列三个数，一个音频一两 KB。
const STORAGE_PREFIX = "nest-waveform-v1:";
const STORAGE_INDEX = "nest-waveform-v1-index";

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function encodePeaks(peaks) {
  const round = (values) => Array.from(values, (value) => Math.round(value * 1000) / 1000);
  return JSON.stringify({ low: round(peaks.low), mid: round(peaks.mid), high: round(peaks.high) });
}

function decodePeaks(text) {
  try {
    const value = JSON.parse(text);
    if (!Array.isArray(value?.low) || !Array.isArray(value?.mid) || !Array.isArray(value?.high)) return null;
    if (value.low.length !== value.mid.length || value.low.length !== value.high.length) return null;
    return { low: Float32Array.from(value.low), mid: Float32Array.from(value.mid), high: Float32Array.from(value.high) };
  } catch {
    return null;
  }
}

export function createWaveformCache(limit = 512, { storage = defaultStorage(), storageLimit = 1200 } = {}) {
  const entries = new Map();
  const readIndex = () => {
    try {
      const value = JSON.parse(storage?.getItem(STORAGE_INDEX) || "[]");
      return Array.isArray(value) ? value.filter((key) => typeof key === "string") : [];
    } catch {
      return [];
    }
  };
  const writeIndex = (keys) => {
    try { storage?.setItem(STORAGE_INDEX, JSON.stringify(keys)); } catch { /* 本机存储不可用就只用内存 */ }
  };
  const remember = (key, value) => {
    entries.delete(key);
    entries.set(key, value);
    while (entries.size > limit) entries.delete(entries.keys().next().value);
  };
  return {
    get(key) {
      const value = entries.get(key);
      if (value) { remember(key, value); return value; }
      if (!storage) return undefined;
      let stored = null;
      try { stored = storage.getItem(STORAGE_PREFIX + key); } catch { return undefined; }
      const peaks = stored ? decodePeaks(stored) : null;
      if (!peaks) return undefined;
      remember(key, peaks);
      return peaks;
    },
    set(key, value) {
      remember(key, value);
      if (!storage) return;
      const keys = readIndex().filter((item) => item !== key);
      keys.push(key);
      // 最久没用的先删；存满（QuotaExceeded）时也从最旧的开始腾地方
      while (keys.length > storageLimit) {
        try { storage.removeItem(STORAGE_PREFIX + keys.shift()); } catch { /* ignore */ }
      }
      const text = encodePeaks(value);
      for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
          storage.setItem(STORAGE_PREFIX + key, text);
          break;
        } catch {
          const oldest = keys.shift();
          if (!oldest || oldest === key) break;
          try { storage.removeItem(STORAGE_PREFIX + oldest); } catch { /* ignore */ }
        }
      }
      writeIndex(keys);
    },
  };
}
export const waveformCache = createWaveformCache();
