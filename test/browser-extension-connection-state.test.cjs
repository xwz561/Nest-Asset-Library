const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const extensionRoot = path.join(root, 'browser-extension');
const ConnectionState = require(path.join(extensionRoot, 'connection-state.js'));

test('connection classifier distinguishes bridge offline, a branded pairing rejection, and connected', () => {
  assert.equal(ConnectionState.classifyConnection({ error: { code: 'ECONNREFUSED' } }).state, 'offline');
  assert.equal(ConnectionState.classifyConnection({ status: 500, error: { code: 'ECONNREFUSED' } }).state, 'offline');
  assert.equal(ConnectionState.classifyConnection({ status: 400, body: '请先启动小旺仔素材库并打开资源库' }).state, 'offline');
  assert.equal(ConnectionState.classifyConnection({ status: 403, body: '浏览器采集扩展未配对，请在小旺仔素材库中重新准备扩展' }).state, 'unpaired');
  assert.equal(ConnectionState.classifyConnection({ status: 403, body: 'Forbidden' }).state, 'offline');
  assert.equal(ConnectionState.classifyConnection({ status: 500, body: 'Unrelated process on this port' }).state, 'offline');
  assert.equal(ConnectionState.classifyConnection({ status: 200, body: { ok: true, ready: true } }).state, 'connected');
});

test('offline retry grows from 15 seconds to a 2 minute cap and clears on recovery', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(ConnectionState.retryDelayForFailure), [15000, 30000, 60000, 120000, 120000]);
  assert.equal(ConnectionState.retryDelayForFailure(0), 0);
});

test('notifications are silent offline, transition based, and deduplicated for ten minutes', () => {
  const now = 1_000_000;
  assert.equal(ConnectionState.shouldNotify({ kind: 'connection', nextState: 'offline', now }), false);
  assert.equal(ConnectionState.shouldNotify({ kind: 'connection', previousState: 'connected', nextState: 'unpaired', now }), true);
  assert.equal(ConnectionState.shouldNotify({ kind: 'connection', previousState: 'unpaired', nextState: 'unpaired', now }), false);
  assert.equal(ConnectionState.shouldNotify({ kind: 'connection', previousState: 'offline', nextState: 'unpaired', lastNotifiedAt: now - 599999, now }), false);
  assert.equal(ConnectionState.shouldNotify({ kind: 'connection', previousState: 'offline', nextState: 'unpaired', lastNotifiedAt: now - 600000, now }), true);
  assert.equal(ConnectionState.shouldNotify({ kind: 'upload-failure', nextState: 'connected', now }), true);
  assert.equal(ConnectionState.shouldNotify({ kind: 'upload-failure', nextState: 'offline', now }), false);
  assert.equal(ConnectionState.shouldNotify({ kind: 'upload-failure', nextState: 'connected', lastNotifiedAt: now - 599999, now }), false);
  assert.equal(ConnectionState.notificationKey('upload-failure', 'AI Flow 引用上传失败'), ConnectionState.notificationKey('upload-failure', 'AI Flow 引用上传失败'));
  assert.equal(ConnectionState.notificationKey('connection', 'unpaired'), 'connection:unpaired');
});

test('the same connection classifier is loaded by the worker, popup, and AI Flow page', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'));
  const worker = fs.readFileSync(path.join(extensionRoot, 'service-worker.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
  const page = fs.readFileSync(path.join(extensionRoot, 'aiflow-page.js'), 'utf8');
  const releaseNotes = fs.readFileSync(path.join(root, 'src', 'lib', 'app-config.js'), 'utf8');
  const popup = fs.readFileSync(path.join(extensionRoot, 'popup.html'), 'utf8');
  const aiFlowScripts = manifest.content_scripts.flatMap(entry => entry.js);
  assert.match(worker, /importScripts\([^)]*connection-state\.js/);
  assert.match(popup, /connection-state\.js/);
  assert.ok(aiFlowScripts.indexOf('connection-state.js') >= 0);
  assert.ok(aiFlowScripts.indexOf('connection-state.js') < aiFlowScripts.indexOf('aiflow-page.js'));
  assert.ok(manifest.permissions.includes('storage'));
  assert.match(worker, /chrome\.storage\?\.session/);
  assert.match(worker, /shouldNotify/);
  assert.match(page, /retryDelayForFailure/);
  assert.match(page, /const BRIDGE_RECOVERY_PROBE_MS = 30 \* 1000/);
  assert.match(page, /aiflow-bridge-recovery-probe/);
  assert.match(page, /bridgeFailureCount = 0;\s*bridgeRetryAfter = 0;/);
  assert.match(worker, /AIFLOW_BRIDGE_RECOVERY_PROBE_ACTION/);
  assert.match(worker, /readBridgeConnectionState\(\)\.then/);
  assert.match(worker, /classifyConnection/);
  assert.match(main, /\/extension-status/);
  assert.match(main, /readCollectorExtensionStatus/);
  assert.match(releaseNotes, /网页采集器升级到 1\.16\.3/);
  assert.match(releaseNotes, /素材库没打开时不再反复弹通知/);
});

test('popup has distinct offline and unpaired guidance and hides recent exceptions while offline', () => {
  const html = fs.readFileSync(path.join(extensionRoot, 'popup.html'), 'utf8');
  const script = fs.readFileSync(path.join(extensionRoot, 'popup.js'), 'utf8');
  const stateSource = fs.readFileSync(path.join(extensionRoot, 'connection-state.js'), 'utf8');
  assert.match(stateSource, /小旺仔素材库没有打开/);
  assert.match(stateSource, /需要重新配对/);
  assert.match(html, /打开素材库后会自动连上/);
  assert.match(html, /重新检测/);
  assert.match(html, /扩展.*面板点安装.*浏览器扩展页点重新加载/);
  assert.match(script, /classifyConnection/);
  assert.match(script, /offline/);
  assert.match(script, /unpaired/);
  assert.match(script, /hidden/);
  assert.doesNotMatch(script, /无法读取状态/);
});

test('offline bridge recovery has a separate 30-second health probe, without changing upload backoff', () => {
  const page = fs.readFileSync(path.join(extensionRoot, 'aiflow-page.js'), 'utf8');
  const worker = fs.readFileSync(path.join(extensionRoot, 'service-worker.js'), 'utf8');
  assert.match(page, /if \(Date\.now\(\) < bridgeRetryAfter\) return/);
  assert.match(page, /scheduleBridgeRecoveryProbe\(\)/);
  assert.match(page, /BRIDGE_RECOVERY_PROBE_MS/);
  assert.match(page, /if \(connection\.state === 'connected'\)[\s\S]{0,240}requestLiveSync\(\)/);
  assert.match(worker, /readBridgeConnectionState\(\)[\s\S]{0,140}observeConnectionState\(connection\)/);
});
