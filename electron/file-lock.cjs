// 跨进程写锁：保证多个客户端同时写同一份 NAS 库时互斥。
// 锁文件放在库目录下，随库共享；用 O_EXCL ('wx') 独占创建，stale 锁按 mtime 超时回收。
//
// 可靠性要点：
//  1. 每把锁带唯一 token；release 只会删除“仍然是自己的”锁，避免锁被他人回收后误删新持有者的锁。
//  2. 持锁期间定时刷新 mtime（心跳），长时间操作不会被其他成员误判为过期锁。
//  3. 回收过期锁先用 rename 原子“认领”，同一时刻只有一个等待者能成功，且认领后会复核是否真的过期。
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const LOCK_FILE = '.nest-lock';
const DEFAULT_STALE_MS = 30000;
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRY_MS = 50;

async function readLockToken(lockPath) {
  try { return JSON.parse(await fs.promises.readFile(lockPath, 'utf8')).token || null; }
  catch { return null; }
}

// 尝试回收过期锁。返回 true 表示锁文件已被清走（可立即重试抢锁）。
async function reclaimStaleLock(lockPath, staleMs) {
  const claimed = `${lockPath}.stale-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  try { await fs.promises.rename(lockPath, claimed); }
  catch (error) { return error.code === 'ENOENT'; } // 已被别人清走或释放，直接重试
  try {
    const stat = await fs.promises.stat(claimed);
    if (Date.now() - stat.mtimeMs > staleMs) return true; // 确实过期：丢弃
    // 认领到的其实是刚被他人重新创建的新鲜锁：尽力放回原处（link 在目标已存在时会失败，不会覆盖）。
    try { await fs.promises.link(claimed, lockPath); } catch {}
    return false;
  } catch {
    return true;
  } finally {
    try { await fs.promises.rm(claimed, { force: true }); } catch {}
  }
}

// 抢占锁；成功返回一个异步 release 函数（幂等）。
async function acquireLock(root, { staleMs = DEFAULT_STALE_MS, timeoutMs = DEFAULT_TIMEOUT_MS, retryMs = DEFAULT_RETRY_MS, heartbeatMs } = {}) {
  const lockPath = path.join(root, LOCK_FILE);
  const started = Date.now();
  const token = crypto.randomUUID();
  const beatEvery = heartbeatMs === undefined ? Math.max(200, Math.floor(staleMs / 3)) : heartbeatMs;
  for (;;) {
    try {
      const handle = await fs.promises.open(lockPath, 'wx');
      try { await handle.writeFile(JSON.stringify({ pid: process.pid, host: os.hostname(), token, at: Date.now() }), 'utf8'); }
      finally { await handle.close(); }
      let released = false, timer = null;
      if (beatEvery > 0) {
        timer = setInterval(async () => {
          if (released) return;
          try { if (await readLockToken(lockPath) === token) { const now = new Date(); await fs.promises.utimes(lockPath, now, now); } } catch {}
        }, beatEvery);
        timer.unref?.();
      }
      return async () => {
        if (released) return;
        released = true;
        if (timer) clearInterval(timer);
        try { if (await readLockToken(lockPath) === token) await fs.promises.rm(lockPath, { force: true }); } catch {}
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let stale = false;
      try { const stat = await fs.promises.stat(lockPath); stale = Date.now() - stat.mtimeMs > staleMs; }
      catch { continue; } // 锁刚好被释放，立即重试
      if (stale && await reclaimStaleLock(lockPath, staleMs)) continue;
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
