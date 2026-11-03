const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { UpdateManager, RELEASE_API } = require('../electron/update-manager.cjs');
const bytes = Buffer.from('isolated update package bytes');
const digest = 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
const url = 'https://github.com/xwz561/Nest-Asset-Library/releases/download/v3.0.42/App-3.0.42-Setup.exe';
const options = { downloadUrl: url, downloadName: 'App-3.0.42-Setup.exe', downloadDigest: digest, latest: '3.0.42' };
const release = { tag_name: 'v3.0.42', html_url: 'https://github.com/xwz561/Nest-Asset-Library/releases/tag/v3.0.42', assets: [{ name: options.downloadName, browser_download_url: url, digest }] };
const response = (body = bytes, status = 200, headers = {}) => new Response(body, { status, headers: { 'content-length': body.length, ...headers } });
function setup(t, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-updater-test-'));
  const manager = new UpdateManager({ directory, version: '3.0.41', platform: 'win32', automaticChecks: false, fetchImpl: async input => input === RELEASE_API ? Response.json(release) : response(), ...overrides });
  t.after(() => { manager.stop(); fs.rmSync(directory, { recursive: true, force: true }); });
  return manager;
}
test('automatic updates default on, preference persists and disabled checks do no network work', async t => {
  let requests = 0; const manager = setup(t, { fetchImpl: async () => { requests++; throw new Error('unexpected request'); } });
  assert.equal(manager.snapshot().enabled, true); manager.setEnabled(false); await manager.check({ background: true }); assert.equal(requests, 0);
  const restored = new UpdateManager({ directory: manager.directory, version: manager.version, automaticChecks: false });
  assert.equal(restored.snapshot().enabled, false); restored.stop();
});
test('checks and downloads deduplicate; background download is verified and never installs immediately', async t => {
  let downloads = 0, installs = 0;
  const manager = setup(t, { canInstallSilently: () => ({ allowed: true }), launchInstaller: async () => { installs++; }, fetchImpl: async input => { await new Promise(resolve => setTimeout(resolve, 5)); if (input === RELEASE_API) return Response.json(release); downloads++; return response(); } });
  const first = manager.check({ background: true }); assert.equal(manager.check(), first); await first; await manager.downloading;
  assert.equal(downloads, 1); assert.equal(installs, 0); assert.equal(manager.snapshot().ready, true); assert.deepEqual(fs.readFileSync(manager.pending.filePath), bytes);
  await manager.check(); assert.equal(downloads, 1);
});
test('partial downloads survive a network failure and resume by Range', async t => {
  const manager = setup(t); const partial = path.join(manager.directory, 'packages/3.0.42', options.downloadName + '.part'); fs.mkdirSync(path.dirname(partial), { recursive: true });
  manager.fetchImpl = async () => response(new ReadableStream({ start(controller) { controller.enqueue(bytes.subarray(0, 7)); setTimeout(() => controller.error(new Error('network interrupted')), 30); } }));
  await assert.rejects(manager.download(options), /network interrupted/); assert.deepEqual(fs.readFileSync(partial), bytes.subarray(0, 7));
  manager.fetchImpl = async (_, input) => { assert.equal(input.headers.Range, 'bytes=7-'); return response(bytes.subarray(7), 206, { 'content-range': `bytes 7-${bytes.length - 1}/${bytes.length}` }); };
  await manager.download(options); assert.deepEqual(fs.readFileSync(manager.pending.filePath), bytes); assert.equal(fs.existsSync(partial), false);
});
test('servers ignoring Range restart the file; 416 resets the stale partial', async t => {
  for (const mode of ['ignore', '416']) {
    const manager = setup(t); const partial = path.join(manager.directory, 'packages/3.0.42', options.downloadName + '.part'); fs.mkdirSync(path.dirname(partial), { recursive: true }); fs.writeFileSync(partial, 'stale');
    let calls = 0; manager.fetchImpl = async () => { calls++; return mode === '416' && calls === 1 ? new Response(null, { status: 416 }) : response(); };
    await manager.download(options); assert.deepEqual(fs.readFileSync(manager.pending.filePath), bytes); assert.equal(calls, mode === '416' ? 2 : 1);
  }
});
test('disabling background download aborts it and preserves a resumable partial', async t => {
  const manager = setup(t); manager.fetchImpl = async (_, input) => response(new ReadableStream({ start(controller) { controller.enqueue(bytes.subarray(0, 5)); input.signal.addEventListener('abort', () => controller.error(new Error('paused'))); } }));
  const pause = new Promise(resolve => manager.on('state', state => { if (state.enabled && state.progress?.received === 5) { manager.setEnabled(false); resolve(); } }));
  const download = manager.download({ ...options, automatic: true }); await pause; await assert.rejects(download, /暂停/);
  const partial = path.join(manager.directory, 'packages/3.0.42', options.downloadName + '.part'); assert.equal(fs.statSync(partial).size, 5);
  manager.setEnabled(true); manager.fetchImpl = async () => response(bytes.subarray(5), 206, { 'content-range': `bytes 5-${bytes.length - 1}/${bytes.length}` }); await manager.download(options); assert.equal(manager.snapshot().ready, true);
});
test('unofficial URLs, wrong channels and missing or mismatched hashes are rejected', async t => {
  const manager = setup(t);
  await assert.rejects(manager.download({ ...options, downloadUrl: 'https://example.test/App-Setup.exe' }), /官方更新包/);
  await assert.rejects(manager.download({ ...options, downloadName: 'App-Portable.exe' }), /官方更新包/);
  await assert.rejects(manager.download({ ...options, downloadDigest: '' }), /SHA256/);
  await assert.rejects(manager.download({ ...options, downloadDigest: 'sha256:' + '0'.repeat(64) }), /校验失败/);
  assert.equal(manager.snapshot().ready, false); assert.equal(fs.existsSync(path.join(manager.directory, 'packages/3.0.42', options.downloadName + '.part')), false);
});
test('ready updates wait for safe exit/startup, persist and never repeat a failed automatic install loop', async t => {
  let saved = false, launched; const manager = setup(t, { canInstallSilently: () => ({ allowed: true }), prepareInstall: async ({ startup }) => startup || saved, launchInstaller: async value => { launched = value; } });
  await manager.download(options); assert.deepEqual(await manager.install({ automatic: true, restart: false }), { deferred: true }); assert.equal(launched, undefined);
  saved = true; const installed = await manager.install({ automatic: true, restart: false }); assert.equal(installed.quitting, true); assert.equal(launched.silent, true); assert.equal(launched.restart, false);
  const restored = new UpdateManager({ directory: manager.directory, version: manager.version, platform: 'win32', automaticChecks: false, canInstallSilently: () => ({ allowed: true }) });
  assert.equal(restored.snapshot().ready, true); assert.match(restored.snapshot().error, /上次自动安装/); assert.deepEqual(await restored.install({ automatic: true, startup: true }), { deferred: true }); restored.stop();
});
test('next startup installs a ready update; disabled updates do not install', async t => {
  let launched; const manager = setup(t, { canInstallSilently: () => ({ allowed: true }), launchInstaller: async value => { launched = value; } });
  await manager.download(options); manager.setEnabled(false); assert.deepEqual(await manager.install({ automatic: true, startup: true }), { deferred: true });
  manager.setEnabled(true); await manager.install({ automatic: true, startup: true }); assert.equal(launched.restart, true); assert.equal(launched.silent, true);
});
test('all-user installations download normally but require manual installation', async t => {
  let launched; const manager = setup(t, { launchInstaller: async value => { launched = value; } });
  await manager.download(options); assert.deepEqual(await manager.install({ automatic: true }), { deferred: true }); assert.equal(launched, undefined);
  await manager.install(); assert.equal(launched.silent, false);
});
test('macOS downloads the matching DMG and opens it without quitting or repeated auto installation', async t => {
  let launches = 0; const manager = setup(t, { platform: 'darwin', arch: 'arm64', launchInstaller: async () => { launches++; } });
  await manager.download({ ...options, downloadName: 'App-macOS-arm64.dmg', downloadUrl: url.replace('App-3.0.42-Setup.exe', 'App-macOS-arm64.dmg') });
  assert.deepEqual(await manager.install({ automatic: true }), { deferred: true }); assert.equal(launches, 0);
  assert.equal((await manager.install()).quitting, false); assert.equal(manager.snapshot().ready, true); assert.equal(manager.pending.attempted, false);
});
test('tampered ready files cannot install; installed-version receipts are removed', async t => {
  const manager = setup(t); await manager.download(options); fs.appendFileSync(manager.pending.filePath, 'tampered');
  await assert.rejects(manager.install(), /校验失败/); assert.equal(manager.snapshot().ready, false); await manager.download(options);
  const filename = manager.pending.filePath; const upgraded = new UpdateManager({ directory: manager.directory, version: '3.0.42', platform: 'win32', automaticChecks: false });
  assert.equal(upgraded.snapshot().ready, false); assert.equal(fs.existsSync(filename), false); upgraded.stop();
});
test('Windows portable update worker waits for parent exit, verifies and retains rollback bytes', { skip: process.platform !== 'win32' }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-update-worker-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const installer = path.join(directory, 'candidate.exe'), current = path.join(directory, 'current.exe'), log = path.join(directory, 'worker.log'); fs.writeFileSync(installer, bytes); fs.writeFileSync(current, 'old bytes');
  const worker = path.resolve(__dirname, '../electron/windows-update-worker.ps1');
  const parent = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 1600)'], { stdio: 'ignore', windowsHide: true }); parent.unref();
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', worker, '-ParentPid', String(parent.pid), '-InstallerPath', installer, '-CurrentExe', current, '-ExpectedSha256', digest.slice(7), '-LogFile', log, '-Portable', '-Silent'];
  const started = Date.now(); const result = spawnSync('powershell.exe', args, { encoding: 'utf8', windowsHide: true, timeout: 20000 }); assert.equal(result.status, 0, result.stderr + (fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '')); assert.ok(Date.now() - started >= 1400); assert.deepEqual(fs.readFileSync(current), bytes); assert.equal(fs.readFileSync(current + '.old', 'utf8'), 'old bytes');
  fs.writeFileSync(current, 'unchanged'); const failure = spawnSync('powershell.exe', args.map(value => value === digest.slice(7) ? '0'.repeat(64) : value === String(parent.pid) ? '2147483646' : value), { encoding: 'utf8', windowsHide: true, timeout: 20000 });
  assert.equal(failure.status, 1); assert.equal(fs.readFileSync(current, 'utf8'), 'unchanged'); assert.match(fs.readFileSync(log, 'utf8'), /SHA256 mismatch/);
});
