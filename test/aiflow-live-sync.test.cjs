const test = require('node:test');
const assert = require('node:assert/strict');
const {
  folderTarget,
  ensureLiveQueue,
  queueAssetsForLiveSync,
  queueRemoteDeletes,
  queueRemoteMoves,
  pendingRemoteDeletesForPage,
  pendingRemoteMovesForPage,
  removePendingRemoteDeletes,
  removePendingRemoteMoves,
  recordLiveUploadFailures,
  pendingLiveUploadsForPage,
  prioritizedLiveUploads,
  nextLiveUploadRetryAt,
  LIVE_UPLOAD_RETRY_BASE_MS,
  setRootLiveSync,
  liveSyncRootsForPage,
  folderAssetsForUpload,
} = require('../electron/aiflow-live-sync.cjs');

function fixture() {
  return {
    folders: [
      {
        id: 'root', name: 'AI Flow 测试', parentId: null,
        aiFlowRootSync: { serverOrigin: 'https://flow.example.test', projectId: '26', liveSync: false, syncedAt: 1 },
      },
      {
        id: 'ep01', name: 'ep01', parentId: 'root',
        aiFlowFolderSync: { serverOrigin: 'https://flow.example.test', projectId: '26', remoteFolderId: '101', rootFolderId: 'root', syncedAt: 1 },
      },
    ],
    assets: [
      { id: 'asset-local', name: '本地图片', folderId: 'ep01', file: 'ep01/a.png', type: 'image/png' },
      { id: 'asset-server', name: '网页图片', folderId: 'ep01', file: 'ep01/b.png', type: 'image/png', importSource: { provider: 'AI Flow' } },
    ],
  };
}

test('resolves a mapped local folder to its paired AI Flow folder and root', () => {
  const target = folderTarget(fixture(), 'ep01');
  assert.deepEqual(target, {
    localFolderId: 'ep01', rootFolderId: 'root', rootFolderName: 'AI Flow 测试',
    remoteFolderId: '101', remoteFolderName: 'ep01',
    serverOrigin: 'https://flow.example.test', projectId: '26', liveSync: true,
  });
});

test('an explicitly enabled root queues only local additions and preserves the paired destination', () => {
  const data = fixture();
  setRootLiveSync(data, 'root', true, { now: 10 });
  assert.equal(queueAssetsForLiveSync(data, data.assets, { now: 11 }), 1);
  const pending = pendingLiveUploadsForPage(data, { serverOrigin: 'https://flow.example.test', projectId: '26' });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].asset.id, 'asset-local');
  assert.equal(pending[0].target.remoteFolderId, '101');
  assert.deepEqual(liveSyncRootsForPage(data, { serverOrigin: 'https://flow.example.test', projectId: '26' }), [
    { folderId: 'root', folderName: 'AI Flow 测试' },
  ]);
});

test('an explicitly disabled root stays stopped after the legacy live-sync migration', () => {
  const data = fixture();
  setRootLiveSync(data, 'root', false, { now: 10 });
  assert.equal(queueAssetsForLiveSync(data, data.assets, { now: 11 }), 0);
  assert.deepEqual(liveSyncRootsForPage(data, { serverOrigin: 'https://flow.example.test', projectId: '26' }), []);
  assert.equal(data.folders[0].aiFlowRootSync.liveSyncDisabledByUser, true);
});

test('folder upload includes descendants and retains the matching remote folder', () => {
  const data = fixture();
  const plan = folderAssetsForUpload(data, 'root');
  assert.equal(plan.assets.length, 1);
  assert.ok(plan.assets.every(item => item.target.remoteFolderId === '101'));
});

test('live upload failures are preserved for the card and cleared when a local asset is queued again', () => {
  const data = fixture();
  setRootLiveSync(data, 'root', true, { now: 10 });
  data.aiFlowLiveSync = {
    pendingUploads: [{
      assetId: 'asset-local', localFolderId: 'ep01', rootFolderId: 'root',
      serverOrigin: 'https://flow.example.test', projectId: '26', remoteFolderId: '101',
      queuedAt: 11, lastError: 'AI Flow returned 422', lastAttemptAt: 12,
    }],
  };
  const queue = ensureLiveQueue(data);
  assert.equal(queue.pendingUploads[0].lastError, 'AI Flow returned 422');
  assert.equal(queue.pendingUploads[0].lastAttemptAt, 12);
  queueAssetsForLiveSync(data, [data.assets[0]], { now: 13 });
  assert.equal(data.aiFlowLiveSync.pendingUploads[0].lastError, '');
  assert.equal(data.aiFlowLiveSync.pendingUploads[0].lastAttemptAt, 0);
});

