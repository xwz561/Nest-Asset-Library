const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const workerSource = fs.readFileSync(path.join(__dirname, '..', 'browser-extension', 'service-worker.js'), 'utf8');

function response({ ok = true, json = {}, text = '', blob = null, headers = {} } = {}) {
  return {
    ok,
    json: async () => json,
    text: async () => text,
    blob: async () => blob || new Blob(['asset'], { type: 'image/png' }),
    headers: new Headers(headers),
  };
}

function createHarness({
  items,
  folders = [],
  folderTarget = () => response({ text: JSON.stringify({ rootFolderId: 'root-7', targetFolderId: 'local-42', targetFolderName: '本地测试' }) }),
  folderStructure = () => response({ text: JSON.stringify({ created: 1, reused: 0, skipped: 0, total: 1, folderName: '接收目录', targetFolderId: 'root-7' }) }),
  bridge = () => response({ text: JSON.stringify({ imported: 1, duplicates: 0, folderName: '本地测试' }) }),
  diffPreview = () => response({ text: JSON.stringify({ ok: true, folder: { name: '本地测试' }, summary: { linked: 0, localNew: 0, possibleDuplicates: 0, remoteOnly: 0, mappingIssues: 0 } }) }),
  pageContext = { workspace: true, ok: true, sharedLibrary: false, pageUrl: 'http://flow.test/project/7', projectId: '7', folderId: '42', folderName: 'EP01' },
}) {
  const calls = [];
  const notifications = [];
  let messageListener = null;
  const listener = handler => ({ addListener: handler });
  const chrome = {
    contextMenus: { create() {}, removeAll(callback) { callback?.(); }, onClicked: listener(() => {}) },
    notifications: { create(payload) { notifications.push(payload); } },
    runtime: {
      lastError: null,
      onInstalled: listener(() => {}),
      onStartup: listener(() => {}),
      onMessage: { addListener(handler) { messageListener = handler; } },
    },
    scripting: { executeScript: async () => [] },
    tabs: {
      reload: async () => {},
      sendMessage: async (_tabId, message) => message?.action === 'aiflow-control-context' ? pageContext : {},
    },
  };
  const context = {
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
    fetch: async (rawUrl, init = {}) => {
      const url = String(rawUrl);
      calls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
      if (url.startsWith('http://flow.test/auth/assets')) return response({ json: { items, folders } });
      if (url.startsWith('http://flow.test/media/')) return response({ blob: new Blob(['asset'], { type: 'image/png' }), headers: { 'content-type': 'image/png' } });
      if (url === 'http://127.0.0.1:32145/aiflow-folder-target') return folderTarget();
      if (url === 'http://127.0.0.1:32145/aiflow-folder-structure') return folderStructure();
      if (url === 'http://127.0.0.1:32145/aiflow-folder-diff-preview') return diffPreview();
      if (url === 'http://127.0.0.1:32145/aiflow-asset-data') return bridge();
      throw new Error(`Unexpected fetch: ${url}`);
    },
  };
  vm.createContext(context);
  vm.runInContext(workerSource, context, { filename: 'service-worker.js' });
  return {
    calls,
    notifications,
    async dispatch(message, sender = { tab: { id: 73 } }) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('worker response timeout')), 2000);
        const returned = messageListener(message, sender, result => {
          clearTimeout(timeout);
          resolve(result);
        });
        if (returned !== true) {
          clearTimeout(timeout);
          reject(new Error('worker did not keep the message channel open'));
        }
      });
    },
  };
}

function currentFolderMessage(overrides = {}) {
  return {
    action: 'sync-aiflow-folder',
    pageUrl: 'http://flow.test/project/7',
    projectId: '7',
    folderId: '42',
    folderName: 'EP01',
    sharedLibrary: false,
    ...overrides,
  };
}

function currentFolderDiffMessage(overrides = {}) {
  return {
    ...currentFolderMessage(),
    action: 'preview-aiflow-folder-diff',
    ...overrides,
  };
}

