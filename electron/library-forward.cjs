// 把一个素材库里的素材/文件夹“转发”（复制）到另一个素材库。
// 只读取来源库、只往目标库写入；任何情况下都不会修改或删除来源库的内容。
// 流程：① 不加锁地把文件复制进目标库的物理目录（大文件不会长时间占住写锁）；
//       ② 短暂持有目标库写锁，重读最新索引，创建文件夹、去重、追加素材记录并写回。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { withLock } = require('./file-lock.cjs');
const { atomicWriteJson, readJson } = require('./json-storage.cjs');
const { physicalAssetPath, buildFolderPartsMap } = require('./physical-folders.cjs');
const { chooseNextReadableFilename } = require('./asset-filenames.cjs');
const { safeName } = require('./drag-export.cjs');

const ROLE_LEVEL = { viewer: 1, editor: 2, admin: 3, owner: 4 };
const defaultIndexFile = root => path.join(root, '.nest-library.json');

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256'); const stream = fs.createReadStream(file);
    stream.on('data', chunk => hash.update(chunk)); stream.on('error', reject); stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function subtreeIds(folders, rootId) {
  const children = new Map();
  for (const folder of folders) { const key = folder.parentId || ''; if (!children.has(key)) children.set(key, []); children.get(key).push(folder); }
  const ids = [], seen = new Set(), stack = [rootId];
  while (stack.length) { const id = stack.pop(); if (seen.has(id)) continue; seen.add(id); ids.push(id); for (const child of children.get(id) || []) stack.push(child.id); }
  return ids;
}

function roleIn(data, profileId) {
  const member = data?.team?.members?.find(item => item.id === profileId);
  if (!member) return data?.team ? null : 'editor';
  return member.id === data.team.ownerId ? 'owner' : member.role;
}

const cleanName = value => String(value || '').trim().slice(0, 50) || '未命名文件夹';

// 目标库里的“文件夹信息”，给界面选择目标文件夹用
function describeLibrary(root, me, indexFile = defaultIndexFile) {
  const data = readJson(indexFile(root));
  if (!data) return { error: '目标素材库不可用' };
  const folders = Array.isArray(data.folders) ? data.folders : [];
  const parts = buildFolderPartsMap(folders);
  const role = roleIn(data, me?.id);
  // 还不是成员时，打开/转发会自动加入（除非被移除过，或默认角色是仅查看）
  const joinable = !role && Boolean(data.team) && !(Array.isArray(data.team.removedIds) && data.team.removedIds.includes(me?.id)) && data.team.defaultRole !== 'viewer';
  return {
    name: String(data.name || path.basename(root)),
    canEdit: Boolean(role ? ROLE_LEVEL[role] >= ROLE_LEVEL.editor : joinable),
    role,
    folders: folders.map(folder => ({ id: folder.id, name: folder.name, parentId: folder.parentId || null, path: (parts.get(folder.id) || [folder.name]).join(' / ') })),
  };
}

