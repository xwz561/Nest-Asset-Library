const crypto = require('crypto');

// This module deliberately has no filesystem or Electron dependency. Callers own
// persistence (for example, by embedding the returned object in library JSON).
const STORE_VERSION = 1;
const DEFAULT_PROVIDER = 'ai-flow';
const DEFAULT_ORIGIN = 'manual';
const DEFAULT_MATCH_METHOD = 'manual';
const DEFAULT_STATUS = 'pending';

const MATCH_METHODS = new Set([
  'manual',
  'upload-batch',
  'remote-id',
  'url',
  'hash',
  'browser-extension',
  'task-import',
]);

const MAPPING_STATUSES = new Set([
  'pending',
  'confirmed',
  'stale',
  'unlinked',
  'archived',
]);

const STATUS_PRIORITY = Object.freeze({
  confirmed: 5,
  pending: 4,
  stale: 3,
  archived: 2,
  unlinked: 1,
});

const MAX_TIMESTAMP = 8_640_000_000_000_000;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeText(value, maxLength = 256) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value)
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeKey(value, fallback = '') {
  const text = normalizeText(value, 96)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return text || fallback;
}

function normalizeId(value, maxLength = 200) {
  return normalizeText(value, maxLength) || null;
}

function normalizeHash(value) {
  const hash = normalizeText(value, 128).toLowerCase();
  return /^[a-f0-9]{64}$/.test(hash) ? hash : null;
}

function normalizeRemoteUrl(value) {
  const text = normalizeText(value, 2048);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    // Query strings often contain expiring download credentials. They are neither
    // stable remote identity nor appropriate to keep in local provenance JSON.
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeRemoteKey(value) {
  const key = normalizeText(value, 128).toLowerCase();
  return /^[a-f0-9]{64}$/.test(key) ? key : null;
}

// Keep query strings (which can carry expiring credentials) out of JSON while
// retaining an opaque, non-reversible discriminator for query-only locators.
function createRemoteLocatorKey(value) {
  const text = normalizeText(value, 2048);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    return crypto.createHash('sha256').update(url.toString(), 'utf8').digest('hex');
  } catch {
    return null;
  }
}

function normalizeTimestamp(value, fallback) {
  let numeric = Number.NaN;
  if (typeof value === 'number' && Number.isFinite(value)) numeric = value;
  else if (typeof value === 'string' && value.trim()) numeric = Date.parse(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(MAX_TIMESTAMP, Math.trunc(numeric)));
}

function resolveNow(options = {}) {
  const source = typeof options.now === 'function' ? options.now() : options.now;
  return normalizeTimestamp(source, Date.now());
}

function firstPresent(source, keys) {
  for (const key of keys) {
    if (hasOwn(source, key)) return { present: true, value: source[key] };
  }
  return { present: false, value: undefined };
}

function generatedId(options = {}) {
  const candidate = typeof options.idFactory === 'function' ? options.idFactory() : crypto.randomUUID();
  return normalizeId(candidate, 128) || crypto.randomUUID();
}

function requireValidMapping(mapping) {
  if (!mapping.assetId) throw new Error('AI Flow 素材对应需要 assetId');
  if (!mapping.currentHash) throw new Error('AI Flow 素材对应需要 64 位 SHA-256 currentHash');
  if (!mapping.remoteAssetId && !mapping.url) {
    throw new Error('AI Flow 素材对应需要 remoteAssetId 或合法的 http(s) url');
  }
}

/**
 * Converts one untrusted JSON-shaped record into the canonical JSON schema.
 * `url` and `name` are remote-side fields. `remoteUrl` / `remoteName` are
 * accepted as input aliases so callers can use either naming convention.
 */
