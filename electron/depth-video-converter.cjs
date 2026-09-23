const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.m4v']);

function isVideoAsset(asset) {
  if (String(asset?.type || '').toLowerCase().startsWith('video/')) return true;
  return VIDEO_EXTENSIONS.has(path.extname(String(asset?.file || '')).toLowerCase());
}

function resolveConverterPaths({ isPackaged, resourcesPath, appPath }) {
  const root = path.join(isPackaged ? resourcesPath : appPath, 'depth-video-converter');
  return {
    root,
    executable: path.join(root, 'DepthVideoConverter.exe'),
    model: path.join(root, 'depth-anything-v2-small-quantized.onnx'),
  };
}

function validateConverterPaths(paths) {
  const missing = [
    [paths.executable, '深度视频转换器'],
    [paths.model, '深度模型'],
  ].filter(([file]) => !fs.existsSync(file));
  if (!missing.length) return null;
  return `深度视频组件不完整：缺少${missing.map(([, label]) => label).join('、')}。请重新安装小旺仔素材库。`;
}

function buildConverterArgs({ input, output, model, style = '灰度深度' }) {
  return ['--input', input, '--output', output, '--model', model, '--style', style];
}

function createDepthVideoCancelledError() {
  const error = new Error('转换已取消');
  error.code = 'DEPTH_VIDEO_CANCELLED';
  return error;
}

function isDepthVideoCancelledError(error) {
  return error?.code === 'DEPTH_VIDEO_CANCELLED';
}

function terminateDepthVideoProcess(child) {
  if (!child) return;
  try { child.kill('SIGTERM'); } catch {}
  // PyInstaller's converter can have an FFmpeg child.  Windows only ends the
  // full tree when taskkill receives /T; child.kill alone leaves FFmpeg alive.
  if (process.platform === 'win32' && Number.isInteger(child.pid) && child.pid > 0) {
    try {
      const taskkill = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      taskkill.once('error', () => {});
    } catch {}
  }
}

function runDepthVideoConverter({ executable, input, output, model, style, onProgress, onLog, signal, spawnProcess = spawn, terminateChild = terminateDepthVideoProcess }) {
  const args = buildConverterArgs({ input, output, model, style });
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(createDepthVideoCancelledError());
    const child = spawnProcess(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdoutBuffer = '';
    let stderr = '';
    let settled = false;
    let cancelled = false;
    let abortHandler = null;
    const removeAbortHandler = () => {
      if (abortHandler) signal?.removeEventListener('abort', abortHandler);
      abortHandler = null;
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      removeAbortHandler();
      callback(value);
    };
    const consume = line => {
      const value = String(line || '').trim();
      if (!value) return;
      if (value.startsWith('PROGRESS:')) {
        const percent = Number(value.slice('PROGRESS:'.length));
        if (Number.isFinite(percent)) onProgress?.(Math.max(0, Math.min(100, percent)));
        return;
      }
      if (value.startsWith('LOG:')) {
        onLog?.(value.slice('LOG:'.length).trim());
        return;
      }
      if (value.startsWith('DONE:')) return;
      onLog?.(value);
    };
    child.stdout.on('data', chunk => {
      stdoutBuffer += chunk.toString('utf8');
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || '';
      lines.forEach(consume);
    });
    child.stderr.on('data', chunk => {
      stderr = (stderr + chunk.toString('utf8')).slice(-8000);
    });
    abortHandler = () => {
      if (cancelled || settled) return;
      cancelled = true;
      terminateChild(child);
    };
    signal?.addEventListener('abort', abortHandler, { once: true });
    if (signal?.aborted) abortHandler();
    child.on('error', error => finish(reject, cancelled ? createDepthVideoCancelledError() : error));
    child.on('close', code => {
      consume(stdoutBuffer);
      if (cancelled) return finish(reject, createDepthVideoCancelledError());
      if (code === 0 && fs.existsSync(output)) return finish(resolve, { output });
      const detail = stderr.trim() || `转换器退出代码 ${code}`;
      finish(reject, new Error(detail.replace(/^ERROR:/, '').trim()));
    });
  });
}

module.exports = {
  VIDEO_EXTENSIONS,
  isVideoAsset,
  resolveConverterPaths,
  validateConverterPaths,
  buildConverterArgs,
  createDepthVideoCancelledError,
  isDepthVideoCancelledError,
  terminateDepthVideoProcess,
  runDepthVideoConverter,
};
