const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { liveSyncStatusForPage } = require('../electron/aiflow-live-sync.cjs');

function fixture() {
  return {
    folders: [
      {
        id: 'root-flow', name: '同步根目录', parentId: null,
        aiFlowRootSync: { serverOrigin: 'https://flow.example.test', projectId: '26', liveSync: true, syncedAt: 1 },
      },
      {
        id: 'folder-flow', name: 'ep01', parentId: 'root-flow',
        aiFlowFolderSync: { serverOrigin: 'https://flow.example.test', projectId: '26', remoteFolderId: '101', rootFolderId: 'root-flow', syncedAt: 1 },
      },
      {
        id: 'root-other', name: '另一项目', parentId: null,
        aiFlowRootSync: { serverOrigin: 'https://other.example.test', projectId: '27', liveSync: true, syncedAt: 1 },
      },
      {
        id: 'folder-other', name: 'ep02', parentId: 'root-other',
        aiFlowFolderSync: { serverOrigin: 'https://other.example.test', projectId: '27', remoteFolderId: '201', rootFolderId: 'root-other', syncedAt: 1 },
      },
    ],
    assets: [
      { id: 'asset-one', folderId: 'folder-flow', name: '本地图片' },
      { id: 'asset-two', folderId: 'folder-flow', name: '本地视频' },
      { id: 'asset-other', folderId: 'folder-other', name: '其他项目素材' },
    ],
    aiFlowLiveSync: {
      pendingUploads: [
        {
          assetId: 'asset-one', localFolderId: 'folder-flow', rootFolderId: 'root-flow',
          serverOrigin: 'https://flow.example.test', projectId: '26', remoteFolderId: '101',
          queuedAt: 100, lastAttemptAt: 400,
          lastError: 'Upload failed: C:\\Users\\EDY\\secret\\asset.png remoteAssetId=98765 https://flow.example.test/api/assets data:image/png;base64,secret',
        },
        {
          assetId: 'asset-two', localFolderId: 'folder-flow', rootFolderId: 'root-flow',
          serverOrigin: 'https://flow.example.test', projectId: '26', remoteFolderId: '101',
          queuedAt: 200, lastAttemptAt: 0, lastError: '',
        },
        {
          assetId: 'asset-other', localFolderId: 'folder-other', rootFolderId: 'root-other',
          serverOrigin: 'https://other.example.test', projectId: '27', remoteFolderId: '201',
          queuedAt: 50, lastAttemptAt: 500, lastError: 'other project failure',
        },
        {
          assetId: 'missing-asset', localFolderId: 'folder-flow', rootFolderId: 'root-flow',
          serverOrigin: 'https://flow.example.test', projectId: '26', remoteFolderId: '101',
          queuedAt: 90, lastAttemptAt: 0, lastError: 'stale record',
        },
      ],
      pendingDeletes: [
        { remoteAssetId: '801', serverOrigin: 'https://flow.example.test', projectId: '26', queuedAt: 150, lastAttemptAt: 300, lastError: 'HTTP 422: assetId=801' },
        { remoteAssetId: '802', serverOrigin: 'https://flow.example.test', projectId: '26', queuedAt: 250, lastAttemptAt: 0, lastError: '' },
        { remoteAssetId: '901', serverOrigin: 'https://other.example.test', projectId: '27', queuedAt: 60, lastAttemptAt: 600, lastError: 'other project delete failure' },
      ],
    },
  };
}

