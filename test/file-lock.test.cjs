const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { acquireLock, withLock, LOCK_FILE } = require('../electron/file-lock.cjs');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nest-lock-'));
const lockPath = root => path.join(root, LOCK_FILE);

test('acquire 后创建锁文件，release 后删除', async () => {
  const root = tmpDir();
  const release = await acquireLock(root);
  assert.ok(fs.existsSync(lockPath(root)), '锁文件应存在');
  await release();
  assert.ok(!fs.existsSync(lockPath(root)), 'release 后锁文件应删除');
});

test('互斥：持锁期间再次 acquire 会超时抛错', async () => {
  const root = tmpDir();
  const release = await acquireLock(root);
  await assert.rejects(
    () => acquireLock(root, { timeoutMs: 300, retryMs: 20 }),
    /正在被其他成员写入/,
    '第二个 acquire 应因锁被占用而失败',
  );
  await release();
});

test('release 幂等，可安全多次调用', async () => {
  const root = tmpDir();
  const release = await acquireLock(root);
  await release();
  await release();
  assert.ok(!fs.existsSync(lockPath(root)));
});

test('stale 锁（超过 staleMs）会被回收', async () => {
  const root = tmpDir();
  fs.writeFileSync(lockPath(root), JSON.stringify({ pid: 9999, at: Date.now() - 60000 }), 'utf8');
  const old = new Date(Date.now() - 60000);
  fs.utimesSync(lockPath(root), old, old);
  const release = await acquireLock(root, { staleMs: 1000, timeoutMs: 500 });
  assert.ok(fs.existsSync(lockPath(root)), '回收后应能重新抢到锁');
  await release();
});

test('withLock 在 fn 抛错时仍会释放锁', async () => {
  const root = tmpDir();
  await assert.rejects(
    () => withLock(root, async () => { throw new Error('boom'); }),
    /boom/,
  );
  assert.ok(!fs.existsSync(lockPath(root)), '抛错后锁必须释放');
});

test('withLock 正常返回 fn 的结果', async () => {
  const root = tmpDir();
  const result = await withLock(root, async () => 42);
  assert.strictEqual(result, 42);
  assert.ok(!fs.existsSync(lockPath(root)));
});

test('root 为空时 withLock 直接执行不锁', async () => {
  const result = await withLock(null, async () => 'no-lock');
  assert.strictEqual(result, 'no-lock');
});