async function forwardToLibrary({ sourceRoot, targetRoot, assetIds = [], folderIds = [], targetFolderId = null, me, join, onProgress, signal, indexFile = defaultIndexFile, lockOptions }) {
  if (!sourceRoot || !targetRoot) return { error: '请选择目标素材库' };
  if (path.resolve(sourceRoot).toLowerCase() === path.resolve(targetRoot).toLowerCase()) return { error: '不能转发到当前素材库自己' };
  const source = readJson(indexFile(sourceRoot));
  if (!source) return { error: '当前素材库不可用' };
  if (!fs.existsSync(indexFile(targetRoot))) return { error: '目标素材库已移动或不可用' };
  if (typeof join === 'function') await join(targetRoot);

  const sourceFolders = Array.isArray(source.folders) ? source.folders : [];
  const sourceAssets = (Array.isArray(source.assets) ? source.assets : []).filter(asset => asset && asset.file && !asset.trashedAt);
  const folderById = new Map(sourceFolders.map(folder => [folder.id, folder]));

  // ① 规划：每个素材要落在目标库的哪个相对文件夹路径（名字数组）
  const folderPathOf = (folderId, rootFolderId) => {
    const parts = []; const guard = new Set();
    for (let current = folderById.get(folderId); current && !guard.has(current.id); current = folderById.get(current.parentId)) {
      guard.add(current.id); parts.unshift(cleanName(current.name));
      if (current.id === rootFolderId) break;
    }
    return parts;
  };
  const planned = new Map();   // assetId -> { asset, parts }
  const folderPlans = new Map(); // key(parts.join) -> parts（含空文件夹，保留结构）
  for (const rootId of folderIds) {
    if (!folderById.has(rootId)) continue;
    for (const folderId of subtreeIds(sourceFolders, rootId)) {
      const parts = folderPathOf(folderId, rootId);
      folderPlans.set(parts.join('\u0000'), parts);
      for (const asset of sourceAssets) if (asset.folderId === folderId && !planned.has(asset.id)) planned.set(asset.id, { asset, parts });
    }
  }
  const wanted = new Set(assetIds);
  for (const asset of sourceAssets) if (wanted.has(asset.id) && !planned.has(asset.id)) planned.set(asset.id, { asset, parts: [] });
  if (!planned.size && !folderPlans.size) return { error: '没有可转发的素材' };

  const snapshot = readJson(indexFile(targetRoot));
  const earlyRole = roleIn(snapshot, me?.id);
  if (!earlyRole || ROLE_LEVEL[earlyRole] < ROLE_LEVEL.editor) return { error: '你在目标素材库里没有编辑权限' };
  const targetFolders0 = Array.isArray(snapshot?.folders) ? snapshot.folders : [];
  if (targetFolderId && !targetFolders0.some(folder => folder.id === targetFolderId)) return { error: '目标文件夹不存在或已被删除' };
  const basePartsMap = buildFolderPartsMap(targetFolders0);
  const baseParts = targetFolderId ? (basePartsMap.get(targetFolderId) || []) : [];
  const assetsRoot = path.join(targetRoot, 'assets');
  const hashed = new Map();
  const seenHash = new Set((snapshot?.assets || []).filter(a => a && !a.trashedAt && a.hash).map(a => `${a.folderId || ''}\u0000${a.hash}`));
  const occupied = new Set((snapshot?.assets || []).filter(a => a?.file).map(a => path.basename(a.file).toLowerCase()));

  // ② 复制文件（不加锁）
  const errors = []; const copied = []; let duplicates = 0, processed = 0;
  const total = planned.size;
  const report = () => onProgress?.({ phase: 'copying', processed, total, copied: copied.length, duplicates });
  report();
  for (const { asset, parts } of planned.values()) {
    if (signal?.aborted) break;
    try {
      const from = physicalAssetPath(sourceRoot, asset.file);
      if (!fs.existsSync(from)) throw new Error('来源文件不存在');
      const hash = asset.hash || await hashFile(from);
      hashed.set(asset.id, hash);
      const destParts = [...baseParts, ...parts.map(part => safeName(part, '未命名文件夹'))];
      const destKeyFolder = `${destParts.join('\u0000')}`; // 仅用于同一批内的去重键
      const batchKey = `batch\u0000${destKeyFolder}\u0000${hash}`;
      // 目标库里同一文件夹已有同内容：跳过（只在目标文件夹已存在时才能判断）
      const existingFolder = findFolderByParts(targetFolders0, basePartsMap, destParts);
      if (seenHash.has(`${existingFolder?.id || ''}\u0000${hash}`) && (existingFolder || !destParts.length) || seenHash.has(batchKey)) { duplicates++; continue; }
      seenHash.add(batchKey);
      const directory = path.join(assetsRoot, ...destParts);
      await fs.promises.mkdir(directory, { recursive: true });
      const ext = path.extname(from).toLowerCase();
      let destination = null;
      for (let attempt = 0; attempt < 50 && !destination; attempt += 1) {
        const filename = chooseNextReadableFilename(occupied, asset.name || path.basename(from, ext), ext);
        occupied.add(filename.toLowerCase());
        const candidate = path.join(directory, filename);
        try { await fs.promises.copyFile(from, candidate, fs.constants.COPYFILE_EXCL); destination = candidate; }
        catch (error) { if (error.code !== 'EEXIST') { await fs.promises.rm(candidate, { force: true }).catch(() => {}); throw error; } }
      }
      if (!destination) throw new Error('无法生成不重名的文件名');
      copied.push({ asset, parts, hash, relative: path.relative(assetsRoot, destination).replace(/\\/g, '/'), destParts });
    } catch (error) {
      errors.push(`${asset.name || asset.file}: ${error.message}`);
    } finally { processed += 1; report(); }
  }

  // ③ 写索引（持有目标库写锁，重读最新内容）
  let outcome;
  try {
    outcome = await withLock(targetRoot, () => {
      const target = readJson(indexFile(targetRoot));
      if (!target) throw new Error('目标素材库索引不可用');
      const role = roleIn(target, me?.id);
      if (!role || ROLE_LEVEL[role] < ROLE_LEVEL.editor) throw new Error('你在目标素材库里没有编辑权限');
      target.folders = Array.isArray(target.folders) ? target.folders : [];
      target.assets = Array.isArray(target.assets) ? target.assets : [];
      target.tags = Array.isArray(target.tags) ? target.tags : [];
      if (targetFolderId && !target.folders.some(folder => folder.id === targetFolderId)) throw new Error('目标文件夹已被删除');
      let foldersCreated = 0;
      const ensureFolder = parts => {
        let parentId = targetFolderId || null;
        for (const name of parts) {
          let folder = target.folders.find(item => item.name === name && (item.parentId || null) === parentId);
          if (!folder) { folder = { id: crypto.randomUUID(), name, parentId, icon: 'folder', color: '#8f98a3', createdAt: Date.now() }; target.folders.push(folder); foldersCreated += 1; }
          parentId = folder.id;
        }
        return parentId;
      };
      for (const parts of folderPlans.values()) ensureFolder(parts.map(cleanName));
      const known = new Set(target.assets.filter(a => a && !a.trashedAt && a.hash).map(a => `${a.folderId || ''}\u0000${a.hash}`));
      const added = []; const lateDuplicates = [];
      for (const item of copied) {
        const folderId = ensureFolder(item.parts.map(cleanName));
        const key = `${folderId || ''}\u0000${item.hash}`;
        if (known.has(key)) { lateDuplicates.push(item); continue; }
        known.add(key);
        const clone = JSON.parse(JSON.stringify(item.asset));
        delete clone.trashedAt; delete clone.deletedAt;
        const asset = {
          ...clone, id: crypto.randomUUID(), file: item.relative, folderId, hash: item.hash,
          createdAt: Date.now(), modifiedAt: Date.now(),
          importSource: { provider: '素材库转发', sourceLibrary: String(source.name || path.basename(sourceRoot)), forwardedAt: Date.now() },
        };
        for (const tag of Array.isArray(asset.tags) ? asset.tags : []) if (!target.tags.includes(tag)) target.tags.push(tag);
        added.push(asset);
      }
      target.assets = [...added.reverse(), ...target.assets];
      atomicWriteJson(indexFile(targetRoot), target);
      return { added: added.length, foldersCreated, lateDuplicates, targetName: String(target.name || path.basename(targetRoot)) };
    }, lockOptions);
  } catch (error) {
    // 写索引失败：已复制进目标库 assets 的文件没有记录，是本次新建的孤儿，清理掉自己刚复制的文件
    for (const item of copied) await fs.promises.rm(path.join(assetsRoot, item.relative), { force: true }).catch(() => {});
    return { error: error.message, copied: 0, duplicates, errors };
  }
  // 极少数情况：复制期间别人刚好导入了同内容。清理自己刚复制的这几份。
  for (const item of outcome.lateDuplicates) { await fs.promises.rm(path.join(assetsRoot, item.relative), { force: true }).catch(() => {}); duplicates++; }
  onProgress?.({ phase: 'complete', processed, total, copied: outcome.added, duplicates });
  return { ok: true, copied: outcome.added, duplicates, foldersCreated: outcome.foldersCreated, errors, targetName: outcome.targetName, cancelled: Boolean(signal?.aborted) };
}

function findFolderByParts(folders, partsMap, parts) {
  if (!parts.length) return null;
  const key = parts.join('\u0000').toLowerCase();
  return folders.find(folder => (partsMap.get(folder.id) || []).join('\u0000').toLowerCase() === key) || null;
}

module.exports = { forwardToLibrary, describeLibrary, subtreeIds };
