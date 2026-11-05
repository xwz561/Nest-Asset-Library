(function exposeConnectionState(root) {
  'use strict';

  const OFFLINE = Object.freeze({
    state: 'offline',
    label: '小旺仔素材库没有打开',
    detail: '本机桥接当前不可用。',
  });
  const UNPAIRED = Object.freeze({
    state: 'unpaired',
    label: '需要重新配对',
    detail: '桌面端已打开，但浏览器扩展密钥不匹配。',
  });
  const CONNECTED = Object.freeze({
    state: 'connected',
    label: '已连接',
    detail: '浏览器扩展已连接到小旺仔素材库。',
  });
  const NOTICE_COOLDOWN_MS = 10 * 60 * 1000;
  const RETRY_BASE_MS = 15 * 1000;
  const RETRY_MAX_MS = 2 * 60 * 1000;
  const PAIRING_MARKER = '浏览器采集扩展未配对';

  function bodyText(body) {
    if (typeof body === 'string') return body;
    if (!body || typeof body !== 'object') return '';
    return [body.error, body.message, body.detail].filter(Boolean).join(' ');
  }

  function classifyConnection(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const explicitState = String(source.state || source.connection?.state || '').toLowerCase();
    if (explicitState === 'connected' || explicitState === 'online') return { ...CONNECTED };
    if (explicitState === 'unpaired') return { ...UNPAIRED };
    if (explicitState === 'offline' || explicitState === 'disconnected' || explicitState === 'unavailable') return { ...OFFLINE };

    const error = source.error;
    const errorCode = String(error?.code || source.code || '');
    const message = bodyText(source.body ?? source.response ?? source.message)
      || bodyText(error)
      || String(error || '');
    const status = Number(source.status ?? source.httpStatus ?? error?.status ?? 0);

    if (message.includes(PAIRING_MARKER)) return { ...UNPAIRED };
    if (source.ready === false || source.body?.ready === false) return { ...OFFLINE };
    if (errorCode === 'NEST_BRIDGE_UNAVAILABLE'
      || /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|failed to fetch|networkerror|fetch failed/i.test(`${errorCode} ${message}`)
      || /请先启动小旺仔素材库并打开资源库|请先打开资源库|当前没有.*素材库|素材库正在删除/.test(message)) {
      return { ...OFFLINE };
    }
    if (status >= 200 && status < 300 && source.body?.ok === true && source.body?.ready === true) return { ...CONNECTED };
    return { ...OFFLINE };
  }

  function retryDelayForFailure(failureCount) {
    const count = Math.max(0, Math.floor(Number(failureCount) || 0));
    if (!count) return 0;
    return Math.min(RETRY_BASE_MS * (2 ** (count - 1)), RETRY_MAX_MS);
  }

  function notificationKey(kind, title) {
    const name = String(title || '').trim().slice(0, 100);
    if (kind === 'connection') return `connection:${name || 'state'}`;
    if (kind === 'upload-failure') return `failure:${name || 'upload'}`;
    return '';
  }

  function shouldNotify({ kind, previousState, nextState, lastNotifiedAt = 0, now = Date.now() } = {}) {
    if (Number(now) - Number(lastNotifiedAt) < NOTICE_COOLDOWN_MS) return false;
    if (kind === 'connection') {
      return nextState === 'unpaired' && previousState !== nextState;
    }
    if (kind === 'upload-failure') return nextState === 'connected';
    return false;
  }

  const api = Object.freeze({
    classifyConnection,
    retryDelayForFailure,
    notificationKey,
    shouldNotify,
    NOTICE_COOLDOWN_MS,
  });

  root.NestConnectionState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