function parseMappingInput(input, options = {}) {
  const source = isPlainObject(input) ? input : {};
  const now = resolveNow(options);
  const provided = new Set();
  const pick = (field, aliases, normalizer, fallback = null) => {
    const found = firstPresent(source, aliases);
    if (!found.present) return fallback;
    provided.add(field);
    return normalizer(found.value);
  };

  const sourceId = firstPresent(source, ['id']);
  if (sourceId.present) provided.add('id');
  const id = sourceId.present ? normalizeId(sourceId.value, 128) : generatedId(options);
  const assetId = pick('assetId', ['assetId'], value => normalizeId(value), null);
  const currentHash = pick('currentHash', ['currentHash', 'hash'], normalizeHash, null);
  const provider = pick('provider', ['provider'], value => normalizeKey(value, DEFAULT_PROVIDER), DEFAULT_PROVIDER);
  const origin = pick('origin', ['origin'], value => normalizeKey(value, DEFAULT_ORIGIN), DEFAULT_ORIGIN);
  const remoteAssetId = pick('remoteAssetId', ['remoteAssetId'], value => normalizeId(value), null);
  const url = pick('url', ['url', 'remoteUrl'], normalizeRemoteUrl, null);
  const remoteKey = pick('remoteKey', ['remoteKey'], normalizeRemoteKey, null);
  const name = pick('name', ['name', 'remoteName'], value => normalizeText(value, 300) || null, null);
  const projectId = pick('projectId', ['projectId'], value => normalizeId(value), null);
  const taskId = pick('taskId', ['taskId'], value => normalizeId(value), null);
  const uploadBatchId = pick('uploadBatchId', ['uploadBatchId'], value => normalizeId(value), null);
  const matchMethod = pick(
    'matchMethod',
    ['matchMethod'],
    value => {
      const normalized = normalizeKey(value);
      return MATCH_METHODS.has(normalized) ? normalized : DEFAULT_MATCH_METHOD;
    },
    DEFAULT_MATCH_METHOD,
  );
  const status = pick(
    'status',
    ['status'],
    value => {
      const normalized = normalizeKey(value);
      return MAPPING_STATUSES.has(normalized) ? normalized : DEFAULT_STATUS;
    },
    DEFAULT_STATUS,
  );
  const createdAt = pick('createdAt', ['createdAt'], value => normalizeTimestamp(value, now), now);
  const updatedAt = pick('updatedAt', ['updatedAt'], value => normalizeTimestamp(value, now), now);

  return {
    mapping: {
      id: id || generatedId(options),
      assetId,
      currentHash,
      provider,
      origin,
      remoteAssetId,
      url,
      remoteKey,
      name,
      projectId,
      taskId,
      uploadBatchId,
      matchMethod,
      status,
      createdAt,
      updatedAt: Math.max(createdAt, updatedAt),
    },
    provided,
  };
}

function normalizeAIFlowMapping(input, options = {}) {
  const { mapping } = parseMappingInput(input, options);
  requireValidMapping(mapping);
  return mapping;
}

function sameNullable(left, right) {
  return (left || null) === (right || null);
}

function sameRemoteAsset(left, right) {
  // A provider ID is stronger than a public locator. Signed/CDN URLs can be
  // reused, so only fall back to the sanitized URL when either side has no ID.
  if (left.remoteAssetId && right.remoteAssetId) {
    return left.remoteAssetId === right.remoteAssetId;
  }
  if (left.remoteKey && right.remoteKey) {
    return left.remoteKey === right.remoteKey;
  }
  return Boolean(left.url && right.url && left.url === right.url);
}

/**
 * The key intentionally excludes origin, matchMethod and status: those describe
 * how a relation was observed, not a distinct asset-to-remote binding.
 */
function isExactBinding(left, right) {
  return left.provider === right.provider
    && left.assetId === right.assetId
    && left.currentHash === right.currentHash
    && sameRemoteAsset(left, right)
    && sameNullable(left.projectId, right.projectId)
    && sameNullable(left.taskId, right.taskId)
    && sameNullable(left.uploadBatchId, right.uploadBatchId);
}

function exactBindingKey(mapping) {
  const remote = mapping.remoteAssetId
    ? `id:${mapping.remoteAssetId}`
    : mapping.remoteKey
      ? `key:${mapping.remoteKey}`
      : `url:${mapping.url || ''}`;
  return [
    mapping.provider,
    mapping.assetId,
    mapping.currentHash,
    remote,
    mapping.projectId || '',
    mapping.taskId || '',
    mapping.uploadBatchId || '',
  ].join('\u001f');
}

