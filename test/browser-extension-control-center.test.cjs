const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const workerSource = fs.readFileSync(path.join(__dirname, '..', 'browser-extension', 'service-worker.js'), 'utf8');

function response({ ok = true, status = ok ? 200 : 500, text = '', blob = null } = {}) {
  return {
    ok,
    status,
    text: async () => text,
    json: async () => JSON.parse(text || '{}'),
    blob: async () => blob || new Blob([text]),
  };
}

function activeContext(overrides = {}) {
  return {
    ok: true,
    workspace: true,
    pageUrl: 'http://flow.test/project/7',
    projectId: '7',
    projectName: '第1集',
    folderId: '42',
    folderName: 'EP01',
    sharedLibrary: false,
    ...overrides,
  };
}

function createHarness({
  tab = { id: 12, url: 'http://flow.test/project/7' },
  context = activeContext(),
  status = { ok: true, queue: { uploads: 2, deletes: 1, failedUploads: 1, failedDeletes: 0, oldestQueuedAt: 123, lastError: '网络暂时断开' } },
  syncResult = { ok: true },
  referenceError = '请先启动小旺仔素材库并打开资源库',
  cancelResult = { ok: true, removed: 1, message: '已取消尚未开始的上传任务' },
} = {}) {
  const calls = [];
  const reloads = [];
  const sent = [];
  const notifications = [];
  let messageListener = null;
  const listener = handler => ({ addListener: handler });
  const chrome = {
    contextMenus: { create() {}, removeAll(callback) { callback?.(); }, onClicked: listener(() => {}) },
    notifications: { create(payload) { notifications.push(payload); } },
    runtime: { lastError: null, onInstalled: listener(() => {}), onStartup: listener(() => {}), onMessage: { addListener(handler) { messageListener = handler; } } },
    scripting: { executeScript: async () => [] },
    tabs: {
      query: async () => tab ? [tab] : [],
      sendMessage: async (tabId, message) => {
        sent.push({ tabId, message });
        if (message.action === 'aiflow-control-context') return context;
        if (message.action === 'aiflow-live-sync-now') return syncResult;
        throw new Error(`Unexpected tab message: ${message.action}`);
      },
      reload: async tabId => { reloads.push(tabId); },
    },
  };
  const sandbox = {
    URL,
    Blob,
    Headers,
    FormData,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    chrome,
    importScripts() {},
    fetch: async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method || 'GET', body: init.body || '' });
      if(String(url).endsWith('/aiflow-reference-upload-plan')) return response({ok:false,status:400,text:JSON.stringify({error:referenceError})});
       if (String(url) === 'http://127.0.0.1:32145/aiflow-live-status') return response({ text: JSON.stringify(status) });
        if (String(url) === 'http://127.0.0.1:32145/aiflow-live-upload-cancel') return response({ text: JSON.stringify(cancelResult) });
      throw new Error(`Unexpected fetch: ${url}`);
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(workerSource, sandbox, { filename: 'service-worker.js' });
  return {
    calls,
    reloads,
    sent,
    notifications,
    dispatch(message) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('worker response timeout')), 2000);
        const returned = messageListener(message, {}, result => { clearTimeout(timer); resolve(result); });
        if (returned !== true) {
          clearTimeout(timer);
          reject(new Error('worker did not keep the message channel open'));
        }
      });
    },
  };
}

test('control-center status reads only the paired local status endpoint and returns a safe summary', async () => {
  const harness = createHarness();
  const result = await harness.dispatch({ action: 'aiflow-control:get-status' });
  assert.equal(result.ok, true);
  assert.equal(result.status.connection.state, 'connected');
  assert.equal(result.status.project.id, '7');
  assert.equal(result.status.folder.name, 'EP01');
  assert.deepEqual(JSON.parse(JSON.stringify(result.status.queue)), { uploads: 2, deletes: 1, moves: 0, references: 0, failed: 1, running: false, active: 0, oldestQueuedAt: 123, nextRetryAt: 0, items: [] });
  assert.equal(result.status.error.message, '网络暂时断开');
  assert.deepEqual(harness.calls.map(call => call.url), ['http://127.0.0.1:32145/aiflow-live-status']);
  assert.equal(harness.reloads.length, 0);
  assert.equal(harness.notifications.length, 0);
  assert.equal(harness.sent[0].message.action, 'aiflow-control-context');
});

