(() => {
  'use strict';

  const ACTIONS = Object.freeze({
    getStatus: 'aiflow-control:get-status',
    reconnect: 'aiflow-control:reconnect',
    retry: 'aiflow-control:retry',
    refresh: 'aiflow-control:refresh',
    cancelUpload: 'aiflow-control:cancel-upload',
  });

  const UNKNOWN = '—';
  let latestStatus = null;
  let activeAction = '';
  let activeCancelId = '';
  let statusPollTimer = null;

  const elements = {
    connectionDot: document.querySelector('#connection-dot'),
    connectionLabel: document.querySelector('#connection-label'),
    connectionDetail: document.querySelector('#connection-detail'),
    offlineGuidance: document.querySelector('#offline-guidance'),
    unpairedGuidance: document.querySelector('#unpaired-guidance'),
    connectedContent: document.querySelector('#connected-content'),
    root: document.querySelector('#nest-sync-popup'),
    projectName: document.querySelector('#project-name'),
    folderName: document.querySelector('#folder-name'),
    queueActiveCount: document.querySelector('#queue-active-count'),
    queueUploadCount: document.querySelector('#queue-upload-count'),
    queueDeleteCount: document.querySelector('#queue-delete-count'),
    queueFailedCount: document.querySelector('#queue-failed-count'),
    queueSummary: document.querySelector('#queue-summary'),
    queueItems: document.querySelector('#queue-items'),
    queueItemsEmpty: document.querySelector('#queue-items-empty'),
    queueItemsNote: document.querySelector('#queue-items-note'),
    errorState: document.querySelector('#error-state'),
    errorMessage: document.querySelector('#error-message'),
    updatedAt: document.querySelector('#updated-at'),
    feedback: document.querySelector('#feedback'),
    actionButtons: Array.from(document.querySelectorAll('[data-action]')),
    copyButton: document.querySelector('#copy-diagnostics'),
  };

  function text(value, fallback = UNKNOWN) {
    if (value === null || value === undefined || value === '') return fallback;
    return String(value);
  }

  function count(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
  }

  function timestamp(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  }

  function transferItem(item) {
    if (!item || typeof item !== 'object') return null;
    const assetId = text(item.assetId, '').trim();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(assetId)) return null;
    const state = ['queued', 'retry-wait', 'failed', 'reading', 'uploading', 'confirming'].includes(String(item.state || ''))
      ? String(item.state)
      : 'queued';
    return {
      assetId,
      name: text(item.name, '未命名素材').slice(0, 120),
      kind: ['image', 'video', 'audio', 'file'].includes(String(item.kind || '')) ? String(item.kind) : 'file',
      size: Math.max(0, Number(item.size) || 0),
      state,
      queuedAt: timestamp(item.queuedAt),
      retryCount: count(item.retryCount),
      nextAttemptAt: timestamp(item.nextAttemptAt),
      elapsedMs: Math.max(0, Number(item.elapsedMs) || 0),
    };
  }

  function formatBytes(value) {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return `${Math.floor(bytes)} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  function transferStateLabel(item) {
    const labels = {
      queued: '准备中',
      reading: '读取本机素材',
      uploading: '上传到 AI Flow',
      confirming: '等待 AI Flow 确认',
      'retry-wait': '等待自动重试',
      failed: '等待重试',
    };
    return labels[item.state] || '准备中';
  }

  function readFirst(source, paths, fallback) {
    for (const path of paths) {
      let value = source;
      for (const key of path.split('.')) {
        value = value && typeof value === 'object' ? value[key] : undefined;
      }
      if (value !== null && value !== undefined && value !== '') return value;
    }
    return fallback;
  }

  function resolveName(value) {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return text(value.name || value.label || value.title);
    return UNKNOWN;
  }

  function normalizeStatus(response) {
    const payload = response && typeof response === 'object'
      ? (response.status || response.data || response)
      : {};
    const queue = payload.queue && typeof payload.queue === 'object' ? payload.queue : {};
    const connection = payload.connection && typeof payload.connection === 'object'
      ? payload.connection
      : {};
    const error = payload.error && typeof payload.error === 'object' ? payload.error : {};
    const failed = count(readFirst(payload, [
      'queue.failed', 'queue.failedCount', 'queue.failures', 'failedCount', 'failures', 'error.count',
    ], 0));
    const connectedFlag = readFirst(payload, ['connection.connected', 'connected', 'bridgeConnected'], undefined);
    const rawConnectionState = readFirst(payload, ['connection.state', 'connection.status', 'state'], '');
    const connectionState = globalThis.NestConnectionState.classifyConnection({
      state: connectedFlag === true ? 'connected' : rawConnectionState,
      status: readFirst(payload, ['connection.httpStatus', 'httpStatus'], 0),
      body: readFirst(payload, ['connection.body', 'body'], ''),
      ready: readFirst(payload, ['connection.ready', 'ready'], undefined),
      error: readFirst(payload, ['connection.error', 'error.message', 'error'], undefined),
    });
    const isConnected = connectionState.state === 'connected';
    const isError = connectionState.state === 'unpaired';
    const connectionLabel = connectionState.label;

    return {
      isConnected,
      isError,
      connectionState: connectionState.state,
      connectionLabel,
      connectionDetail: text(readFirst(payload, [
        'connection.detail', 'connection.reason', 'connectionDetail', 'detail', 'message',
      ], connectionState.detail)),
      projectName: resolveName(readFirst(payload, ['project', 'currentProject', 'context.project'], UNKNOWN)),
      folderName: resolveName(readFirst(payload, ['folder', 'currentFolder', 'context.folder'], UNKNOWN)),
      active: count(readFirst(payload, ['queue.active', 'queue.uploading', 'activeUploads'], 0)),
      uploads: count(readFirst(payload, ['queue.uploads', 'queue.pendingUploads', 'pendingUploads', 'uploads'], 0)),
      deletes: count(readFirst(payload, ['queue.deletes', 'queue.pendingDeletes', 'pendingDeletes', 'deletes'], 0)),
      references: count(readFirst(payload, ['queue.references', 'queue.pendingReferences', 'pendingReferences', 'references'], 0)),
      failed,
      nextRetryAt: timestamp(readFirst(payload, ['queue.nextRetryAt', 'nextRetryAt'], 0)),
      items: (Array.isArray(readFirst(payload, ['queue.items', 'queue.uploadItems'], []))
        ? readFirst(payload, ['queue.items', 'queue.uploadItems'], [])
        : []).map(transferItem).filter(Boolean),
      theme: payload.theme && typeof payload.theme === 'object' ? payload.theme : {},
      errorMessage: connectionState.state === 'connected' ? text(readFirst(payload, [
        'error.message', 'lastError', 'lastFailure', 'failureMessage',
      ], ''), '') : '',
      updatedAt: readFirst(payload, ['updatedAt', 'lastUpdatedAt', 'updated_at'], null),
    };
  }

  function formatTime(value) {
    if (!value) return UNKNOWN;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return text(value);
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(parsed);
  }

  function showFeedback(message, isError = false) {
    elements.feedback.textContent = text(message, '');
    elements.feedback.classList.toggle('is-error', Boolean(isError));
  }

  function setButtonBusy(action, busy) {
    activeAction = busy ? action : '';
    elements.actionButtons.forEach((button) => {
      const isCurrent = button.dataset.action === action;
      const queued = latestStatus ? latestStatus.uploads + latestStatus.deletes + latestStatus.references : 0;
      button.disabled = busy || (button.dataset.action === ACTIONS.retry && queued === 0);
      button.classList.toggle('is-busy', busy && isCurrent);
      if (isCurrent) button.setAttribute('aria-busy', String(busy));
    });
    elements.copyButton.disabled = busy;
  }

  function renderQueueItems(status) {
    const items = Array.isArray(status.items) ? status.items : [];
    elements.queueItems.replaceChildren();
    elements.queueItemsEmpty.hidden = items.length > 0;
    elements.queueItemsNote.textContent = status.nextRetryAt > Date.now()
      ? `下次重试 ${formatTime(status.nextRetryAt)}`
      : '小文件优先';
    for (const item of items) {
      const row = document.createElement('div');
      row.className = `nx-item nx-item-${item.state}`;
      row.setAttribute('role', 'listitem');

      const copy = document.createElement('div');
      copy.className = 'nx-item-copy';
      const title = document.createElement('strong');
      title.textContent = item.name;
      title.title = item.name;
      const meta = document.createElement('span');
      const retry = item.state === 'retry-wait' && item.nextAttemptAt > Date.now()
        ? ` · ${formatTime(item.nextAttemptAt)} 重试`
        : '';
      meta.textContent = `${transferStateLabel(item)} · ${formatBytes(item.size)}${retry}`;
      copy.append(title, meta);
      row.appendChild(copy);

      const transferable = ['queued', 'retry-wait', 'failed'].includes(item.state);
      if (transferable) {
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'nx-button nx-button-subtle';
        cancel.textContent = activeCancelId === item.assetId ? '取消中…' : '取消';
        cancel.disabled = Boolean(activeAction || activeCancelId);
        cancel.addEventListener('click', () => cancelQueuedUpload(item));
        row.appendChild(cancel);
      } else {
        const state = document.createElement('span');
        state.className = 'nx-item-active';
        state.textContent = transferStateLabel(item);
        row.appendChild(state);
      }
      elements.queueItems.appendChild(row);
    }
  }

  function render(status) {
    latestStatus = status;
    const state = status.connectionState || 'offline';
    elements.root.dataset.connection = state;
    const colorPattern = /^(#[0-9a-f]{3,8}|rgba?\([0-9.,%\s]+\)|hsla?\([0-9.,%\s]+\))$/i;
    for (const [key, value] of Object.entries(status.theme || {})) {
      const safeValue = String(value || '').trim();
      if (['bg', 'surface', 'border', 'text', 'muted', 'accent', 'button'].includes(key) && colorPattern.test(safeValue)) {
        elements.root.style.setProperty(`--nx-${key}`, safeValue, 'important');
      }
    }
    elements.offlineGuidance.hidden = state !== 'offline';
    elements.unpairedGuidance.hidden = state !== 'unpaired';
    elements.connectedContent.hidden = state !== 'connected';
    elements.feedback.textContent = '';
    const queued = status.uploads + status.deletes + status.references;
    elements.connectionLabel.textContent = status.connectionLabel;
    elements.connectionDetail.textContent = status.connectionDetail;
    elements.projectName.textContent = status.projectName;
    elements.folderName.textContent = status.folderName;
    elements.queueActiveCount.textContent = String(status.active);
    elements.queueUploadCount.textContent = String(status.uploads);
    elements.queueDeleteCount.textContent = String(status.deletes);
    elements.queueFailedCount.textContent = String(status.failed);
    elements.queueSummary.textContent = status.active > 0 ? `上传中 ${status.active} 项` : queued > 0 ? `队列中 ${queued} 项` : '队列空闲';
    const hasRecentError = Boolean(status.errorMessage || status.failed > 0);
    elements.errorState.textContent = hasRecentError ? '需要处理' : '暂无异常';
    elements.errorState.classList.toggle('nx-error', hasRecentError);
    elements.errorMessage.textContent = status.errorMessage || (status.failed > 0
      ? '存在失败任务，可点击“重新唤醒队列”重新处理既有任务。'
      : '队列空闲或上一轮同步已完成。');
    elements.updatedAt.textContent = `最后更新：${formatTime(status.updatedAt)}`;

    elements.connectionDot.classList.remove('is-loading', 'is-connected', 'is-error', 'nx-dot-connected', 'nx-dot-unpaired', 'nx-dot-offline');
    elements.connectionDot.classList.add(state === 'connected' ? 'nx-dot-connected' : state === 'unpaired' ? 'nx-dot-unpaired' : 'nx-dot-offline');
    renderQueueItems(status);
    if (!activeAction) setButtonBusy('', false);
  }

  function sendRuntimeMessage(action, payload = {}) {
    return new Promise((resolve) => {
      const runtime = globalThis.chrome && globalThis.chrome.runtime;
      if (!runtime || typeof runtime.sendMessage !== 'function') {
        resolve({ ok: false, error: '当前浏览器无法使用扩展消息接口。' });
        return;
      }
      try {
        runtime.sendMessage({ action, ...payload }, (response) => {
          const runtimeError = globalThis.chrome && globalThis.chrome.runtime && globalThis.chrome.runtime.lastError;
          if (runtimeError) {
            resolve({ ok: false, error: runtimeError.message || '扩展后台未响应。' });
            return;
          }
          if (!response || response.ok === false || response.success === false) {
            resolve({ ok: false, error: text(response && (response.error || response.message), '扩展后台未返回可用结果。'), response });
            return;
          }
          resolve({ ok: true, response });
        });
      } catch (error) {
        resolve({ ok: false, error: error && error.message ? error.message : '扩展消息发送失败。' });
      }
    });
  }

  async function readStatus(silent = false) {
    const result = await sendRuntimeMessage(ACTIONS.getStatus);
    if (!result.ok) {
      const connection = globalThis.NestConnectionState.classifyConnection(result.response?.connection || { error: result.error });
      render(normalizeStatus({
        connection: { state: connection.state, label: connection.label, detail: connection.detail },
        updatedAt: Date.now(),
      }));
      return false;
    }
    render(normalizeStatus(result.response));
    return true;
  }

  async function runAction(action) {
    setButtonBusy(action, true);
    showFeedback('正在处理…');
    const result = await sendRuntimeMessage(action);
    setButtonBusy(action, false);
    if (!result.ok) {
      showFeedback(result.error, true);
      if (result.response) render(normalizeStatus(result.response));
      return;
    }
    if (result.response && (result.response.status || result.response.data)) {
      render(normalizeStatus(result.response));
    }
    showFeedback(text(result.response && result.response.message, '操作已提交。'));
    if (action === ACTIONS.refresh) return;
    await readStatus(true);
  }

  async function cancelQueuedUpload(item) {
    if (!item?.assetId || activeCancelId || activeAction) return;
    activeCancelId = item.assetId;
    render(latestStatus || normalizeStatus({}));
    showFeedback(`正在取消“${item.name}”的待上传任务…`);
    const result = await sendRuntimeMessage(ACTIONS.cancelUpload, { assetId: item.assetId });
    activeCancelId = '';
    if (!result.ok) {
      showFeedback(result.error, true);
      if (result.response) render(normalizeStatus(result.response));
      else render(latestStatus || normalizeStatus({}));
      return;
    }
    if (result.response && (result.response.status || result.response.data)) {
      render(normalizeStatus(result.response));
    }
    showFeedback(text(result.response && result.response.message, '已取消尚未开始的上传任务。'));
    await readStatus(true);
  }

  function diagnosticsText() {
    const status = latestStatus || normalizeStatus({});
    return [
      '小旺仔同步控制台诊断',
      `生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
      `连接：${status.connectionLabel}`,
      `连接详情：${status.connectionDetail}`,
      `当前项目：${status.projectName}`,
      `当前文件夹：${status.folderName}`,
      `队列：上传中 ${status.active}，待上传 ${status.uploads}，待删除 ${status.deletes}，引用 ${status.references}，失败 ${status.failed}`,
      `下一次自动重试：${status.nextRetryAt ? formatTime(status.nextRetryAt) : '无'}`,
      `最近异常：${status.errorMessage || '无'}`,
      `状态更新时间：${formatTime(status.updatedAt)}`,
    ].join('\n');
  }

  async function copyDiagnostics() {
    const value = diagnosticsText();
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        if (!copied) throw new Error('浏览器拒绝复制。');
      }
      showFeedback('诊断信息已复制，可直接粘贴到 Bug 反馈中。');
    } catch (error) {
      showFeedback(error && error.message ? error.message : '复制诊断信息失败。', true);
    }
  }

  elements.actionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (!button.disabled) runAction(button.dataset.action);
    });
  });
  elements.copyButton.addEventListener('click', copyDiagnostics);

  async function pollStatus() {
    await readStatus(true);
    const delay = latestStatus?.connectionState === 'connected' ? 3000 : 15000;
    statusPollTimer = window.setTimeout(pollStatus, delay);
  }

  if (statusPollTimer) window.clearTimeout(statusPollTimer);
  void pollStatus();
})();

// 标题下显示网页采集器版本号，方便核对浏览器里装的是不是新版
{
  const versionLabel = document.getElementById('extension-version');
  const version = globalThis.chrome?.runtime?.getManifest?.()?.version;
  if (versionLabel && version) versionLabel.textContent = `v${version}`;
}
