const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { UpdateManager } = require('./update-manager.cjs');

function registerUpdateController({ app, ipcMain, net, spawn, shell, getMainWindows, isBusy = () => false, quitForUpdate }) {
  const directory = path.join(app.getPath('userData'), 'updates');
  const currentExe = process.env.PORTABLE_EXECUTABLE_FILE || app.getPath('exe');
  const portable = Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
  const acknowledgements = new Map();
  const trusted = event => getMainWindows().some(win => !win.isDestroyed() && win.webContents === event.sender);
  function capability() {
    if (process.platform !== 'win32') return { allowed: false, reason: 'macOS 更新包下载完成后需要手动安装' };
    if (!app.isPackaged) return { allowed: false, reason: '开发运行不自动覆盖程序文件' };
    if (portable) return { allowed: true, reason: '' };
    let scope; try { scope = JSON.parse(fs.readFileSync(path.join(path.dirname(currentExe), 'resources/installation-context.json'), 'utf8')).scope; } catch {}
    return scope === 'CurrentUser' ? { allowed: true, reason: '' } : { allowed: false, reason: '所有用户安装或未识别的安装范围需要手动安装授权' };
  }
  async function prepareInstall({ startup }) {
    if (startup) return true;
    if (isBusy()) return false;
    const requests = getMainWindows().filter(win => !win.isDestroyed()).map(win => new Promise((resolve, reject) => {
      const id = crypto.randomUUID(), timer = setTimeout(() => { acknowledgements.delete(id); reject(new Error('保存素材数据超时，请稍后重试')); }, 15000);
      acknowledgements.set(id, { sender: win.webContents, finish: ok => { clearTimeout(timer); acknowledgements.delete(id); ok ? resolve() : reject(new Error('部分素材修改未保存，更新已推迟')); } });
      win.webContents.send('app:prepare-update', id);
    }));
    await Promise.all(requests); return !isBusy();
  }
  async function launchInstaller({ filePath, sha256, silent, restart }) {
    if (process.platform !== 'win32') { const error = await shell.openPath(filePath); if (error) throw new Error(error); return; }
    fs.mkdirSync(directory, { recursive: true });
    const worker = path.join(directory, 'windows-update-worker.ps1'), log = path.join(directory, 'updater.log');
    if (!silent && !portable) {
      fs.appendFileSync(log, `${new Date().toISOString()} Launching the interactive Windows installer.\n`, 'utf8');
      const child = spawn(filePath, ['--updated'], { detached: true, stdio: 'ignore', windowsHide: false });
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      child.unref();
      fs.appendFileSync(log, `${new Date().toISOString()} Interactive installer process started (restart=${restart}).\n`, 'utf8');
      return;
    }
    fs.writeFileSync(worker, '\uFEFF' + fs.readFileSync(path.join(__dirname, 'windows-update-worker.ps1'), 'utf8').replace(/^\uFEFF/, ''));
    const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', worker, '-ParentPid', String(process.pid), '-InstallerPath', filePath, '-CurrentExe', currentExe, '-ExpectedSha256', sha256, '-LogFile', log];
    if (silent) args.push('-Silent'); if (portable) args.push('-Portable'); if (restart) args.push('-Restart');
    const child = spawn('powershell.exe', args, { detached: true, stdio: 'ignore', windowsHide: true });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); }); child.unref();
  }
  const manager = new UpdateManager({ directory, version: app.getVersion(), portable, fetchImpl: net.fetch.bind(net), canInstallSilently: capability, prepareInstall, launchInstaller, automaticChecks: app.isPackaged });
  manager.on('state', value => { for (const win of getMainWindows()) if (!win.isDestroyed()) { win.webContents.send('app:auto-update-state', value); if (value.progress) win.webContents.send('app:update-progress', value.progress); } });
  ipcMain.on('app:update-prepared', (event, { id, ok } = {}) => { const request = acknowledgements.get(id); if (request && request.sender === event.sender) request.finish(ok === true); });
  const handlers = {
    'app:auto-update-state': () => manager.snapshot(),
    'app:set-auto-update': enabled => manager.setEnabled(enabled),
    'app:check-update': () => manager.check(),
    'app:download-update': options => manager.download(options),
    'app:install-update': async filePath => { const result = await manager.install({ filePath, restart: true }); if (result.deferred) return { error: '请先结束导入、文件传输或文本编辑，再安装已下载的更新' }; if (result.quitting) quitForUpdate(); return result; }
  };
  for (const [name, handler] of Object.entries(handlers)) ipcMain.handle(name, async (event, value) => { if (!trusted(event)) return { error: '窗口不可用' }; try { return await handler(value); } catch (error) { return { error: error.message }; } });
  return {
    manager,
    start: () => manager.start(),
    stop: () => manager.stop(),
    readyForExit: () => manager.enabled && manager.validPending() && !manager.pending.attempted && capability().allowed,
    installOnExit: () => manager.install({ automatic: true, restart: false }),
    installAtStartup: async () => { const result = await manager.install({ automatic: true, restart: true, startup: true }); if (result.quitting) quitForUpdate(); return result; }
  };
}
module.exports = { registerUpdateController };