test('live sync status is isolated by the configured page origin and numeric project', () => {
  const data = fixture();
  const flow = liveSyncStatusForPage(data, { serverOrigin: 'https://flow.example.test/path', projectId: '26' });
  const other = liveSyncStatusForPage(data, { serverOrigin: 'https://other.example.test', projectId: '27' });

  assert.deepEqual(flow.roots, [{ name: '同步根目录' }]);
  assert.equal(flow.queue.uploads, 2);
  assert.equal(flow.queue.deletes, 2);
  assert.equal(flow.queue.failedUploads, 1);
  assert.equal(flow.queue.failedDeletes, 1);
  assert.equal(flow.queue.oldestQueuedAt, 100);
  assert.equal(flow.queue.nextRetryAt, 0);
  assert.equal(flow.queue.lastError, 'AI Flow 同步失败，请重试');
  assert.deepEqual(flow.queue.items, [
    { assetId: 'asset-one', name: '本地图片', kind: 'file', size: 0, queuedAt: 100, retryCount: 0, nextAttemptAt: 0, state: 'failed' },
    { assetId: 'asset-two', name: '本地视频', kind: 'file', size: 0, queuedAt: 200, retryCount: 0, nextAttemptAt: 0, state: 'queued' },
  ]);
  assert.equal(other.queue.uploads, 1);
  assert.equal(other.queue.deletes, 1);
  assert.equal(other.queue.failedUploads, 1);
  assert.equal(other.queue.failedDeletes, 1);
  assert.equal(liveSyncStatusForPage(data, { serverOrigin: 'https://flow.example.test', projectId: 'not-a-project' }).queue.uploads, 0);
});

test('live sync status aggregates failures but redacts local paths, URLs, data, and remote identifiers', () => {
  const status = liveSyncStatusForPage(fixture(), { serverOrigin: 'https://flow.example.test', projectId: '26' });
  assert.equal(status.queue.failedUploads, 1);
  assert.equal(status.queue.failedDeletes, 1);
  assert.ok(status.queue.lastError.length <= 180);
  assert.doesNotMatch(status.queue.lastError, /C:\\Users|https?:\/\/|file:\/\/|data:|98765|801/i);
  assert.equal(status.queue.lastError, 'AI Flow 同步失败，请重试');
});

test('live sync status exposes cancelable upload metadata without local paths or remote identifiers', () => {
  const data = fixture();
  data.assets[0].type = 'image/png';
  data.assets[0].size = 2048;
  data.aiFlowLiveSync.pendingUploads[0].retryCount = 2;
  data.aiFlowLiveSync.pendingUploads[0].nextAttemptAt = Date.now() + 30 * 1000;
  const status = liveSyncStatusForPage(data, { serverOrigin: 'https://flow.example.test', projectId: '26' });
  const item = status.queue.items.find(candidate => candidate.assetId === 'asset-one');
  assert.deepEqual(Object.keys(item).sort(), ['assetId', 'kind', 'name', 'nextAttemptAt', 'queuedAt', 'retryCount', 'size', 'state']);
  assert.equal(item.kind, 'image');
  assert.equal(item.size, 2048);
  assert.equal(item.state, 'retry-wait');
  assert.doesNotMatch(JSON.stringify(item), /C:\\Users|https?:\/\/|98765|801/i);
});

test('live sync status never normalizes, filters, reorders, or otherwise mutates the persisted queue', () => {
  const data = fixture();
  const before = JSON.parse(JSON.stringify(data));
  const status = liveSyncStatusForPage(data, { serverOrigin: 'https://flow.example.test', projectId: '26' });

  assert.equal(status.queue.uploads, 2);
  assert.deepEqual(data, before);
  const empty = { folders: [], assets: [] };
  liveSyncStatusForPage(empty, { serverOrigin: 'https://flow.example.test', projectId: '26' });
  assert.equal(Object.hasOwn(empty, 'aiFlowLiveSync'), false);
});

test('the paired bridge exposes the read-only status route through the existing validation boundary', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  assert.match(main, /async function readCollectorAIFlowLiveStatus\(req\)/);
  assert.match(main, /validatedAIFlowPageOrigin\(input\.pageUrl\)/);
  assert.match(main, /collectorNumericValue\(input\.projectId, 'AI Flow 项目 ID'\)/);
  assert.match(main, /const permission = collectorPermission\(\);/);
  assert.match(main, /liveSyncStatusForPage\(permission, \{ serverOrigin, projectId \}\)/);
  assert.match(main, /req\.url === '\/aiflow-live-status'/);
});
