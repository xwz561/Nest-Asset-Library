// 跨进程写锁：保证多个客户端同时写同一份 NAS 库时互斥。
// 锁文件放在库目录下，随库共享；用 O_EXCL ('wx') 独占创建，stale 锁按 mtime 超时回收。
const fs = require('fs');
const os = require('os');
const path = require('path');

const LOCK_FILE = '.nest-lock';
const DEFAULT_STALE_MS = 30000;
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRY_MS = 50;

// 抢占锁；成功返回一个异步 release 函数（幂等）。
async function acquireLock(root, { staleMs = DEFAULT_STALE_MS, timeoutMs = DEFAULT_TIMEOUT_MS, retryMs = DEFAULT_RETRY_MS } = {}) {
  const lockPath = path.join(root, LOCK_FILE);
  const started = Date.now();
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    try { await fs.promises.rm(lockPath, { force: true }); } catch {}
  };
  for (;;) {
    try {
      const handle = await fs.promises.open(lockPath, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, host: os.hostname(), at: Date.now() }), 'utf8');
      await handle.close();
      return release;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let stale = false;
      try { const stat = await fs.promises.stat(lockPath); stale = Date.now() - stat.mtimeMs > staleMs; }
      catch { stale = true; }
      if (stale) { try { await fs.promises.rm(lockPath, { force: true }); } catch {} continue; }
      if (Date.now() - started > timeoutMs) throw new Error('资源库正在被其他成员写入，请稍后重试');
      await new Promise(resolve => setTimeout(resolve, retryMs));
    }
  }
}

// 在锁内执行 fn，无论成功失败都释放锁。
async function withLock(root, fn, options) {
  if (!root) return fn();
  const release = await acquireLock(root, options);
  try { return await fn(); }
  finally { await release(); }
}

module.exports = { acquireLock, withLock, LOCK_FILE, DEFAULT_STALE_MS, DEFAULT_TIMEOUT_MS };
