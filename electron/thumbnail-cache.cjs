const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function createThumbnailCache({ app, ffmpegPath, resolveAssetPath }) {
  const imageAssets = new Map();
  let libraryKey = '';
  let activeJobs = 0;
  const jobs = [];
  const inFlight = new Map();
  const maxConcurrent = 2;

  const keyFor = value => crypto.createHash('sha256').update(String(value)).digest('hex');
  const executablePath = () => {
    if (!ffmpegPath) return '';
    const unpacked = String(ffmpegPath).replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
    return fs.existsSync(unpacked) ? unpacked : String(ffmpegPath);
  };

  function setLibrary(root, assets) {
    libraryKey = root ? keyFor(path.resolve(root)).slice(0, 24) : '';
    imageAssets.clear();
    for (const asset of Array.isArray(assets) ? assets : []) {
      if (asset?.file && String(asset.type || '').startsWith('image/')) imageAssets.set(String(asset.id), asset.file);
    }
  }

  function urlFor(assetId) {
    return libraryKey && assetId != null
      ? `nest://thumbnail/${libraryKey}/${encodeURIComponent(String(assetId))}`
      : '';
  }

  function schedule(task) {
    return new Promise((resolve, reject) => {
      jobs.push({ task, resolve, reject });
      pump();
    });
  }

  function pump() {
    while (activeJobs < maxConcurrent && jobs.length) {
      const job = jobs.shift();
      activeJobs += 1;
      Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(() => {
        activeJobs -= 1;
        pump();
      });
    }
  }

  function convert(source, target) {
    const executable = executablePath();
    if (!executable || !fs.existsSync(executable)) return Promise.reject(new Error('Bundled image converter is unavailable'));
    const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp.jpg`;
    return schedule(() => new Promise((resolve, reject) => {
      let child;
      let stderr = '';
      let settled = false;
      const cleanup = () => fs.promises.rm(temporary, { force: true }).catch(() => {});
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) {
          child?.kill();
          void cleanup();
          reject(error);
        } else {
          resolve();
        }
      };
      const timeout = setTimeout(() => finish(new Error('Thumbnail generation timed out')), 30000);
      try {
        child = spawn(executable, [
          '-nostdin', '-hide_banner', '-loglevel', 'error', '-threads', '1',
          '-i', source, '-frames:v', '1', '-vf', "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease",
          '-q:v', '5', '-c:v', 'mjpeg', '-f', 'image2', temporary,
        ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
        child.stderr?.on('data', chunk => { if (stderr.length < 4000) stderr += chunk.toString(); });
        child.once('error', error => finish(error));
        child.once('close', code => {
          if (code !== 0) return finish(new Error(stderr.trim() || `Image conversion exited with code ${code}`));
          fs.promises.stat(temporary).then(stat => {
            if (!stat.isFile() || stat.size === 0) throw new Error('Generated thumbnail is empty');
            return fs.promises.rename(temporary, target);
          }).then(() => finish(), finish);
        });
      } catch (error) {
        finish(error);
      }
    }));
  }

  async function getFile(requestUrl) {
    let parsed;
    try { parsed = new URL(requestUrl); } catch { return null; }
    if (parsed.protocol !== 'nest:' || parsed.hostname !== 'thumbnail') return null;
    let segments;
    try { segments = parsed.pathname.split('/').filter(Boolean); } catch { return null; }
    if (segments.length !== 2 || segments[0] !== libraryKey || !libraryKey) return null;
    let assetId;
    try { assetId = decodeURIComponent(segments[1]); } catch { return null; }
    const relativeFile = imageAssets.get(assetId);
    if (!relativeFile) return null;

    let source;
    let stat;
    try {
      source = resolveAssetPath(relativeFile);
      stat = await fs.promises.stat(source);
      if (!stat.isFile()) return null;
    } catch { return null; }

    const identity = keyFor(`${source}\0${stat.size}\0${stat.mtimeMs}`);
    const cacheDirectory = path.join(app.getPath('userData'), 'thumbnail-cache', libraryKey);
    const target = path.join(cacheDirectory, `${identity}.jpg`);
    try {
      const cached = await fs.promises.stat(target);
      if (cached.isFile() && cached.size > 0) return { path: target, thumbnail: true };
    } catch {}

    let task = inFlight.get(target);
    if (!task) {
      task = (async () => {
        await fs.promises.mkdir(cacheDirectory, { recursive: true });
        await convert(source, target);
      })().finally(() => inFlight.delete(target));
      inFlight.set(target, task);
    }
    try {
      await task;
      return { path: target, thumbnail: true };
    } catch {
      // Preserve access to unusual or damaged image formats if FFmpeg cannot decode them.
      return { path: source, thumbnail: false };
    }
  }

  return { setLibrary, urlFor, getFile };
}

module.exports = { createThumbnailCache };
