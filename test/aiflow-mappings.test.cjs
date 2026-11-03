const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createAIFlowMappings,
  normalizeAIFlowMapping,
  normalizeAIFlowMappings,
  createRemoteLocatorKey,
  upsertAIFlowMapping,
  updateAIFlowMapping,
  findAIFlowMappingsByAsset,
  findAIFlowMappingsByTask,
  findAIFlowMappingsByBatch,
  findAIFlowMappingConflict,
} = require('../electron/aiflow-mappings.cjs');

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function mapping(overrides = {}) {
  return {
    assetId: 'asset-a',
    currentHash: HASH_A,
    provider: 'ai-flow',
    remoteAssetId: 'remote-a',
    url: 'https://flow.example.test/assets/remote-a.png',
    name: '角色参考图',
    projectId: 'project-1',
    taskId: 'task-1',
    uploadBatchId: 'batch-1',
    matchMethod: 'upload-batch',
    status: 'pending',
    ...overrides,
  };
}

test('canonical mapping strips unsafe URL credentials and normalizes JSON fields', () => {
  const result = normalizeAIFlowMapping(mapping({
    assetId: '  asset-a\u0000  ',
    currentHash: ` ${HASH_A.toUpperCase()} `,
    provider: ' AI Flow ',
    origin: ' Browser Extension ',
    url: 'https://user:secret@flow.example.test/assets/remote-a.png?token=secret#preview',
    name: '  角色\n参考图  ',
    createdAt: '2026-09-03T00:00:00.000Z',
  }), { now: 2_000 });

  assert.equal(result.assetId, 'asset-a');
  assert.equal(result.currentHash, HASH_A);
  assert.equal(result.provider, 'ai-flow');
  assert.equal(result.origin, 'browser-extension');
  assert.equal(result.url, null);
  assert.equal(result.name, '角色 参考图');
  assert.equal(result.createdAt, Date.parse('2026-09-03T00:00:00.000Z'));
  assert.equal(result.updatedAt, result.createdAt);
});

test('supports N:N relations while keeping asset hash as the mapped version', () => {
  let data = createAIFlowMappings();
  data = upsertAIFlowMapping(data, mapping({ remoteAssetId: 'remote-1', taskId: 'task-1' }), { now: 1 }).data;
  data = upsertAIFlowMapping(data, mapping({ remoteAssetId: 'remote-2', taskId: 'task-2' }), { now: 2 }).data;
  data = upsertAIFlowMapping(data, mapping({ assetId: 'asset-b', remoteAssetId: 'remote-1', taskId: 'task-3' }), { now: 3 }).data;
  data = upsertAIFlowMapping(data, mapping({ currentHash: HASH_B, remoteAssetId: 'remote-1', taskId: 'task-4' }), { now: 4 }).data;

  assert.equal(data.mappings.length, 4);
  assert.equal(findAIFlowMappingsByAsset(data, 'asset-a').length, 3);
  assert.equal(findAIFlowMappingsByTask(data, 'task-3')[0].assetId, 'asset-b');
  assert.equal(findAIFlowMappingsByTask(data, 'task-4')[0].currentHash, HASH_B);
});

test('upsert merges an exact relation instead of creating duplicate bindings', () => {
  const first = upsertAIFlowMapping(createAIFlowMappings(), mapping({
    origin: 'manual',
    name: '初始名称',
    status: 'pending',
  }), { now: 1_000, idFactory: () => 'map-1' });
  const second = upsertAIFlowMapping(first.data, mapping({
    origin: 'browser-extension',
    url: 'https://flow.example.test/cdn/remote-a.png?signature=secret',
    name: '网页已确认名称',
    status: 'confirmed',
  }), { now: 2_000, idFactory: () => 'map-2' });

  assert.equal(second.created, false);
  assert.equal(second.updated, true);
  assert.equal(second.data.mappings.length, 1);
  assert.equal(second.mapping.id, 'map-1');
  assert.equal(second.mapping.origin, 'browser-extension');
  assert.equal(second.mapping.name, '网页已确认名称');
  assert.equal(second.mapping.status, 'confirmed');
  assert.equal(second.mapping.url, 'https://flow.example.test/cdn/remote-a.png');
  assert.equal(second.mapping.createdAt, 1_000);
  assert.equal(second.mapping.updatedAt, 2_000);
});

test('provider IDs take precedence over a shared sanitized URL', () => {
  const first = upsertAIFlowMapping(createAIFlowMappings(), mapping({
    remoteAssetId: 'remote-a',
    url: 'https://flow.example.test/download?asset=remote-a&token=secret',
  }), { now: 1, idFactory: () => 'map-a' });
  const second = upsertAIFlowMapping(first.data, mapping({
    remoteAssetId: 'remote-b',
    url: 'https://flow.example.test/download?asset=remote-b&token=secret',
  }), { now: 2, idFactory: () => 'map-b' });

  assert.equal(second.created, true);
  assert.equal(second.data.mappings.length, 2);
});

