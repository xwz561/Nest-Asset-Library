const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const workerSource = fs.readFileSync(path.join(__dirname, '..', 'browser-extension', 'service-worker.js'), 'utf8');

function response({ status = 200, text = '' } = {}) {
  return { status, ok: status >= 200 && status < 300, text: async () => text };
}

function createHarness({ deletes = [{ remoteAssetId: '22784' }], deleteResponseFor = () => response() } = {}) {
  const calls = [];
  const notifications = [];
  const reloads = [];
  const listener = handler => ({ addListener: handler });
  const chrome = {
    contextMenus: { create() {}, removeAll(callback) { callback?.(); }, onClicked: listener(() => {}) },
    notifications: { create(payload) { notifications.push(payload); } },
    runtime: { lastError: null, onInstalled: listener(() => {}), onStartup: listener(() => {}), onMessage: listener(() => {}) },
    scripting: { executeScript: async () => [] },
    tabs: { query: async () => [], sendMessage: async () => ({}), reload: async tabId => { reloads.push(tabId); } },
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
      calls.push({ url, method: init.method || 'GET', body: init.body || '' });
      if (url === 'http://127.0.0.1:32145/aiflow-live-plan') {
        return response({ text: JSON.stringify({ wakeSequence: 1, deletes, assets: [], roots: [] }) });
      }
      const deleteMatch = url.match(/^http:\/\/flow\.test\/auth\/assets\/(\d+)$/);
      if (deleteMatch) return deleteResponseFor(deleteMatch[1]);
      if (url === 'http://127.0.0.1:32145/aiflow-live-delete-complete') return response({ text: JSON.stringify({ ok: true, removed: 1 }) });
      if (url === 'http://127.0.0.1:32145/aiflow-live-delete-failed') return response({ text: JSON.stringify({ ok: true, updated: 1 }) });
      throw new Error(`Unexpected fetch: ${url}`);
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(workerSource, sandbox, { filename: 'service-worker.js' });
  return {
    calls,
    notifications,
    reloads,
    runLiveSync(tabId = -1) {
      return vm.runInContext(`runAIFlowLiveSync({ pageUrl: 'http://flow.test/project/7', projectId: '7' }, { tabId: ${Number(tabId)} })`, sandbox);
    },
    deletePlan() {
      return vm.runInContext("deleteAIFlowPlan({ origin: 'http://flow.test' }, [{ remoteAssetId: '22784' }])", sandbox);
    },
    notifyDeleteFailureTwice() {
      vm.runInContext("notifyLiveDeleteFailure(['服务器删除暂时失败']); notifyLiveDeleteFailure(['服务器删除暂时失败'])", sandbox);
    },
  };
}

test('a 404 missing AI Flow asset is an idempotent delete completion, not a retry', async () => {
  const harness = createHarness({
    deleteResponseFor: () => response({ status: 404, text: JSON.stringify({ success: false, error: '资产不存在' }) }),
  });
  const result = await harness.runLiveSync();
  assert.deepEqual(JSON.parse(JSON.stringify(result.deleteErrors)), []);
  const complete = harness.calls.find(call => call.url.endsWith('/aiflow-live-delete-complete'));
  assert.ok(complete);
  assert.deepEqual(JSON.parse(complete.body).remoteAssetIds, ['22784']);
  assert.equal(harness.calls.filter(call => call.url.endsWith('/aiflow-live-delete-failed')).length, 0);
  assert.equal(harness.calls.filter(call => call.method === 'DELETE').length, 1);
});

test('a completed live sync keeps the active AI Flow page and its in-progress work intact', async () => {
  const harness = createHarness();
  await harness.runLiveSync(31);
  assert.ok(harness.calls.some(call => call.url.endsWith('/aiflow-live-delete-complete')));
  assert.deepEqual(harness.reloads, []);
});

test('AI Flow business response “资产不存在” is also acknowledged when returned with HTTP 200', async () => {
  const harness = createHarness({
    deleteResponseFor: () => response({ status: 200, text: JSON.stringify({ success: false, error: '资产不存在' }) }),
  });
  const result = await harness.deletePlan();
  assert.equal(result.deleted, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.errors)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(result.deletedRemoteAssetIds)), ['22784']);
});

test('only genuinely failed deletions stay queued and repeated failure alerts are deduplicated', async () => {
  const harness = createHarness({
    deletes: [{ remoteAssetId: '22784' }, { remoteAssetId: '22785' }],
    deleteResponseFor: remoteAssetId => remoteAssetId === '22784'
      ? response({ status: 404, text: JSON.stringify({ error: '资产不存在' }) })
      : response({ status: 500, text: JSON.stringify({ error: '服务繁忙' }) }),
  });
  const result = await harness.runLiveSync();
  assert.deepEqual(JSON.parse(JSON.stringify(result.deleteErrors)), ['服务器素材 22785: 服务繁忙']);
  const complete = harness.calls.find(call => call.url.endsWith('/aiflow-live-delete-complete'));
  const failed = harness.calls.find(call => call.url.endsWith('/aiflow-live-delete-failed'));
  assert.deepEqual(JSON.parse(complete.body).remoteAssetIds, ['22784']);
  assert.deepEqual(JSON.parse(failed.body).failures, [{ remoteAssetId: '22785', error: '服务繁忙' }]);
  harness.notifyDeleteFailureTwice();
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.notifications[0].title, 'AI Flow 实时删除失败');
});
