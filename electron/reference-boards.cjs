const MAX_BOARDS = 80;
const MAX_ITEMS = 1_000;
const MAX_GROUPS = 160;
const MAX_CONNECTIONS = 3_000;
const GROUP_COLORS = new Set(['#2f7dff', '#25b899', '#bd7aff', '#e4973d', '#dc6275', '#54a7d6']);

const text = (value, limit = 120) => String(value ?? "").trim().slice(0, limit);
const number = (value, fallback, min, max) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};
const timestamp = (value, fallback) => number(value, fallback, 0, 9_999_999_999_999);

function normalizeCamera(value = {}) {
  return {
    x: number(value.x, 0, -1_000_000, 1_000_000),
    y: number(value.y, 0, -1_000_000, 1_000_000),
    zoom: number(value.zoom, 1, 0.2, 3),
  };
}

function normalizeGroups(groups) {
  const usedGroupIds = new Set();
  const result = [];
  for (const [index, group] of (Array.isArray(groups) ? groups : []).entries()) {
    if (result.length >= MAX_GROUPS) break;
    const baseGroupId = text(group?.id, 180) || `group-${index + 1}`;
    let id = baseGroupId;
    let suffix = 2;
    while (usedGroupIds.has(id)) id = `${baseGroupId}-${suffix++}`.slice(0, 200);
    usedGroupIds.add(id);
    const color = String(group?.color || '').toLowerCase();
    result.push({
      id,
      name: text(group?.name, 80) || `分组 ${result.length + 1}`,
      x: number(group?.x, 0, -100_000, 100_000),
      y: number(group?.y, 0, -100_000, 100_000),
      width: number(group?.width, 360, 220, 8_000),
      height: number(group?.height, 220, 140, 8_000),
      color: GROUP_COLORS.has(color) ? color : '#2f7dff',
      zIndex: number(group?.zIndex, index, -100_000, 0),
    });
  }
  return result;
}

function normalizeItems(items, knownAssetIds, knownGroupIds = new Set()) {
  const usedNodeIds = new Set();
  const result = [];
  for (const [index, item] of (Array.isArray(items) ? items : []).entries()) {
    if (result.length >= MAX_ITEMS) break;
    const assetId = text(item?.assetId, 160);
    if (!assetId || !knownAssetIds.has(assetId)) continue;
    const baseNodeId = text(item?.id, 180) || `asset-${assetId}-${index + 1}`;
    let id = baseNodeId;
    let suffix = 2;
    while (usedNodeIds.has(id)) id = `${baseNodeId}-${suffix++}`.slice(0, 200);
    usedNodeIds.add(id);
    result.push({
      id,
      assetId,
      x: number(item?.x, 0, -100_000, 100_000),
      y: number(item?.y, 0, -100_000, 100_000),
      width: number(item?.width, 260, 150, 900),
      rotation: number(item?.rotation, 0, -180, 180),
      zIndex: number(item?.zIndex, index + 1, 0, 100_000),
      note: text(item?.note, 1_000),
      locked: Boolean(item?.locked),
      groupId: knownGroupIds.has(text(item?.groupId, 180)) ? text(item?.groupId, 180) : '',
    });
  }
  return result;
}

function normalizeConnections(connections, knownNodeIds) {
  const usedIds = new Set();
  const usedPairs = new Set();
  const result = [];
  for (const [index, connection] of (Array.isArray(connections) ? connections : []).entries()) {
    if (result.length >= MAX_CONNECTIONS) break;
    const fromId = text(connection?.fromId, 180);
    const toId = text(connection?.toId, 180);
    if (!fromId || !toId || fromId === toId || !knownNodeIds.has(fromId) || !knownNodeIds.has(toId)) continue;
    const pair = [fromId, toId].sort().join('\u0000');
    if (usedPairs.has(pair)) continue;
    usedPairs.add(pair);
    const baseId = text(connection?.id, 180) || `connection-${index + 1}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`.slice(0, 200);
    usedIds.add(id);
    result.push({ id, fromId, toId });
  }
  return result;
}

function normalizeReferenceBoard(input = {}, knownAssetIds = new Set(), options = {}) {
  const now = Number(options.now) || Date.now();
  const groups = normalizeGroups(input.groups);
  const items = normalizeItems(input.items, knownAssetIds, new Set(groups.map(group => group.id)));
  return {
    id: text(input.id || options.fallbackId, 180) || "reference-board",
    name: text(input.name || options.fallbackName || "未命名参考板", 80) || "未命名参考板",
    camera: normalizeCamera(input.camera),
    groups,
    items,
    connections: normalizeConnections(input.connections, new Set(items.map(item => item.id))),
    createdAt: timestamp(input.createdAt, now),
    updatedAt: timestamp(input.updatedAt, now),
  };
}

function normalizeReferenceBoards(boards, assets) {
  const knownAssetIds = new Set((Array.isArray(assets) ? assets : []).map(asset => text(asset?.id, 160)).filter(Boolean));
  const usedBoardIds = new Set();
  const result = [];
  for (const [index, board] of (Array.isArray(boards) ? boards : []).entries()) {
    if (result.length >= MAX_BOARDS) break;
    const normalized = normalizeReferenceBoard(board, knownAssetIds, { fallbackId: `reference-board-${index + 1}` });
    if (usedBoardIds.has(normalized.id)) continue;
    usedBoardIds.add(normalized.id);
    result.push(normalized);
  }
  return result;
}

function createReferenceBoard(input = {}, assets = [], options = {}) {
  const now = Number(options.now) || Date.now();
  const id = text(options.id, 180);
  if (!id) throw new Error("参考板 ID 无效");
  const knownAssetIds = new Set((Array.isArray(assets) ? assets : []).map(asset => text(asset?.id, 160)).filter(Boolean));
  const assetIds = [...new Set((Array.isArray(input.assetIds) ? input.assetIds : []).map(value => text(value, 160)).filter(value => knownAssetIds.has(value)))];
  const items = assetIds.map((assetId, index) => ({
    id: `${id}-item-${index + 1}`,
    assetId,
    x: (index % 3) * 300,
    y: Math.floor(index / 3) * 235,
    width: 260,
    zIndex: index + 1,
  }));
  return normalizeReferenceBoard({ id, name: input.name, groups: [], items, connections: [], createdAt: now, updatedAt: now }, knownAssetIds, { now, fallbackId: id, fallbackName: "新参考板" });
}

function updateReferenceBoard(current, changes = {}, assets = [], options = {}) {
  if (!current) return null;
  const now = Number(options.now) || Date.now();
  const knownAssetIds = new Set((Array.isArray(assets) ? assets : []).map(asset => text(asset?.id, 160)).filter(Boolean));
  const candidate = {
    ...current,
    ...(Object.prototype.hasOwnProperty.call(changes, "name") ? { name: changes.name } : {}),
    ...(Object.prototype.hasOwnProperty.call(changes, "camera") ? { camera: changes.camera } : {}),
    ...(Object.prototype.hasOwnProperty.call(changes, "groups") ? { groups: changes.groups } : {}),
    ...(Object.prototype.hasOwnProperty.call(changes, "items") ? { items: changes.items } : {}),
    ...(Object.prototype.hasOwnProperty.call(changes, "connections") ? { connections: changes.connections } : {}),
    updatedAt: now,
  };
  return normalizeReferenceBoard(candidate, knownAssetIds, { now, fallbackId: current.id, fallbackName: current.name });
}

module.exports = {
  createReferenceBoard,
  normalizeReferenceBoards,
  updateReferenceBoard,
};
