const test = require('node:test');
const assert = require('node:assert/strict');
const { previewMappedAIFlowFolderDiff } = require('../electron/aiflow-current-folder-diff.cjs');

const scope = { serverOrigin: 'http://10.128.20.135:8080', projectId: '7', remoteFolderId: '42' };

function mappedFolders() {
  return [
    { id: 'root-7', name: '同步根目录', aiFlowRootSync: { serverOrigin: scope.serverOrigin, projectId: scope.projectId } },
    { id: 'local-42', name: '测试2', parentId: 'root-7', aiFlowFolderSync: { rootFolderId: 'root-7', remoteFolderId: '42', serverOrigin: scope.serverOrigin, projectId: scope.projectId } },
    { id: 'other-folder', name: '其他目录', parentId: 'root-7' },
  ];
}

function fixture() {
  return {
    folders: mappedFolders(),
    assets: [
      {
        id: 'from-server', folderId: 'local-42', name: '远端角色.png', type: 'image/png', size: 120, hash: 'a'.repeat(64),
        importSource: { provider: 'AI Flow', assetId: '1', projectId: '7', serverOrigin: scope.serverOrigin },
      },
      { id: 'uploaded', folderId: 'local-42', name: '本地视频.mov', type: 'video/quicktime', size: 240, hash: 'b'.repeat(64) },
      { id: 'duplicate', folderId: 'local-42', name: '同名素材.jpg', type: 'image/jpeg', size: 60, hash: 'c'.repeat(64) },
      { id: 'new-local', folderId: 'local-42', name: '仅本地.png', type: 'image/png', size: 80, hash: 'd'.repeat(64) },
    ],
    aiFlowMappings: {
      version: 1,
      mappings: [{
        id: 'mapped-upload', assetId: 'uploaded', currentHash: 'b'.repeat(64), provider: 'ai-flow', origin: 'live-sync',
        remoteAssetId: '2', name: '本地视频.mov', projectId: '7', matchMethod: 'upload-batch', status: 'confirmed', createdAt: 1, updatedAt: 1,
      }],
    },
  };
}

function remoteItems() {
  return [
    { id: '1', name: '远端角色.png', kind: 'image', size: 120 },
    { id: '2', name: '本地视频.mov', kind: 'video', size: 240 },
    { id: '3', name: '同名素材.png', kind: 'image', size: 60 },
    { id: '4', name: '仅远端.wav', kind: 'audio', size: 32 },
  ];
}

test('previews exact associations, local additions, possible duplicates, and remote-only files without changing data', () => {
  const data = fixture();
  const before = structuredClone(data);
  const result = previewMappedAIFlowFolderDiff(data, { ...scope, remoteItems: remoteItems() });

  assert.deepEqual(result.folder, { name: '测试2' });
  assert.deepEqual(result.summary, { linked: 2, localNew: 1, possibleDuplicates: 1, remoteOnly: 1, mappingIssues: 0 });
  assert.deepEqual(result.localNew, [{ name: '仅本地.png', kind: 'image', size: 80 }]);
  assert.deepEqual(result.possibleDuplicates, [{
    local: { name: '同名素材.jpg', kind: 'image', size: 60 },
    remote: { name: '同名素材.png', kind: 'image', size: 60 },
    reason: '同名、同类型、大小一致',
  }]);
  assert.deepEqual(result.remoteOnly, [{ name: '仅远端.wav', kind: 'audio', size: 32 }]);
  assert.equal(result.truncated, false);
  assert.deepEqual(data, before);
});