test('query-only locators keep an opaque discriminator without persisting a token', () => {
  const rawA = 'https://flow.example.test/download?asset=remote-a&token=secret-a';
  const rawB = 'https://flow.example.test/download?asset=remote-b&token=secret-b';
  const keyA = createRemoteLocatorKey(rawA);
  const keyB = createRemoteLocatorKey(rawB);
  assert.notEqual(keyA, keyB);

  const first = upsertAIFlowMapping(createAIFlowMappings(), mapping({
    remoteAssetId: null,
    url: rawA,
    remoteKey: keyA,
  }), { now: 1, idFactory: () => 'map-a' });
  const second = upsertAIFlowMapping(first.data, mapping({
    assetId: 'asset-b',
    remoteAssetId: null,
    url: rawB,
    remoteKey: keyB,
  }), { now: 2, idFactory: () => 'map-b' });
  const conflict = findAIFlowMappingConflict(second.data, mapping({
    assetId: 'asset-c',
    remoteAssetId: null,
    url: rawA,
    remoteKey: keyA,
  }));

  assert.equal(second.data.mappings.length, 2);
  assert.equal(conflict?.id, 'map-a');
  assert.doesNotMatch(JSON.stringify(second.data), /token=secret/);
});

test('duplicate normalization keeps the confirmed record regardless of JSON order', () => {
  const pending = mapping({ id: 'pending', status: 'pending', name: '旧记录', updatedAt: 100, createdAt: 10 });
  const confirmed = mapping({ id: 'confirmed', status: 'confirmed', name: '网页已确认', updatedAt: 200, createdAt: 20 });
  const forward = normalizeAIFlowMappings({ mappings: [pending, confirmed] }, { now: 1_000 });
  const reverse = normalizeAIFlowMappings({ mappings: [confirmed, pending] }, { now: 1_000 });

  assert.equal(forward.mappings.length, 1);
  assert.equal(reverse.mappings.length, 1);
  assert.equal(forward.mappings[0].status, 'confirmed');
  assert.equal(reverse.mappings[0].status, 'confirmed');
  assert.equal(forward.mappings[0].name, '网页已确认');
  assert.equal(reverse.mappings[0].name, '网页已确认');
  assert.equal(forward.mappings[0].updatedAt, 200);
  assert.equal(reverse.mappings[0].updatedAt, 200);
});

test('can update a relation and find it by task or upload batch', () => {
  const created = upsertAIFlowMapping(createAIFlowMappings(), mapping({
    taskId: null,
    status: 'pending',
  }), { now: 1_000, idFactory: () => 'map-1' });
  const changed = updateAIFlowMapping(created.data, 'map-1', {
    taskId: 'task-returned-1',
    uploadBatchId: 'batch-returned-1',
    status: 'confirmed',
    name: '回库成片的输入参考',
  }, { now: 2_000 });

  assert.equal(changed.updated, true);
  assert.equal(changed.merged, false);
  assert.equal(changed.mapping.createdAt, 1_000);
  assert.equal(changed.mapping.updatedAt, 2_000);
  assert.equal(changed.mapping.status, 'confirmed');
  assert.deepEqual(
    findAIFlowMappingsByTask(changed.data, 'task-returned-1').map(item => item.id),
    ['map-1'],
  );
  assert.deepEqual(
    findAIFlowMappingsByBatch(changed.data, 'batch-returned-1').map(item => item.assetId),
    ['asset-a'],
  );
});

test('normalization drops corrupt records and create rejects missing stable identity', () => {
  const normalized = normalizeAIFlowMappings({
    mappings: [
      mapping({ id: 'valid' }),
      mapping({ id: 'bad-hash', currentHash: 'not-a-hash' }),
      mapping({ id: 'bad-remote', remoteAssetId: null, url: 'file:///not-safe.png' }),
    ],
  }, { now: 1_000 });

  assert.deepEqual(normalized.mappings.map(item => item.id), ['valid']);
  assert.throws(
    () => upsertAIFlowMapping(createAIFlowMappings(), mapping({ currentHash: 'bad' })),
    /64 位 SHA-256 currentHash/,
  );
});

test('an update that becomes an exact duplicate collapses to one mapping', () => {
  let data = createAIFlowMappings();
  const first = upsertAIFlowMapping(data, mapping({ taskId: 'task-a' }), { now: 1, idFactory: () => 'map-a' });
  data = first.data;
  const second = upsertAIFlowMapping(data, mapping({ taskId: 'task-b' }), { now: 2, idFactory: () => 'map-b' });
  const collapsed = updateAIFlowMapping(second.data, 'map-b', { taskId: 'task-a' }, { now: 3 });

  assert.equal(collapsed.merged, true);
  assert.equal(collapsed.data.mappings.length, 1);
  assert.equal(collapsed.mapping.id, 'map-b');
  assert.equal(collapsed.mapping.taskId, 'task-a');
});
