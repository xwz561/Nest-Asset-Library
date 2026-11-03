const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { folderParts, physicalAssetPath } = require('./physical-folders.cjs');
const { safeName } = require('./drag-export.cjs');

function receiveFolder(data, senderId, senderName) {
  data.folders ||= [];
  let root = data.folders.find(folder => folder.lanReceiveRoot) || data.folders.find(folder => folder.name === '接收文件' && !folder.parentId);
  if (!root) { root = { id: crypto.randomUUID(), name: '接收文件', parentId: null, icon: 'folder', color: '#18b795', createdAt: Date.now() }; data.folders.push(root); }
  root.lanReceiveRoot = true;
  let sender = data.folders.find(folder => folder.parentId === root.id && folder.lanSenderId === senderId);
  if (!sender) {
    const base = safeName(senderName, '素材库用户').slice(0, 45); let name = base, number = 2;
    while (data.folders.some(folder => folder.parentId === root.id && folder.name.toLowerCase() === name.toLowerCase())) name = `${base} (${number++})`;
    sender = { id: crypto.randomUUID(), name, parentId: root.id, lanSenderId: senderId, icon: 'folder', color: '#18b795', createdAt: Date.now() }; data.folders.push(sender);
  }
  sender.lanSenderName = senderName;
  return sender;
}

async function archiveReceivedFile({ root, data, message, senderName, writeIndex, typeForFile = () => 'application/octet-stream', extractText }) {
  const folder = receiveFolder(data, message.from, senderName);
  const relativeDirectory = folderParts(data.folders, folder.id), directory = path.join(root, 'assets', ...relativeDirectory);
  fs.mkdirSync(directory, { recursive: true });
  const existing = data.assets.find(asset => !asset.trashedAt && asset.folderId === folder.id && asset.hash && asset.hash === message.file.sha256);
  if (existing && fs.existsSync(physicalAssetPath(root, existing.file))) {
    await writeIndex(data);
    return { libraryPath: root, libraryName: data.name || path.basename(root), assetId: existing.id, relativePath: existing.file };
  }
  const original = safeName(message.file.name, '附件'), extension = path.extname(original), base = original.slice(0, -extension.length || undefined);
  let name = original, number = 2;
  const occupied = new Set(data.assets.map(asset => String(asset.file || '').toLowerCase()));
  while (fs.existsSync(path.join(directory, name)) || occupied.has([...relativeDirectory, name].join('/').toLowerCase())) name = `${base} (${number++})${extension}`;
  const target = path.join(directory, name), temporary = path.join(directory, `.${crypto.randomUUID()}.receive-part`);
  const relativePath = path.relative(path.join(root, 'assets'), target).replace(/\\/g, '/');
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) throw new Error('接收目录无效');
  let asset, ownsTarget = false;
  try {
    await pipeline(fs.createReadStream(message.localPath), fs.createWriteStream(temporary, { flags: 'wx' }));
    if (fs.statSync(temporary).size !== message.file.size) throw new Error('接收文件未完整写入素材库');
    await fs.promises.rename(temporary, target);
    ownsTarget = true;
    let documentText = '';
    if (extractText) { try { documentText = await extractText(target); } catch {} }
    asset = { id: crypto.randomUUID(), name: path.basename(name, extension), file: relativePath, originalName: message.file.name, type: typeForFile(name), size: message.file.size, width: 0, height: 0, folderId: folder.id, hash: message.file.sha256 || '', tags: [], favorite: false, note: '', rating: 0, documentText, documentFormat: documentText ? extension.slice(1).toUpperCase() : '', createdAt: Date.now(), modifiedAt: Date.now(), importSource: { provider: '局域网好友', peerId: message.from, senderName, messageId: message.id, receivedAt: message.time } };
    data.assets.unshift(asset); await writeIndex(data);
    return { libraryPath: root, libraryName: data.name || path.basename(root), assetId: asset.id, relativePath };
  } catch (error) { if (asset) data.assets = data.assets.filter(item => item.id !== asset.id); await fs.promises.rm(temporary, { force: true }); if (ownsTarget) await fs.promises.rm(target, { force: true }); throw error; }
}
module.exports = { receiveFolder, archiveReceivedFile };