test('keeps stale, missing, and cross-folder relations as mapping issues instead of guessing a sync action', () => {
  const data = fixture();
  data.assets.push(
    { id: 'stale', folderId: 'local-42', name: '已变更.png', type: 'image', size: 40, hash: 'e'.repeat(64) },
    { id: 'other-linked', folderId: 'other-folder', name: '错目录.png', type: 'image', size: 50, hash: 'f'.repeat(64) },
    { id: 'not-visible', folderId: 'local-42', name: '网页未显示.png', type: 'image', size: 70, hash: '1'.repeat(64) },
  );
  data.aiFlowMappings.mappings.push(
    { id: 'stale-map', assetId: 'stale', currentHash: '0'.repeat(64), provider: 'ai-flow', remoteAssetId: '10', projectId: '7', status: 'confirmed', createdAt: 1, updatedAt: 1 },
    { id: 'outside-map', assetId: 'other-linked', currentHash: 'f'.repeat(64), provider: 'ai-flow', remoteAssetId: '11', projectId: '7', status: 'confirmed', createdAt: 1, updatedAt: 1 },
    { id: 'hidden-map', assetId: 'not-visible', currentHash: '1'.repeat(64), provider: 'ai-flow', remoteAssetId: '12', projectId: '7', status: 'confirmed', createdAt: 1, updatedAt: 1 },
    { id: 'missing-map', assetId: 'deleted-local', currentHash: '2'.repeat(64), provider: 'ai-flow', remoteAssetId: '13', projectId: '7', status: 'confirmed', createdAt: 1, updatedAt: 1 },
  );

  const result = previewMappedAIFlowFolderDiff(data, {
    ...scope,
    remoteItems: [
      { id: '1', name: '远端角色.png', kind: 'image' },
      { id: '2', name: '本地视频.mov', kind: 'video' },
      { id: '10', name: '已变更.png', kind: 'image' },
      { id: '11', name: '错目录.png', kind: 'image' },
      { id: '13', name: '已删除本地.png', kind: 'image' },
    ],
  });

  assert.equal(result.summary.mappingIssues, 4);
  assert.equal(result.summary.localNew, 2);
  assert.match(result.mappingIssues.map(item => item.message).join(' '), /本地版本已变化/);
  assert.match(result.mappingIssues.map(item => item.message).join(' '), /其他本地目录/);
  assert.match(result.mappingIssues.map(item => item.message).join(' '), /网页文件夹/);
  assert.match(result.mappingIssues.map(item => item.message).join(' '), /本地素材已不存在/);
});

test('refuses unmapped or ambiguous destinations and never exposes paths, ids, urls, or hashes in the public result', () => {
  assert.throws(() => previewMappedAIFlowFolderDiff({ folders: [], assets: [] }, { ...scope, remoteItems: [] }), /尚未与本地目录建立对应/);
  const ambiguous = fixture();
  ambiguous.folders.push({ id: 'other-root', name: '另一根', aiFlowRootSync: { serverOrigin: scope.serverOrigin, projectId: scope.projectId } });
  assert.throws(() => previewMappedAIFlowFolderDiff(ambiguous, { ...scope, remoteItems: [] }), /多个本地同步根目录/);

  const result = previewMappedAIFlowFolderDiff(fixture(), {
    ...scope,
    remoteItems: [
      { id: '4', name: 'C:\\Users\\EDY\\secret.png https://server.example/file?token=abc', kind: 'image' },
      { id: '5', name: 'prefix=C:/Users/EDY/secret.mov', kind: 'video' },
      { id: '6', name: '(\\\\server\\share\\private.wav) /Users/EDY/private.mp3', kind: 'audio' },
    ],
  });
  const publicText = JSON.stringify(result);
  assert.doesNotMatch(publicText, /local-42|root-7|remoteAssetId|"id"|"hash"|https?:\/\/|[a-z]:[\\/]|\\\\server|\/Users\//i);
});

test('does not treat pending or unlinked mappings as confirmed remote associations', () => {
  const data = fixture();
  data.aiFlowMappings.mappings[0].status = 'pending';
  const result = previewMappedAIFlowFolderDiff(data, {
    ...scope,
    remoteItems: [
      { id: '1', name: '远端角色.png', kind: 'image', size: 120 },
      { id: '2', name: '本地视频.mov', kind: 'video', size: 240 },
    ],
  });
  assert.equal(result.summary.linked, 1);
  assert.equal(result.summary.mappingIssues, 1);
  assert.equal(result.summary.remoteOnly, 0);
  assert.equal(result.summary.localNew, 2);
  assert.match(result.mappingIssues[0].message, /尚未确认/);
});