test('control-center rejects a shared or invalid current page without bridge or server requests', async () => {
  const harness = createHarness({ context: activeContext({ ok: false, sharedLibrary: true, error: '公共资产包不支持实时同步，请打开“我的素材”中的文件夹' }) });
  const result = await harness.dispatch({ action: 'aiflow-control:get-status' });
  assert.equal(result.ok, false);
  assert.match(result.error, /公共资产包/);
  assert.equal(harness.calls.length, 0);
  assert.equal(harness.reloads.length, 0);
  assert.equal(harness.notifications.length, 0);
});

test('control-center retry with an empty queue does not create a live plan or trigger a server write', async () => {
  const harness = createHarness({ status: { ok: true, queue: { uploads: 0, deletes: 0, failedUploads: 0, failedDeletes: 0 } } });
  const result = await harness.dispatch({ action: 'aiflow-control:retry' });
  assert.equal(result.ok, false);
  assert.match(result.error, /没有待重试/);
  assert.deepEqual(harness.calls.map(call => call.url), ['http://127.0.0.1:32145/aiflow-live-status']);
  assert.equal(harness.sent.filter(item => item.message.action === 'aiflow-live-sync-now').length, 0);
  assert.equal(harness.reloads.length, 0);
});

test('control-center retry delegates only to the verified current AI Flow tab', async () => {
  const harness = createHarness({ syncResult: { ok: true, skipped: true } });
  const result = await harness.dispatch({ action: 'aiflow-control:retry' });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.equal(harness.sent.at(-1).tabId, 12);
  assert.equal(harness.sent.at(-1).message.action, 'aiflow-live-sync-now');
  assert.equal(harness.sent.at(-1).message.forceRetry, true);
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.reloads.length, 0);
});

test('control-center refresh reloads only the verified current AI Flow tab without a bridge request', async () => {
  const harness = createHarness();
  const result = await harness.dispatch({ action: 'aiflow-control:refresh' });
  assert.equal(result.ok, true);
  assert.deepEqual(harness.reloads, [12]);
  assert.equal(harness.calls.length, 0);
  assert.equal(harness.sent.length, 1);
  assert.equal(harness.sent[0].message.action, 'aiflow-control-context');
});

test('control-center cancels only a validated queued upload and refreshes its safe status', async () => {
  const queuedStatus = {
    ok: true,
    queue: {
      uploads: 1,
      deletes: 0,
      failedUploads: 0,
      failedDeletes: 0,
      items: [{ assetId: 'asset-local', name: '本地图片', kind: 'image', size: 1234, state: 'queued' }],
    },
  };
  const harness = createHarness({ status: queuedStatus });
  const result = await harness.dispatch({ action: 'aiflow-control:cancel-upload', assetId: 'asset-local' });
  assert.equal(result.ok, true);
  assert.match(result.message, /已取消/);
  assert.equal(result.status.queue.items[0].assetId, 'asset-local');
  const cancelCall = harness.calls.find(call => call.url === 'http://127.0.0.1:32145/aiflow-live-upload-cancel');
  assert.equal(cancelCall.method, 'POST');
  assert.match(String(cancelCall.body), /asset-local/);
  assert.equal(harness.sent.filter(item => item.message.action === 'aiflow-control-context').length, 1);
});

