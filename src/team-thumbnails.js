// 团队素材库缩略图生成（在渲染进程里用 canvas 完成，结果由主进程上传到服务端，所有成员共用）。
// 图片：直接缩放；视频：取靠前的一帧；音频：解码后画波形（文件较大时跳过，只显示图标）。
export const THUMBNAIL_MAX_EDGE = 480;
export const THUMBNAIL_QUALITY = 0.82;
const IMAGE_LIMIT = 80 * 1024 * 1024;
const AUDIO_LIMIT = 40 * 1024 * 1024;
const BACKGROUND = '#17171a';

export function thumbnailKind(asset) {
  const type = String(asset?.type || '');
  const size = Number(asset?.size) || 0;
  if (type === 'image/svg+xml' || (type.startsWith('image/') && size <= IMAGE_LIMIT)) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/') && size <= AUDIO_LIMIT) return 'audio';
  return null;
}

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

function waitFor(target, okEvent, ms, message) {
  return withTimeout(new Promise((resolve, reject) => {
    target.addEventListener(okEvent, () => resolve(), { once: true });
    target.addEventListener('error', () => reject(new Error(message)), { once: true });
  }), ms, message);
}

function fitSize(width, height, maxEdge = THUMBNAIL_MAX_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function toBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('无法生成缩略图'))), 'image/jpeg', THUMBNAIL_QUALITY));
}

function drawSource(source, sourceWidth, sourceHeight) {
  if (!sourceWidth || !sourceHeight) throw new Error('无法读取画面尺寸');
  const { width, height } = fitSize(sourceWidth, sourceHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

async function imageThumbnail(url, timeoutMs) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.decoding = 'async';
  const loaded = waitFor(image, 'load', timeoutMs, '图片加载失败');
  image.src = url;
  await loaded;
  // SVG 可能没有固有尺寸，按 480 画
  const width = image.naturalWidth || THUMBNAIL_MAX_EDGE, height = image.naturalHeight || Math.round(THUMBNAIL_MAX_EDGE * 0.75);
  return drawSource(image, width, height);
}

async function videoThumbnail(url, timeoutMs) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.crossOrigin = 'anonymous';
  try {
    const metadata = waitFor(video, 'loadedmetadata', timeoutMs, '视频加载失败');
    video.src = url;
    await metadata;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const target = duration > 0 ? Math.min(Math.max(duration * 0.1, 0.1), 5, Math.max(duration - 0.05, 0)) : 0;
    if (target > 0) {
      const seeked = waitFor(video, 'seeked', timeoutMs, '视频定位失败');
      video.currentTime = target;
      await seeked;
    } else if (video.readyState < 2) {
      await waitFor(video, 'loadeddata', timeoutMs, '视频画面读取失败');
    }
    return drawSource(video, video.videoWidth, video.videoHeight);
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

export function peaksFromSamples(samples, columns) {
  const peaks = new Float32Array(columns);
  if (!samples.length) return peaks;
  const step = samples.length / columns;
  for (let column = 0; column < columns; column++) {
    const from = Math.floor(column * step), to = Math.max(from + 1, Math.floor((column + 1) * step));
    let peak = 0;
    for (let index = from; index < to && index < samples.length; index++) peak = Math.max(peak, Math.abs(samples[index]));
    peaks[column] = peak;
  }
  return peaks;
}

async function audioThumbnail(url, timeoutMs) {
  const response = await withTimeout(fetch(url), timeoutMs, '音频加载失败');
  if (!response.ok) throw new Error(`音频读取失败（${response.status}）`);
  const bytes = await withTimeout(response.arrayBuffer(), timeoutMs * 2, '音频读取超时');
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('当前环境不支持音频解码');
  const context = new AudioContextClass();
  try {
    const buffer = await withTimeout(context.decodeAudioData(bytes), timeoutMs * 2, '音频解码超时');
    const columns = 96, width = THUMBNAIL_MAX_EDGE, height = Math.round(THUMBNAIL_MAX_EDGE * 0.6);
    const peaks = peaksFromSamples(buffer.getChannelData(0), columns);
    const max = Math.max(...peaks, 0.001);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const drawing = canvas.getContext('2d');
    drawing.fillStyle = BACKGROUND;
    drawing.fillRect(0, 0, width, height);
    const gradient = drawing.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#6f8cff');
    gradient.addColorStop(1, '#b07cf6');
    drawing.fillStyle = gradient;
    const barWidth = width / columns;
    for (let column = 0; column < columns; column++) {
      const barHeight = Math.max(3, (peaks[column] / max) * (height - 24));
      drawing.fillRect(column * barWidth + 1, (height - barHeight) / 2, Math.max(1, barWidth - 2), barHeight);
    }
    return canvas;
  } finally {
    context.close?.();
  }
}

// 返回 { blob, width, height }；不支持的类型返回 null；失败时抛出错误
export async function generateThumbnail(asset, url, { timeoutMs = 20000 } = {}) {
  const kind = thumbnailKind(asset);
  if (!kind) return null;
  const canvas = kind === 'image' ? await imageThumbnail(url, timeoutMs) : kind === 'video' ? await videoThumbnail(url, timeoutMs) : await audioThumbnail(url, timeoutMs);
  const blob = await toBlob(canvas);
  return { blob, width: canvas.width, height: canvas.height };
}

// 简单的并发队列：同一素材只排一次；失败的素材在本次会话内不再重试
export function createThumbnailQueue(worker, { concurrency = 2 } = {}) {
  const seen = new Set(), pending = [];
  let running = 0;
  const pump = () => {
    while (running < concurrency && pending.length) {
      const asset = pending.shift();
      running += 1;
      Promise.resolve().then(() => worker(asset)).catch(() => {}).finally(() => { running -= 1; pump(); });
    }
  };
  return {
    add(asset) {
      if (!asset?.id || seen.has(asset.id)) return false;
      seen.add(asset.id);
      pending.push(asset);
      pump();
      return true;
    },
    clear() { pending.length = 0; seen.clear(); },
    get size() { return pending.length + running; },
  };
}
