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

test('旧持有者的 release 不会删掉已被他人回收后重新持有的锁', async () => {
  const root = tmpDir();
  const releaseOld = await acquireLock(root, { staleMs: 1000, heartbeatMs: 0 });
  const old = new Date(Date.now() - 60000);
  fs.utimesSync(lockPath(root), old, old); // 模拟旧持有者卡住，锁已过期
  const releaseNew = await acquireLock(root, { staleMs: 1000, timeoutMs: 500 });
  await releaseOld(); // 旧持有者迟到的释放
  assert.ok(fs.existsSync(lockPath(root)), '新持有者的锁不能被旧持有者误删');
  await assert.rejects(() => acquireLock(root, { timeoutMs: 200, retryMs: 20 }), /正在被其他成员写入/);
  await releaseNew();
  assert.ok(!fs.existsSync(lockPath(root)));
});

test('持锁时间超过 staleMs 时有心跳续期，不会被他人当作过期锁抢走', async () => {
  const root = tmpDir();
  const release = await acquireLock(root, { staleMs: 600, heartbeatMs: 100 });
  await new Promise(resolve => setTimeout(resolve, 1500));
  await assert.rejects(() => acquireLock(root, { staleMs: 600, timeoutMs: 200, retryMs: 20 }), /正在被其他成员写入/);
  await release();
});

test('多个等待者同时回收同一把过期锁时，只有一个能拿到锁', async () => {
  const root = tmpDir();
  fs.writeFileSync(lockPath(root), JSON.stringify({ pid: 1, token: 'dead', at: 0 }), 'utf8');
  const old = new Date(Date.now() - 60000);
  fs.utimesSync(lockPath(root), old, old);
  let holders = 0, maxHolders = 0, done = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    const release = await acquireLock(root, { staleMs: 1000, timeoutMs: 5000, retryMs: 5, heartbeatMs: 0 });
    holders++; maxHolders = Math.max(maxHolders, holders);
    await new Promise(resolve => setTimeout(resolve, 20));
    holders--; done++;
    await release();
  }));
  assert.strictEqual(done, 8);
  assert.strictEqual(maxHolders, 1, '任何时刻只能有一个持锁者');
  assert.ok(!fs.existsSync(lockPath(root)));
});
