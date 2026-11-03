const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { registerUpdateController } = require('../electron/update-controller.cjs');
function setup(t, scope = 'CurrentUser') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-update-controller-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'resources')); fs.writeFileSync(path.join(root, 'resources/installation-context.json'), JSON.stringify({ scope }));
  const handlers = new Map(), ipcMain = new EventEmitter(); ipcMain.handle = (name, handler) => handlers.set(name, handler);
  const context = { busy: false, saveOK: true, launched: null, quitting: 0 };
  const webContents = { send(name, id) { if (name === 'app:prepare-update') setImmediate(() => ipcMain.emit('app:update-prepared', { sender: webContents }, { id, ok: context.saveOK })); } };
  const controller = registerUpdateController({ app: { getPath: name => name === 'exe' ? path.join(root, 'App.exe') : root, getVersion: () => '3.0.41', isPackaged: true }, ipcMain, net: { fetch: async () => new Response('test bytes') }, shell: { openPath: async () => '' }, spawn: (command, args, options) => { context.launched = { command, args, options }; const child = new EventEmitter(); child.unref = () => {}; setImmediate(() => child.emit('spawn')); return child; }, getMainWindows: () => [{ isDestroyed: () => false, webContents }], isBusy: () => context.busy, quitForUpdate: () => { context.quitting++; } });
  t.after(() => controller.stop());
  const bytes = Buffer.from('test bytes'), sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const download = () => controller.manager.download({ latest: '3.0.42', downloadUrl: 'https://github.com/xwz561/Nest-Asset-Library/releases/download/v3.0.42/App-Setup.exe', downloadName: 'App-Setup.exe', downloadDigest: 'sha256:' + sha256 });
  return { root, context, controller, handlers, webContents, download };
}
test('current-user marker matches NSIS and quiet installation waits for save acknowledgement', { skip: process.platform !== 'win32' }, async t => {
  const { root, context, controller, handlers, webContents, download } = setup(t);
  assert.equal(controller.manager.snapshot().silentInstall, true); await download(); context.busy = true;
  assert.deepEqual(await controller.installOnExit(), { deferred: true }); assert.equal(context.launched, null);
  context.busy = false; context.saveOK = false; await assert.rejects(controller.installOnExit(), /未保存/); assert.equal(context.launched, null);
  context.saveOK = true; await controller.installOnExit(); assert.ok(context.launched.args.includes('-Silent')); assert.equal(context.launched.args.includes('-Restart'), false); assert.equal(context.launched.options.windowsHide, true);
  const worker = fs.readFileSync(path.join(root, 'updates/windows-update-worker.ps1'), 'utf8'); assert.equal(worker.charCodeAt(0), 0xfeff);
  assert.deepEqual(await handlers.get('app:set-auto-update')({ sender: {} }, false), { error: '窗口不可用' });
  assert.equal((await handlers.get('app:set-auto-update')({ sender: webContents }, false)).enabled, false);
});
test('all-user marker prohibits quiet installation; startup launch releases the application', { skip: process.platform !== 'win32' }, async t => {
  const all = setup(t, 'all'); await all.download(); assert.equal(all.controller.manager.snapshot().silentInstall, false); assert.deepEqual(await all.controller.installAtStartup(), { deferred: true }); assert.equal(all.context.quitting, 0);
  const current = setup(t); await current.download(); await current.controller.installAtStartup(); assert.equal(current.context.quitting, 1); assert.ok(current.context.launched.args.includes('-Restart'));
});