test('live transfer uses two bounded workers, reports real stages, and preserves each asset id for bridge reads', async () => {
  let api;
  let inFlight = 0;
  let maxInFlight = 0;
  let omitRemoteId = false;
  const readRequests = [];
  const stageSnapshots = [];
  const assets = [
    { id: 'asset-small', name: 'small.png', size: 1024, projectId: '7', targetFolderId: '42' },
    { id: 'asset-medium', name: 'medium.png', size: 2048, projectId: '7', targetFolderId: '42' },
    { id: 'asset-large', name: 'large.png', size: 4096, projectId: '7', targetFolderId: '42' },
  ];
  const chrome = {
    contextMenus: { create() {}, removeAll(callback) { callback?.(); }, onClicked: { addListener() {} } },
    notifications: { create() {} },
    runtime: { lastError: null, onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener() {} } },
    scripting: { executeScript: async () => [] },
    tabs: { query: async () => [], sendMessage: async () => ({}), reload() {} },
  };
  const sandbox = {
    URL,
    Blob,
    Headers,
    FormData,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    chrome,
    importScripts() {},
    fetch: async (url, init = {}) => {
      const endpoint = String(url);
      if (endpoint === 'http://127.0.0.1:32145/aiflow-live-upload-data') {
        const payload = JSON.parse(String(init.body));
        readRequests.push(payload);
        return response({ blob: new Blob([payload.assetId]) });
      }
      if (endpoint.startsWith('http://flow.test/auth/upload-asset?')) {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        const snapshot = api.normalizeAIFlowControlStatus(activeContext(), {
          queue: { items: assets.map(asset => ({ assetId: asset.id, name: asset.name, kind: 'image', state: 'queued' })) },
        });
        stageSnapshots.push(snapshot.queue.items.map(item => item.state));
        await new Promise(resolve => setTimeout(resolve, 15));
        inFlight -= 1;
        return response({ text: JSON.stringify(omitRemoteId ? { success: true, asset: {} } : { success: true, asset: { id: String(100 + readRequests.length) } }) });
      }
      throw new Error(`Unexpected fetch: ${endpoint}`);
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(`${workerSource}\nglobalThis.__m3Test = { uploadAIFlowPlan, normalizeAIFlowControlStatus, setLiveUploadState, clearLiveUploadState, liveWakeRetryDelay };`, sandbox, { filename: 'service-worker.js' });
  api = sandbox.__m3Test;

  const result = await api.uploadAIFlowPlan(new URL('http://flow.test/project/7'), { uploadId: 'batch-1', assets }, {
    projectId: '7',
    folderId: '42',
    dataEndpoint: '/aiflow-live-upload-data',
    dataPayload: { pageUrl: 'http://flow.test/project/7', assetId: 'spoofed-id' },
    concurrency: 2,
    trackLiveTransfer: true,
  });

  assert.equal(result.uploaded, 3);
  assert.equal(result.errors.length, 0);
  assert.equal(maxInFlight, 2);
  assert.deepEqual(readRequests.map(item => item.assetId), ['asset-small', 'asset-medium', 'asset-large']);
  assert.ok(stageSnapshots.some(states => states.includes('uploading')));
  const after = api.normalizeAIFlowControlStatus(activeContext(), {
    queue: { items: assets.map(asset => ({ assetId: asset.id, name: asset.name, kind: 'image', state: 'queued' })) },
  });
  assert.equal(after.queue.active, 0);
  assert.ok(after.queue.items.every(item => item.state === 'queued'));

  omitRemoteId = true;
  const unlinked = await api.uploadAIFlowPlan(new URL('http://flow.test/project/7'), {
    uploadId: 'batch-missing-id',
    assets: [assets[0]],
  }, {
    projectId: '7',
    folderId: '42',
    dataEndpoint: '/aiflow-live-upload-data',
    dataPayload: { pageUrl: 'http://flow.test/project/7' },
    trackLiveTransfer: true,
  });
  assert.equal(unlinked.uploaded, 0);
  assert.equal(unlinked.failures.length, 1);
  assert.match(unlinked.errors[0], /未返回可关联素材 ID/);
  omitRemoteId = false;

  api.setLiveUploadState({ id: 'asset-active', name: '正在传输的大素材', kind: 'video', size: 9_999_999 }, 'uploading', {
    serverOrigin: 'http://flow.test/project/7', projectId: '7',
  });
  const crowded = api.normalizeAIFlowControlStatus(activeContext(), {
    queue: {
      items: Array.from({ length: 8 }, (_, index) => ({
        assetId: `asset-queued-${index}`,
        name: `排队素材 ${index}`,
        kind: 'image',
        size: index + 1,
        queuedAt: index + 1,
        state: 'queued',
      })),
    },
  });
  assert.equal(crowded.queue.active, 1);
  assert.equal(crowded.queue.items[0].assetId, 'asset-active');
  assert.equal(crowded.queue.items[0].state, 'uploading');
  api.clearLiveUploadState('asset-active');

  const now = 1_000_000;
  assert.equal(api.liveWakeRetryDelay({ pending: true, nextRetryAt: now + 2_000 }, { nextRetryAt: now + 6_000 }, now), 6_000);
  assert.equal(api.liveWakeRetryDelay({ pending: true }, null, now), 3_000);
});

 test('deleted library pauses reference polling without notification spam', async()=>{
 const harness=createHarness();
 for(let i=0;i<5;i++){
 const result=await harness.dispatch({action:'aiflow-reference-upload-tick',pageUrl:'http://flow.test/project/7',projectId:'7',folderId:'42'});
 assert.equal(result.offline,true);
 }
 assert.equal(harness.notifications.length,0);
 });
 test('actual reference errors remain visible',async()=>{
 const harness=createHarness({referenceError:'素材文件损坏'});
 const result=await harness.dispatch({action:'aiflow-reference-upload-tick',pageUrl:'http://flow.test/project/7',projectId:'7',folderId:'42'});
 assert.equal(result.ok,false);
 assert.equal(harness.notifications.length,1);
 });