test('current-folder worker sync imports only direct private media', async () => {
  const harness = createHarness({
    folders: [{ id: 44, shared: true }],
    items: [
      { id: 1, folderId: '42', type: 'image', name: 'direct.png', url: '/media/direct.png' },
      { id: 2, folderId: '42', type: 'audio', name: 'direct.mp3', url: '/media/direct.mp3' },
      { id: 3, folderId: '43', type: 'video', name: 'child.mp4', url: '/media/child.mp4' },
      { id: 4, folderId: '42', type: 'image', shared: true, name: 'shared-item.png', url: '/media/shared-item.png' },
      { id: 5, folderId: '44', type: 'image', name: 'shared-folder.png', url: '/media/shared-folder.png' },
      { id: 6, folderId: '42', type: 'document', name: 'skip.txt', url: '/media/skip.txt' },
    ],
  });
  const result = await harness.dispatch(currentFolderMessage());
  const writes = harness.calls.filter(call => call.url.endsWith('/aiflow-asset-data'));
  assert.equal(result.ok, true);
  assert.equal(result.total, 2);
  assert.equal(result.imported, 2);
  assert.equal(writes.length, 2);
  assert.deepEqual(writes.map(call => String(call.headers['x-nest-aiflow-folder-id'])).sort(), ['42', '42']);
  assert.deepEqual(writes.map(call => String(call.headers['x-nest-aiflow-root-folder-id'])).sort(), ['root-7', 'root-7']);
});

test('library structure sync excludes AI Flow root materials and unknown folder records', async () => {
  const harness = createHarness({
    folders: [
      { id: 42, name: 'ep01' },
      { id: 44, name: '公共包', shared: true },
    ],
    items: [
      { id: 1, folderId: '42', type: 'image', name: 'folder-item.png', url: '/media/folder-item.png' },
      { id: 2, folderId: null, type: 'image', name: 'root-item.png', url: '/media/root-item.png' },
      { id: 3, type: 'video', name: 'missing-folder.mp4', url: '/media/missing-folder.mp4' },
      { id: 4, folderId: '999', type: 'audio', name: 'stale-folder.mp3', url: '/media/stale-folder.mp3' },
      { id: 5, folderId: '44', type: 'image', name: 'shared-folder.png', url: '/media/shared-folder.png' },
    ],
  });
  const result = await harness.dispatch({
    action: 'sync-aiflow-folder-structure',
    pageUrl: 'http://flow.test/project/7',
    projectId: '7',
  });
  const writes = harness.calls.filter(call => call.url.endsWith('/aiflow-asset-data'));
  const reads = harness.calls.filter(call => call.url.includes('/media/'));
  assert.equal(result.ok, true);
  assert.equal(result.total, 1);
  assert.equal(result.imported, 1);
  assert.equal(writes.length, 1);
  assert.equal(reads.length, 1);
  assert.equal(String(writes[0].headers['x-nest-aiflow-folder-id']), '42');
});

test('current-folder worker sync treats an empty private directory as successful without local writes', async () => {
  const harness = createHarness({
    items: [{ id: 1, folderId: '42', type: 'image', name: 'direct.png', url: '/media/direct.png' }],
    pageContext: { workspace: true, ok: true, sharedLibrary: false, pageUrl: 'http://flow.test/project/7', projectId: '7', folderId: '99', folderName: '空目录' },
  });
  const result = await harness.dispatch(currentFolderMessage({ folderId: '99', folderName: '空目录' }));
  assert.equal(result.ok, true);
  assert.equal(result.empty, true);
  assert.equal(result.total, 0);
  assert.equal(harness.calls.filter(call => call.url.endsWith('/aiflow-asset-data')).length, 0);
  assert.equal(harness.calls.filter(call => call.url.endsWith('/aiflow-folder-target')).length, 1);
});

test('current-folder worker sync rejects shared views and never reports all failures as success', async () => {
  const sharedHarness = createHarness({ folders: [{ id: 42, shared: true }], items: [] });
  const shared = await sharedHarness.dispatch(currentFolderMessage({ folderId: '42', sharedLibrary: true }));
  assert.equal(shared.ok, false);
  assert.match(shared.error, /公共资产包/);

  const failingHarness = createHarness({
    items: [{ id: 1, folderId: '42', type: 'image', name: 'denied.png', url: '/media/denied.png' }],
    bridge: () => response({ ok: false, text: JSON.stringify({ error: '本地桥拒绝导入' }) }),
  });
  const failed = await failingHarness.dispatch(currentFolderMessage());
  assert.equal(failed.ok, false);
  assert.equal(failed.imported, 0);
  assert.equal(failed.errors.length, 1);
  assert.match(failed.error, /本地桥拒绝导入/);
  assert.equal(failingHarness.notifications.at(-1).title, 'AI Flow 当前文件夹同步失败');
});

test('current-folder worker refuses an unmapped target before downloading or importing assets', async () => {
  const harness = createHarness({
    items: [{ id: 1, folderId: '42', type: 'image', name: 'blocked.png', url: '/media/blocked.png' }],
    folderTarget: () => response({ ok: false, text: JSON.stringify({ error: 'AI Flow 子目录对应不存在，请重新执行“同步目录和素材”' }) }),
  });
  const result = await harness.dispatch(currentFolderMessage());
  assert.equal(result.ok, false);
  assert.match(result.error, /子目录对应不存在/);
  assert.equal(harness.calls.filter(call => call.url.includes('/media/')).length, 0);
  assert.equal(harness.calls.filter(call => call.url.endsWith('/aiflow-asset-data')).length, 0);
});