function moreAuthoritativeMapping(left, right) {
  const leftPriority = STATUS_PRIORITY[left.status] || 0;
  const rightPriority = STATUS_PRIORITY[right.status] || 0;
  if (leftPriority !== rightPriority) return leftPriority > rightPriority ? left : right;
  if (left.updatedAt !== right.updatedAt) return left.updatedAt > right.updatedAt ? left : right;
  return String(left.id).localeCompare(String(right.id)) <= 0 ? left : right;
}

function mergeMappings(left, right, updatedAt = null) {
  const preferred = moreAuthoritativeMapping(left, right);
  const other = preferred === left ? right : left;
  const canonicalId = left.createdAt === right.createdAt
    ? (String(left.id).localeCompare(String(right.id)) <= 0 ? left.id : right.id)
    : (left.createdAt < right.createdAt ? left.id : right.id);
  return {
    ...other,
    ...preferred,
    id: canonicalId,
    remoteAssetId: preferred.remoteAssetId || other.remoteAssetId,
    url: preferred.url || other.url,
    remoteKey: preferred.remoteKey || other.remoteKey,
    name: preferred.name || other.name,
    createdAt: Math.min(preferred.createdAt, other.createdAt),
    updatedAt: Math.max(Number(updatedAt) || 0, preferred.updatedAt, other.updatedAt),
  };
}

function cloneMapping(mapping) {
  return { ...mapping };
}

function uniqueMappingId(candidate, used, options = {}) {
  let id = normalizeId(candidate, 128) || generatedId(options);
  // A test/integration id factory may be deterministic. Do not spin forever if
  // it happens to return an already-used value.
  for (let attempts = 0; used.has(id) && attempts < 3; attempts += 1) id = generatedId(options);
  while (used.has(id)) id = crypto.randomUUID();
  return id;
}

function normalizeAIFlowMappings(input, options = {}) {
  const source = Array.isArray(input)
    ? input
    : (isPlainObject(input) && Array.isArray(input.mappings) ? input.mappings : []);
  const now = resolveNow(options);
  const mappings = [];
  const usedIds = new Set();

  for (const entry of source) {
    let normalized;
    try {
      normalized = normalizeAIFlowMapping(entry, { ...options, now });
    } catch {
      // Corrupt or incomplete records must not make the local library unreadable.
      continue;
    }
    normalized.id = uniqueMappingId(normalized.id, usedIds, options);
    usedIds.add(normalized.id);
    const duplicateIndex = mappings.findIndex(item => isExactBinding(item, normalized));
    if (duplicateIndex >= 0) {
      mappings[duplicateIndex] = mergeMappings(mappings[duplicateIndex], normalized);
    } else {
      mappings.push(normalized);
    }
  }

  return { version: STORE_VERSION, mappings: mappings.map(cloneMapping) };
}

function createAIFlowMappings() {
  return { version: STORE_VERSION, mappings: [] };
}

function applyProvidedFields(base, patch, provided) {
  const merged = { ...base };
  for (const field of provided) {
    if (field === 'id' || field === 'createdAt' || field === 'updatedAt') continue;
    merged[field] = patch[field];
  }
  return merged;
}

function upsertAIFlowMapping(input, candidate, options = {}) {
  const now = resolveNow(options);
  const data = normalizeAIFlowMappings(input, { ...options, now });
  const { mapping: parsed, provided } = parseMappingInput(candidate, { ...options, now });
  requireValidMapping(parsed);
  const duplicateIndex = data.mappings.findIndex(item => isExactBinding(item, parsed));

  if (duplicateIndex >= 0) {
    const current = data.mappings[duplicateIndex];
    const mergedInput = applyProvidedFields(current, parsed, provided);
    const merged = normalizeAIFlowMapping(mergedInput, { ...options, now });
    merged.id = current.id;
    merged.createdAt = current.createdAt;
    merged.updatedAt = now;
    data.mappings[duplicateIndex] = merged;
    return { data, mapping: cloneMapping(merged), created: false, updated: true };
  }

  const mapping = normalizeAIFlowMapping(parsed, { ...options, now });
  mapping.id = uniqueMappingId(mapping.id, new Set(data.mappings.map(item => item.id)), options);
  mapping.createdAt = now;
  mapping.updatedAt = now;
  data.mappings.push(mapping);
  return { data, mapping: cloneMapping(mapping), created: true, updated: false };
}

