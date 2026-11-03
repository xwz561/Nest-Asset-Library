const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { receiveFolder, archiveReceivedFile } = require('../electron/received-files.cjs');
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-receive-test-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const data = { name: '隔离素材库', folders: [], assets: [] }, cache = path.join(root, 'cache'); fs.writeFileSync(cache, '附件内容');
  const message = { id: crypto.randomUUID(), from: 'friend-one', time: Date.now(), localPath: cache, file: { id: crypto.randomUUID(), name: '素材.txt', size: fs.statSync(cache).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(cache)).digest('hex') } };
  return { root, data, message, senderName: '小旺仔', writeIndex: value => fs.writeFileSync(path.join(root, '.nest-library.json'), JSON.stringify(value)) };
}
test('received files create per-sender directories and are immediately indexed with provenance', async t => {
  const context = setup(t); const result = await archiveReceivedFile({ ...context, typeForFile: () => 'text/plain', extractText: filename => fs.readFileSync(filename, 'utf8') });
  assert.equal(result.relativePath, '接收文件/小旺仔/素材.txt'); assert.equal(fs.readFileSync(path.join(context.root, 'assets', result.relativePath), 'utf8'), '附件内容');
  const saved = JSON.parse(fs.readFileSync(path.join(context.root, '.nest-library.json'), 'utf8')); assert.equal(saved.assets.length, 1); assert.equal(saved.assets[0].id, result.assetId); assert.equal(saved.assets[0].documentText, '附件内容'); assert.equal(saved.assets[0].importSource.peerId, 'friend-one');
  assert.equal(fs.existsSync(context.message.localPath), true, 'runtime deletes cache only after persisting the archive receipt');
});
test('same sender has one folder after nickname change; same nickname across devices stays separate', () => {
  const data = { folders: [] }; const first = receiveFolder(data, 'one', '昵称'); const renamed = receiveFolder(data, 'one', '新昵称'); const second = receiveFolder(data, 'two', '昵称');
  assert.equal(first.id, renamed.id); assert.equal(renamed.lanSenderName, '新昵称'); assert.notEqual(first.id, second.id); assert.equal(second.name, '昵称 (2)'); assert.equal(data.folders.length, 3);
});
test('duplicates reuse the sender asset; different bytes with same filename receive a suffix', async t => {
  const context = setup(t); const first = await archiveReceivedFile(context), repeated = await archiveReceivedFile(context); assert.equal(first.assetId, repeated.assetId); assert.equal(context.data.assets.length, 1);
  fs.writeFileSync(context.message.localPath, '不同内容'); context.message.file.sha256 = crypto.createHash('sha256').update(fs.readFileSync(context.message.localPath)).digest('hex'); context.message.file.size = fs.statSync(context.message.localPath).size;
  const second = await archiveReceivedFile(context); assert.equal(second.relativePath, '接收文件/小旺仔/素材 (2).txt'); assert.equal(context.data.assets.length, 2);
});
test('names cannot escape the library and failed index commits preserve cached bytes', async t => {
  const context = setup(t); context.senderName = '../坏名字'; context.message.file.name = '../../附件.txt';
  await assert.rejects(archiveReceivedFile({ ...context, writeIndex: () => { throw new Error('disk failure'); } }), /disk failure/);
  assert.equal(context.data.assets.length, 0); assert.equal(fs.readFileSync(context.message.localPath, 'utf8'), '附件内容');
  const entries = fs.readdirSync(path.join(context.root, 'assets/接收文件'), { recursive: true }); assert.ok(entries.every(entry => !entry.endsWith('.txt') && !entry.endsWith('.receive-part')));
});
test('incomplete cache fails before indexing, while text extraction failure still preserves the file', async t => {
  const context = setup(t); context.message.file.size++;
  await assert.rejects(archiveReceivedFile(context), /未完整/); assert.equal(context.data.assets.length, 0); context.message.file.size--;
  const result = await archiveReceivedFile({ ...context, extractText: async () => { throw new Error('unsupported'); } }); assert.equal(context.data.assets.length, 1); assert.ok(fs.existsSync(path.join(context.root, 'assets', result.relativePath)));
});