test('linked remote assets are queued for deletion only on their paired AI Flow project', () => {
  const data = fixture();
  setRootLiveSync(data, 'root', true, { now: 10 });
  assert.equal(queueRemoteDeletes(data, [{ remoteAssetId: '812', serverOrigin: 'https://flow.example.test', projectId: '26' }], { now: 11 }), 1);
  assert.deepEqual(pendingRemoteDeletesForPage(data, { serverOrigin: 'https://flow.example.test', projectId: '26' }).map(item => item.remoteAssetId), ['812']);
  assert.equal(pendingRemoteDeletesForPage(data, { serverOrigin: 'https://elsewhere.example.test', projectId: '26' }).length, 0);
  assert.equal(removePendingRemoteDeletes(data, ['812'], { serverOrigin: 'https://flow.example.test', projectId: '26' }), 1);
});

test('linked material moves stay scoped to the current mapped destination and newest destination wins', () => {
  const data = fixture();
  setRootLiveSync(data, 'root', true, { now: 10 });
  const first = {
    assetId: 'asset-server', remoteAssetId: '812', localFolderId: 'ep01', rootFolderId: 'root', remoteFolderId: '101',
    serverOrigin: 'https://flow.example.test', projectId: '26',
  };
  assert.equal(queueRemoteMoves(data, [first], { now: 11 }), 1);
  assert.deepEqual(pendingRemoteMovesForPage(data, { serverOrigin: 'https://flow.example.test', projectId: '26' }).map(item => item.remoteFolderId), ['101']);

  const rootMove = { ...first, localFolderId: 'root', remoteFolderId: '' };
  assert.equal(queueRemoteMoves(data, [rootMove], { now: 12 }), 0);
  const pending = pendingRemoteMovesForPage(data, { serverOrigin: 'https://flow.example.test', projectId: '26' });
  assert.deepEqual(pending.map(item => [item.localFolderId, item.remoteFolderId]), [['ep01', '101']]);

  data.assets[1].folderId = 'root';
  const refreshed = pendingRemoteMovesForPage(data, { serverOrigin: 'https://flow.example.test', projectId: '26' });
  assert.deepEqual(refreshed.map(item => [item.localFolderId, item.remoteFolderId]), [['root', '']]);
  assert.equal(removePendingRemoteMoves(data, refreshed, { serverOrigin: 'https://flow.example.test', projectId: '26' }), 1);
});

test('live upload scheduling sends smaller ready files first and backs off repeated failures', () => {
  const data = fixture();
  data.assets[0].size = 8 * 1024 * 1024;
  data.assets.push({ id: 'asset-small', name: '小图', folderId: 'ep01', file: 'ep01/s.png', type: 'image/png', size: 24 * 1024 });
  setRootLiveSync(data, 'root', true, { now: 10 });
  queueAssetsForLiveSync(data, [data.assets[0], data.assets[2]], { now: 11 });
  const scope = { serverOrigin: 'https://flow.example.test', projectId: '26' };
  const pending = pendingLiveUploadsForPage(data, scope);
  assert.deepEqual(prioritizedLiveUploads(pending, { now: 12 }).map(item => item.asset.id), ['asset-small', 'asset-local']);

  const first = recordLiveUploadFailures(data, [{ assetId: 'asset-small', error: 'HTTP 503' }], { ...scope, now: 100 });
  assert.equal(first.updated, 1);
  assert.equal(first.nextRetryAt, 100 + LIVE_UPLOAD_RETRY_BASE_MS);
  const afterFirst = pendingLiveUploadsForPage(data, scope);
  assert.deepEqual(prioritizedLiveUploads(afterFirst, { now: 101 }).map(item => item.asset.id), ['asset-local']);
  assert.equal(nextLiveUploadRetryAt(afterFirst, { now: 101 }), 100 + LIVE_UPLOAD_RETRY_BASE_MS);

  const second = recordLiveUploadFailures(data, [{ assetId: 'asset-small', error: 'HTTP 503' }], { ...scope, now: first.nextRetryAt });
  assert.equal(second.nextRetryAt, first.nextRetryAt + LIVE_UPLOAD_RETRY_BASE_MS * 2);
  const record = data.aiFlowLiveSync.pendingUploads.find(item => item.assetId === 'asset-small');
  assert.equal(record.retryCount, 2);
});
