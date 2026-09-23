const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const workerSource = fs.readFileSync(path.join(__dirname, '..', 'browser-extension', 'service-worker.js'), 'utf8');

function response({ status = 200, text = '' } = {}) {
  return { status, ok: status >= 200 && status < 300, text: async () => text };
}

function createHarness({ moveResponse = () => response() } = {}) {
  const calls = [];
  const notifications = [];
  const listener = handler => ({ addListener: handler });
  const chrome = {
    contextMenus: { create() {}, removeAll(callback) { callback?.(); }, onClicked: listener(() => {}) },
    notifications: { create(payload) { notifications.push(payload); } },
    runtime: { lastError: null, onInstalled: listener(() => {}), onStartup: listener(() => {}), onMessage: listener(() => {}) },
    scripting: { executeScript: async () => [] },
    tabs: { query: async () => [], sendMessage: async () => ({}), reload: async () => {} },
  };
  const sandbox = {
    URL,
    Blob,
    Headers,
    FormData,
    chrome,
    importScripts() {},
    setTimeout() { return 0; },
    clearTimeout() {},
    setInterval() { return 0; },
    clearInterval() {},
    fetch: async (rawUrl, init = {}) => {
      const url = String(rawUrl);
      calls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body || '' });
      const moveMatch = url.match(/^http:\/\/flow\.test\/auth\/assets\/(\d+)\/folder$/);
      if (moveMatch) return moveResponse(moveMatch[1]);
      throw new Error(`Unexpected fetch: ${url}`);
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(`${workerSource}\nglobalThis.__moveTest = { moveAIFlowPlan, notifyLiveMoveFailure };`, sandbox, { filename: 'service-worker.js' });
  return { calls, notifications, api: sandbox.__moveTest };
}

const move = { assetId: 'local-asset', remoteAssetId: '22784', localFolderId: 'local-ep02', remoteFolderId: '42' };

test('linked material move uses AI Flow native folder API without uploading a second copy', async () => {
  const harness = createHarness();
  const result = await harness.api.moveAIFlowPlan({ origin: 'http://flow.test' }, [move]);
  assert.equal(result.moved, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.errors)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(result.movedMoves)), [move]);
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].url, 'http://flow.test/auth/assets/22784/folder');
  assert.equal(harness.calls[0].method, 'PUT');
  assert.deepEqual(JSON.parse(harness.calls[0].body), { folderId: 42 });
});

test('failed linked material moves remain reportable and repeat alerts are deduplicated', async () => {
  const harness = createHarness({ moveResponse: () => response({ status: 422, text: JSON.stringify({ error: '目标文件夹不可用' }) }) });
  const result = await harness.api.moveAIFlowPlan({ origin: 'http://flow.test' }, [move]);
  assert.equal(result.moved, 0);
  assert.match(result.errors[0], /目标文件夹不可用/);
  assert.deepEqual(JSON.parse(JSON.stringify(result.failures)), [{ ...move, error: '目标文件夹不可用' }]);
  harness.api.notifyLiveMoveFailure(result.errors);
  harness.api.notifyLiveMoveFailure(result.errors);
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.notifications[0].title, 'AI Flow 素材移动失败');
});