test('current-folder diff preview reads only direct private media and never starts a sync mutation', async () => {
  const harness = createHarness({
    folders: [{ id: 44, shared: true }],
    items: [
      { id: 1, folderId: '42', type: 'image', name: 'direct.png', size: 12, url: '/media/direct.png' },
      { id: 2, folderId: '42', type: 'audio', name: 'direct.mp3', size: 24, url: '/media/direct.mp3' },
      { id: 3, folderId: '43', type: 'video', name: 'child.mp4', size: 36, url: '/media/child.mp4' },
      { id: 4, folderId: '42', type: 'image', shared: true, name: 'shared.png', size: 48, url: '/media/shared.png' },
      { id: 5, folderId: '44', type: 'image', name: 'shared-folder.png', size: 60, url: '/media/shared-folder.png' },
      { id: 6, folderId: '42', type: 'document', name: 'skip.txt', size: 72, url: '/media/skip.txt' },
    ],
  });
  const result = await harness.dispatch(currentFolderDiffMessage());
  const bridgeCall = harness.calls.find(call => call.url.endsWith('/aiflow-folder-diff-preview'));
  assert.equal(result.ok, true);
  assert.ok(bridgeCall);
  assert.deepEqual(JSON.parse(bridgeCall.body), {
    pageUrl: 'http://flow.test/project/7',
    projectId: '7',
    folderId: '42',
    items: [
      { id: '1', name: 'direct.png', kind: 'image', size: 12 },
      { id: '2', name: 'direct.mp3', kind: 'audio', size: 24 },
    ],
  });
  assert.equal(harness.calls.filter(call => call.url.includes('/media/')).length, 0);
  assert.equal(harness.calls.filter(call => call.url.endsWith('/aiflow-folder-target')).length, 0);
  assert.equal(harness.calls.filter(call => call.url.endsWith('/aiflow-asset-data')).length, 0);
  assert.equal(harness.calls.filter(call => /aiflow-(live|upload|reference)/.test(call.url)).length, 0);
});

test('current-folder diff preview rejects public folders and bridge mapping errors without downloading or importing', async () => {
  const sharedHarness = createHarness({ folders: [{ id: 42, shared: true }], items: [] });
  const shared = await sharedHarness.dispatch(currentFolderDiffMessage({ folderId: '42', sharedLibrary: true }));
  assert.equal(shared.ok, false);
  assert.match(shared.error, /公共资产包/);
  assert.equal(sharedHarness.calls.filter(call => call.url.endsWith('/aiflow-folder-diff-preview')).length, 0);

  const rejectedHarness = createHarness({
    items: [{ id: 1, folderId: '42', type: 'image', name: 'blocked.png', url: '/media/blocked.png' }],
    diffPreview: () => response({ ok: false, text: JSON.stringify({ error: 'AI Flow 子目录对应不存在，请重新执行“同步目录和素材”' }) }),
  });
  const rejected = await rejectedHarness.dispatch(currentFolderDiffMessage());
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /子目录对应不存在/);
  assert.equal(rejectedHarness.calls.filter(call => call.url.includes('/media/')).length, 0);
  assert.equal(rejectedHarness.calls.filter(call => call.url.endsWith('/aiflow-asset-data')).length, 0);
});

test('current-folder sync and diff reject a tab that switched project or folder before a remote read can mutate anything', async () => {
  const harness = createHarness({
    items: [{ id: 1, folderId: '42', type: 'image', name: 'blocked.png', url: '/media/blocked.png' }],
    pageContext: { workspace: true, ok: true, sharedLibrary: false, pageUrl: 'http://flow.test/project/8', projectId: '8', folderId: '43', folderName: '已切换文件夹' },
  });
  const sync = await harness.dispatch(currentFolderMessage());
  const preview = await harness.dispatch(currentFolderDiffMessage());
  assert.equal(sync.ok, false);
  assert.equal(preview.ok, false);
  assert.match(sync.error, /已切换/);
  assert.match(preview.error, /已切换/);
  assert.equal(harness.calls.filter(call => call.url.startsWith('http://flow.test/auth/assets')).length, 0);
  assert.equal(harness.calls.filter(call => call.url.includes('/media/')).length, 0);
  assert.equal(harness.calls.filter(call => call.url.includes('32145')).length, 0);
});
