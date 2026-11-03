// Keep only compact peaks, never decoded audio buffers.
export function createWaveformCache(limit = 512) {
  const entries = new Map();
  return {
    get(key) {
      const value = entries.get(key);
      if (value) { entries.delete(key); entries.set(key, value); }
      return value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, value);
      while (entries.size > limit) entries.delete(entries.keys().next().value);
    },
  };
}
export const waveformCache = createWaveformCache();