function updateAIFlowMapping(input, mappingId, patch, options = {}) {
  const now = resolveNow(options);
  const data = normalizeAIFlowMappings(input, { ...options, now });
  const id = normalizeId(mappingId, 128);
  const index = data.mappings.findIndex(item => item.id === id);
  if (index < 0) return { data, mapping: null, updated: false, merged: false };

  const current = data.mappings[index];
  const { mapping: parsedPatch, provided } = parseMappingInput(patch, { ...options, now });
  const mergedInput = applyProvidedFields(current, parsedPatch, provided);
  const updated = normalizeAIFlowMapping(mergedInput, { ...options, now });
  updated.id = current.id;
  updated.createdAt = current.createdAt;
  updated.updatedAt = now;

  const duplicateIndex = data.mappings.findIndex((item, itemIndex) => itemIndex !== index && isExactBinding(item, updated));
  if (duplicateIndex >= 0) {
    const collapsed = mergeMappings(updated, data.mappings[duplicateIndex], now);
    // The caller explicitly edited this record, so preserve its public ID even
    // when an older duplicate is the canonical historical record.
    collapsed.id = updated.id;
    const next = data.mappings.filter((_, itemIndex) => itemIndex !== index && itemIndex !== duplicateIndex);
    next.splice(Math.min(index, duplicateIndex), 0, collapsed);
    data.mappings = next;
    return { data, mapping: cloneMapping(collapsed), updated: true, merged: true };
  }

  data.mappings[index] = updated;
  return { data, mapping: cloneMapping(updated), updated: true, merged: false };
}

function findAIFlowMappings(input, predicate) {
  const data = normalizeAIFlowMappings(input);
  return data.mappings.filter(predicate).map(cloneMapping);
}

function findAIFlowMappingsByAsset(input, assetId) {
  const id = normalizeId(assetId);
  return id ? findAIFlowMappings(input, mapping => mapping.assetId === id) : [];
}

function findAIFlowMappingsByTask(input, taskId) {
  const id = normalizeId(taskId);
  return id ? findAIFlowMappings(input, mapping => mapping.taskId === id) : [];
}

function findAIFlowMappingsByBatch(input, uploadBatchId) {
  const id = normalizeId(uploadBatchId);
  return id ? findAIFlowMappings(input, mapping => mapping.uploadBatchId === id) : [];
}

function findAIFlowMappingConflict(input, candidate, options = {}) {
  const data = normalizeAIFlowMappings(input, options);
  const mapping = normalizeAIFlowMapping(candidate, options);
  return data.mappings.find(item => (
    item.assetId !== mapping.assetId
    && item.status !== 'unlinked'
    && sameRemoteAsset(item, mapping)
  )) || null;
}

module.exports = {
  STORE_VERSION,
  DEFAULT_PROVIDER,
  DEFAULT_ORIGIN,
  DEFAULT_MATCH_METHOD,
  DEFAULT_STATUS,
  MATCH_METHODS,
  MAPPING_STATUSES,
  STATUS_PRIORITY,
  createAIFlowMappings,
  normalizeAIFlowMapping,
  normalizeAIFlowMappings,
  normalizeRemoteUrl,
  createRemoteLocatorKey,
  exactBindingKey,
  isExactBinding,
  upsertAIFlowMapping,
  updateAIFlowMapping,
  findAIFlowMappings,
  findAIFlowMappingsByAsset,
  findAIFlowMappingsByTask,
  findAIFlowMappingsByBatch,
  findAIFlowMappingConflict,
};
