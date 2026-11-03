const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { chooseUpdateAsset, isCompatibleUpdateFile } = require('./update-assets.cjs');
const RELEASE_API = 'https://api.github.com/repos/xwz561/Nest-Asset-Library/releases/latest';
const PACKAGE_URL = /^https:\/\/github\.com\/xwz561\/Nest-Asset-Library\/releases\/download\/[^/]+\/[^/]+$/i;
const readJSON = filename => { try { return JSON.parse(fs.readFileSync(filename, 'utf8')); } catch { return {}; } };
const newerVersion = (candidate, current) => { const a = String(candidate).replace(/^v/i, '').split('.').map(Number), b = String(current).replace(/^v/i, '').split('.').map(Number); if (a.some(n => !Number.isFinite(n))) return false; for (let i = 0; i < Math.max(a.length, b.length); i++) { if ((a[i] || 0) > (b[i] || 0)) return true; if ((a[i] || 0) < (b[i] || 0)) return false; } return false; };
async function fileHash(filename) { const hash = crypto.createHash('sha256'); for await (const chunk of fs.createReadStream(filename)) hash.update(chunk); return hash.digest('hex'); }

class UpdateManager extends EventEmitter {
  constructor({ directory, version, platform = process.platform, arch = process.arch, portable = false, fetchImpl = fetch, canInstallSilently = () => ({ allowed: false, reason: '当前安装类型需要手动安装' }), prepareInstall = async () => true, launchInstaller = async () => {}, automaticChecks = true }) {
    super(); Object.assign(this, { directory, version, platform, arch, portable, fetchImpl, canInstallSilently, prepareInstall, launchInstaller, automaticChecks });
    fs.mkdirSync(path.join(directory, 'packages'), { recursive: true });
    this.preferencesFile = path.join(directory, 'preferences.json'); this.pendingFile = path.join(directory, 'pending.json');
    this.enabled = readJSON(this.preferencesFile).enabled !== false;
    this.pending = readJSON(this.pendingFile); this.info = this.pending.info || null; this.progress = null; this.error = ''; this.phase = 'idle';
    this.checking = null; this.downloading = null; this.installing = false; this.downloadController = null; this.automaticDownload = false; this.stopped = false;
    if (!this.validPending() || !newerVersion(this.pending.version, version)) {
      if (this.validPending()) { try { fs.rmSync(this.pending.filePath, { force: true }); } catch {} }
      this.pending = {}; this.info = null; this.persist(this.pendingFile, {});
    } else this.phase = this.pending.attempted ? 'error' : 'ready';
  }
  persist(filename, value) { fs.writeFileSync(filename + '.tmp', JSON.stringify(value, null, 2)); fs.renameSync(filename + '.tmp', filename); }
  inCache(filename) { const relative = path.relative(path.join(this.directory, 'packages'), path.resolve(String(filename || ''))); return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative); }
  validPending() { return this.inCache(this.pending.filePath) && fs.existsSync(this.pending.filePath) && /^[a-f\d]{64}$/.test(this.pending.sha256 || '') && /^\d+\.\d+\.\d+$/.test(this.pending.version || '') && isCompatibleUpdateFile({ platform: this.platform, portable: this.portable, name: this.pending.filePath }); }
  snapshot() {
    const ready = this.validPending(), capability = this.canInstallSilently();
    return { enabled: this.enabled, phase: this.phase, info: this.info, progress: this.progress, error: this.error || (this.pending.attempted ? '上次自动安装未完成，可手动重试安装' : ''), ready, filePath: ready ? this.pending.filePath : '', silentInstall: capability.allowed, reason: capability.reason || '', pendingVersion: ready ? this.pending.version : '' };
  }
  notify() { this.emit('state', this.snapshot()); }
  setEnabled(enabled) { if (typeof enabled !== 'boolean') throw new Error('更新开关状态无效'); this.persist(this.preferencesFile, { enabled }); this.enabled = enabled; if (!enabled && this.automaticDownload) this.downloadController?.abort(); this.notify(); if (enabled && this.automaticChecks) this.check({ background: true }).catch(() => {}); return this.snapshot(); }
  start() {
    if (!this.automaticChecks || this.stopped) return;
    this.startupTimer = setTimeout(() => { if (this.enabled) this.check({ background: true }).catch(() => {}); }, 5000);
    this.interval = setInterval(() => { if (this.enabled) this.check({ background: true }).catch(() => {}); }, 30 * 60 * 1000);
    this.startupTimer.unref?.(); this.interval.unref?.();
  }
  stop() { this.stopped = true; clearTimeout(this.startupTimer); clearInterval(this.interval); this.downloadController?.abort(); }

  check({ background = false } = {}) {
    if (background && (!this.enabled || this.stopped)) return Promise.resolve(this.info);
    if (this.checking) return this.checking;
    this.checking = this.checkRelease(background).finally(() => { this.checking = null; }); return this.checking;
  }
  async checkRelease(background) {
    if (!this.downloading) this.phase = 'checking'; this.error = ''; this.notify();
    try {
      const response = await this.fetchImpl(RELEASE_API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Small-Wangzai-Asset-Library' }, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`GitHub 返回 ${response.status}`);
      const release = await response.json(), latest = String(release.tag_name || '').replace(/^v/i, '');
      const selection = chooseUpdateAsset({ platform: this.platform, arch: this.arch, portable: this.portable, assets: release.assets });
      this.info = { ok: true, current: this.version, latest, available: newerVersion(latest, this.version), installKind: selection.installKind, releaseUrl: release.html_url, downloadUrl: selection.asset?.browser_download_url || '', downloadName: selection.asset?.name || '', downloadDigest: selection.asset?.digest || '', notes: String(release.body || '').slice(0, 3000), publishedAt: release.published_at || '', missingPackage: newerVersion(latest, this.version) && !selection.asset };
      if (!this.downloading) this.phase = this.validPending() ? 'ready' : 'idle'; this.notify();
      if (this.enabled && this.info.available && !this.info.missingPackage && !this.downloading && !(this.validPending() && !newerVersion(latest, this.pending.version))) {
        this.download({ ...this.info, automatic: true }).catch(() => {});
      }
      return this.info;
    } catch (error) { if (!this.downloading) this.phase = 'error'; this.error = `检查更新失败：${error.message}`; this.notify(); throw new Error(this.error); }
  }

  download(options) {
    if (this.downloading) return this.downloading;
    this.downloading = this.downloadPackage(options).finally(() => { this.downloading = null; this.downloadController = null; this.automaticDownload = false; }); return this.downloading;
  }
  async downloadPackage(options) {
    const url = String(options?.downloadUrl || options?.url || ''), name = path.basename(String(options?.downloadName || options?.name || ''));
    const digest = String(options?.downloadDigest || options?.digest || ''), expected = /^sha256:([a-f\d]{64})$/i.exec(digest)?.[1].toLowerCase();
    const version = String(options?.latest || this.info?.latest || '');
    if (!PACKAGE_URL.test(url) || !name || !/^\d+\.\d+\.\d+$/.test(version) || !isCompatibleUpdateFile({ platform: this.platform, portable: this.portable, name })) { this.error = '没有适合当前设备的官方更新包'; this.phase = 'error'; this.notify(); throw new Error(this.error); }
    if (!expected) { this.error = '更新包缺少 SHA256 校验信息，已拒绝下载'; this.phase = 'error'; this.notify(); throw new Error(this.error); }
    if (this.validPending() && this.pending.version === version && this.pending.sha256 === expected) return { ok: true, filePath: this.pending.filePath, verified: true };
    const folder = path.join(this.directory, 'packages', version); fs.mkdirSync(folder, { recursive: true });
    const target = path.join(folder, name), temporary = target + '.part';
    const controller = new AbortController(); this.downloadController = controller; this.automaticDownload = options.automatic === true; this.phase = 'downloading'; this.error = ''; this.notify();
    let lastNotify = 0;
    try {
      let offset = fs.existsSync(temporary) ? fs.statSync(temporary).size : 0;
      let response = await this.fetchImpl(url, { headers: offset ? { Range: `bytes=${offset}-` } : {}, signal: controller.signal });
      if (response.status === 416 && offset) { await fs.promises.rm(temporary, { force: true }); offset = 0; response = await this.fetchImpl(url, { signal: controller.signal }); }
      if (!response.ok || !response.body) throw new Error(`下载服务器返回 ${response.status}`);
      const resumed = offset > 0 && response.status === 206 && String(response.headers.get('content-range') || '').startsWith(`bytes ${offset}-`);
      let received = resumed ? offset : 0;
      const total = received + (Number(response.headers.get('content-length')) || 0), reader = response.body.getReader();
      const output = await fs.promises.open(temporary, resumed ? 'a' : 'w');
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          const chunk = Buffer.from(value); let written = 0;
          while (written < chunk.length) written += (await output.write(chunk, written, chunk.length - written)).bytesWritten;
          received += chunk.length; this.progress = { received, total, percent: total ? Math.min(100, received / total * 100) : 0 };
          if (Date.now() - lastNotify > 250) { lastNotify = Date.now(); this.notify(); }
        }
      } finally { await output.close(); reader.releaseLock(); }
      if (total && received !== total) throw new Error('更新包未完整下载，稍后会继续下载');
      if (await fileHash(temporary) !== expected) { await fs.promises.rm(temporary, { force: true }); throw new Error('SHA256 校验失败，已丢弃下载内容'); }
      await fs.promises.rename(temporary, target);
      const previous = this.pending;
      this.pending = { version, filePath: target, sha256: expected, info: this.info || { ...options, latest: version }, downloadedAt: Date.now(), attempted: false }; this.persist(this.pendingFile, this.pending);
      if (previous.filePath && previous.filePath !== target && this.inCache(previous.filePath)) await fs.promises.rm(previous.filePath, { force: true }).catch(() => {});
      this.phase = 'ready'; this.progress = { received, total: received, percent: 100, verified: true }; this.error = ''; this.notify();
      return { ok: true, filePath: target, verified: true };
    } catch (error) { this.phase = controller.signal.aborted ? 'idle' : 'error'; this.progress = null; this.error = controller.signal.aborted ? '' : `下载更新失败：${error.message}`; this.notify(); throw new Error(this.error || '后台下载已暂停'); }
  }

  async install({ filePath = this.pending.filePath, automatic = false, restart = true, startup = false } = {}) {
    if (this.installing) return { deferred: true };
    if (automatic && (!this.enabled || this.pending.attempted || !this.canInstallSilently().allowed)) return { deferred: true };
    if (!this.validPending() || path.resolve(filePath || '') !== path.resolve(this.pending.filePath) || !newerVersion(this.pending.version, this.version)) return { deferred: true };
    this.installing = true;
    try {
      if (!await this.prepareInstall({ startup, automatic })) return { deferred: true };
      if (await fileHash(this.pending.filePath) !== this.pending.sha256) { await fs.promises.rm(this.pending.filePath, { force: true }); this.pending = {}; this.persist(this.pendingFile, {}); throw new Error('待安装更新包校验失败，请重新下载'); }
      await this.launchInstaller({ ...this.pending, silent: automatic && this.canInstallSilently().allowed, restart });
      if (this.platform === 'win32') { this.pending.attempted = true; this.persist(this.pendingFile, this.pending); this.phase = 'installing'; } else this.phase = 'ready';
      this.notify();
      return { ok: true, quitting: this.platform === 'win32', updater: this.portable ? 'portable' : 'installer' };
    } catch (error) { this.error = `无法安装更新：${error.message}`; this.phase = 'error'; this.notify(); throw new Error(this.error); }
    finally { this.installing = false; }
  }
}
module.exports = { UpdateManager, newerVersion, fileHash, RELEASE_API };
