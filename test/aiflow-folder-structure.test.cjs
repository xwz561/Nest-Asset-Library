const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAIFlowFolderStructure, mirrorAIFlowFolderStructure, detachAIFlowFolderConnections } = require('../electron/aiflow-folder-structure.cjs');

test('normalizes private AI Flow folders into parent-first order and ignores shared folders', () => {
  const result = normalizeAIFlowFolderStructure([
    { id: 12, name: '角色', parentId: 10 },
    { id: 10, name: 'ep01' },
    { id: 13, name: '公共包', shared: true },
  ]);
  assert.deepEqual(result.folders.map(folder => [folder.remoteId, folder.parentRemoteId, folder.name]), [
    ['10', '', 'ep01'],
    ['12', '10', '角色'],
  ]);
  assert.equal(result.skipped, 1);
});

test('breaks malformed remote cycles into a safe local hierarchy', () => {
  const result = normalizeAIFlowFolderStructure([
    { id: 10, name: 'A', parentId: 11 },
    { id: 11, name: 'B', parentId: 10 },
  ]);
  assert.equal(result.folders.length, 2);
  assert.ok(result.folders.every(folder => folder.parentRemoteId === ''));
});

test('mirrors only missing folders and preserves prior remote mapping', () => {
  const data = {
    folders: [{ id: 'root', name: '第26集', parentId: null }],
  };
  const first = mirrorAIFlowFolderStructure(data, {
    targetFolderId: 'root',
    serverOrigin: 'https://flow.example.test',
    projectId: '26',
    folders: [{ id: 1, name: 'ep01' }, { id: 2, name: '角色', parentId: 1 }],
  }, { makeId: (() => { let count = 0; return () => `local-${++count}`; })(), now: () => 100 });
  assert.deepEqual(first, { created: 2, reused: 0, skipped: 0, total: 2 });
  const second = mirrorAIFlowFolderStructure(data, {
    targetFolderId: 'root',
    serverOrigin: 'https://flow.example.test',
    projectId: '26',
    folders: [{ id: 1, name: 'ep01' }, { id: 2, name: '角色', parentId: 1 }],
  }, { makeId: () => 'unexpected', now: () => 200 });
  assert.deepEqual(second, { created: 0, reused: 2, skipped: 0, total: 2 });
  assert.equal(data.folders.length, 3);
  assert.equal(data.folders[2].parentId, data.folders[1].id);
  assert.deepEqual(data.folders[0].aiFlowRootSync, {
    serverOrigin: 'https://flow.example.test', projectId: '26', liveSync: true, liveSyncDisabledByUser: false, syncedAt: 200,
  });
});

test('reuses a selected local root that is already mapped to the current AI Flow folder', () => {
  const data = {
    folders: [{
      id: 'test-root', name: '测试', parentId: null,
      aiFlowFolderSync: { serverOrigin: 'https://flow.example.test', projectId: '26', remoteFolderId: '1406', rootFolderId: 'legacy-root' },
    }],
  };
  const result = mirrorAIFlowFolderStructure(data, {
    targetFolderId: 'test-root',
    serverOrigin: 'https://flow.example.test',
    projectId: '26',
    folders: [{ id: 1406, name: '测试' }, { id: 1407, name: 'ep01', parentId: 1406 }],
  }, { makeId: () => 'local-ep01', now: () => 300 });
  assert.deepEqual(result, { created: 1, reused: 1, skipped: 0, total: 2 });
  assert.equal(data.folders.length, 2);
  assert.equal(data.folders[1].parentId, 'test-root');
  assert.equal(data.folders[0].aiFlowFolderSync.rootFolderId, 'test-root');
  assert.equal(data.folders[0].aiFlowRootSync.liveSync, true);
});

test('repairs an older duplicated selected-root alias without deleting its assets', () => {
  const data = {
    folders: [
      { id: 'root', name: '测试', parentId: null, aiFlowFolderSync: { serverOrigin: 'https://flow.example.test', projectId: '26', remoteFolderId: '1406', rootFolderId: 'old-root' } },
      { id: 'alias', name: '测试', parentId: 'root', aiFlowFolderSync: { serverOrigin: 'https://flow.example.test', projectId: '26', remoteFolderId: '1406', rootFolderId: 'root' } },
    ],
    assets: [{ id: 'asset', name: '场景1', folderId: 'alias' }],
  };
  mirrorAIFlowFolderStructure(data, {
    targetFolderId: 'root', serverOrigin: 'https://flow.example.test', projectId: '26', folders: [{ id: 1406, name: '测试' }],
  }, { now: () => 400 });
  assert.equal(data.folders.length, 1);
  assert.equal(data.assets[0].folderId, 'root');
  assert.equal(data.folders[0].aiFlowFolderSync.rootFolderId, 'root');
});

test('sign-out detaches lightning folder links without deleting folders or local assets', () => {
  const data = {
    folders: [
      { id: 'root', name: 'FLOW', aiFlowRootSync: { projectId: '26' } },
      { id: 'child', name: 'ep01', parentId: 'root', aiFlowFolderSync: { remoteFolderId: '10' } },
      { id: 'normal', name: '本地文件夹' },
    ],
    assets: [{ id: 'asset', name: '本地素材', folderId: 'child' }],
    aiFlowLiveSync: { version: 2, pendingUploads: [{ assetId: 'asset' }], pendingDeletes: [{ remoteAssetId: '9' }] },
  };
  assert.deepEqual(detachAIFlowFolderConnections(data), { roots: 1, folders: 1 });
  assert.deepEqual(data.folders.map(folder => [folder.id, folder.name, folder.parentId || null]), [
    ['root', 'FLOW', null], ['child', 'ep01', 'root'], ['normal', '本地文件夹', null],
  ]);
  assert.deepEqual(data.assets, [{ id: 'asset', name: '本地素材', folderId: 'child' }]);
  assert.deepEqual(data.aiFlowLiveSync.pendingUploads, []);
  assert.deepEqual(data.aiFlowLiveSync.pendingDeletes, []);
});
