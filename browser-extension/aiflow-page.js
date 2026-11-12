(() => {
  const AI_FLOW_DOM = window.NestAIFlowDOM || null;
  const BUTTON_ID = 'nest-copy-aiflow-video';
  const FOLDER_SYNC_BUTTON_ID = 'nest-sync-aiflow-folder';
  const FOLDER_SYNC_ACTION = 'sync-aiflow-folder';
  const FOLDER_DIFF_ACTION = 'preview-aiflow-folder-diff';
  const FOLDER_DIFF_PANEL_ID = 'nest-aiflow-folder-diff-preview';
  const FOLDER_DIFF_STYLE_ID = 'nest-aiflow-folder-diff-preview-style';
  const FOLDER_STRUCTURE_SYNC_BUTTON_ID = 'nest-sync-aiflow-folder-structure';
  const FOLDER_STRUCTURE_SYNC_ACTION = 'sync-aiflow-folder-structure';
  const FOLDER_STRUCTURE_ONLY_ACTION = 'sync-aiflow-folder-structure-only';
  const LEGACY_UPLOAD_BUTTON_ID = 'nest-upload-aiflow-assets';
  const PROMPT_HIGHLIGHT_STYLE_ID = 'nest-aiflow-prompt-highlight-style';
  const PROMPT_HIGHLIGHT_CLASS = 'nest-aiflow-prompt-highlighted';
  const PROMPT_HIGHLIGHT_LAYER_CLASS = 'nest-aiflow-prompt-highlight-layer';
  const PROMPT_REFERENCE_TOKEN_RE = /@(图片|视频|音频)\s*(\d+)/g;
  // AI Flow can renumber references by changing textarea.value directly after
  // a referenced asset is removed. That does not dispatch an input event.
  const PROMPT_VALUE_WATCH_INTERVAL_MS = 180;
  const LIVE_SYNC_ACTION = 'aiflow-live-sync-tick';
  const BRIDGE_RECOVERY_PROBE_ACTION = 'aiflow-bridge-recovery-probe';
  const BRIDGE_RECOVERY_PROBE_MS = 30 * 1000;
  const REFERENCE_UPLOAD_ACTION = 'aiflow-reference-upload-tick';
  const REFERENCE_ATTACH_ACTION = 'attach-aiflow-uploaded-references';
  const CONTROL_CONTEXT_ACTION = 'aiflow-control-context';
  const CONTROL_SYNC_NOW_ACTION = 'aiflow-live-sync-now';
  const AIFLOW_LIBRARY_ASSETS_ACTION = 'aiflow-library-assets';
  const AIFLOW_REFERENCE_SELECT_ACTION = 'aiflow-reference-select';
  const AIFLOW_STORYBOARD_MATCH_ACTION = 'aiflow-match-storyboard-assets';
  const VIDEO_EXTEND_LIBRARY_PANEL_ID = 'nest-aiflow-video-extend-library';
  const VIDEO_EXTEND_WORKBENCH_ID = 'nest-aiflow-video-extend-workbench';
  const VIDEO_EXTEND_WORKBENCH_STYLE_ID = 'nest-aiflow-video-extend-workbench-style';
  const VIDEO_EXTEND_WORKBENCH_RETURN_ID = 'nest-aiflow-video-extend-return';
  const AIFLOW_THEME_SWITCHER_ID = 'nest-aiflow-theme-switcher';
  const AIFLOW_THEME_STYLE_ID = 'nest-aiflow-theme-style';
  const AIFLOW_THEME_KEY = 'nest-aiflow-theme';
  const AIFLOW_ORIGINAL_THEME = 'aiflow-original';
  const FOCUS_LAYOUT_STYLE_ID = 'nest-aiflow-focus-layout-style';
  const FOCUS_LAYOUT_TOGGLE_ID = 'nest-aiflow-focus-layout-toggle';
  const FOCUS_LAYOUT_CLASS = 'nest-aiflow-focus-layout';
  const FOCUS_LAYOUT_STORAGE_KEY = 'nest-aiflow-focus-layout-enabled';
  const FOCUS_HIDE_CLASS = 'nest-focus-hidden';
  const WORKS_CANVAS_STYLE_ID = 'nest-aiflow-works-canvas-style';
  const WORKS_CANVAS_TOGGLE_ID = 'nest-aiflow-works-canvas-toggle';
  const WORKS_CANVAS_HUD_ID = 'nest-aiflow-works-canvas-hud';
  const WORKS_CANVAS_GROUPS_ID = 'nest-aiflow-works-canvas-groups';
  const WORKS_CANVAS_MINIMAP_ID = 'nest-aiflow-works-canvas-minimap';
  const WORKS_CANVAS_MARQUEE_ID = 'nest-aiflow-works-canvas-marquee';
  const WORKS_CANVAS_ORDER_ID = 'nest-aiflow-works-canvas-order';
  const WORKS_CANVAS_ENABLED_KEY = 'nest-aiflow-works-canvas-enabled';
  const WORKS_CANVAS_LAYOUT_PREFIX = 'nest-aiflow-works-canvas-layout:';
  // 这几个类名加在 AI Flow 自己的节点上，故意不用 nest-aiflow- 前缀（见 isNestOwnedNode）
  const WORKS_CANVAS_VIEWPORT_CLASS = 'nest-works-canvas-viewport';
  const WORKS_CANVAS_WORLD_CLASS = 'nest-works-canvas-world';
  const WORKS_CANVAS_PASSTHROUGH_CLASS = 'nest-works-canvas-passthrough';
  const WORKS_CANVAS_MIN_ZOOM = 0.2;
  const WORKS_CANVAS_MAX_ZOOM = 2.5;
  const WORKS_CANVAS_GAP = 20;
  const WORKS_CANVAS_DEFAULT_CARD_WIDTH = 244;
  const WORKS_CANVAS_DEFAULT_CARD_HEIGHT = 420;
  const WORKS_CANVAS_MAX_SAVED_CARDS = 1000;
  const WORKS_CANVAS_GROUP_PAD = 16;
  const WORKS_CANVAS_GROUP_HEADER = 34;
  const WORKS_CANVAS_MINIMAP_WIDTH = 184;
  const WORKS_CANVAS_MINIMAP_HEIGHT = 124;
  const WORKS_CANVAS_ROW_TOLERANCE = 120;
  const WORKS_CANVAS_TITLE_RETRY_MS = 1500;
  // A long-poll wake-up makes imports immediate; this remains the recovery poll.
  const LIVE_SYNC_INTERVAL_MS = 3 * 1000;
  let pendingTaskId = '';
  // 最近一次点过的 AI Flow 任务卡片：延长弹窗里的视频接不上时，用这张卡片的视频文件做预览
  let lastVideoExtendTaskId = '';
  let liveSyncTimer = null;
  let bridgeHealthTimer = null;
  let bridgeFailureCount = 0;
  let bridgeRetryAfter = 0;
  let contextRecoveryScheduled = false;
  let pageMutationObserver = null;
  const promptHighlighters = new WeakMap();
  const videoExtendReferenceSessions = new Map();
  // 每个小旺仔延长工作台对应哪一个 AI Flow 延长窗口
  const videoExtendWorkbenchDialogs = new WeakMap();
  // 提交延长期间不动 AI Flow 的窗口，等它关掉再恢复
  let videoExtendSubmitting = false;
  const recentReferenceInsertions = new WeakMap();
  // The right-hand library takes focus when a material is chosen. Keep the
  // left prompt's last explicit caret so a new reference never falls to the
  // end merely because the prompt was first rendered programmatically.
  const workbenchPromptSelections = new WeakMap();

  function recoverFromInvalidExtensionContext(error) {
    const message = String(error?.message || error || '');
    if (!/extension context invalidated/i.test(message) || contextRecoveryScheduled) return;
    contextRecoveryScheduled = true;
    // Reloading an unpacked extension invalidates already-injected page code.
    // Refresh once so the newly loaded extension can inject a fresh script.
    setTimeout(() => location.reload(), 120);
  }

  function sendRuntimeMessage(message, callback, onError) {
    const fail = error => {
      recoverFromInvalidExtensionContext(error);
      onError?.(error);
    };
    try {
      chrome.runtime.sendMessage(message, response => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          fail(lastError);
          return;
        }
        callback?.(response);
      });
    } catch (error) {
      fail(error);
    }
  }

  function videoUrl(taskId) {
    return `${location.origin}/videos/${encodeURIComponent(taskId)}.mp4`;
  }

  function ensurePromptHighlightStyles() {
    if (document.getElementById(PROMPT_HIGHLIGHT_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = PROMPT_HIGHLIGHT_STYLE_ID;
    style.textContent = `
      .${PROMPT_HIGHLIGHT_LAYER_CLASS} {
        position: absolute !important; z-index: 2 !important; box-sizing: border-box !important;
        pointer-events: none !important; overflow: hidden !important; white-space: pre-wrap !important;
        overflow-wrap: break-word !important; word-break: break-word !important; color: transparent !important;
        -webkit-text-fill-color: transparent !important;
        user-select: none !important;
      }
      .${PROMPT_HIGHLIGHT_LAYER_CLASS} > div { min-height: 100%; color: transparent !important; -webkit-text-fill-color: transparent !important; will-change: transform; }
      .${PROMPT_HIGHLIGHT_CLASS} {
        position: relative !important; z-index: 1 !important;
        caret-color: #f4f8ff !important; text-shadow: none !important;
      }
      .${PROMPT_HIGHLIGHT_CLASS}::selection { background: color-mix(in srgb, var(--nest-theme-accent, #6f9bff) 38%, transparent) !important; }
      .${PROMPT_HIGHLIGHT_LAYER_CLASS} .nest-aiflow-reference-token {
        border-radius: 3px !important; font: inherit !important; font-weight: inherit !important;
        font-style: inherit !important; font-stretch: inherit !important; font-kerning: inherit !important;
        font-variant: inherit !important; font-feature-settings: inherit !important; font-variation-settings: inherit !important;
        letter-spacing: inherit !important; word-spacing: inherit !important; text-transform: inherit !important;
        text-decoration: underline !important;
        text-decoration-thickness: 1px !important; text-underline-offset: 2px !important;
        box-shadow: inset 0 -1px 0 currentColor !important;
      }
      .${PROMPT_HIGHLIGHT_LAYER_CLASS} .nest-aiflow-reference-image { color: #8cc8ff !important; background: rgba(140, 200, 255, .14) !important; }
      .${PROMPT_HIGHLIGHT_LAYER_CLASS} .nest-aiflow-reference-video { color: #bfb0ff !important; background: rgba(191, 176, 255, .14) !important; }
      .${PROMPT_HIGHLIGHT_LAYER_CLASS} .nest-aiflow-reference-audio { color: #8fdcb8 !important; background: rgba(143, 220, 184, .13) !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function isAIFlowWorkspace() {
    return Boolean(AI_FLOW_DOM?.workspace?.() || document.querySelector('#assetLibrary, .gen-current-project, .task-card[data-taskid]'));
  }

  function promptEditorText(editor) {
    return editor instanceof HTMLTextAreaElement ? editor.value : editor.textContent || '';
  }

  // 小旺仔自己插进页面的浮窗（延长工作台、素材库等，id 都以 nest-aiflow- 开头）里也写着
  // 「延长秒数」「提交延长」，绝不能当成 AI Flow 的延长窗口：否则原窗口一藏起来，
  // 工作台会拿自己当窗口反复重建，页面卡死（LES-019）。
  function isNestOwnedNode(node) {
    for (let current = node; current && current !== document.body; current = current.parentElement) {
      if (String(current.id || '').startsWith('nest-aiflow-')) return true;
    }
    return false;
  }

  function isVideoExtendPrompt(editor) {
    // AI Flow has changed the modal class names more than once. The two visible
    // labels are stable, so walk upward from the editor instead of relying on a
    // particular dialog class.
    if (isNestOwnedNode(editor)) return false;
    let container = editor.parentElement;
    while (container && container !== document.body) {
      const text = String(container.textContent || '');
      if (text.includes('延长秒数') && text.includes('提交延长')) return true;
      container = container.parentElement;
    }
    return false;
  }

  function videoExtendContainer(editor) {
    if (isNestOwnedNode(editor)) return null;
    let container = editor.parentElement;
    while (container && container !== document.body) {
      const text = String(container.textContent || '');
      if (text.includes('延长秒数') && text.includes('提交延长')) return container;
      container = container.parentElement;
    }
    return null;
  }

  // AI Flow 关掉延长窗口时，有时只是藏起来、留在页面里，下次点「延长」再拿出来用。
  // 所以"找到了延长窗口"不等于"窗口开着"，要看它此刻是否真的显示在屏幕上。
  function isVideoExtendDialogShown(dialog) {
    if (!(dialog instanceof HTMLElement) || !dialog.isConnected) return false;
    for (let node = dialog; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return dialog.getClientRects().length > 0;
  }

  // 页面里可能同时有一个藏起来的旧窗口和一个新打开的窗口，优先取正在显示的那个。
  function currentVideoExtendEditor() {
    const editors = [...document.querySelectorAll('textarea')].filter(isVideoExtendPrompt);
    return editors.find(editor => isVideoExtendDialogShown(videoExtendContainer(editor))) || editors[0];
  }

  const PAGE_OBSERVER_OPTIONS = { subtree: true, childList: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true };
  // 页面扫描节流：AI Flow 进度条、计时器会持续改 class，以前每条变动都同步跑一整轮注入（十几次全页 querySelectorAll），
  // 浏览器明显发卡（LES-021）。现在一轮变动最多每 PAGE_SCAN_MIN_INTERVAL_MS 扫一次，并忽略扩展自己造成的变动。
  const PAGE_SCAN_MIN_INTERVAL_MS = 250;

  function isNestClassToken(token) { return token.startsWith('nest-'); }

  function isNestOwnedMutationNode(node) {
    if (!(node instanceof Element)) return node?.nodeType === 3 ? isNestOwnedNode(node.parentElement) : false;
    if (String(node.id || '').startsWith('nest-aiflow-')) return true;
    if (String(node.id || '').startsWith('nest-') || [...node.classList].some(isNestClassToken)) return true;
    return isNestOwnedNode(node);
  }

  // 只由扩展自己引起的变动（我们的浮窗、样式、高亮层、加在 AI Flow 节点上的 nest-* class）不触发重扫，避免自激循环。
  function isNestOnlyMutation(record) {
    const target = record.target instanceof Element ? record.target : record.target?.parentElement;
    if (target && isNestOwnedNode(target)) return true;
    if (record.type === 'attributes') {
      const before = String(record.oldValue || '').split(/\s+/).filter(token => token && !isNestClassToken(token)).sort().join(' ');
      const after = String(target?.getAttribute?.('class') || '').split(/\s+/).filter(token => token && !isNestClassToken(token)).sort().join(' ');
      return before === after;
    }
    if (record.type === 'childList') {
      const nodes = [...record.addedNodes, ...record.removedNodes];
      return nodes.length > 0 && nodes.every(isNestOwnedMutationNode);
    }
    return false;
  }

  // 「打开 AI Flow 原窗口」和「提交延长」会暂停页面监听，免得和 AI Flow 的重绘打架。
  // 窗口一关就恢复监听，下次点「延长」才会重新弹出小旺仔延长工作台。
  function resumeAfterVideoExtendDialogCloses(dialog, onClosed) {
    const watch = setInterval(() => {
      if (isVideoExtendDialogShown(dialog)) return;
      clearInterval(watch);
      try { onClosed?.(); } catch { /* 清理失败不影响恢复监听 */ }
      pageMutationObserver?.observe(document.documentElement, PAGE_OBSERVER_OPTIONS);
      ensureLiveSyncTimer();
      injectVideoExtendWorkbench();
    }, 300);
  }

  function referenceAssetKey(asset) {
    const kind = String(asset?.type || '').startsWith('video/') ? '视频'
      : String(asset?.type || '').startsWith('audio/') ? '音频' : '图片';
    return `${kind}:${String(asset?.id || '')}`;
  }

  function referenceSessionKey(dialog) {
    const source = String(dialog?.querySelector('video')?.currentSrc || dialog?.querySelector('video')?.src || '');
    let stableSource = source;
    try { stableSource = new URL(source, location.href).pathname || source; } catch {}
    return `${currentProjectId() || 'project'}:${stableSource || 'active-video-extend'}`;
  }

  function nativeVideoExtendReferenceNodes(dialog) {
    if (!(dialog instanceof HTMLElement)) return [];
    // Keep the complete chip for its filename and remove action, but also
    // consider direct children: AI Flow has used both layouts.
    return [...new Set(dialog.querySelectorAll('#sd25RefChips [data-refchip], #sd25RefChips .ref-chip, #sd25RefChips > *'))];
  }

  function exactVideoExtendReferenceToken(value) {
    return String(value || '').trim().match(/^@(图片|视频|音频)\s*(\d+)$/);
  }

  function isolatedNativeVideoExtendToken(node) {
    if (!(node instanceof Element)) return null;
    const candidates = [
      node.getAttribute('data-ref-token'), node.getAttribute('data-reference-token'), node.dataset.refchip,
      node.getAttribute('aria-label'), node.getAttribute('title'),
      ...[...node.querySelectorAll('[data-ref-token], [data-reference-token], [data-refchip]')].flatMap(child => [
        child.getAttribute('data-ref-token'), child.getAttribute('data-reference-token'), child.getAttribute('data-refchip'),
      ]),
    ];
    for (const candidate of candidates) {
      const match = exactVideoExtendReferenceToken(candidate);
      if (match) return `@${match[1]}${match[2]}`;
    }
    // Only accept an individual text node that is exactly a token. Never
    // search the concatenated chip text: @图片1 beside a filename beginning
    // with 02 must remain @图片1, never become @图片102.
    const tokens = new Set();
    const walker = document.createTreeWalker(node, 4);
    let textNode = walker.nextNode();
    while (textNode) {
      const match = exactVideoExtendReferenceToken(textNode.nodeValue);
      if (match) tokens.add(`@${match[1]}${match[2]}`);
      textNode = walker.nextNode();
    }
    // A wrapper holding several chips has no one-to-one asset identity.
    return tokens.size === 1 ? [...tokens][0] : '';
  }

  function normalizedVideoExtendReferenceName(value) {
    return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('zh-CN');
  }

  function parseNativeVideoExtendReference(node) {
    if (!(node instanceof Element)) return null;
    const token = isolatedNativeVideoExtendToken(node);
    if (!token) return null;
    const raw = String(node.textContent || '').replace(/\s+/g, ' ').trim();
    const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // The token was independently verified above, so removing its prefix is
    // safe even when the following filename starts with a digit.
    const filename = raw.replace(new RegExp(`^${escapedToken}[\\s_.-]*`), '').trim().slice(0, 160);
    // 真 AI Flow 的参考条：title 是完整文件名，图片参考里带一张小缩略图；视频参考只有一个图标
    const title = String(node.getAttribute('title') || '').trim();
    const image = node.querySelector('img');
    const thumb = image ? String(image.currentSrc || image.src || '') : '';
    return { token, filename, title, thumb };
  }

  function videoExtendPromptReferenceTokens(editor) {
    if (!(editor instanceof HTMLTextAreaElement)) return [];
    return [...new Set([...String(editor.value || '').matchAll(/@(图片|视频|音频)\s*(\d+)/g)]
      .map(match => `@${match[1]}${match[2]}`))];
  }

  function nativeVideoExtendReferences(dialog) {
    const items = []; const seen = new Set();
    for (const node of nativeVideoExtendReferenceNodes(dialog)) {
      const item = parseNativeVideoExtendReference(node);
      if (!item || seen.has(item.token)) continue;
      seen.add(item.token); items.push(item);
    }
    return items;
  }

  function nativeVideoExtendReferenceNode(dialog, token) {
    return nativeVideoExtendReferenceNodes(dialog).find(node => parseNativeVideoExtendReference(node)?.token === token) || null;
  }

  function removeNativeVideoExtendReference(dialog, token) {
    const root = dialog instanceof HTMLElement ? dialog.querySelector('#sd25RefChips') : null;
    const matched = nativeVideoExtendReferenceNode(dialog, token);
    if (!(root instanceof HTMLElement) || !(matched instanceof HTMLElement)) return false;
    const actionText = control => [
      control.getAttribute('data-ref-remove'), control.getAttribute('data-action'), control.getAttribute('aria-label'), control.getAttribute('title'), control.className, control.textContent,
    ].filter(Boolean).join(' ');
    // The exact-token span may be nested inside the chip while the native ×
    // button is on its parent. Search only ancestors that still represent the
    // same single reference; never cross into the multi-chip container.
    const candidates = [];
    for (let node = matched; node instanceof HTMLElement && node !== root; node = node.parentElement) {
      if (isolatedNativeVideoExtendToken(node) === token) candidates.push(node);
    }
    for (const node of candidates) {
      const controls = [
        // AI Flow's current extension dialog renders the icon-only × as a
        // span with data-refdel="<index>". Include it explicitly: it is the
        // native handler that removes the real reference and re-numbers tags.
        ...node.querySelectorAll('[data-refdel], [data-ref-remove], [data-action*="remove" i], [data-action*="delete" i], [class*="remove" i], [class*="delete" i], [class*="close" i], button, [role="button"]'),
      ].filter(control => control instanceof HTMLElement && control !== node);
      const removeControl = controls.find(control => /(?:删除|移除|移出|remove|delete|close|×)/i.test(actionText(control)))
        // Some releases render the × as an SVG with no accessible text. A
        // reference chip has only one inner control in that layout.
        || (controls.length === 1 ? controls[0] : null);
      if (removeControl instanceof HTMLElement) { removeControl.click(); return true; }
      // Some AI Flow releases make the complete reference chip itself the
      // remove control. Only use that fallback when its accessible name says so.
      if (node.matches('button, [role="button"]') && /(?:删除|移除|remove|delete|close|×)/i.test(actionText(node))) { node.click(); return true; }
    }
    return false;
  }

  function forgetVideoExtendReferenceToken(dialog, token) {
    if (!(dialog instanceof HTMLElement) || !token) return;
    const references = referenceMap(dialog);
    for (const [key, value] of Object.entries(references)) if (value === token) delete references[key];
    dialog.dataset.nestReferenceMap = JSON.stringify(references);
    videoExtendReferenceSessions.set(referenceSessionKey(dialog), references);
  }

  function rememberVideoExtendReference(dialog, asset, token) {
    if (!(dialog instanceof HTMLElement) || !/^@(图片|视频|音频)\d+$/.test(String(token || ''))) return '';
    const references = referenceMap(dialog);
    references[referenceAssetKey(asset)] = token;
    dialog.dataset.nestReferenceMap = JSON.stringify(references);
    videoExtendReferenceSessions.set(referenceSessionKey(dialog), references);
    return token;
  }

  function referenceTokenForVideoExtendAsset(dialog, asset) {
    const references = referenceMap(dialog);
    const key = referenceAssetKey(asset);
    const known = String(references[key] || '');
    if (/^@(图片|视频|音频)\d+$/.test(known)) {
      const promptEditors = [...dialog.querySelectorAll('textarea')];
      const isCurrent = nativeVideoExtendReferences(dialog).some(item => item.token === known)
        || promptEditors.some(editor => videoExtendPromptReferenceTokens(editor).includes(known));
      if (isCurrent) return known;
      // Do not reuse a stale or previously corrupt token mapping after AI Flow
      // renumbers its reference list.
      forgetVideoExtendReference(dialog, asset);
    }
    const expectedName = normalizedVideoExtendReferenceName(asset?.name);
    if (!expectedName) return '';
    const item = nativeVideoExtendReferences(dialog).find(candidate => {
      const actualName = normalizedVideoExtendReferenceName(candidate.filename);
      // A token-only chip has no identity. Matching it through `endsWith('')`
      // made any clicked character reuse whichever reference chip appeared
      // first, such as Victor incorrectly becoming @图片2.
      return Boolean(actualName) && actualName === expectedName;
    });
    return item ? rememberVideoExtendReference(dialog, asset, item.token) : '';
  }

  function rememberVideoExtendReferenceWhenReady(dialog, asset, onResolved, options = {}) {
    const attempts = [0, 100, 300, 700, 1300, 2200, 3600, 5200];
    const editor = options.editor instanceof HTMLTextAreaElement ? options.editor : null;
    const beforeTokens = new Set(Array.isArray(options.beforeTokens) ? options.beforeTokens : []);
    const beforeNativeTokens = new Set(Array.isArray(options.beforeNativeTokens) ? options.beforeNativeTokens : []);
    const assignedToken = /^@(图片|视频|音频)\d+$/.test(String(options.assignedToken || '')) ? String(options.assignedToken) : '';
    let resolved = false;
    for (const delay of attempts) setTimeout(() => {
      if (resolved) return;
      let token = assignedToken || referenceTokenForVideoExtendAsset(dialog, asset);
      if (!token) {
        const insertedByNative = nativeVideoExtendReferences(dialog)
          .map(item => item.token).filter(candidate => !beforeNativeTokens.has(candidate));
        if (insertedByNative.length === 1) token = rememberVideoExtendReference(dialog, asset, insertedByNative[0]);
      }
      if (!token && editor) {
        const insertedByAIFlow = videoExtendPromptReferenceTokens(editor).filter(candidate => !beforeTokens.has(candidate));
        if (insertedByAIFlow.length === 1) token = rememberVideoExtendReference(dialog, asset, insertedByAIFlow[0]);
      }
      if (!token) return;
      resolved = true;
      if (typeof onResolved === 'function') onResolved(token);
    }, delay);
  }

  function forgetVideoExtendReference(dialog, asset) {
    if (!(dialog instanceof HTMLElement)) return;
    const references = referenceMap(dialog);
    delete references[referenceAssetKey(asset)];
    dialog.dataset.nestReferenceMap = JSON.stringify(references);
    videoExtendReferenceSessions.set(referenceSessionKey(dialog), references);
  }
  function referenceMap(dialog) {
    if (!(dialog instanceof HTMLElement)) return {};
    const key = referenceSessionKey(dialog);
    const existing = videoExtendReferenceSessions.get(key);
    if (existing) return existing;
    try {
      const parsed = JSON.parse(dialog.dataset.nestReferenceMap || '{}');
      const references = parsed && typeof parsed === 'object' ? parsed : {};
      videoExtendReferenceSessions.set(key, references);
      return references;
    } catch { return {}; }
  }

  function rememberWorkbenchPromptSelection(prompt, selection) {
    if (!(prompt instanceof HTMLTextAreaElement)) return;
    const length = prompt.value.length;
    const start = Math.max(0, Math.min(Number(selection?.start) || 0, length));
    const end = Math.max(start, Math.min(Number(selection?.end) || start, length));
    workbenchPromptSelections.set(prompt, { start, end });
  }

  function workbenchPromptSelection(prompt) {
    if (!(prompt instanceof HTMLTextAreaElement)) return null;
    const saved = workbenchPromptSelections.get(prompt);
    // The browser moves a programmatically populated textarea caret to the
    // end. Until the user selects a position, the predictable first target is
    // the prompt beginning instead of a hidden trailing line.
    if (!saved) return { start: 0, end: 0 };
    const length = prompt.value.length;
    const start = Math.max(0, Math.min(saved.start, length));
    const end = Math.max(start, Math.min(saved.end, length));
    return { start, end };
  }

  function removeNewestVideoExtendPromptToken(editor, token) {
    if (!(editor instanceof HTMLTextAreaElement) || !token) return false;
    const escaped = String(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = [...String(editor.value || '').matchAll(new RegExp(`${escaped}(?!\\d)`, 'g'))];
    const match = matches.at(-1);
    if (!match) return false;
    const before = editor.value.slice(0, match.index);
    const after = editor.value.slice(match.index + match[0].length);
    const left = before.replace(/[ \t]+$/, '');
    const right = after.replace(/^[ \t]+/, '');
    editor.value = left && right ? `${left} ${right}` : `${left}${right}`;
    return true;
  }

  function insertVideoExtendReferenceToken(editor, token, selection) {
    if (!(editor instanceof HTMLTextAreaElement) || !token) return '';
    const previous = recentReferenceInsertions.get(editor);
    const now = Date.now();
    if (previous?.token === token && now - previous.at < 550) return token;
    const start = Math.max(0, Math.min(Number(selection?.start ?? editor.selectionStart) || 0, editor.value.length));
    const end = Math.max(start, Math.min(Number(selection?.end ?? editor.selectionEnd) || start, editor.value.length));
    const previousScrollTop = editor.scrollTop
    const before = editor.value.slice(0, start);
    const after = editor.value.slice(end);
    const prefix = before && !/[\s\n]$/.test(before) ? ' ' : '';
    const suffix = after && !/^[\s\n]/.test(after) ? ' ' : '';
    editor.value = `${before}${prefix}${token}${suffix}${after}`;
    recentReferenceInsertions.set(editor, { token, at: now });
    const caret = (before + prefix + token).length;
    editor.focus(); editor.setSelectionRange(caret, caret);
    editor.scrollTop = previousScrollTop;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    requestAnimationFrame(() => { if (editor.isConnected) editor.scrollTop = previousScrollTop; });
    return token;
  }

  function collapseDuplicateVideoExtendReference(editor, token) {
    if (!(editor instanceof HTMLTextAreaElement) || !token) return false;
    const escaped = String(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const next = String(editor.value || '').replace(new RegExp(`(${escaped})(?:[ \\t]*${escaped})+`, 'g'), '$1');
    if (next === editor.value) return false;
    const position = Math.min(editor.selectionStart || 0, next.length);
    editor.value = next;
    editor.setSelectionRange(position, position);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  function scheduleDuplicateReferenceCollapse(editor, token) {
    for (const delay of [0, 180, 700, 1300]) setTimeout(() => collapseDuplicateVideoExtendReference(editor, token), delay);
  }
  function insertVideoExtendReferenceAtCaret(editor, asset, selection, dialog) {
    if (!(editor instanceof HTMLTextAreaElement)) return '';
    const key = referenceAssetKey(asset);
    const kind = key.split(':', 1)[0];
    const references = referenceMap(dialog);
    let token = String(references[key] || '');
    if (!new RegExp(`^@${kind}\\d+$`).test(token)) {
      const used = [...String(editor.value || '').matchAll(new RegExp(`@${kind}\\s*(\\d+)`, 'g'))]
        .map(match => Number(match[1]) || 0);
      token = `@${kind}${Math.max(0, ...used) + 1}`;
      if (dialog instanceof HTMLElement && key !== `${kind}:`) {
        references[key] = token;
        dialog.dataset.nestReferenceMap = JSON.stringify(references);
        videoExtendReferenceSessions.set(referenceSessionKey(dialog), references);
      }
    }
    return insertVideoExtendReferenceToken(editor, token, selection);
  }

  // AI Flow 原生素材选择器在侧边素材库里的只读副本。抄过来的缩略图常常是黑的：
  // 懒加载图片还没地址、视频没解出首帧、画布复制出来是空白。按原件逐个补上。
  // 真 AI Flow 上看到：缩略图就是原文件（图片每张 2–4 MB），视频 preload="none" 所以一直是黑的；
  // 一个项目上百个素材，所以图片保持懒加载、视频滚到眼前才去取第一帧（data-nest-lazy-src）。
  function copyNativePickerMedia(original, copy) {
    const originals = original.querySelectorAll('img, video, canvas');
    const copies = copy.querySelectorAll('img, video, canvas');
    originals.forEach((node, index) => {
      const twin = copies[index];
      if (!twin || twin.tagName !== node.tagName) return;
      if (node instanceof HTMLImageElement && twin instanceof HTMLImageElement) {
        const src = node.currentSrc || node.src || node.getAttribute('data-src') || node.getAttribute('data-original') || '';
        if (src && twin.getAttribute('src') !== src) twin.setAttribute('src', src);
        twin.loading = 'lazy';
      } else if (node instanceof HTMLVideoElement && twin instanceof HTMLVideoElement) {
        const src = node.currentSrc || node.src || node.querySelector('source')?.src || '';
        twin.muted = true;
        twin.preload = 'metadata';
        twin.removeAttribute('autoplay');
        if (node.poster) twin.poster = node.poster;
        twin.removeAttribute('src');
        if (src && !src.startsWith('blob:')) twin.dataset.nestLazySrc = src.includes('#') ? src : `${src}#t=0.1`;
      } else if (node instanceof HTMLCanvasElement && twin instanceof HTMLCanvasElement) {
        try {
          const image = document.createElement('img');
          image.src = node.toDataURL('image/png');
          image.className = twin.className;
          image.style.cssText = twin.style.cssText;
          image.style.objectFit = 'cover';
          twin.replaceWith(image);
        } catch { /* 跨域画布读不出像素，保留原样 */ }
      }
    });
  }

  function mountNativeVideoExtendPicker(panel, dialog) {
    const slot = panel.querySelector('[data-nest-native-picker]');
    const sourceButton = dialog.querySelector('#sd25RefAdd')
      || [...dialog.querySelectorAll('button')].find(button => /^@?素材$/.test(String(button.textContent || '').trim()));
    if (!slot || !sourceButton) return;
    const depth = node => {
      let count = 0;
      for (let current = node; current && current !== dialog; current = current.parentElement) count += 1;
      return count;
    };
    // 素材格子一样多时取最里层的那一层：外层还带着"@素材"按钮和说明文字，抄过来只会占地方
    const findPicker = () => [...dialog.querySelectorAll('div, section')]
      .filter(node => node.querySelector('[data-refpick]') && node.querySelector('input'))
      .sort((left, right) => right.querySelectorAll('[data-refpick]').length - left.querySelectorAll('[data-refpick]').length || depth(right) - depth(left))[0];
    let nativePickerObserver = null;
    let nativePickerRefreshTimer = null;
    let lazyVideoObserver = null;
    const scheduleNativePickerSync = () => {
      if (nativePickerRefreshTimer) clearTimeout(nativePickerRefreshTimer);
      nativePickerRefreshTimer = setTimeout(() => {
        nativePickerRefreshTimer = null;
        if (!slot.isConnected) { nativePickerObserver?.disconnect(); return; }
        const updatedPicker = findPicker();
        if (updatedPicker) syncNativePicker(updatedPicker);
      }, 80);
    };
    const syncNativePicker = nativePicker => {
      const copy = nativePicker.cloneNode(true);
      copyNativePickerMedia(nativePicker, copy);
      copy.removeAttribute('id');
      copy.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
      copy.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', () => {
          const original = nativePicker.querySelector('input');
          if (original instanceof HTMLInputElement && input instanceof HTMLInputElement) {
            original.value = input.value;
            original.dispatchEvent(new Event('input', { bubbles: true }));
            // AI Flow fetches results after the input event. Rebuild the side
            // copy from the updated native picker, including public packs.
            scheduleNativePickerSync();
          }
        });
      });
      copy.addEventListener('click', event => {
        const card = event.target instanceof Element && event.target.closest('[data-refpick]');
        const id = card?.getAttribute('data-refpick');
        if (id) nativePicker.querySelector(`[data-refpick="${CSS.escape(id)}"]`)?.click();
      });
      slot.replaceChildren(copy);
      lazyVideoObserver?.disconnect();
      lazyVideoObserver = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const video = entry.target;
          lazyVideoObserver.unobserve(video);
          if (video.dataset.nestLazySrc) video.src = video.dataset.nestLazySrc;
        }
      }, { root: slot, rootMargin: '120px' });
      copy.querySelectorAll('video[data-nest-lazy-src]').forEach(video => lazyVideoObserver.observe(video));
      requestAnimationFrame(() => {
        for (const node of [copy, ...copy.querySelectorAll('*')]) {
          const overflowY = getComputedStyle(node).overflowY;
          if (/(auto|scroll)/.test(overflowY) && node.scrollHeight > node.clientHeight + 4) {
            node.style.setProperty('max-height', 'none', 'important');
            node.style.setProperty('overflow-y', 'visible', 'important');
          }
        }
      });
      nativePickerObserver?.disconnect();
      nativePickerObserver = new MutationObserver(scheduleNativePickerSync);
      // 懒加载的缩略图是后来才改 src 的，也要跟着重抄
      nativePickerObserver.observe(nativePicker, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['src', 'poster', 'data-src'] });
    };
    const render = () => {
      sourceButton.click();
      const nativePicker = findPicker();
      if (!nativePicker) { slot.textContent = '正在读取 AI Flow 原生素材…'; return false; }
      syncNativePicker(nativePicker);
      return true;
    };
    if (!render()) setTimeout(render, 550);
  }
  function removeVideoExtendReferenceToken(editor, token) {
    if (!(editor instanceof HTMLTextAreaElement) || !token) return;
    const escaped = String(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    editor.value = editor.value.replace(new RegExp(`\\s*${escaped}`, 'g'), '');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const FOLDER_GLYPH = '<svg class="nx-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6a2 2 0 0 1 1.4.6L12 6h6.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/></svg>';

  function injectVideoExtendLibraryPanel() {
    const editor = currentVideoExtendEditor();
    const dialog = editor && videoExtendContainer(editor);
    const existing = document.getElementById(VIDEO_EXTEND_LIBRARY_PANEL_ID);
    if (!editor || !dialog) { existing?.remove(); return; }
    if (existing) return;
    ensureVideoExtendWorkbenchStyle();
    // 用 div 不用 aside/section：AI Flow 的"页面配色"会给所有 aside/section 强行刷底色
    const panel = document.createElement('div');
    panel.id = VIDEO_EXTEND_LIBRARY_PANEL_ID;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '视频延长素材库');
    const rect = dialog.getBoundingClientRect();
    panel.style.left = `${rect.right + 14 + 300 <= window.innerWidth ? rect.right + 14 : Math.max(12, rect.left - 314)}px`;
    panel.style.top = `${Math.max(12, Math.min(rect.top, window.innerHeight - 300))}px`;
    panel.innerHTML = '<div class="nx-head" data-nest-library-drag><button type="button" class="nx-btn nx-round" data-nest-library-back title="返回上级文件夹" aria-label="返回上级文件夹">←</button><div class="nx-title"><b data-nest-library-title>视频延长素材库</b><small>小旺仔素材库 · AI Flow 素材</small></div><button type="button" class="nx-btn" data-nest-library-refresh title="刷新素材">刷新</button></div><div class="nx-tip">点击素材即刻写入提示词光标处；拖动标题栏，右下角可缩放</div><div class="nx-scroll"><div class="nx-group" data-nest-library-group="native"><button type="button" class="nx-group-head" data-nest-library-group-toggle aria-expanded="true"><b>AI Flow 原生素材</b><span>收起</span></button><div class="nx-native" data-nest-native-picker>正在读取 AI Flow 原生素材…</div></div><div class="nx-group" data-nest-library-group="local"><div class="nx-group-head"><b>小旺仔素材库</b><span data-nest-library-path>全部</span></div><div class="nx-grid" data-nest-assets><div class="nx-empty">读取素材中…</div></div></div></div>';
    const list = panel.querySelector('[data-nest-assets]');
    const title = panel.querySelector('[data-nest-library-title]');
    const pathLabel = panel.querySelector('[data-nest-library-path]');
    const backButton = panel.querySelector('[data-nest-library-back]');
    const refreshButton = panel.querySelector('[data-nest-library-refresh]');
    const nativeGroup = panel.querySelector('[data-nest-library-group="native"]');
    const nativeToggle = panel.querySelector('[data-nest-library-group-toggle]');
    nativeToggle?.addEventListener('click', () => {
      const collapsed = nativeGroup?.dataset.collapsed !== 'true';
      if (nativeGroup) nativeGroup.dataset.collapsed = String(collapsed);
      nativeToggle.setAttribute('aria-expanded', String(!collapsed));
      const hint = nativeToggle.querySelector('span');
      if (hint) hint.textContent = collapsed ? '展开' : '收起';
    });
    let currentFolderId = '';
    let parentFolderId = null;
    const showNote = text => {
      if (!list) return;
      const note = document.createElement('div');
      note.className = 'nx-empty';
      note.textContent = text;
      list.replaceChildren(note);
    };
    const render = result => {
      if (!list) return;
      list.replaceChildren();
      if (!result?.ok) { showNote(result?.error || '素材库读取失败'); return; }
      if (title) title.textContent = result.folderId ? `素材库 / ${result.folderName || '文件夹'}` : '视频延长素材库';
      if (pathLabel) pathLabel.textContent = result.folderId ? (result.folderName || '文件夹') : '全部';
      parentFolderId = result.parentId || null;
      if (backButton instanceof HTMLButtonElement) backButton.disabled = !result.folderId;
      for (const folder of result.folders || []) {
        const button = document.createElement('button');
        button.type = 'button'; button.dataset.nestLibraryFolder = folder.id;
        button.className = 'nx-btn nx-folder';
        button.title = `打开文件夹：${folder.name}`;
        button.innerHTML = FOLDER_GLYPH;
        const label = document.createElement('span'); label.textContent = folder.name;
        button.append(label); button.addEventListener('click', () => load(folder.id)); list.appendChild(button);
      }
      if (!result.folders?.length && !result.assets?.length) { showNote('这个文件夹暂无可展示的媒体'); return; }
      for (const asset of result.assets) {
        const card = document.createElement('button');
        card.type = 'button'; card.dataset.nestLibraryAsset = asset.id;
        card.className = 'nx-btn nx-tile';
        card.title = asset.name;
        if (asset.thumbnail) {
          const image = document.createElement('img');
          image.src = asset.thumbnail; image.alt = asset.name; image.loading = 'lazy';
          image.className = 'nx-thumb';
          card.appendChild(image);
        } else {
          const placeholder = document.createElement('div');
          placeholder.textContent = String(asset.type || '').startsWith('video/') ? '视频' : '音频';
          placeholder.className = 'nx-thumb nx-kind';
          card.appendChild(placeholder);
        }
        const label = document.createElement('span'); label.textContent = asset.name; label.className = 'nx-name'; card.appendChild(label);
        card.addEventListener('click', () => {
          const projectId = currentProjectId();
          if (!projectId) { card.title = '未识别当前 AI Flow 项目'; return; }
          const workbenchPrompt = document.querySelector(`#${VIDEO_EXTEND_WORKBENCH_ID} [data-nest-workbench-prompt]`);
          const selection = workbenchPromptSelection(workbenchPrompt);
          const referenceTokensBefore = videoExtendPromptReferenceTokens(editor);
          const nativeReferenceTokensBefore = nativeVideoExtendReferences(dialog).map(item => item.token);
          const originalLabel = label.textContent;
          // A previously attached asset has a confirmed AI Flow token and can
          // be inserted immediately. A new asset must be inserted only by the
          // native picker after upload; pre-writing a guessed token made one
          // click create two tags and could bind the wrong image number.
          const knownToken = referenceTokenForVideoExtendAsset(dialog, asset);
          if (knownToken) {
            insertVideoExtendReferenceToken(editor, knownToken, selection);
            rememberWorkbenchPromptSelection(workbenchPrompt, {
              start: editor.selectionStart, end: editor.selectionEnd,
            });
            label.textContent = `已插入 ${knownToken}`;
            setTimeout(() => { if (card.isConnected) label.textContent = originalLabel; }, 1200);
            return;
          }
          card.disabled = true;
          label.textContent = '正在加入 AI Flow…';
          sendRuntimeMessage({ action: AIFLOW_REFERENCE_SELECT_ACTION, pageUrl: location.href, projectId, assetId: asset.id }, result => {
            if (result?.ok) {
              label.textContent = '正在写入提示词…';
              // Preserve the click-time selection. AI Flow normally writes the
              // real tag itself; only insert a fallback tag if it did not.
              // This avoids the historic duplicate-@ regression.
              rememberVideoExtendReferenceWhenReady(dialog, asset, token => {
                const wasAddedByThisClick = !referenceTokensBefore.includes(token);
                // AI Flow may append the native tag to the end while attaching
                // the material. Remove that one generated occurrence, then
                // place the confirmed tag at the click-time caret.
                if (wasAddedByThisClick && videoExtendPromptReferenceTokens(editor).includes(token)) {
                  removeNewestVideoExtendPromptToken(editor, token);
                }
                if (!videoExtendPromptReferenceTokens(editor).includes(token)) {
                  insertVideoExtendReferenceToken(editor, token, selection);
                }
                rememberWorkbenchPromptSelection(workbenchPrompt, {
                  start: editor.selectionStart, end: editor.selectionEnd,
                });
                if (card.isConnected) label.textContent = `已插入 ${token}`;
              }, {
                editor,
                beforeTokens: referenceTokensBefore,
                beforeNativeTokens: nativeReferenceTokensBefore,
                assignedToken: result?.referenceTokens?.[String(asset.id)],
              });
            } else {
              forgetVideoExtendReference(dialog, asset);
              label.textContent = (result?.error || '加入失败').slice(0, 18);
            }
            setTimeout(() => { if (card.isConnected) { card.disabled = false; label.textContent = originalLabel; } }, 2400);
          }, () => { forgetVideoExtendReference(dialog, asset); label.textContent = '加入失败'; setTimeout(() => { if (card.isConnected) { card.disabled = false; label.textContent = originalLabel; } }, 1800); });
        });
        list.appendChild(card);
      }
    };
    const load = (folderId = currentFolderId) => { currentFolderId = String(folderId || ''); sendRuntimeMessage({ action: AIFLOW_LIBRARY_ASSETS_ACTION, folderId: currentFolderId }, render, error => render({ ok: false, error: String(error?.message || error) })); };
    refreshButton?.addEventListener('click', () => load());
    backButton?.addEventListener('click', () => load(parentFolderId || ''));
    const dragHandle = panel.querySelector('[data-nest-library-drag]');
    dragHandle?.addEventListener('pointerdown', event => {
      if (event.target instanceof Element && event.target.closest('button')) return;
      panel.dataset.nestMoved = 'true';
      const start = { x: event.clientX, y: event.clientY, left: panel.offsetLeft, top: panel.offsetTop };
      const move = moveEvent => { panel.style.left = `${Math.max(4, Math.min(window.innerWidth - 80, start.left + moveEvent.clientX - start.x))}px`; panel.style.top = `${Math.max(4, Math.min(window.innerHeight - 50, start.top + moveEvent.clientY - start.y))}px`; };
      const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', end, { once: true });
    });
    document.body.appendChild(panel); mountNativeVideoExtendPicker(panel, dialog); load();
    requestAnimationFrame(arrangeVideoExtendWindows);
  }

  // 两个浮窗第一次出现时并排放在屏幕中间：工作台在左、素材库在右，顶边对齐、素材库和工作台一样高。
  // 屏幕放不下就让素材库靠右叠在工作台上。用户拖过哪个窗口，就不再替他摆那个。
  function arrangeVideoExtendWindows() {
    const workbench = document.getElementById(VIDEO_EXTEND_WORKBENCH_ID);
    const library = document.getElementById(VIDEO_EXTEND_LIBRARY_PANEL_ID);
    if (!workbench || !library || workbench.style.display === 'none' || workbench.dataset.nestArranged === 'true') return;
    const gap = 14, margin = 14;
    const width = workbench.offsetWidth, height = workbench.offsetHeight, libraryWidth = library.offsetWidth;
    const top = Math.max(margin, Math.round((window.innerHeight - height) / 2));
    const together = width + gap + libraryWidth + margin * 2 <= window.innerWidth;
    const left = Math.max(margin, Math.round(together ? (window.innerWidth - width - gap - libraryWidth) / 2 : (window.innerWidth - width) / 2));
    if (workbench.dataset.nestMoved !== 'true') {
      workbench.style.transform = 'none';
      workbench.style.left = `${left}px`;
      workbench.style.top = `${top}px`;
    }
    if (library.dataset.nestMoved !== 'true') {
      library.style.left = `${Math.max(margin, Math.min(window.innerWidth - libraryWidth - margin, left + width + gap))}px`;
      library.style.top = `${top}px`;
      library.style.height = `${Math.max(360, Math.min(height, window.innerHeight - top - margin))}px`;
    }
    workbench.dataset.nestArranged = 'true';
  }

  function ensureVideoExtendWorkbenchStyle() {
    if (document.getElementById(VIDEO_EXTEND_WORKBENCH_STYLE_ID)) return;
    const W = `#${VIDEO_EXTEND_WORKBENCH_ID}`, L = `#${VIDEO_EXTEND_LIBRARY_PANEL_ID}`, P = '#nest-aiflow-people-find-replace', R = `#${VIDEO_EXTEND_WORKBENCH_RETURN_ID}`;
    const style = document.createElement('style');
    style.id = VIDEO_EXTEND_WORKBENCH_STYLE_ID;
    // 两个浮窗按小旺仔素材库新界面的造型：大圆角窗口、圆角分区、胶囊按钮；颜色跟着 AI Flow「页面配色」（--nest-theme-*）。
    // AI Flow 自己的样式和「页面配色」都有很多带 !important 的通用规则（button、header、section、aside、
    // class 里带 card / tab / panel / item 的元素……），所以这里一律以窗口 ID 开头并加 !important，
    // 元素只用 div / button，class 名也避开那些关键词，免得被刷掉。
    style.textContent = `
      .nest-aiflow-video-extend-native-hidden { opacity: 0 !important; pointer-events: none !important; }
      ${W}, ${L}, ${P}, ${R} {
        --nx-bg: var(--nest-theme-overlay, #1c1f26);
        --nx-raise: var(--nest-theme-surface, #181b21);
        --nx-field: var(--nest-theme-field, #0b0d10);
        --nx-line: color-mix(in srgb, var(--nest-theme-border, #2a2f38) 75%, transparent);
        --nx-text: var(--nest-theme-text, #e8eaee);
        --nx-muted: var(--nest-theme-muted, #8b919c);
        --nx-accent: var(--nest-theme-accent, #6f9bff);
        --nx-primary: var(--nest-theme-primary, var(--nx-accent));
        --nx-on-primary: var(--nest-theme-primary-text, #ffffff);
        --nx-soft: color-mix(in srgb, var(--nx-text) 7%, transparent);
        --nx-soft-hover: color-mix(in srgb, var(--nx-text) 13%, transparent);
        --nx-tint: color-mix(in srgb, var(--nx-accent) 16%, transparent);
        --nx-danger: #f0717a;
        --nx-font: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      ${W}, ${L} {
        position: fixed !important; z-index: 2147483645 !important;
        display: flex !important; flex-direction: column !important;
        box-sizing: border-box !important; margin: 0 !important; padding: 0 !important;
        border: 1px solid var(--nx-line) !important; border-radius: 22px !important;
        background: var(--nx-bg) !important; color: var(--nx-text) !important;
        box-shadow: 0 32px 90px rgba(0, 0, 0, .55), inset 0 1px 0 rgba(255, 255, 255, .04) !important;
        font: 13px/1.45 var(--nx-font) !important; letter-spacing: normal !important; text-align: left !important;
        overflow: hidden !important;
      }
      ${W} { left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(820px, calc(100vw - 28px)); max-height: calc(100vh - 28px); }
      ${L} { z-index: 2147483646 !important; width: 340px; height: min(640px, calc(100vh - 24px)); min-width: 260px !important; max-width: calc(100vw - 24px) !important; min-height: 260px !important; max-height: calc(100vh - 24px) !important; resize:both !important; }
      ${W} *, ${P} *, ${L} :is(.nx-head, .nx-tip, .nx-scroll, .nx-group, .nx-group-head, .nx-grid, .nx-grid *) { box-sizing: border-box !important; letter-spacing: normal !important; text-transform: none !important; text-shadow: none !important; }

      /* 标题栏 */
      :is(${W}, ${L}) .nx-head { display: flex !important; align-items: center !important; gap: 10px !important; flex: none !important; margin: 0 !important; padding: 14px 14px 10px 16px !important; border: 0 !important; background: transparent !important; cursor: move !important; user-select: none !important; }
      :is(${W}, ${L}) .nx-mark { flex: none !important; display: grid !important; place-items: center !important; width: 34px !important; height: 34px !important; border-radius: 12px !important; background: var(--nx-primary) !important; color: var(--nx-on-primary) !important; font-size: 13px !important; font-weight: 800 !important; }
      :is(${W}, ${L}) .nx-title { flex: 1 1 auto !important; display: grid !important; gap: 1px !important; min-width: 0 !important; margin: 0 !important; }
      :is(${W}, ${L}) .nx-title b { display: block !important; overflow: hidden !important; color: var(--nx-text) !important; font-size: 15px !important; font-weight: 750 !important; line-height: 1.3 !important; white-space: nowrap !important; text-overflow: ellipsis !important; }
      :is(${W}, ${L}) .nx-ver:empty { display: none !important; }
      :is(${W}, ${L}) .nx-ver { margin-left: 8px !important; padding: 1px 7px !important; border-radius: 999px !important; background: var(--nx-soft) !important; color: var(--nx-muted) !important; font-size: 10px !important; font-weight: 650 !important; vertical-align: 2px !important; }
      :is(${W}, ${L}) .nx-title small { display: block !important; overflow: hidden !important; color: var(--nx-muted) !important; font-size: 11px !important; line-height: 1.4 !important; white-space: nowrap !important; text-overflow: ellipsis !important; }

      /* 按钮：胶囊形；主按钮用主题主色渐变 */
      :is(${W}, ${L}, ${P}) .nx-btn, ${R} {
        display: inline-flex !important; align-items: center !important; justify-content: center !important; gap: 6px !important;
        flex: none !important; float: none !important; width: auto !important; min-width: 0 !important; max-width: none !important; height: auto !important; min-height: 32px !important;
        margin: 0 !important; padding: 7px 14px !important;
        border: 0 !important; border-radius: 999px !important;
        background: var(--nx-soft) !important; color: var(--nx-text) !important;
        box-shadow: none !important; outline: none !important;
        font: 650 12px/1.2 var(--nx-font) !important; white-space: nowrap !important; text-decoration: none !important;
        cursor: pointer !important; transition: background-color .15s ease, color .15s ease, transform .15s ease, box-shadow .15s ease !important;
      }
      :is(${W}, ${L}, ${P}) .nx-btn:hover:not(:disabled) { background: var(--nx-soft-hover) !important; color: var(--nx-text) !important; }
      :is(${W}, ${L}, ${P}) .nx-btn:focus-visible { box-shadow: 0 0 0 2px var(--nx-accent) !important; }
      :is(${W}, ${L}, ${P}) .nx-btn:disabled { opacity: .5 !important; cursor: default !important; }
      :is(${W}, ${L}, ${P}) .nx-round { width: 32px !important; height: 32px !important; padding: 0 !important; color: var(--nx-muted) !important; font-size: 17px !important; line-height: 1 !important; }
      :is(${W}, ${L}, ${P}) .nx-mini { min-height: 24px !important; padding: 3px 10px !important; font-size: 11px !important; }
      :is(${W}, ${L}, ${P}) .nx-ghost { background: transparent !important; color: var(--nx-muted) !important; box-shadow: inset 0 0 0 1px var(--nx-line) !important; }
      :is(${W}, ${L}, ${P}) .nx-ghost:hover:not(:disabled) { background: var(--nx-soft) !important; color: var(--nx-text) !important; }
      :is(${W}, ${L}, ${P}) .nx-go { background: var(--nx-primary) !important; color: var(--nx-on-primary) !important; box-shadow: 0 10px 24px color-mix(in srgb, var(--nx-primary) 32%, transparent) !important; }
      :is(${W}, ${L}, ${P}) .nx-go:hover:not(:disabled) { background: color-mix(in srgb, var(--nx-primary) 88%, #fff) !important; color: var(--nx-on-primary) !important; transform: translateY(-1px) !important; }
      ${R} { position: fixed !important; right: 20px !important; bottom: 20px !important; z-index: 2147483647 !important; min-height: 40px !important; padding: 10px 18px !important; background: var(--nx-primary) !important; color: var(--nx-on-primary) !important; box-shadow: 0 12px 30px rgba(0, 0, 0, .45) !important; font-size: 13px !important; }
      ${R}:hover { background: var(--nx-primary) !important; color: var(--nx-on-primary) !important; transform: translateY(-1px) !important; }

      /* 延长工作台 */
      ${W} .nx-body { display: grid !important; grid-template-columns: minmax(0, 1.08fr) minmax(0, 1fr) !important; gap: 16px !important; flex: 1 1 auto !important; min-height: 0 !important; margin: 0 !important; padding: 2px 16px 14px !important; overflow: auto !important; border: 0 !important; background: transparent !important; }
      ${W} .nx-col { display: flex !important; flex-direction: column !important; gap: 14px !important; min-width: 0 !important; min-height: 0 !important; margin: 0 !important; }
      ${W} .nx-preview { position: relative !important; display: grid !important; place-items: center !important; flex: 1 1 auto !important; min-height: 260px !important; max-height: min(60vh, 540px) !important; margin: 0 !important; overflow: hidden !important; border: 0 !important; border-radius: 16px !important; background: #000 !important; color: var(--nx-muted) !important; font-size: 12px !important; }
      ${W} .nx-preview video { display: block !important; width: 100% !important; height: 100% !important; max-height: min(60vh, 540px) !important; margin: 0 !important; border: 0 !important; border-radius: 0 !important; background: #000 !important; object-fit: contain !important; }
      ${W} .nx-preview .nx-empty { max-width: 260px !important; padding: 20px !important; text-align: center !important; line-height: 1.6 !important; }
      ${W} .nx-field { display: grid !important; gap: 7px !important; min-width: 0 !important; margin: 0 !important; }
      ${W} .nx-label { display: block !important; margin: 0 !important; color: var(--nx-muted) !important; font-size: 12px !important; font-weight: 650 !important; }
      ${W} .nx-dirs { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 4px !important; margin: 0 !important; padding: 4px !important; border-radius: 999px !important; background: var(--nx-field) !important; }
      ${W} .nx-dirs .nx-btn { min-height: 34px !important; padding: 6px 10px !important; background: transparent !important; color: var(--nx-muted) !important; }
      ${W} .nx-dirs .nx-btn small { margin: 0 0 0 4px !important; color: inherit !important; font-size: 11px !important; font-weight: 500 !important; opacity: .78 !important; }
      ${W} .nx-dirs .nx-btn:hover:not(:disabled) { background: var(--nx-soft) !important; color: var(--nx-text) !important; }
      ${W} .nx-dirs .nx-btn[data-active="true"] { background: var(--nx-primary) !important; color: var(--nx-on-primary) !important; box-shadow: 0 6px 16px color-mix(in srgb, var(--nx-primary) 30%, transparent) !important; }
      ${W} .nx-row { display: flex !important; flex-wrap: wrap !important; align-items: flex-end !important; gap: 10px 12px !important; margin: 0 !important; }
      ${W} .nx-row > .nx-btn { margin-left: auto !important; min-height: 38px !important; background: var(--nx-tint) !important; color: var(--nx-text) !important; }
      ${W} .nx-stepper { display: inline-flex !important; align-items: center !important; gap: 2px !important; height: 38px !important; margin: 0 !important; padding: 3px !important; border-radius: 999px !important; background: var(--nx-field) !important; }
      ${W} .nx-stepper .nx-btn { width: 32px !important; height: 32px !important; padding: 0 !important; background: transparent !important; font-size: 16px !important; }
      ${W} .nx-stepper .nx-btn:hover:not(:disabled) { background: var(--nx-soft) !important; }
      ${W} .nx-stepper input { width: 40px !important; height: 32px !important; margin: 0 !important; padding: 0 !important; border: 0 !important; border-radius: 0 !important; background: transparent !important; box-shadow: none !important; outline: none !important; color: var(--nx-text) !important; font: 750 15px/1 var(--nx-font) !important; text-align: center !important; appearance: textfield !important; -moz-appearance: textfield !important; }
      ${W} .nx-stepper input::-webkit-inner-spin-button, ${W} .nx-stepper input::-webkit-outer-spin-button { margin: 0 !important; -webkit-appearance: none !important; }
      ${W} .nx-unit { padding: 0 10px 0 2px !important; color: var(--nx-muted) !important; font-size: 12px !important; }
      ${W} .nx-chips { display: flex !important; flex-wrap: wrap !important; align-items: flex-start !important; gap: 8px !important; min-height: 42px !important; max-height: 220px !important; overflow-y: auto !important; margin: 0 !important; padding: 8px 10px !important; border: 0 !important; border-radius: 14px !important; background: var(--nx-field) !important; color: var(--nx-muted) !important; font-size: 12px !important; line-height: 1.5 !important; }
      ${W} .nx-ref { position: relative !important; display: block !important; flex: none !important; width: 76px !important; margin: 0 !important; }
      ${W} .nx-ref-pick { display: grid !important; gap: 4px !important; width: 100% !important; height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; border: 0 !important; border-radius: 0 !important; background: transparent !important; box-shadow: none !important; color: var(--nx-text) !important; font: inherit !important; text-align: left !important; cursor: pointer !important; }
      ${W} .nx-ref-media { position: relative !important; display: grid !important; place-items: center !important; width: 76px !important; height: 76px !important; overflow: hidden !important; border-radius: 12px !important; background: #000 !important; box-shadow: inset 0 0 0 1px var(--nx-line) !important; color: var(--nx-muted) !important; font-size: 12px !important; font-weight: 650 !important; }
      ${W} .nx-ref-media[data-empty="true"] { background: var(--nx-raise) !important; }
      ${W} .nx-ref-media :is(img, video) { display: block !important; width: 100% !important; height: 100% !important; margin: 0 !important; border: 0 !important; border-radius: 0 !important; object-fit: cover !important; }
      ${W} .nx-ref-token { position: absolute !important; left: 4px !important; bottom: 4px !important; padding: 1px 6px !important; border-radius: 999px !important; background: rgba(0, 0, 0, .62) !important; color: #fff !important; font-size: 10px !important; font-weight: 700 !important; line-height: 1.5 !important; }
      ${W} .nx-ref-name { display: block !important; overflow: hidden !important; color: var(--nx-muted) !important; font-size: 10px !important; line-height: 1.3 !important; white-space: nowrap !important; text-overflow: ellipsis !important; }
      ${W} .nx-ref-pick:hover .nx-ref-media { box-shadow: inset 0 0 0 2px var(--nx-accent) !important; }
      ${W} .nx-ref-pick:hover .nx-ref-name { color: var(--nx-text) !important; }
      ${W} .nx-ref [data-nest-workbench-reference-remove] { position: absolute !important; top: 4px !important; right: 4px !important; width: 22px !important; height: 22px !important; min-height: 22px !important; padding: 0 !important; background: rgba(0, 0, 0, .62) !important; color: #fff !important; font-size: 13px !important; line-height: 1 !important; opacity: 0 !important; }
      ${W} .nx-ref:hover [data-nest-workbench-reference-remove], ${W} .nx-ref [data-nest-workbench-reference-remove]:focus-visible { opacity: 1 !important; }
      ${W} .nx-ref [data-nest-workbench-reference-remove]:hover:not(:disabled) { background: var(--nx-danger) !important; color: #fff !important; }
      ${W} .nx-grow { flex: 1 1 auto !important; }
      ${W} .nx-prompt-head { display: flex !important; align-items: center !important; gap: 8px !important; margin: 0 !important; }
      ${W} .nx-prompt-head .nx-label { margin-right: auto !important; }
      ${W} [data-nest-workbench-count] { color: var(--nx-muted) !important; font-size: 11px !important; font-variant-numeric: tabular-nums !important; }
      ${W} .nx-prompt-wrap { position: relative !important; margin: 0 !important; }
      ${W} textarea[data-nest-workbench-prompt] { display: block !important; width: 100% !important; min-height: 180px !important; max-height: calc(100vh - 230px) !important; margin: 0 !important; padding: 12px 14px !important; resize: vertical !important; border: 1px solid transparent !important; border-radius: 14px !important; background: var(--nx-field) !important; color: var(--nx-text) !important; box-shadow: none !important; outline: none !important; font: 14px/1.65 var(--nx-font) !important; caret-color: var(--nx-accent) !important; }
      ${W} textarea[data-nest-workbench-prompt]:focus { border-color: var(--nx-accent) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--nx-accent) 20%, transparent) !important; }
      ${W} textarea[data-nest-workbench-prompt]::placeholder { color: var(--nx-muted) !important; opacity: .8 !important; }
      ${W} [data-nest-workbench-reference-hints] { min-height: 16px !important; margin: 0 !important; color: var(--nx-muted) !important; font-size: 11px !important; }
      ${W} .nx-foot { display: flex !important; align-items: center !important; gap: 10px !important; flex: none !important; margin: 0 !important; padding: 12px 16px 16px !important; border: 0 !important; border-top: 1px solid var(--nx-line) !important; background: transparent !important; }
      ${W} .nx-foot .nx-btn { min-height: 42px !important; padding: 8px 18px !important; }
      ${W} .nx-foot .nx-go { flex: 1 1 auto !important; font-size: 14px !important; font-weight: 750 !important; }

      /* 视频延长素材库 */
      ${L} .nx-tip { flex: none !important; margin: 0 14px 10px !important; padding: 8px 12px !important; border-radius: 12px !important; background: var(--nx-tint) !important; color: var(--nx-text) !important; font-size: 12px !important; line-height: 1.5 !important; }
      ${L} .nx-scroll { display: flex !important; flex-direction: column !important; gap: 10px !important; flex: 1 1 auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 12px 14px !important; overflow: auto !important; background: transparent !important; }
      ${L} .nx-group { flex: none !important; margin: 0 !important; padding: 10px !important; border: 0 !important; border-radius: 16px !important; background: var(--nx-raise) !important; color: var(--nx-text) !important; }
      ${L} .nx-group-head { display: flex !important; align-items: center !important; justify-content: space-between !important; gap: 8px !important; width: 100% !important; min-height: 0 !important; margin: 0 0 8px !important; padding: 2px 4px !important; border: 0 !important; border-radius: 8px !important; background: transparent !important; color: var(--nx-text) !important; box-shadow: none !important; font: inherit !important; text-align: left !important; cursor: default !important; }
      ${L} button.nx-group-head { cursor: pointer !important; }
      ${L} .nx-group-head b { color: var(--nx-text) !important; font-size: 12px !important; font-weight: 750 !important; }
      ${L} .nx-group-head span { min-width: 0 !important; overflow: hidden !important; color: var(--nx-muted) !important; font-size: 11px !important; white-space: nowrap !important; text-overflow: ellipsis !important; }
      ${L} .nx-group[data-collapsed="true"] .nx-native { display: none !important; }
      ${L} .nx-group[data-collapsed="true"] .nx-group-head { margin-bottom: 0 !important; }
      ${L} .nx-native { max-height: 340px !important; overflow: auto !important; color: var(--nx-muted) !important; font-size: 12px !important; }
      ${L} .nx-native :is(img, video) { object-fit: cover !important; }
      ${L} .nx-grid { display: grid !important; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)) !important; align-content: start !important; gap: 8px !important; margin: 0 !important; }
      ${L} .nx-folder { grid-column: 1 / -1 !important; justify-content: flex-start !important; gap: 8px !important; width: 100% !important; min-height: 36px !important; padding: 7px 12px !important; border-radius: 12px !important; background: var(--nx-soft) !important; text-align: left !important; }
      ${L} .nx-folder .nx-glyph { flex: none !important; width: 16px !important; height: 16px !important; color: var(--nx-accent) !important; fill: currentColor !important; }
      ${L} .nx-folder span { min-width: 0 !important; overflow: hidden !important; text-overflow: ellipsis !important; }
      ${L} .nx-tile { display: flex !important; flex-direction: column !important; align-items: stretch !important; justify-content: flex-start !important; gap: 5px !important; width: 100% !important; padding: 5px !important; border-radius: 12px !important; background: transparent !important; text-align: left !important; white-space: normal !important; }
      ${L} .nx-tile:hover:not(:disabled) { background: var(--nx-soft) !important; }
      ${L} .nx-thumb { display: block !important; width: 100% !important; aspect-ratio: 4 / 3 !important; margin: 0 !important; border: 0 !important; border-radius: 9px !important; background: var(--nx-field) !important; object-fit: contain !important; }
      ${L} .nx-kind { display: grid !important; place-items: center !important; color: var(--nx-accent) !important; font-size: 12px !important; font-weight: 700 !important; }
      ${L} .nx-name { display: -webkit-box !important; overflow: hidden !important; -webkit-box-orient: vertical !important; -webkit-line-clamp: 2 !important; color: var(--nx-text) !important; font-size: 11px !important; font-weight: 500 !important; line-height: 1.35 !important; overflow-wrap: anywhere !important; }
      :is(${W}, ${L}) .nx-empty { grid-column: 1 / -1 !important; padding: 10px 4px !important; color: var(--nx-muted) !important; font-size: 12px !important; }

      /* 人物查找和替换 */
      ${P} { position: absolute !important; inset: 12px !important; z-index: 20 !important; display: grid !important; align-content: start !important; gap: 10px !important; min-height: 270px !important; margin: 0 !important; padding: 18px !important; overflow: auto !important; border: 1px solid var(--nx-line) !important; border-radius: 18px !important; background: var(--nx-bg) !important; color: var(--nx-text) !important; box-shadow: 0 20px 60px rgba(0, 0, 0, .5) !important; font: 13px/1.45 var(--nx-font) !important; }
      body > ${P} { position: fixed !important; inset: auto !important; top: 80px !important; right: 24px !important; width: min(380px, calc(100vw - 32px)) !important; z-index: 2147483647 !important; }
      ${P} .nx-people-head { display: flex !important; align-items: center !important; gap: 8px !important; }
      ${P} .nx-people-head b { color: var(--nx-text) !important; font-size: 15px !important; font-weight: 750 !important; }
      ${P} [data-nest-person-position] { margin-right: auto !important; color: var(--nx-muted) !important; font-size: 12px !important; }
      ${P} [data-nest-person-status] { min-height: 18px !important; color: var(--nx-accent) !important; font-size: 12px !important; }
      ${P} .nx-people-field { display: grid !important; gap: 6px !important; margin: 0 !important; color: var(--nx-muted) !important; font-size: 12px !important; font-weight: 650 !important; }
      ${P} .nx-people-field :is(input, select) { width: 100% !important; height: 38px !important; margin: 0 !important; padding: 0 12px !important; border: 1px solid transparent !important; border-radius: 12px !important; background: var(--nx-field) !important; color: var(--nx-text) !important; box-shadow: none !important; outline: none !important; font: 500 13px/1.2 var(--nx-font) !important; }
      ${P} .nx-people-field :is(input, select):focus { border-color: var(--nx-accent) !important; }
      ${P} .nx-people-actions { display: flex !important; flex-wrap: wrap !important; gap: 8px !important; margin-top: 4px !important; }

      @media (max-width: 760px) {
        ${W} .nx-body { grid-template-columns: minmax(0, 1fr) !important; }
        ${W} .nx-preview { min-height: 180px !important; }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function isNativeVideoExtendModeOpen() {
    const editor = currentVideoExtendEditor();
    const dialog = editor && videoExtendContainer(editor);
    return Boolean(dialog?.dataset.nestWorkbenchDisabled === 'true');
  }

  function nativeVideoExtendDirectionText(dialog, input) {
    if (!(dialog instanceof HTMLElement) || !(input instanceof HTMLInputElement)) return '';
    const id = String(input.id || '').trim();
    const labels = id ? [...dialog.querySelectorAll('label')].filter(label => label.htmlFor === id) : [];
    return [
      input.value, input.name, input.id, input.dataset.direction,
      input.getAttribute('aria-label'), input.getAttribute('title'),
      ...labels.map(label => label.textContent), input.closest('label')?.textContent,
    ].filter(Boolean).join(' ');
  }

  function nativeVideoExtendDirectionInput(dialog, direction) {
    if (!(dialog instanceof HTMLElement)) return null;
    const expected = direction === 'start' ? /(?:向前|补开头|prepend|start)/i : /(?:向后|接结尾|append|end)/i;
    const radios = [...dialog.querySelectorAll('input[type=radio]')];
    const matched = radios.find(input => expected.test(nativeVideoExtendDirectionText(dialog, input)));
    // AI Flow renders this two-item group in a fixed end/start order. This
    // fallback is only used for icon-only releases with no readable label.
    return matched || (radios.length === 2 ? radios[direction === 'start' ? 1 : 0] : null);
  }

  function syncVideoExtendDirectionButtons(workbench, dialog) {
    if (!(workbench instanceof HTMLElement)) return;
    for (const button of workbench.querySelectorAll('[data-nest-workbench-direction]')) {
      const native = nativeVideoExtendDirectionInput(dialog, button.dataset.nestWorkbenchDirection);
      const active = Boolean(native?.checked);
      button.dataset.active = String(active);
      button.setAttribute('aria-pressed', String(active));
      button.disabled = !native;
      button.title = native ? (active ? '当前延长方向' : '点击切换延长方向') : '未读取到 AI Flow 延长方向';
    }
  }

  // 工作台里预览用的视频地址，按顺序试：AI Flow 弹窗里的视频（普通地址）→ 刚才点「延长」的那张任务卡片的
  // 视频文件 → 弹窗里的 blob 地址。blob 往往是只能接一次的视频流，第二个播放器接不上，就是以前黑屏的原因。
  function videoExtendReferencePreview(dialog, item) {
    const kind = item.token.startsWith('@视频') ? 'video' : item.token.startsWith('@音频') ? 'audio' : 'image';
    if (item.thumb) return { kind: 'image', src: item.thumb };
    const name = String(item.title || item.filename || '').replace(/[×✕✖]+$/, '').trim();
    if (name && dialog instanceof HTMLElement) {
      for (const tile of dialog.querySelectorAll('[data-refpick]')) {
        const media = tile.querySelector('img, video');
        const src = media ? String(media.currentSrc || media.getAttribute('src') || '') : '';
        let decoded = src;
        try { decoded = decodeURIComponent(src); } catch { /* 保持原样 */ }
        if (!media || (String(tile.textContent || '').trim() !== name && !decoded.includes(name))) continue;
        const absolute = src ? new URL(src, location.href).href : '';
        return { kind: media.tagName === 'VIDEO' ? 'video' : 'image', src: absolute };
      }
    }
    return { kind, src: '' };
  }

  function videoExtendPreviewSources(dialog) {
    const video = dialog?.querySelector('video');
    const direct = [], streams = [];
    for (const value of [video?.currentSrc, video?.src, video?.querySelector('source')?.src]) {
      const text = String(value || '').trim();
      if (!text) continue;
      (text.startsWith('blob:') ? streams : direct).push(text);
    }
    const fromTask = lastVideoExtendTaskId ? [videoUrl(lastVideoExtendTaskId)] : [];
    return { sources: [...new Set([...direct, ...fromTask, ...streams])], poster: String(video?.poster || '') };
  }

  function videoExtendSourceName(src) {
    try {
      const name = decodeURIComponent(new URL(src, location.href).pathname.split('/').pop() || '');
      return name && !src.startsWith('blob:') ? name : '';
    } catch { return ''; }
  }

  function injectVideoExtendWorkbench() {
    if (videoExtendSubmitting) return;
    const editor = currentVideoExtendEditor();
    const dialog = editor && videoExtendContainer(editor);
    let existing = document.getElementById(VIDEO_EXTEND_WORKBENCH_ID);
    if (!editor || !dialog || !isVideoExtendDialogShown(dialog)) {
      existing?.remove();
      document.getElementById(VIDEO_EXTEND_WORKBENCH_RETURN_ID)?.remove();
      document.querySelector('.nest-aiflow-video-extend-native-hidden')?.classList.remove('nest-aiflow-video-extend-native-hidden');
      // 窗口已经关了：上次选的「用原窗口」只对那一次有效，下次打开仍弹小旺仔延长工作台
      if (dialog) delete dialog.dataset.nestWorkbenchDisabled;
      return;
    }
    if (existing && videoExtendWorkbenchDialogs.get(existing) !== dialog) {
      // 上一个延长窗口留下的工作台（原窗口模式下是藏起来的），换了新窗口就重建
      existing.remove();
      document.getElementById(VIDEO_EXTEND_WORKBENCH_RETURN_ID)?.remove();
      existing = null;
    }
    if (existing) return;
    // “打开 AI Flow 原窗口” is an explicit opt-out for this modal instance.
    // The observer runs after every DOM change, so remember that choice instead
    // of immediately hiding the native dialog again.
    if (dialog.dataset.nestWorkbenchDisabled === 'true') {
      // Keep this control outside AI Flow's React dialog tree. Inserting it in
      // the native footer makes React remove it, then our observer add it back,
      // which can lock up the page in a render loop.
      dialog.querySelector('[data-nest-workbench-return]')?.remove();
      if (!document.getElementById(VIDEO_EXTEND_WORKBENCH_RETURN_ID)) {
        ensureVideoExtendWorkbenchStyle();
        const back = document.createElement('button');
        back.id = VIDEO_EXTEND_WORKBENCH_RETURN_ID;
        back.type = 'button'; back.textContent = '返回小旺仔工作台';
        back.title = '切回小旺仔自定义视频延长窗口';
        back.addEventListener('click', () => {
          delete dialog.dataset.nestWorkbenchDisabled;
          back.remove();
          injectVideoExtendWorkbench();
        });
        document.body.appendChild(back);
      }
      return;
    }
    document.getElementById(VIDEO_EXTEND_WORKBENCH_RETURN_ID)?.remove();
    ensureVideoExtendWorkbenchStyle();
    dialog.classList.add('nest-aiflow-video-extend-native-hidden');
    const seconds = dialog.querySelector('input[type=number]');
    // 用 div 不用 section/header：AI Flow 的"页面配色"会给所有 section/header 强行刷底色
    const workbench = document.createElement('div');
    workbench.id = VIDEO_EXTEND_WORKBENCH_ID;
    videoExtendWorkbenchDialogs.set(workbench, dialog);
    workbench.setAttribute('role', 'dialog');
    workbench.setAttribute('aria-label', '小旺仔延长工作台');
    workbench.innerHTML = `<div class="nx-head" data-nest-workbench-drag><span class="nx-mark" aria-hidden="true">▶</span><div class="nx-title"><b>小旺仔延长工作台<span class="nx-ver"></span></b><small data-nest-workbench-source>AI Flow 视频延长</small></div><button type="button" class="nx-btn nx-round" data-nest-workbench-close title="关闭（AI Flow 的延长窗口一起关闭）" aria-label="关闭">×</button></div><div class="nx-body"><div class="nx-col"><div class="nx-preview" data-nest-workbench-preview><div class="nx-empty">正在读取视频预览…</div></div></div><div class="nx-col"><div class="nx-field"><span class="nx-label">延长方向</span><div class="nx-dirs" role="group" aria-label="延长方向"><button type="button" class="nx-btn" data-nest-workbench-direction="end">向后延长<small>接结尾</small></button><button type="button" class="nx-btn" data-nest-workbench-direction="start">向前延长<small>补开头</small></button></div></div><div class="nx-row"><div class="nx-field"><span class="nx-label">延长秒数</span><div class="nx-stepper"><button type="button" class="nx-btn" data-nest-workbench-seconds-step="-1" aria-label="少 1 秒">−</button><input type="number" data-nest-workbench-seconds aria-label="延长秒数"><button type="button" class="nx-btn" data-nest-workbench-seconds-step="1" aria-label="多 1 秒">+</button><span class="nx-unit">秒</span></div></div><button type="button" class="nx-btn" data-nest-workbench-match title="识别提示词里的人物，替换成对应的 @图片 引用">自动匹配人物</button></div><div class="nx-field"><span class="nx-label">延长参考素材</span><div class="nx-chips" data-nest-workbench-chips>暂无参考素材</div></div><div class="nx-field nx-grow"><div class="nx-prompt-head"><span class="nx-label">延长提示词</span><span data-nest-workbench-count>0</span><button type="button" class="nx-btn nx-mini" data-nest-workbench-clear>清空</button></div><div class="nx-prompt-wrap"><textarea data-nest-workbench-prompt placeholder="写接着做什么，例如人物转身走向门口；可直接输入 @图片1、@视频1 等引用…"></textarea></div><div data-nest-workbench-reference-hints></div></div></div></div><div class="nx-foot"><button type="button" class="nx-btn nx-ghost" data-nest-workbench-native>打开 AI Flow 原窗口</button><button type="button" class="nx-btn nx-go" data-nest-workbench-submit>提交延长</button></div>`;
    const prompt = workbench.querySelector('[data-nest-workbench-prompt]');
    const secondsInput = workbench.querySelector('[data-nest-workbench-seconds]');
    const chips = workbench.querySelector('[data-nest-workbench-chips]');
    const promptCount = workbench.querySelector('[data-nest-workbench-count]');
    const referenceHints = workbench.querySelector('[data-nest-workbench-reference-hints]');
    const preview = workbench.querySelector('[data-nest-workbench-preview]');
    const sourceLabel = workbench.querySelector('[data-nest-workbench-source]');
    const versionLabel = workbench.querySelector('.nx-ver');
    try { const version = chrome.runtime.getManifest?.()?.version; if (versionLabel && version) versionLabel.textContent = `v${version}`; } catch { /* 扩展刚重新加载时读不到，留空 */ }
    if (secondsInput instanceof HTMLInputElement) {
      secondsInput.min = String(Number(seconds?.min) || 4);
      secondsInput.max = String(Number(seconds?.max) || 30);
      secondsInput.step = String(Number(seconds?.step) || 1);
    }
    let previewKey = null;
    const showPreview = (sources, poster, index) => {
      if (!(preview instanceof HTMLElement)) return;
      const src = sources[index];
      if (!src) {
        const note = document.createElement('div');
        note.className = 'nx-empty';
        note.textContent = sources.length ? '视频预览没能加载，可以点「打开 AI Flow 原窗口」查看原视频。' : '正在读取视频预览…';
        preview.replaceChildren(note);
        return;
      }
      const video = document.createElement('video');
      video.controls = true; video.playsInline = true; video.preload = 'metadata';
      if (poster) video.poster = poster;
      video.addEventListener('error', () => { if (video.isConnected) showPreview(sources, poster, index + 1); }, { once: true });
      video.addEventListener('loadedmetadata', () => {
        if (workbench.dataset.nestMoved === 'true') return;
        delete workbench.dataset.nestArranged;
        requestAnimationFrame(arrangeVideoExtendWindows);
      }, { once: true });
      video.src = src;
      preview.replaceChildren(video);
      const name = videoExtendSourceName(src);
      if (sourceLabel) sourceLabel.textContent = name ? `AI Flow 视频延长 · ${name}` : 'AI Flow 视频延长';
    };
    const renderPreview = () => {
      const { sources, poster } = videoExtendPreviewSources(dialog);
      const key = `${sources.join('|')}#${poster}`;
      if (key === previewKey) return;
      previewKey = key;
      showPreview(sources, poster, 0);
    };
    const resizeWorkbenchPrompt = (force = false) => {
      if (!(prompt instanceof HTMLTextAreaElement)) return;
      if (force || prompt.dataset.nestManualResize !== 'true') {
        prompt.style.height = 'auto';
        prompt.style.height = `${Math.min(window.innerHeight - 250, Math.max(180, prompt.scrollHeight))}px`;
      }
      if (promptCount) { const limit = Number(editor.maxLength); promptCount.textContent = `${prompt.value.length}${limit > 0 ? ` / ${limit}` : ''}`; }
      if (referenceHints) {
        referenceHints.replaceChildren();
        const tags = [...new Set([...prompt.value.matchAll(/@(图片|视频|音频)\s*\d+/g)].map(match => match[0].replace(/\s+/g, '')))];
        if (tags.length) referenceHints.textContent = `已在提示词中引用：${tags.join(' · ')}`;
      }
    };
    // 参考素材条每 300ms 对一次；内容没变就不重画，免得鼠标悬停、点击被打断
    let chipsKey = null;
    const sync = () => {
      // Do not assign the same value on every timer tick: assigning textarea
      // value resets its scrollTop and throws the reader back to the top.
      if (prompt instanceof HTMLTextAreaElement && document.activeElement !== prompt && prompt.value !== editor.value) {
        const scrollTop = prompt.scrollTop;
        const selection = workbenchPromptSelection(prompt);
        prompt.value = editor.value;
        resizeWorkbenchPrompt();
        if (selection) prompt.setSelectionRange(
          Math.min(selection.start, prompt.value.length),
          Math.min(selection.end, prompt.value.length)
        );
        prompt.scrollTop = scrollTop;
      }
      if (secondsInput instanceof HTMLInputElement && document.activeElement !== secondsInput) secondsInput.value = String(seconds?.value || 5);
      syncVideoExtendDirectionButtons(workbench, dialog);
      renderPreview();
      if (chips) {
        // Keep AI Flow's actual token. Its chip list can be displayed in a
        // different order from the token numbers, so never renumber by index.
        const referenceItems = nativeVideoExtendReferences(dialog);
        const knownTokens = new Set(referenceItems.map(item => item.token));
        for (const match of String(editor.value || '').matchAll(/@(图片|视频|音频)\s*(\d+)/g)) {
          const token = `@${match[1]}${match[2]}`;
          if (!knownTokens.has(token)) { knownTokens.add(token); referenceItems.push({ token, filename: '' }); }
        }
        // 按 AI Flow 的编号排（@图片1、@视频2、@图片3……），编号本身不改
        const referenceNumber = item => Number(item.token.match(/\d+/)?.[0]) || 0;
        referenceItems.sort((left, right) => referenceNumber(left) - referenceNumber(right) || left.token.localeCompare(right.token, 'zh-CN', { numeric: true }));
        const previews = referenceItems.map(item => videoExtendReferencePreview(dialog, item));
        const nextChipsKey = referenceItems.map((item, index) => `${item.token}:${item.title || item.filename}:${previews[index].src}`).join('|');
        if (nextChipsKey === chipsKey) return;
        chipsKey = nextChipsKey;
        chips.replaceChildren();
        if (!referenceItems.length) chips.textContent = '暂无参考素材；从右侧小旺仔素材库点击素材即可加入。';
        referenceItems.forEach(({ token, filename, title }, index) => {
          const preview = previews[index];
          const chip = document.createElement('div');
          chip.className = 'nx-ref';
          chip.dataset.nestWorkbenchReferenceToken = token;
          // AI Flow 的参考条里带着自己的删除按钮（×），从文字里取文件名会多一个 ×，显示时去掉
          const shownName = String(title || filename || '').replace(/[×✕✖]+$/, '').trim();
          chip.title = shownName ? `${token} · ${shownName}` : token;
          const insert = document.createElement('button');
          insert.type = 'button'; insert.className = 'nx-ref-pick'; insert.dataset.nestWorkbenchReferenceInsert = token;
          insert.title = `点击在当前光标插入 ${token}${shownName ? `（${shownName}）` : ''}`;
          const media = document.createElement('span');
          media.className = 'nx-ref-media';
          if (preview.src && preview.kind === 'video') {
            const video = document.createElement('video');
            video.muted = true; video.playsInline = true; video.preload = 'metadata';
            video.src = preview.src.includes('#') ? preview.src : `${preview.src}#t=0.1`;
            media.appendChild(video);
          } else if (preview.src) {
            const image = document.createElement('img');
            image.src = preview.src; image.alt = ''; image.loading = 'lazy';
            media.appendChild(image);
          } else {
            media.textContent = preview.kind === 'video' ? '视频' : preview.kind === 'audio' ? '♪' : '图片';
            media.dataset.empty = 'true';
          }
          const badge = document.createElement('span');
          badge.className = 'nx-ref-token'; badge.textContent = token;
          media.appendChild(badge);
          const label = document.createElement('span');
          label.className = 'nx-ref-name'; label.textContent = shownName || token;
          insert.append(media, label);
          insert.addEventListener('click', () => {
            if (!(prompt instanceof HTMLTextAreaElement)) return;
            insertVideoExtendReferenceToken(prompt, token, { start: prompt.selectionStart, end: prompt.selectionEnd });
          });
          const remove = document.createElement('button');
          remove.type = 'button'; remove.className = 'nx-btn nx-ref-del'; remove.dataset.nestWorkbenchReferenceRemove = token;
          remove.textContent = '×'; remove.title = `删除参考素材 ${token}`; remove.setAttribute('aria-label', `删除参考素材 ${token}`);
          remove.addEventListener('click', () => {
            if (!(prompt instanceof HTMLTextAreaElement)) return;
            remove.disabled = true;
            const hasNativeReference = nativeVideoExtendReferences(dialog).some(item => item.token === token);
            const nativeRemovalRequested = removeNativeVideoExtendReference(dialog, token);
            if (hasNativeReference && !nativeRemovalRequested) {
              remove.disabled = false;
              remove.title = `AI Flow 没有返回 ${token} 的删除控件，请稍后重试`;
              return;
            }
            forgetVideoExtendReferenceToken(dialog, token);
            removeVideoExtendReferenceToken(editor, token);
            prompt.value = editor.value;
            resizeWorkbenchPrompt();
            chipsKey = null;
            setTimeout(sync, 160);
          });
          chip.append(insert, remove); chips.appendChild(chip);
        });
      }
    };
    prompt?.addEventListener('pointerdown', () => {
      if (!(prompt instanceof HTMLTextAreaElement)) return;
      const startHeight = prompt.offsetHeight;
      window.addEventListener('pointerup', () => { if (Math.abs(prompt.offsetHeight - startHeight) > 3) prompt.dataset.nestManualResize = 'true'; }, { once: true });
    });
    const rememberPromptCaret = () => {
      if (prompt instanceof HTMLTextAreaElement) {
        rememberWorkbenchPromptSelection(prompt, { start: prompt.selectionStart, end: prompt.selectionEnd });
      }
    };
    prompt?.addEventListener('pointerup', () => requestAnimationFrame(rememberPromptCaret));
    prompt?.addEventListener('keyup', rememberPromptCaret);
    prompt?.addEventListener('select', rememberPromptCaret);
    prompt?.addEventListener('input', () => {
      rememberPromptCaret();
      editor.value = prompt.value;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      resizeWorkbenchPrompt();
    });
    workbench.querySelector('[data-nest-workbench-clear]')?.addEventListener('click', () => { if (prompt instanceof HTMLTextAreaElement) { prompt.value = ''; prompt.dispatchEvent(new Event('input', { bubbles: true })); prompt.focus(); } });
    secondsInput?.addEventListener('input', () => { if (seconds) { seconds.value = secondsInput.value; seconds.dispatchEvent(new Event('input', { bubbles: true })); seconds.dispatchEvent(new Event('change', { bubbles: true })); } });
    for (const stepButton of workbench.querySelectorAll('[data-nest-workbench-seconds-step]')) stepButton.addEventListener('click', () => {
      if (!(secondsInput instanceof HTMLInputElement)) return;
      const min = Number(secondsInput.min) || 4, max = Number(secondsInput.max) || 30, step = Number(secondsInput.step) || 1;
      const current = Number(secondsInput.value) || Number(seconds?.value) || 5;
      secondsInput.value = String(Math.max(min, Math.min(max, current + step * Number(stepButton.dataset.nestWorkbenchSecondsStep))));
      secondsInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    workbench.querySelector('[data-nest-workbench-match]')?.addEventListener('click', event => startVideoExtendPeopleFindReplace(dialog, editor, workbench, event.currentTarget));
    for (const button of workbench.querySelectorAll('[data-nest-workbench-direction]')) button.addEventListener('click', () => {
      const native = nativeVideoExtendDirectionInput(dialog, button.dataset.nestWorkbenchDirection);
      if (native && !native.checked) native.click();
      syncVideoExtendDirectionButtons(workbench, dialog);
      setTimeout(() => { if (workbench.isConnected) syncVideoExtendDirectionButtons(workbench, dialog); }, 0);
    });
    workbench.querySelector('[data-nest-workbench-submit]')?.addEventListener('click', event => {
      const nativeSubmit = [...dialog.querySelectorAll('button')].find(button => String(button.textContent || '').trim() === '提交延长');
      if (!(nativeSubmit instanceof HTMLButtonElement) || nativeSubmit.disabled) return;
      const submitButton = event.currentTarget;
      if (submitButton instanceof HTMLButtonElement) { submitButton.disabled = true; submitButton.textContent = '提交中…'; }
      // AI Flow re-renders its dialog during submit. Stop all extension DOM
      // work first so that re-render cannot race the native submit handler.
      workbench.dataset.nestWorkbenchSubmitting = 'true';
      videoExtendSubmitting = true;
      pageMutationObserver?.disconnect();
      if (liveSyncTimer) { clearInterval(liveSyncTimer); liveSyncTimer = null; }
      document.getElementById(VIDEO_EXTEND_LIBRARY_PANEL_ID)?.remove();
      promptHighlighters.get(editor)?.dispose();
      editor.classList.remove(PROMPT_HIGHLIGHT_CLASS);
      dialog.classList.remove('nest-aiflow-video-extend-native-hidden');
      workbench.remove();
      nativeSubmit.click();
      resumeAfterVideoExtendDialogCloses(dialog, () => { videoExtendSubmitting = false; });
    });
    workbench.querySelector('[data-nest-workbench-close]')?.addEventListener('click', () => {
      const nativeRoot = dialog.closest('[role="dialog"], .modal, .dialog') || dialog;
      const closeButton = [...nativeRoot.querySelectorAll('button')].find(button => /(?:^×$|关闭|close)/i.test([
        button.textContent, button.getAttribute('aria-label'), button.getAttribute('title'), button.className,
      ].filter(Boolean).join(' ')));
      dialog.dataset.nestWorkbenchDisabled = 'true';
      dialog.classList.remove('nest-aiflow-video-extend-native-hidden');
      workbench.remove();
      if (closeButton) closeButton.click();
      else {
        // Newer AI Flow dialogs use an icon-only close control. Escape is the
        // same native cancel path when that control has no stable selector.
        const escape = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true });
        dialog.dispatchEvent(escape);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      }
    });
    workbench.querySelector('[data-nest-workbench-native]')?.addEventListener('click', () => {
      // Keep the workbench instance alive. Removing it makes the page observer
      // rebuild the integration while AI Flow re-renders its native modal.
      dialog.dataset.nestWorkbenchDisabled = 'true';
      pageMutationObserver?.disconnect();
      if (liveSyncTimer) { clearInterval(liveSyncTimer); liveSyncTimer = null; }
      document.getElementById(VIDEO_EXTEND_LIBRARY_PANEL_ID)?.remove();
      dialog.classList.remove('nest-aiflow-video-extend-native-hidden');
      // Native mode is still an AI Flow prompt. Keep its reference mirror
      // mounted so @图片/@视频/@音频 highlights remain visible after switching.
      ensurePromptHighlightStyles();
      attachPromptHighlighter(editor);
      requestAnimationFrame(() => promptHighlighters.get(editor)?.refreshValue());
      // 样式表里给浮窗写了 display: flex !important（防 AI Flow 样式），所以隐藏也要带 important，否则藏不住
      workbench.style.setProperty('display', 'none', 'important');
      document.getElementById(VIDEO_EXTEND_WORKBENCH_RETURN_ID)?.remove();
      const back = document.createElement('button');
      back.id = VIDEO_EXTEND_WORKBENCH_RETURN_ID;
      back.type = 'button'; back.textContent = '返回小旺仔工作台';
      back.title = '切回小旺仔自定义视频延长窗口';
      back.addEventListener('click', () => {
        delete dialog.dataset.nestWorkbenchDisabled;
        dialog.classList.add('nest-aiflow-video-extend-native-hidden');
        workbench.style.removeProperty('display');
        pageMutationObserver?.observe(document.documentElement, PAGE_OBSERVER_OPTIONS);
        ensureLiveSyncTimer();
        back.remove();
      });
      document.body.appendChild(back);
      resumeAfterVideoExtendDialogCloses(dialog, () => {
        delete dialog.dataset.nestWorkbenchDisabled;
        back.remove();
        workbench.remove();
      });
    });
    const nestWorkbenchDrag = workbench.querySelector('[data-nest-workbench-drag]');
    nestWorkbenchDrag?.addEventListener('pointerdown', event => {
      if (event.target instanceof Element && event.target.closest('button, select')) return;
      const box = workbench.getBoundingClientRect();
      const start = { x: event.clientX, y: event.clientY, left: box.left, top: box.top };
      workbench.dataset.nestMoved = 'true';
      workbench.style.transform = 'none';
      const move = moveEvent => {
        const maxLeft = Math.max(4, window.innerWidth - workbench.offsetWidth - 4);
        const maxTop = Math.max(4, window.innerHeight - Math.min(workbench.offsetHeight, window.innerHeight - 8) - 4);
        workbench.style.left = `${Math.max(4, Math.min(maxLeft, start.left + moveEvent.clientX - start.x))}px`;
        workbench.style.top = `${Math.max(4, Math.min(maxTop, start.top + moveEvent.clientY - start.y))}px`;
      };
      const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end, { once: true });
    });
    document.body.appendChild(workbench); sync(); resizeWorkbenchPrompt();
    requestAnimationFrame(arrangeVideoExtendWindows);
    const timer = setInterval(() => { if (!workbench.isConnected || !dialog.isConnected) { clearInterval(timer); return; } if (workbench.style.display === 'none' || dialog.dataset.nestWorkbenchDisabled === 'true') return; sync(); }, 300);
  }

  function extractVideoExtendStoryboardNames(text) {
    const names = new Set();
    const source = String(text || '');
    for (const match of source.matchAll(/(?:人物|角色|姓名|出场人物|主角|男主|女主)\s*[：:]?\s*([^，。；;\n]{2,60})/g)) {
      for (const value of match[1].split(/[、/，,和及与]+/)) {
        const name = value.trim().replace(/^(?:是|为)\s*/, '').slice(0, 40);
        if (/^[\u4e00-\u9fffA-Za-z][\u4e00-\u9fffA-Za-z0-9 _.-]{1,39}$/.test(name)) names.add(name);
      }
    }
    for (const match of source.matchAll(/\b[A-Z][A-Z0-9_-]{1,24}\b/g)) {
      if (!['AI', 'FLOW', 'JSON', 'VO', 'CUT'].includes(match[0])) names.add(match[0]);
    }
    // English character cues such as "Carlos says" and dialogue labels such as
    // "Selena:" are common in AI Flow storyboards, but are not necessarily all caps.
    for (const match of source.matchAll(/(?:^|[\n。；;])\s*([A-Z][a-z]{1,30})\s*(?:[：:]|说|道|看向|走向)/gm)) names.add(match[1]);
    for (const match of source.matchAll(/\b([A-Z][a-z]{2,30})\b/g)) {
      if (!['The', 'This', 'That', 'With', 'From', 'Then', 'When', 'After', 'Before', 'Camera', 'Wide', 'Close', 'Medium', 'Scene', 'Shot'].includes(match[1])) names.add(match[1]);
    }
    return [...names].slice(0, 24);
  }

  function insertMatchedStoryboardReferenceTags(editor, matches) {
    if (!(editor instanceof HTMLTextAreaElement)) return 0;
    let value = String(editor.value || '');
    let inserted = 0;
    for (const match of (Array.isArray(matches) ? matches : [])) {
      const name = String(match?.matchedName || '').trim();
      const token = /^@图片\d+$/.test(String(match?.referenceToken || '')) ? String(match.referenceToken) : '';
      if (!name || !token) continue;
      const outcome = replaceVideoExtendPersonReference(value, name, `${token} ${name}`, { all: true });
      value = outcome.value; inserted += outcome.replaced;
    }
    if (inserted) { editor.value = value; editor.dispatchEvent(new Event('input', { bubbles: true })); }
    return inserted;
  }
  function exactImageReferenceToken(value) {
    return /^@图片\d+$/.test(String(value || '')) ? String(value) : '';
  }

  function referenceTokenForMatchedPerson(dialog, match) {
    const direct = exactImageReferenceToken(match?.referenceToken);
    if (direct) return direct;
    const needles = [match?.matchedName, match?.name].map(value => normalizedVideoExtendReferenceName(value)).filter(Boolean);
    if (!needles.length) return '';
    const reference = nativeVideoExtendReferences(dialog).find(item => exactImageReferenceToken(item.token)
      && needles.some(needle => normalizedVideoExtendReferenceName(item.filename).includes(needle)));
    return reference?.token || '';
  }

  function replaceVideoExtendPersonReference(value, name, replacement, { all = false } = {}) {
    const person = String(name || '').trim();
    const target = String(replacement || '').trim();
    if (!person || !/^@图片\d+\s+\S/.test(target)) return { value: String(value || ''), replaced: 0 };
    const escaped = person.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = /^[A-Za-z0-9_-]+$/.test(person)
      ? new RegExp(`(^|[^A-Za-z0-9_-])(@?${escaped})(?![A-Za-z0-9_-])`, 'gi')
      : new RegExp(`(^|[^\\u4e00-\\u9fff])(@?${escaped})`, 'g');
    let replaced = 0;
    const next = String(value || '').replace(pattern, (whole, prefix, found, offset, source) => {
      const before = String(source).slice(0, Number(offset) + String(prefix || '').length);
      if (/@(?:图片|视频|音频)\d+\s*$/.test(before) || (!all && replaced > 0)) return whole;
      replaced += 1;
      return `${prefix}${target}`;
    });
    return { value: next, replaced };
  }

  function openVideoExtendPeopleFindReplace(dialog, editor, workbench, names, matchingAssets = [], notice = '') {
    if (!(dialog instanceof HTMLElement) || !(editor instanceof HTMLTextAreaElement)) return;
    document.getElementById('nest-aiflow-people-find-replace')?.remove();
    const references = nativeVideoExtendReferences(dialog).filter(item => exactImageReferenceToken(item.token));
    const normalized = value => String(value || '').trim().toLocaleLowerCase('zh-CN');
    const byName = new Map((Array.isArray(matchingAssets) ? matchingAssets : [])
      .filter(item => String(item?.matchedName || '').trim()).map(item => [normalized(item.matchedName), item]));
    const rows = [...new Set((Array.isArray(names) ? names : []).map(name => String(name || '').trim()).filter(Boolean))].map(name => {
      const match = byName.get(normalized(name)) || { matchedName: name };
      const token = referenceTokenForMatchedPerson(dialog, match);
      return { name, token, replacement: token ? `${token} ${name}` : '' };
    });
    if (!rows.length) return;
    ensureVideoExtendWorkbenchStyle();
    // 用 div 不用 section：AI Flow 的"页面配色"会给所有 section 强行刷底色
    const panel = document.createElement('div');
    panel.id = 'nest-aiflow-people-find-replace'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', '人物查找和替换');
    panel.innerHTML = '<div class="nx-people-head"><b>人物查找和替换</b><span data-nest-person-position></span><button type="button" class="nx-btn nx-round" data-nest-person-close aria-label="关闭" title="关闭">×</button></div><div data-nest-person-status></div><label class="nx-people-field"><span>查找</span><input data-nest-person-find readonly></label><label class="nx-people-field"><span>替换为</span><input data-nest-person-replace placeholder="请选择图片参考"></label><label class="nx-people-field"><span>使用参考图</span><select data-nest-person-reference><option value="">选择 @图片引用</option></select></label><div class="nx-people-actions"><button type="button" class="nx-btn" data-nest-person-prev>上一个</button><button type="button" class="nx-btn" data-nest-person-next>下一个</button><button type="button" class="nx-btn" data-nest-person-replace-one>替换当前</button><button type="button" class="nx-btn nx-go" data-nest-person-replace-all>全部替换</button></div>';
    const findInput = panel.querySelector('[data-nest-person-find]'); const replaceInput = panel.querySelector('[data-nest-person-replace]');
    const referenceSelect = panel.querySelector('[data-nest-person-reference]'); const position = panel.querySelector('[data-nest-person-position]'); const status = panel.querySelector('[data-nest-person-status]');
    let index = 0;
    const updateEditor = value => { editor.value = value; editor.dispatchEvent(new Event('input', { bubbles: true })); };
    const render = () => {
      const row = rows[index];
      if (!(findInput instanceof HTMLInputElement) || !(replaceInput instanceof HTMLInputElement) || !(referenceSelect instanceof HTMLSelectElement)) return;
      findInput.value = row.name; replaceInput.value = row.replacement; referenceSelect.replaceChildren(new Option('选择 @图片引用', ''));
      for (const reference of references) referenceSelect.add(new Option(`${reference.token} ${reference.filename || '参考图'}`, reference.token, false, reference.token === row.token));
      position.textContent = `${index + 1} / ${rows.length}`;
      status.textContent = row.replacement ? '已匹配参考图；可直接替换。' : (notice || '未找到对应参考图，请从下拉列表选择。');
    };
    referenceSelect?.addEventListener('change', () => { const row = rows[index]; row.token = exactImageReferenceToken(referenceSelect.value); row.replacement = row.token ? `${row.token} ${row.name}` : ''; render(); });
    replaceInput?.addEventListener('input', () => { rows[index].replacement = replaceInput.value; });
    const apply = all => {
      const applicable = all ? rows : [rows[index]]; let value = editor.value; let replaced = 0;
      for (const row of applicable) { const outcome = replaceVideoExtendPersonReference(value, row.name, row.replacement, { all }); value = outcome.value; replaced += outcome.replaced; }
      if (replaced) updateEditor(value);
      status.textContent = replaced ? `已替换 ${replaced} 处人物引用。` : '没有可替换的人名，或请先选择 @图片引用。';
    };
    panel.querySelector('[data-nest-person-prev]')?.addEventListener('click', () => { index = (index + rows.length - 1) % rows.length; render(); });
    panel.querySelector('[data-nest-person-next]')?.addEventListener('click', () => { index = (index + 1) % rows.length; render(); });
    panel.querySelector('[data-nest-person-replace-one]')?.addEventListener('click', () => apply(false));
    panel.querySelector('[data-nest-person-replace-all]')?.addEventListener('click', () => apply(true));
    panel.querySelector('[data-nest-person-close]')?.addEventListener('click', () => panel.remove());
    (workbench instanceof HTMLElement ? workbench : document.body).appendChild(panel); render();
  }

  function startVideoExtendPeopleFindReplace(dialog, editor, workbench, button) {
    if (!(editor instanceof HTMLTextAreaElement)) return;
    const names = extractVideoExtendStoryboardNames(editor.value).sort((left, right) => right.length - left.length);
    const original = button?.textContent || '自动匹配人物';
    if (!names.length) { if (button) { button.textContent = '未识别人物'; setTimeout(() => { if (button.isConnected) button.textContent = original; }, 1800); } return; }
    const projectId = currentProjectId();
    if (!projectId) { openVideoExtendPeopleFindReplace(dialog, editor, workbench, names, [], '未识别当前 AI Flow 项目，请手动选择参考图。'); return; }
    // Show the find-and-replace panel immediately. It refreshes with exact
    // image tokens when the asynchronous match and attachment finish.
    openVideoExtendPeopleFindReplace(dialog, editor, workbench, names, [], '正在匹配人物素材…');
    if (button instanceof HTMLButtonElement) { button.disabled = true; button.textContent = '匹配素材中…'; }
    sendRuntimeMessage({ action: AIFLOW_STORYBOARD_MATCH_ACTION, pageUrl: location.href, projectId, names }, result => {
      openVideoExtendPeopleFindReplace(dialog, editor, workbench, names, result?.matchingAssets || [], result?.error || '');
      if (button instanceof HTMLButtonElement) { button.disabled = false; button.textContent = original; }
    }, () => {
      openVideoExtendPeopleFindReplace(dialog, editor, workbench, names, [], '匹配服务暂不可用，请手动选择参考图。');
      if (button instanceof HTMLButtonElement) { button.disabled = false; button.textContent = original; }
    });
  }

  function injectVideoExtendAutoMatchButton() {
    const editor = currentVideoExtendEditor();
    const dialog = editor && videoExtendContainer(editor);
    if (!editor || !dialog) return;
    const sourceButton = dialog.querySelector('#sd25RefAdd')
      || [...dialog.querySelectorAll('button')].find(button => /^@?素材$/.test(String(button.textContent || '').trim()));
    if (!sourceButton || sourceButton.parentElement?.querySelector('[data-nest-auto-match-people]')) return;
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.nestAutoMatchPeople = 'true';
    button.textContent = '自动匹配人物'; button.title = '识别人物并打开查找替换，可将 Carlos 替换为 @图片3 Carlos';
    button.style.cssText = 'margin-left:6px;border:1px solid #80713e;border-radius:5px;background:#2e2917;color:#f0d887;padding:4px 8px;font:inherit;cursor:pointer';
    button.addEventListener('click', () => {
      startVideoExtendPeopleFindReplace(dialog, editor, document.getElementById(VIDEO_EXTEND_WORKBENCH_ID), button);
    });
    sourceButton.insertAdjacentElement('afterend', button);
  }

  function ensureAIFlowThemeStyle() {
    if (document.getElementById(AIFLOW_THEME_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = AIFLOW_THEME_STYLE_ID;
    style.textContent = `
      body[data-nest-aiflow-theme] { --nest-theme-bg:#0f1115; --nest-theme-sidebar:#13161b; --nest-theme-surface:#181b21; --nest-theme-field:#0b0d10; --nest-theme-overlay:#1c1f26; --nest-theme-border:#2a2f38; --nest-theme-text:#e8eaee; --nest-theme-muted:#8b919c; --nest-theme-accent:#6f9bff; --nest-theme-button:#1d2027; --nest-theme-button-hover:#262b34; --nest-theme-selected:#202b42; --nest-theme-primary:#3f6fe6; --nest-theme-primary-text:#ffffff; }
      body[data-nest-aiflow-theme="polar-purple"] { --nest-theme-bg:#111015; --nest-theme-sidebar:#15141a; --nest-theme-surface:#1a1920; --nest-theme-field:#0c0b10; --nest-theme-overlay:#1f1d26; --nest-theme-border:#2e2b37; --nest-theme-text:#ece9f2; --nest-theme-muted:#928e9f; --nest-theme-accent:#a898ff; --nest-theme-button:#201e27; --nest-theme-button-hover:#29263a; --nest-theme-selected:#2a2542; --nest-theme-primary:#7a64e6; --nest-theme-primary-text:#ffffff; }
      body[data-nest-aiflow-theme="emerald"] { --nest-theme-bg:#0e1211; --nest-theme-sidebar:#121716; --nest-theme-surface:#171c1b; --nest-theme-field:#0a0d0c; --nest-theme-overlay:#1b2120; --nest-theme-border:#29302e; --nest-theme-text:#e6ece9; --nest-theme-muted:#8a9592; --nest-theme-accent:#4fd3a5; --nest-theme-button:#1c2220; --nest-theme-button-hover:#242b29; --nest-theme-selected:#19302a; --nest-theme-primary:#3fbf92; --nest-theme-primary-text:#06130e; }
      body[data-nest-aiflow-theme="graphite"] { --nest-theme-bg:#111111; --nest-theme-sidebar:#161616; --nest-theme-surface:#1b1b1b; --nest-theme-field:#0b0b0b; --nest-theme-overlay:#202020; --nest-theme-border:#2f2f2f; --nest-theme-text:#ededed; --nest-theme-muted:#8f8f8f; --nest-theme-accent:#d6d6d6; --nest-theme-button:#222222; --nest-theme-button-hover:#2b2b2b; --nest-theme-selected:#303030; --nest-theme-primary:#ececec; --nest-theme-primary-text:#121212; }
      body[data-nest-aiflow-theme="twilight-orange"] { --nest-theme-bg:#12100e; --nest-theme-sidebar:#171412; --nest-theme-surface:#1c1916; --nest-theme-field:#0c0b0a; --nest-theme-overlay:#221e1a; --nest-theme-border:#332d27; --nest-theme-text:#efe9e3; --nest-theme-muted:#9b9188; --nest-theme-accent:#f2ab66; --nest-theme-button:#231f1b; --nest-theme-button-hover:#2c2722; --nest-theme-selected:#352a1d; --nest-theme-primary:#e89a52; --nest-theme-primary-text:#1b1006; }
      body[data-nest-aiflow-theme="sakura"] { --nest-theme-bg:#131012; --nest-theme-sidebar:#181417; --nest-theme-surface:#1d181c; --nest-theme-field:#0d0b0c; --nest-theme-overlay:#231d22; --nest-theme-border:#352c32; --nest-theme-text:#f1e9ed; --nest-theme-muted:#9d9097; --nest-theme-accent:#f297b8; --nest-theme-button:#241e23; --nest-theme-button-hover:#2d252b; --nest-theme-selected:#3a2431; --nest-theme-primary:#e283a8; --nest-theme-primary-text:#1b0811; }
      body[data-nest-aiflow-theme] { background:var(--nest-theme-bg) !important; color:var(--nest-theme-text) !important; accent-color:var(--nest-theme-accent) !important; }
      body[data-nest-aiflow-theme] * { scrollbar-color:var(--nest-theme-accent) var(--nest-theme-surface) !important; }
      body[data-nest-aiflow-theme] :is([class*="sidebar"], [class*="panel"], [class*="header"], [class*="card"], [class*="modal"], [class*="drawer"], [class*="toolbar"], [class*="menu"], [class*="option"], [class*="setting"], [class*="param"], [class*="ratio"], [class*="switch"]) { border-color:var(--nest-theme-border) !important; }
      body[data-nest-aiflow-theme] :is(input, textarea, select) { background-color:var(--nest-theme-field) !important; color:var(--nest-theme-text) !important; border-color:var(--nest-theme-border) !important; caret-color:var(--nest-theme-accent) !important; }
      body[data-nest-aiflow-theme] :is(input:focus, textarea:focus, select:focus) { border-color:var(--nest-theme-accent) !important; box-shadow:0 0 0 2px color-mix(in srgb,var(--nest-theme-accent) 22%,transparent) !important; }
      body[data-nest-aiflow-theme] :is(progress, meter) { accent-color:var(--nest-theme-accent) !important; }
      body[data-nest-aiflow-theme] :is(input[type="checkbox"], input[type="radio"]) { accent-color:var(--nest-theme-accent) !important; }
       /* AI Flow 修补标注色块通过 data-mc 保存固定颜色，不跟随页面主题。 */
       body[data-nest-aiflow-theme] button:not([data-mc]) { border-color:var(--nest-theme-border) !important; background-color:var(--nest-theme-button) !important; color:var(--nest-theme-text) !important; }
       body[data-nest-aiflow-theme] button:not([data-mc]):hover:not(:disabled) { background-color:var(--nest-theme-button-hover) !important; border-color:var(--nest-theme-accent) !important; color:var(--nest-theme-text) !important; }
       body[data-nest-aiflow-theme] :is(button.active, button.selected, button[aria-pressed="true"], button[aria-checked="true"], button[class*="active"], button[class*="selected"], button[class*="checked"], button[class*="primary"], button[class*="submit"], button[class*="generate"], .active > button, .selected > button, [class*="active"] > button, [class*="selected"] > button):not([data-mc]) { background:var(--nest-theme-primary) !important; color:var(--nest-theme-primary-text) !important; border-color:var(--nest-theme-primary) !important; box-shadow:0 0 0 1px color-mix(in srgb,var(--nest-theme-primary) 32%,transparent),0 8px 24px color-mix(in srgb,var(--nest-theme-primary) 16%,transparent) !important; }
      body[data-nest-aiflow-theme] :is([role="switch"], [class*="switch"], [class*="Switch"], [class*="toggle"], [class*="Toggle"]) { background-color:var(--nest-theme-surface) !important; border-color:var(--nest-theme-border) !important; }
      body[data-nest-aiflow-theme] :is([role="switch"][aria-checked="true"], [class*="switch"][aria-checked="true"], [class*="toggle"][aria-checked="true"], [class*="checked"], [class*="Checked"]) { background-color:var(--nest-theme-primary) !important; border-color:var(--nest-theme-primary) !important; color:var(--nest-theme-primary-text) !important; }
      body[data-nest-aiflow-theme] :is([class*="ratio"], [class*="Ratio"], [class*="segment"], [class*="Segment"], [class*="pill"], [class*="Pill"], [class*="tag"], [class*="Tag"]) button { background-color:var(--nest-theme-button) !important; border-color:var(--nest-theme-border) !important; color:var(--nest-theme-text) !important; }
      body[data-nest-aiflow-theme] :is([class*="ratio"], [class*="Ratio"], [class*="segment"], [class*="Segment"], [class*="pill"], [class*="Pill"], [class*="tag"], [class*="Tag"]) :is(button[aria-pressed="true"], button[class*="active"], button[class*="selected"], .active, .selected) { background:var(--nest-theme-selected) !important; border-color:var(--nest-theme-accent) !important; color:var(--nest-theme-text) !important; }
      body[data-nest-aiflow-theme] :is([class*="progress"], [class*="Progress"], [class*="slider"], [class*="Slider"]) { --primary:var(--nest-theme-accent) !important; --accent:var(--nest-theme-accent) !important; color:var(--nest-theme-accent) !important; }
      body[data-nest-aiflow-theme] :is(header, nav, aside, main, section, article, footer, [class*="Header"], [class*="header"], [class*="Sidebar"], [class*="sidebar"], [class*="Sider"], [class*="sider"], [class*="Nav"], [class*="nav"], [class*="Tabs"], [class*="tabs"], [class*="Tab"], [class*="tab"], [class*="Panel"], [class*="panel"], [class*="Card"], [class*="card"], [class*="Content"], [class*="content"], [class*="Form"], [class*="form"], [class*="Option"], [class*="option"], [class*="Collapse"], [class*="collapse"], [class*="Accordion"], [class*="accordion"]) { border-color:var(--nest-theme-border) !important; }
      body[data-nest-aiflow-theme] :is(aside, nav, [class*="Sidebar"], [class*="sidebar"], [class*="Sider"], [class*="sider"], [class*="Menu"], [class*="menu"]) { background-color:var(--nest-theme-sidebar) !important; color:var(--nest-theme-text) !important; }
      body[data-nest-aiflow-theme] :is(header, [class*="Header"], [class*="header"], [class*="Top"], [class*="top"], [class*="Bar"], [class*="bar"]) { background-color:var(--nest-theme-bg) !important; border-color:var(--nest-theme-border) !important; color:var(--nest-theme-text) !important; }
      body[data-nest-aiflow-theme] :is(section, article, [class*="Panel"], [class*="panel"], [class*="Card"], [class*="card"], [class*="Box"], [class*="box"], [class*="Block"], [class*="block"], [class*="Collapse"], [class*="collapse"], [class*="Accordion"], [class*="accordion"], [class*="Popover"], [class*="popover"], [class*="Dropdown"], [class*="dropdown"]) { background-color:var(--nest-theme-surface) !important; border-color:var(--nest-theme-border) !important; color:var(--nest-theme-text) !important; }
      body[data-nest-aiflow-theme] :is([class*="Tab"], [class*="tab"], [role="tab"], [class*="Segment"], [class*="segment"], [class*="Selector"], [class*="selector"], [class*="Select"], [class*="select"], [class*="Radio"], [class*="radio"]) { border-color:var(--nest-theme-border) !important; color:var(--nest-theme-text) !important; }
      body[data-nest-aiflow-theme] :is([role="tab"][aria-selected="true"], [class*="Tab"][aria-selected="true"], [class*="tab"][aria-selected="true"], [class*="Tab"][class*="active"], [class*="tab"][class*="active"], [class*="Segment"][class*="active"], [class*="segment"][class*="active"], [class*="Radio"][class*="checked"], [class*="radio"][class*="checked"]) { background:var(--nest-theme-selected) !important; border-color:var(--nest-theme-accent) !important; color:var(--nest-theme-text) !important; box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--nest-theme-accent) 32%,transparent) !important; }
      body[data-nest-aiflow-theme] :is([class*="Item"], [class*="item"], [class*="List"], [class*="list"], [class*="Episode"], [class*="episode"]) { border-color:color-mix(in srgb,var(--nest-theme-border) 72%,transparent) !important; }
      body[data-nest-aiflow-theme] :is([class*="Item"][class*="active"], [class*="item"][class*="active"], [class*="Item"][class*="selected"], [class*="item"][class*="selected"], [aria-selected="true"], [data-state="active"], [data-active="true"]) { background:var(--nest-theme-selected) !important; border-color:var(--nest-theme-accent) !important; color:var(--nest-theme-text) !important; }
      body[data-nest-aiflow-theme] :is(svg, [class*="Icon"], [class*="icon"]) { color:var(--nest-theme-muted) !important; }
      body[data-nest-aiflow-theme] :is(button:hover svg, button[aria-pressed="true"] svg, button[class*="active"] svg, [aria-selected="true"] svg, [class*="active"] [class*="Icon"], [class*="selected"] [class*="Icon"]) { color:var(--nest-theme-primary-text) !important; }
      body[data-nest-aiflow-theme] :is([class*="Create"], [class*="create"], [class*="Generate"], [class*="generate"], [class*="Submit"], [class*="submit"]) button, body[data-nest-aiflow-theme] button:has(:is(svg, span)):is([class*="primary"], [class*="submit"], [class*="generate"]) { background:var(--nest-theme-primary) !important; border-color:var(--nest-theme-primary) !important; color:var(--nest-theme-primary-text) !important; }
      body[data-nest-aiflow-theme] :is([style*="rgb(168"], [style*="#a855"], [style*="#9333"], [style*="purple"], [style*="violet"], [style*="rgba(168"], [style*="rgba(147"]) { background-color:var(--nest-theme-selected) !important; border-color:var(--nest-theme-accent) !important; color:var(--nest-theme-text) !important; }
      #${AIFLOW_THEME_SWITCHER_ID} { position:fixed;right:18px;bottom:62px;z-index:2147483647;font:600 12px/1.1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
      #${AIFLOW_THEME_SWITCHER_ID} button { display:flex;align-items:center;gap:8px;border:1px solid var(--nest-theme-border,#2a2f38);border-radius:999px;background:var(--nest-theme-overlay,#1c1f26);color:var(--nest-theme-text,#e8eaee);padding:8px 13px;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.4); }
      #${AIFLOW_THEME_SWITCHER_ID} [data-nest-theme-toggle]::before { content:"";width:9px;height:9px;border-radius:50%;background:var(--nest-theme-accent,#6f9bff); }
      #${AIFLOW_THEME_SWITCHER_ID} [data-nest-theme-options] { display:none;position:absolute;right:0;bottom:44px;width:148px;padding:6px;border:1px solid var(--nest-theme-border,#2a2f38);border-radius:14px;background:var(--nest-theme-overlay,#1c1f26);box-shadow:0 16px 40px rgba(0,0,0,.5); }
      #${AIFLOW_THEME_SWITCHER_ID}[data-open="true"] [data-nest-theme-options] { display:grid;gap:2px; }
      #${AIFLOW_THEME_SWITCHER_ID} [data-nest-theme-options] button { width:100%;text-align:left;padding:7px 9px;border:0;border-radius:9px;background:transparent;color:var(--nest-theme-text,#e8eaee);box-shadow:none; }
      #${AIFLOW_THEME_SWITCHER_ID} [data-nest-theme-options] button:hover { background:var(--nest-theme-button-hover,#262b34) !important; }
      #${AIFLOW_THEME_SWITCHER_ID} [data-nest-theme-options] button::before { content:"";flex:none;width:10px;height:10px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18); }
      #${AIFLOW_THEME_SWITCHER_ID} [data-nest-theme="aiflow-original"]::before { background:transparent;box-shadow:inset 0 0 0 1.5px var(--nest-theme-muted,#8b919c); }
      #${AIFLOW_THEME_SWITCHER_ID} [data-nest-theme="deep-blue"]::before { background:#6f9bff; }
      #${AIFLOW_THEME_SWITCHER_ID} [data-nest-theme="polar-purple"]::before { background:#a898ff; }
      #${AIFLOW_THEME_SWITCHER_ID} [data-nest-theme="emerald"]::before { background:#4fd3a5; }
      #${AIFLOW_THEME_SWITCHER_ID} [data-nest-theme="graphite"]::before { background:#d6d6d6; }
      #${AIFLOW_THEME_SWITCHER_ID} [data-nest-theme="twilight-orange"]::before { background:#f2ab66; }
      #${AIFLOW_THEME_SWITCHER_ID} [data-nest-theme="sakura"]::before { background:#f297b8; }
      #${AIFLOW_THEME_SWITCHER_ID} [data-nest-theme-options] button[data-active="true"] { background:var(--nest-theme-selected,#202b42) !important;color:var(--nest-theme-text,#e8eaee) !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // 「AI Flow 原版」：去掉 body 上的主题标记，所有 body[data-nest-aiflow-theme] 规则失效，页面回到 AI Flow 自己的颜色；
  // 小旺仔自己的浮窗用 --nest-theme-* 的兜底色（夜蓝）。
  function applyAIFlowTheme(value) {
    if (value === AIFLOW_ORIGINAL_THEME) delete document.body.dataset.nestAiflowTheme;
    else document.body.dataset.nestAiflowTheme = value;
  }

  function injectAIFlowThemeSwitcher() {
    ensureAIFlowThemeStyle();
    let theme = 'deep-blue';
    try { theme = localStorage.getItem(AIFLOW_THEME_KEY) || 'deep-blue'; } catch {}
    if (!['deep-blue', 'polar-purple', 'emerald', 'graphite', 'twilight-orange', 'sakura', AIFLOW_ORIGINAL_THEME].includes(theme)) theme = 'deep-blue';
    applyAIFlowTheme(theme);
    const existing = document.getElementById(AIFLOW_THEME_SWITCHER_ID);
    if (existing) {
      existing.querySelectorAll('[data-nest-theme]').forEach(button => { button.dataset.active = button.getAttribute('data-nest-theme') === theme ? 'true' : 'false'; });
      return;
    }
    const switcher = document.createElement('div');
    switcher.id = AIFLOW_THEME_SWITCHER_ID;
    switcher.innerHTML = '<button type="button" data-nest-theme-toggle>页面配色</button><div data-nest-theme-options><button type="button" data-nest-theme="aiflow-original">AI Flow 原版</button><button type="button" data-nest-theme="deep-blue">夜蓝</button><button type="button" data-nest-theme="polar-purple">雾紫</button><button type="button" data-nest-theme="emerald">松石</button><button type="button" data-nest-theme="graphite">石墨</button><button type="button" data-nest-theme="twilight-orange">琥珀</button><button type="button" data-nest-theme="sakura">玫瑰</button></div>';
    const syncActiveTheme = value => switcher.querySelectorAll('[data-nest-theme]').forEach(button => { button.dataset.active = button.getAttribute('data-nest-theme') === value ? 'true' : 'false'; });
    syncActiveTheme(theme);
    switcher.querySelector('[data-nest-theme-toggle]')?.addEventListener('click', () => { switcher.dataset.open = switcher.dataset.open === 'true' ? 'false' : 'true'; });
    switcher.querySelectorAll('[data-nest-theme]').forEach(button => button.addEventListener('click', () => {
      const value = button.getAttribute('data-nest-theme') || 'deep-blue';
      applyAIFlowTheme(value);
      try { localStorage.setItem(AIFLOW_THEME_KEY, value); } catch {}
      syncActiveTheme(value);
      switcher.dataset.open = 'false';
    }));
    document.body.appendChild(switcher);
  }

  function ensureAIFlowFocusLayoutStyle() {
    if (document.getElementById(FOCUS_LAYOUT_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = FOCUS_LAYOUT_STYLE_ID;
    style.textContent = `
      /* 专注布局（DEC-016）：隐藏顶栏和左侧「军团 + 分集」栏，只留生成表单和作品区；参数栏不再压窄 */
      body.${FOCUS_LAYOUT_CLASS} { --project-nav-width: 0px !important; }
      body.${FOCUS_LAYOUT_CLASS} .gen-navigation,
      body.${FOCUS_LAYOUT_CLASS} .${FOCUS_HIDE_CLASS} { display: none !important; }
      #${FOCUS_LAYOUT_TOGGLE_ID} {
        position: fixed !important; right: 18px !important; bottom: 18px !important; z-index: 2147483646 !important;
        border: 1px solid var(--nest-theme-border, #2a2f38) !important; border-radius: 999px !important;
        background: var(--nest-theme-overlay, #1c1f26) !important; color: var(--nest-theme-text, #e8eaee) !important;
        padding: 8px 13px !important; font: 600 12px/1.1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        cursor: pointer !important; box-shadow: 0 8px 24px rgba(0, 0, 0, .4) !important;
      }
      #${FOCUS_LAYOUT_TOGGLE_ID}[data-enabled="true"] { border-color: var(--nest-theme-accent, #6f9bff) !important; background: var(--nest-theme-selected, #202b42) !important; color: var(--nest-theme-text, #e8eaee) !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function focusLayoutEnabled() {
    try { return localStorage.getItem(FOCUS_LAYOUT_STORAGE_KEY) === 'true'; } catch { return false; }
  }

  // 顶栏和左侧军团栏没有稳定的类名，按位置认：
  // 顶栏 = 含「AI Flow」字样、贴着页面顶部、几乎和窗口一样宽的矮条；
  // 左侧栏 = 含「搜索成员」或分集列表、贴着页面左边、窄而高的一列。两者都不能包含生成表单（#generatePanel）或扩展自己的节点。
  function focusLayoutCandidate(start, accept) {
    let found = null;
    for (let node = start; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
      if (node.querySelector?.('#generatePanel') || node.id === 'generatePanel' || isNestOwnedNode(node)) break;
      if (accept(node.getBoundingClientRect())) found = node;
    }
    return found;
  }

  function markFocusLayoutTargets() {
    for (const node of document.querySelectorAll(`.${FOCUS_HIDE_CLASS}`)) {
      if (node.querySelector('#generatePanel')) node.classList.remove(FOCUS_HIDE_CLASS);
    }
    const width = window.innerWidth || document.documentElement.clientWidth || 0;
    const height = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!document.querySelector(`.${FOCUS_HIDE_CLASS}[data-nest-focus="top"]`)) {
      const brand = [...document.querySelectorAll('span, div, b, strong, h1, a')]
        .find(node => node.childElementCount === 0 && /^AI\s*Flow$/i.test(String(node.textContent || '').trim()) && !isNestOwnedNode(node));
      const top = brand && focusLayoutCandidate(brand, rect => rect.top <= 4 && rect.height > 0 && rect.height <= 100 && rect.width >= width * 0.8);
      if (top) { top.classList.add(FOCUS_HIDE_CLASS); top.dataset.nestFocus = 'top'; }
    }
    if (!document.querySelector(`.${FOCUS_HIDE_CLASS}[data-nest-focus="side"]`)) {
      const anchor = document.querySelector('input[placeholder*="搜索成员"]') || document.querySelector('.gen-episode-list') || document.querySelector('.gen-current-project');
      const side = anchor && focusLayoutCandidate(anchor, rect => rect.left <= 4 && rect.width > 0 && rect.width <= Math.max(320, width * 0.25) && rect.height >= height * 0.5);
      if (side) { side.classList.add(FOCUS_HIDE_CLASS); side.dataset.nestFocus = 'side'; }
    }
  }

  function setAIFlowFocusLayout(enabled) {
    // 先在可见状态下按位置认出顶栏和左侧栏，再加 body 类把它们隐藏
    if (enabled) { focusLayoutRemarkTries = 0; markFocusLayoutTargets(); }
    document.body.classList.toggle(FOCUS_LAYOUT_CLASS, enabled);
    try { localStorage.setItem(FOCUS_LAYOUT_STORAGE_KEY, String(enabled)); } catch { /* storage can be blocked by the page */ }
    const button = document.getElementById(FOCUS_LAYOUT_TOGGLE_ID);
    if (button) {
      button.dataset.enabled = String(enabled);
      button.textContent = enabled ? '恢复布局' : '专注布局';
      button.title = enabled ? '恢复 AI Flow 原来的布局' : '隐藏顶栏和左侧军团、分集栏，只留生成表单和作品区；不修改任何数据';
    }
  }

  let focusLayoutRemarkAt = 0;
  let focusLayoutRemarkTries = 0;
  function injectAIFlowFocusLayoutToggle() {
    if (!document.body || !document.getElementById('generatePanel')) return;
    ensureAIFlowFocusLayoutStyle();
    const existing = document.getElementById(FOCUS_LAYOUT_TOGGLE_ID);
    if (existing) {
      // AI Flow 重绘出新的顶栏或左侧栏时补标记。隐藏的元素量不到位置，所以只在还没有可用标记时，
      // 临时去掉 body 类量一次再加回（同一帧内完成，不会闪）。
      if (document.body.classList.contains(FOCUS_LAYOUT_CLASS)
        && (!document.querySelector(`.${FOCUS_HIDE_CLASS}[data-nest-focus="top"]`) || !document.querySelector(`.${FOCUS_HIDE_CLASS}[data-nest-focus="side"]`))
        && focusLayoutRemarkTries < 5 && Date.now() - focusLayoutRemarkAt > 2000) {
        // 最多补认 5 次：页面上确实没有顶栏或左侧栏时，不再反复强制排版
        focusLayoutRemarkTries += 1;
        focusLayoutRemarkAt = Date.now();
        document.body.classList.remove(FOCUS_LAYOUT_CLASS);
        markFocusLayoutTargets();
        document.body.classList.add(FOCUS_LAYOUT_CLASS);
      }
      return;
    }
    const button = document.createElement('button');
    button.id = FOCUS_LAYOUT_TOGGLE_ID;
    button.type = 'button';
    button.addEventListener('click', () => setAIFlowFocusLayout(!document.body.classList.contains(FOCUS_LAYOUT_CLASS)));
    document.body.appendChild(button);
    setAIFlowFocusLayout(focusLayoutEnabled());
  }

  // ===== 「作品」区无限画布（DEC-014）=====
  // 不搬动、不克隆 AI Flow 的作品卡片：只给作品网格和它的滚动容器加类名和内联样式，
  // 卡片仍是 AI Flow 自己的节点，下载、增强、重制、延长等按钮照常工作；关掉后把类名和样式全部撤掉。
  // 注意：网格和卡片不能套 nest-aiflow- 前缀的 id，否则全局点击监听和 isNestOwnedNode 会把它们当成扩展自己的浮窗（LES-019）。
  // 画布上另有三样小旺仔自己的东西：分组框层（放在视口里、卡片下面）、右下角小地图、左下角浮条里的搜索框。
  function clampWorksCanvas(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function finiteWorksCanvasNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function worksCanvasStoredEnabled() {
    try { return localStorage.getItem(WORKS_CANVAS_ENABLED_KEY) === 'true'; } catch { return false; }
  }

  const worksCanvas = {
    enabled: worksCanvasStoredEnabled(),
    viewport: null,
    world: null,
    layout: null,
    layoutKey: '',
    savedScrollTop: 0,
    savedMinHeight: false,
    scheduled: false,
    interaction: null,
    suppressClickUntil: 0,
    saveTimer: 0,
    idleTimer: 0,
    resizeObserver: null,
    titleSearchAt: 0,
    titleRetries: 0,
    topZ: 1,
    // 按住空格时左键拖空白处改为平移
    spaceHeld: false,
    // 框选 / Shift+点选中的作品 id
    selected: new Set(),
    // 卡片高度缓存：拖动时不读 offsetHeight，免得每帧强制排版
    heights: new Map(),
    search: { query: '', hits: [], index: -1 },
    minimapScheduled: false,
    minimapGeometry: null,
    flyFrame: 0,
  };

  function ensureWorksCanvasStyle() {
    if (document.getElementById(WORKS_CANVAS_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = WORKS_CANVAS_STYLE_ID;
    // 选择器写成 html body .x.x，压过 body[data-nest-aiflow-theme] :is([class*="panel"]…) 的整页配色规则。
    style.textContent = `
      html body .${WORKS_CANVAS_VIEWPORT_CLASS}.${WORKS_CANVAS_VIEWPORT_CLASS} {
        position:relative !important; overflow:hidden !important; overscroll-behavior:contain !important; touch-action:none !important; cursor:default;
        background-color:var(--nest-theme-bg,#0f1115) !important;
        background-image:
          radial-gradient(color-mix(in srgb,var(--nest-theme-muted,#8b919c) 30%,transparent) .8px,transparent .8px),
          linear-gradient(90deg,color-mix(in srgb,var(--nest-theme-border,#2a2f38) 45%,transparent) 1px,transparent 1px),
          linear-gradient(color-mix(in srgb,var(--nest-theme-border,#2a2f38) 45%,transparent) 1px,transparent 1px) !important;
        background-size:20px 20px,100px 100px,100px 100px;
      }
      html body .${WORKS_CANVAS_PASSTHROUGH_CLASS}.${WORKS_CANVAS_PASSTHROUGH_CLASS} { position:static !important; overflow:visible !important; transform:none !important; contain:none !important; }
      html body .${WORKS_CANVAS_WORLD_CLASS}.${WORKS_CANVAS_WORLD_CLASS} {
        position:absolute !important; left:0 !important; top:0 !important; z-index:1 !important; display:block !important;
        width:0 !important; height:0 !important; min-width:0 !important; min-height:0 !important; max-width:none !important;
        margin:0 !important; padding:0 !important; overflow:visible !important; transform-origin:0 0 !important;
        columns:auto !important; grid-template-columns:none !important;
      }
      html body .${WORKS_CANVAS_VIEWPORT_CLASS}.${WORKS_CANVAS_VIEWPORT_CLASS}[data-nest-wc-space="true"] { cursor:grab; }
      html body .${WORKS_CANVAS_VIEWPORT_CLASS}[data-nest-wc-moving="true"] :is(.${WORKS_CANVAS_WORLD_CLASS}, #${WORKS_CANVAS_GROUPS_ID}) { will-change:transform; }
      html body .${WORKS_CANVAS_WORLD_CLASS}.${WORKS_CANVAS_WORLD_CLASS} > .task-card {
        position:absolute !important; left:var(--nest-wc-cx,0px) !important; top:var(--nest-wc-cy,0px) !important;
        width:var(--nest-wc-card-w,244px) !important; max-width:none !important; box-sizing:border-box !important; margin:0 !important;
        z-index:var(--nest-wc-z,1) !important; cursor:grab; box-shadow:0 10px 28px rgba(0,0,0,.35);
        -webkit-user-drag:none;
      }
      html body .${WORKS_CANVAS_WORLD_CLASS} > .task-card :is(img, video) { -webkit-user-drag:none; }
      /* 悬停只描边，不缩放（LES-020） */
      html body .${WORKS_CANVAS_WORLD_CLASS} > .task-card:hover { outline:1px solid color-mix(in srgb,var(--nest-theme-accent,#6f9bff) 70%,transparent); outline-offset:2px; }
      html body .${WORKS_CANVAS_WORLD_CLASS} > .task-card[data-nest-wc-selected="true"] { outline:2px solid var(--nest-theme-accent,#6f9bff); outline-offset:3px; }
      html body .${WORKS_CANVAS_WORLD_CLASS} > .task-card[data-nest-wc-dragging="true"] { cursor:grabbing; outline:2px solid var(--nest-theme-accent,#6f9bff); box-shadow:0 18px 42px rgba(0,0,0,.5); }
      html body .${WORKS_CANVAS_WORLD_CLASS}[data-nest-wc-searching="true"] > .task-card:not([data-nest-wc-hit]) { opacity:.32; }
      html body .${WORKS_CANVAS_WORLD_CLASS} > .task-card[data-nest-wc-hit="match"] { outline:2px dashed var(--nest-theme-accent,#6f9bff); outline-offset:3px; }
      html body .${WORKS_CANVAS_WORLD_CLASS} > .task-card[data-nest-wc-hit="current"] { outline:3px solid var(--nest-theme-accent,#6f9bff); outline-offset:4px; box-shadow:0 0 0 10px color-mix(in srgb,var(--nest-theme-accent,#6f9bff) 22%,transparent),0 18px 42px rgba(0,0,0,.5); }
      body[data-nest-wc-interacting="true"], body[data-nest-wc-interacting="true"] * { user-select:none !important; cursor:grabbing !important; }
      #${WORKS_CANVAS_GROUPS_ID} { position:absolute; left:0; top:0; width:0; height:0; z-index:0; transform-origin:0 0; pointer-events:none; }
      #${WORKS_CANVAS_GROUPS_ID} [data-nest-wc-group] {
        position:absolute; box-sizing:border-box; pointer-events:none; border-radius:18px;
        border:1.5px solid color-mix(in srgb,var(--nest-theme-accent,#6f9bff) 55%,transparent);
        background:color-mix(in srgb,var(--nest-theme-accent,#6f9bff) 7%,transparent);
      }
      #${WORKS_CANVAS_GROUPS_ID} [data-nest-wc-group-head] {
        position:absolute; left:0; right:0; top:0; height:${WORKS_CANVAS_GROUP_HEADER}px; display:flex; align-items:center; gap:8px; padding:0 8px 0 14px;
        pointer-events:auto; cursor:grab; color:var(--nest-theme-text,#e8eaee); font:600 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        border-bottom:1px solid color-mix(in srgb,var(--nest-theme-accent,#6f9bff) 30%,transparent);
      }
      #${WORKS_CANVAS_GROUPS_ID} [data-nest-wc-group-name] { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:text; }
      #${WORKS_CANVAS_GROUPS_ID} [data-nest-wc-group-name][hidden] { display:none; }
      #${WORKS_CANVAS_GROUPS_ID} [data-nest-wc-rename] {
        flex:none; width:22px; height:22px; padding:0; border:0 !important; border-radius:7px !important; cursor:pointer;
        background:transparent !important; color:var(--nest-theme-muted,#8b919c) !important; font:13px/1 sans-serif; box-shadow:none !important;
      }
      #${WORKS_CANVAS_GROUPS_ID} [data-nest-wc-rename]:hover { background:var(--nest-theme-button-hover,#262b34) !important; color:var(--nest-theme-text,#e8eaee) !important; }
      #${WORKS_CANVAS_GROUPS_ID} input[data-nest-wc-group-input] {
        flex:0 1 220px; min-width:80px; height:24px; box-sizing:border-box; padding:0 8px; border-radius:7px !important; cursor:text;
        border:1px solid var(--nest-theme-accent,#6f9bff) !important; background:var(--nest-theme-field,#0b0d10) !important;
        color:var(--nest-theme-text,#e8eaee) !important; font:600 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; outline:none; box-shadow:none !important;
      }
      #${WORKS_CANVAS_GROUPS_ID} [data-nest-wc-group-count] { color:var(--nest-theme-muted,#8b919c); font-weight:500; }
      #${WORKS_CANVAS_GROUPS_ID} [data-nest-wc-ungroup] {
        margin-left:auto; height:22px; padding:0 8px; border:0 !important; border-radius:7px !important; cursor:pointer;
        background:transparent !important; color:var(--nest-theme-muted,#8b919c) !important; font:inherit; box-shadow:none !important;
      }
      #${WORKS_CANVAS_GROUPS_ID} [data-nest-wc-ungroup]:hover { background:var(--nest-theme-button-hover,#262b34) !important; color:var(--nest-theme-text,#e8eaee) !important; }
      #${WORKS_CANVAS_MARQUEE_ID} { position:fixed; z-index:2147483645; pointer-events:none; border:1px solid var(--nest-theme-accent,#6f9bff); background:color-mix(in srgb,var(--nest-theme-accent,#6f9bff) 12%,transparent); border-radius:4px; }
      #${WORKS_CANVAS_MINIMAP_ID} {
        position:fixed; z-index:2147483644; width:${WORKS_CANVAS_MINIMAP_WIDTH}px; height:${WORKS_CANVAS_MINIMAP_HEIGHT}px; overflow:hidden; cursor:pointer;
        border:1px solid var(--nest-theme-border,#2a2f38); border-radius:12px; background:color-mix(in srgb,var(--nest-theme-overlay,#1c1f26) 94%,transparent);
        box-shadow:0 8px 24px rgba(0,0,0,.4);
      }
      #${WORKS_CANVAS_MINIMAP_ID} canvas { display:block; width:100%; height:100%; }
      #${WORKS_CANVAS_TOGGLE_ID} {
        display:inline-flex !important; align-items:center !important; gap:6px !important; margin:0 0 0 10px !important; vertical-align:middle !important;
        border:1px solid var(--nest-theme-border,#2a2f38) !important; border-radius:999px !important;
        background:var(--nest-theme-button,#1d2027) !important; color:var(--nest-theme-text,#e8eaee) !important;
        padding:4px 11px !important; font:600 12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important; cursor:pointer !important; box-shadow:none !important;
      }
      #${WORKS_CANVAS_TOGGLE_ID}::before { content:""; width:8px; height:8px; border-radius:2px; box-shadow:inset 0 0 0 1.5px var(--nest-theme-muted,#8b919c); }
      #${WORKS_CANVAS_TOGGLE_ID}:hover { background:var(--nest-theme-button-hover,#262b34) !important; border-color:var(--nest-theme-accent,#6f9bff) !important; }
      #${WORKS_CANVAS_TOGGLE_ID}[data-enabled="true"] { background:var(--nest-theme-selected,#202b42) !important; border-color:var(--nest-theme-accent,#6f9bff) !important; }
      #${WORKS_CANVAS_TOGGLE_ID}[data-enabled="true"]::before { background:var(--nest-theme-accent,#6f9bff); box-shadow:none; }
      #${WORKS_CANVAS_ORDER_ID} {
        display:inline-flex !important; align-items:center !important; margin:0 0 0 6px !important; vertical-align:middle !important;
        border:1px solid var(--nest-theme-border,#2a2f38) !important; border-radius:999px !important;
        background:transparent !important; color:var(--nest-theme-muted,#8b919c) !important;
        padding:4px 10px !important; font:600 12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important; cursor:pointer !important; box-shadow:none !important;
      }
      #${WORKS_CANVAS_ORDER_ID}:hover { background:var(--nest-theme-button-hover,#262b34) !important; color:var(--nest-theme-text,#e8eaee) !important; border-color:var(--nest-theme-accent,#6f9bff) !important; }
      #${WORKS_CANVAS_TOGGLE_ID}[data-placement="floating"] { position:fixed !important; z-index:2147483645 !important; margin:0 !important; box-shadow:0 8px 24px rgba(0,0,0,.4) !important; }
      #${WORKS_CANVAS_HUD_ID} {
        position:fixed; z-index:2147483645; display:flex; align-items:center; gap:4px; padding:5px; max-width:calc(100vw - 32px);
        border:1px solid var(--nest-theme-border,#2a2f38); border-radius:12px;
        background:color-mix(in srgb,var(--nest-theme-overlay,#1c1f26) 94%,transparent); color:var(--nest-theme-muted,#8b919c);
        box-shadow:0 8px 24px rgba(0,0,0,.4); font:600 11px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      }
      #${WORKS_CANVAS_HUD_ID} button {
        min-width:28px; height:26px; padding:0 8px; border:0 !important; border-radius:8px !important;
        background:transparent !important; color:var(--nest-theme-text,#e8eaee) !important; font:inherit; cursor:pointer; box-shadow:none !important; white-space:nowrap;
      }
      #${WORKS_CANVAS_HUD_ID} button:hover { background:var(--nest-theme-button-hover,#262b34) !important; }
      #${WORKS_CANVAS_HUD_ID} button[hidden] { display:none !important; }
      #${WORKS_CANVAS_HUD_ID} [data-nest-wc-act="group"] { background:var(--nest-theme-primary,#3f6fe6) !important; color:var(--nest-theme-primary-text,#ffffff) !important; }
      #${WORKS_CANVAS_HUD_ID} [data-nest-wc-act="zoom"] { min-width:52px; font-variant-numeric:tabular-nums; }
      #${WORKS_CANVAS_HUD_ID} [data-nest-wc-sep] { width:1px; align-self:stretch; margin:3px 4px; background:var(--nest-theme-border,#2a2f38); }
      #${WORKS_CANVAS_HUD_ID} input[data-nest-wc-search] {
        width:170px; height:26px; box-sizing:border-box; padding:0 9px; border-radius:8px !important;
        border:1px solid var(--nest-theme-border,#2a2f38) !important; background:var(--nest-theme-field,#0b0d10) !important;
        color:var(--nest-theme-text,#e8eaee) !important; font:500 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; outline:none; box-shadow:none !important;
      }
      #${WORKS_CANVAS_HUD_ID} input[data-nest-wc-search]:focus { border-color:var(--nest-theme-accent,#6f9bff) !important; }
      #${WORKS_CANVAS_HUD_ID} [data-nest-wc-count] { min-width:34px; text-align:center; font-variant-numeric:tabular-nums; white-space:nowrap; }
      #${WORKS_CANVAS_HUD_ID} [data-nest-wc-hint] { padding:0 6px; white-space:nowrap; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function worksTaskCards() {
    const cards = AI_FLOW_DOM?.tasks ? AI_FLOW_DOM.tasks() : [...document.querySelectorAll('.task-card[data-taskid]')];
    return cards.filter(card => card instanceof HTMLElement && !isNestOwnedNode(card));
  }

  function worksCardId(card) {
    return String(AI_FLOW_DOM?.taskId?.(card) || card?.dataset?.taskid || card?.dataset?.taskId || '').trim();
  }

  // 作品网格 = 装着最多作品卡片的那个父元素
  function worksGridFromCards(cards) {
    const counts = new Map();
    for (const card of cards) if (card.parentElement) counts.set(card.parentElement, (counts.get(card.parentElement) || 0) + 1);
    let grid = null;
    let most = 0;
    for (const [parent, count] of counts) if (count > most) { grid = parent; most = count; }
    return grid;
  }

  // 画布视口 = 网格外面最近的滚动容器（开着画布时它已被改成 overflow:hidden，所以先认类名）
  function worksViewportFor(grid) {
    for (let node = grid?.parentElement; node && node !== document.body; node = node.parentElement) {
      if (node.classList.contains(WORKS_CANVAS_VIEWPORT_CLASS)) return node;
      if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.clientHeight > 0) return node;
    }
    return grid?.parentElement || null;
  }

  function worksCanvasTitle(grid) {
    let scope = worksViewportFor(grid);
    for (let depth = 0; scope && scope !== document.documentElement && depth < 4; depth += 1, scope = scope.parentElement) {
      const title = [...scope.querySelectorAll('h1, h2, h3, h4, h5, h6, span, div, strong, b, p')]
        .find(node => node.childElementCount === 0 && String(node.textContent || '').trim() === '作品' && !grid.contains(node) && !isNestOwnedNode(node));
      if (title) return title;
    }
    return null;
  }

  function worksCanvasLayoutKey() {
    return WORKS_CANVAS_LAYOUT_PREFIX + (currentProjectId() || 'default');
  }

  function loadWorksCanvasLayout(key) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch { saved = null; }
    const camera = saved?.camera || {};
    const cards = {};
    if (saved?.cards && typeof saved.cards === 'object') {
      for (const [id, pos] of Object.entries(saved.cards)) {
        const x = Number(pos?.x);
        const y = Number(pos?.y);
        if (Number.isFinite(x) && Number.isFinite(y)) cards[id] = { x, y, z: finiteWorksCanvasNumber(pos?.z, 1) };
      }
    }
    const groups = (Array.isArray(saved?.groups) ? saved.groups : [])
      .map(group => ({
        id: String(group?.id || ''),
        // name 是用户自己起的名字，空 = 用 defaultName（打组时按镜头号生成的「镜头 S01」）
        // 早期存档只有 name，那时 name 就是默认名
        name: group?.defaultName ? String(group?.name || '').slice(0, 60) : '',
        defaultName: String(group?.defaultName || group?.name || '').slice(0, 60),
        ids: [...new Set((Array.isArray(group?.ids) ? group.ids : []).map(String).filter(Boolean))],
      }))
      .filter(group => group.id && group.ids.length >= 2);
    return {
      cards,
      groups,
      camera: {
        x: finiteWorksCanvasNumber(camera.x, 24),
        y: finiteWorksCanvasNumber(camera.y, 24),
        zoom: clampWorksCanvas(finiteWorksCanvasNumber(camera.zoom, 1), WORKS_CANVAS_MIN_ZOOM, WORKS_CANVAS_MAX_ZOOM),
      },
      cardWidth: finiteWorksCanvasNumber(saved?.cardWidth, 0),
      columns: finiteWorksCanvasNumber(saved?.columns, 0),
      // 退出画布后列表的排法：canvas = 按画布位置，original = AI Flow 原顺序
      listOrder: saved?.listOrder === 'original' ? 'original' : 'canvas',
    };
  }

  function writeWorksCanvasLayout() {
    clearTimeout(worksCanvas.saveTimer);
    const { layout, layoutKey, world } = worksCanvas;
    if (!layout || !layoutKey) return;
    // 只留得住最近的位置：超过上限时丢掉页面上已不存在的作品
    if (Object.keys(layout.cards).length > WORKS_CANVAS_MAX_SAVED_CARDS && world) {
      const present = new Set([...world.children].map(worksCardId).filter(Boolean));
      for (const id of Object.keys(layout.cards)) if (!present.has(id)) delete layout.cards[id];
    }
    try { localStorage.setItem(layoutKey, JSON.stringify(layout)); } catch { /* 存储被页面禁用时只在本次会话生效 */ }
  }

  function saveWorksCanvasLayout() {
    clearTimeout(worksCanvas.saveTimer);
    worksCanvas.saveTimer = setTimeout(writeWorksCanvasLayout, 250);
  }

  // 卡片位置变了（拖动、打组、重排）：退出画布后列表重新跟着画布排
  function markWorksCanvasOrderChanged() {
    if (worksCanvas.layout) worksCanvas.layout.listOrder = 'canvas';
  }

  // ---- 退出画布后的列表顺序 ----
  // 按位置排：先按 y 分行（相差不到半张卡算同一行），行内按 x
  function sortWorksByPosition(items) {
    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    const rows = [];
    for (const item of sorted) {
      const row = rows[rows.length - 1];
      if (row && item.y - row.y < WORKS_CANVAS_ROW_TOLERANCE) row.items.push(item);
      else rows.push({ y: item.y, items: [item] });
    }
    return rows.flatMap(row => row.items.sort((a, b) => a.x - b.x));
  }

  // ids 为 AI Flow 当前的卡片顺序。还没在画布里摆过的新作品按原顺序放最前面；
  // 其余按画布位置，同一分组的卡片连在一起，分组按组内最靠上、最靠左的位置参与排序。
  function worksCanvasListSequence(ids, layout) {
    const fresh = ids.filter(id => !layout.cards[id]);
    const positioned = ids.filter(id => layout.cards[id]);
    const present = new Set(positioned);
    const grouped = new Set();
    const units = [];
    for (const group of layout.groups || []) {
      const members = group.ids.filter(id => present.has(id) && !grouped.has(id));
      if (!members.length) continue;
      members.forEach(id => grouped.add(id));
      const items = members.map(id => ({ id, x: layout.cards[id].x, y: layout.cards[id].y }));
      units.push({ x: Math.min(...items.map(item => item.x)), y: Math.min(...items.map(item => item.y)), ids: sortWorksByPosition(items).map(item => item.id) });
    }
    for (const id of positioned) if (!grouped.has(id)) units.push({ x: layout.cards[id].x, y: layout.cards[id].y, ids: [id] });
    return [...fresh, ...sortWorksByPosition(units).flatMap(unit => unit.ids)];
  }

  function clearWorksListOrder(cards) {
    for (const card of cards) {
      if (!card.dataset?.nestWcOrdered) continue;
      card.style.removeProperty('order');
      delete card.dataset.nestWcOrdered;
    }
  }

  function updateWorksOrderButton(visible, listOrder) {
    const toggle = document.getElementById(WORKS_CANVAS_TOGGLE_ID);
    let button = document.getElementById(WORKS_CANVAS_ORDER_ID);
    // 只跟在「作品」标题旁的开关后面；开关浮在作品区上时不放这个按钮
    if (!visible || !toggle || toggle.dataset.placement !== 'title') {
      button?.remove();
      return;
    }
    if (!button) {
      button = document.createElement('button');
      button.id = WORKS_CANVAS_ORDER_ID;
      button.type = 'button';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        setWorksListOrder(button.dataset.order === 'original' ? 'canvas' : 'original');
      });
    }
    if (toggle.nextElementSibling !== button) toggle.insertAdjacentElement('afterend', button);
    const text = listOrder === 'original' ? '按画布顺序' : '恢复原顺序';
    if (button.dataset.order !== listOrder) button.dataset.order = listOrder;
    if (button.textContent !== text) button.textContent = text;
    button.title = listOrder === 'original'
      ? '列表按无限画布里的位置排（从上到下、从左到右，同组连在一起）'
      : '列表回到 AI Flow 原来的顺序；画布里的位置和分组不变';
  }

  function setWorksListOrder(value) {
    const key = worksCanvasLayoutKey();
    const layout = loadWorksCanvasLayout(key);
    layout.listOrder = value === 'original' ? 'original' : 'canvas';
    try { localStorage.setItem(key, JSON.stringify(layout)); } catch { /* 存储被禁用时只在本次生效 */ }
    worksCanvas.listCache = { key, layout, signature: '' };
    syncWorksListOrder();
  }

  // 列表模式：用 CSS order 给 AI Flow 的卡片排顺序，不移动它的 DOM 节点
  function syncWorksListOrder() {
    const cards = worksTaskCards();
    const grid = worksGridFromCards(cards);
    if (!grid || worksCanvas.enabled) {
      updateWorksOrderButton(false);
      return;
    }
    const key = worksCanvasLayoutKey();
    if (worksCanvas.listCache?.key !== key) worksCanvas.listCache = { key, layout: loadWorksCanvasLayout(key), signature: '' };
    const cache = worksCanvas.listCache;
    const { layout } = cache;
    const gridCards = cards.filter(card => card.parentElement === grid);
    const ids = gridCards.map(worksCardId);
    const hasCanvasLayout = ids.some(id => id && layout.cards[id]);
    updateWorksOrderButton(hasCanvasLayout, layout.listOrder);
    if (!hasCanvasLayout || layout.listOrder === 'original') {
      clearWorksListOrder(gridCards);
      cache.signature = '';
      return;
    }
    // 卡片和顺序都没变时什么都不写（AI Flow 刷新进度等频繁变动不重排）
    const signature = ids.join('|');
    if (signature === cache.signature && gridCards.every(card => card.dataset.nestWcOrdered)) return;
    cache.signature = signature;
    const byId = new Map(gridCards.map((card, index) => [ids[index], card]));
    worksCanvasListSequence(ids.filter(Boolean), layout).forEach((id, index) => {
      const card = byId.get(id);
      if (!card) return;
      if (card.style.getPropertyValue('order') !== String(index)) card.style.setProperty('order', String(index));
      card.dataset.nestWcOrdered = 'true';
    });
  }

  function worksGridCards() {
    const { world } = worksCanvas;
    return world ? [...world.children].filter(card => card.classList?.contains('task-card')) : [];
  }

  function worksCardsById() {
    const map = new Map();
    for (const card of worksGridCards()) {
      const id = worksCardId(card);
      if (id) map.set(id, card);
    }
    return map;
  }

  function worksCardHeight(id) {
    return worksCanvas.heights.get(id) || WORKS_CANVAS_DEFAULT_CARD_HEIGHT;
  }

  function worksCellSize() {
    const width = worksCanvas.layout?.cardWidth || WORKS_CANVAS_DEFAULT_CARD_WIDTH;
    const tallest = Math.max(WORKS_CANVAS_DEFAULT_CARD_HEIGHT, ...worksCanvas.heights.values());
    return { width, cellWidth: width + WORKS_CANVAS_GAP, cellHeight: tallest + WORKS_CANVAS_GAP };
  }

  function worksRectsOverlap(a, b, gap = WORKS_CANVAS_GAP / 2) {
    return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
  }

  // 分组框 = 组内（页面上还在的）卡片的外接矩形 + 内边距 + 标题栏
  function worksGroupFrame(group, present = null) {
    const { layout } = worksCanvas;
    const width = layout?.cardWidth || WORKS_CANVAS_DEFAULT_CARD_WIDTH;
    const members = group.ids.filter(id => layout?.cards[id] && (!present || present.has(id)));
    if (!members.length) return null;
    const left = Math.min(...members.map(id => layout.cards[id].x));
    const top = Math.min(...members.map(id => layout.cards[id].y));
    const right = Math.max(...members.map(id => layout.cards[id].x + width));
    const bottom = Math.max(...members.map(id => layout.cards[id].y + worksCardHeight(id)));
    const pad = WORKS_CANVAS_GROUP_PAD;
    return {
      x: left - pad,
      y: top - pad - WORKS_CANVAS_GROUP_HEADER,
      w: right - left + pad * 2,
      h: bottom - top + pad * 2 + WORKS_CANVAS_GROUP_HEADER,
      count: members.length,
    };
  }

  // 按网格槽位从左到右、换行找第一个放得下 w×h 且不压住 occupied 的位置
  function findWorksFreeSpot(w, h, occupied) {
    const columns = Math.max(1, worksCanvas.layout?.columns || 4);
    const { cellWidth, cellHeight } = worksCellSize();
    const rowWidth = Math.max(columns * cellWidth, w);
    for (let slot = 0; slot < 40000; slot += 1) {
      const x = (slot % columns) * cellWidth;
      const y = Math.floor(slot / columns) * cellHeight;
      if (x + w > rowWidth + 1) continue;
      const rect = { x, y, w, h };
      if (!occupied.some(other => worksRectsOverlap(rect, other))) return rect;
    }
    return { x: 0, y: (occupied.reduce((max, r) => Math.max(max, r.y + r.h), 0)) + cellHeight, w, h };
  }

  function setWorksCardPosition(card, pos) {
    const x = `${Math.round(pos.x)}px`;
    const y = `${Math.round(pos.y)}px`;
    const z = String(pos.z || 1);
    if (card.style.getPropertyValue('--nest-wc-cx') !== x) card.style.setProperty('--nest-wc-cx', x);
    if (card.style.getPropertyValue('--nest-wc-cy') !== y) card.style.setProperty('--nest-wc-cy', y);
    if (card.style.getPropertyValue('--nest-wc-z') !== z) card.style.setProperty('--nest-wc-z', z);
  }

  // 新作品（还没有位置的）按网格顺序从左到右、换行，放进第一个空位，不压住已经摆好的卡片和分组框
  function placeWorksCards(cards) {
    const { layout } = worksCanvas;
    if (!layout) return;
    const width = layout.cardWidth || WORKS_CANVAS_DEFAULT_CARD_WIDTH;
    // 先统一读高度，再统一写样式，避免读写交替反复触发排版
    const entries = cards.map(card => ({ card, id: worksCardId(card), height: card.offsetHeight || WORKS_CANVAS_DEFAULT_CARD_HEIGHT })).filter(entry => entry.id);
    for (const entry of entries) worksCanvas.heights.set(entry.id, entry.height);
    const present = new Set(entries.map(entry => entry.id));
    const occupied = [];
    const pending = [];
    for (const entry of entries) {
      const pos = layout.cards[entry.id];
      if (pos) {
        occupied.push({ x: pos.x, y: pos.y, w: width, h: entry.height });
        worksCanvas.topZ = Math.max(worksCanvas.topZ, pos.z || 1);
      } else pending.push(entry);
    }
    for (const group of layout.groups) {
      const frame = worksGroupFrame(group, present);
      if (frame) occupied.push(frame);
    }
    for (const entry of pending) {
      const spot = findWorksFreeSpot(width, entry.height, occupied);
      layout.cards[entry.id] = { x: spot.x, y: spot.y, z: 1 };
      occupied.push(spot);
    }
    for (const entry of entries) if (layout.cards[entry.id]) setWorksCardPosition(entry.card, layout.cards[entry.id]);
    if (pending.length) saveWorksCanvasLayout();
  }

  // 把一组卡片紧凑地排成一块（frameX/frameY 是分组框左上角）
  function arrangeWorksGroupMembers(ids, frameX, frameY) {
    const { layout } = worksCanvas;
    const { cellWidth } = worksCellSize();
    const columns = Math.max(1, Math.min(ids.length, layout.columns || 4));
    const rowHeight = Math.max(...ids.map(worksCardHeight)) + WORKS_CANVAS_GAP;
    ids.forEach((id, index) => {
      layout.cards[id] = {
        x: frameX + WORKS_CANVAS_GROUP_PAD + (index % columns) * cellWidth,
        y: frameY + WORKS_CANVAS_GROUP_HEADER + WORKS_CANVAS_GROUP_PAD + Math.floor(index / columns) * rowHeight,
        z: layout.cards[id]?.z || 1,
      };
    });
  }

  function worksGroupBlockSize(ids) {
    const { cellWidth } = worksCellSize();
    const columns = Math.max(1, Math.min(ids.length, worksCanvas.layout.columns || 4));
    const rows = Math.ceil(ids.length / columns);
    const rowHeight = Math.max(...ids.map(worksCardHeight)) + WORKS_CANVAS_GAP;
    return {
      w: columns * cellWidth - WORKS_CANVAS_GAP + WORKS_CANVAS_GROUP_PAD * 2,
      h: rows * rowHeight - WORKS_CANVAS_GAP + WORKS_CANVAS_GROUP_PAD * 2 + WORKS_CANVAS_GROUP_HEADER,
    };
  }

  // 镜头号取自 AI Flow 卡片上的任务名，例如 liwang_E09_S02_v01_HZ → 2
  function worksCardShotNumber(card) {
    const text = String(card?.textContent || '');
    // 优先认「E09_S02」这种集号+镜头号的任务名，避免被提示词里零散的 S 编号带偏
    const match = text.match(/E\d{1,3}_S(\d{1,3})(?![0-9])/) || text.match(/(?:^|[^A-Za-z0-9])S(\d{1,3})(?![0-9])/);
    return match ? Number(match[1]) : null;
  }

  function worksDefaultGroupName(cards) {
    const shots = new Set(cards.map(worksCardShotNumber).filter(value => value !== null));
    if (shots.size === 1) return `镜头 S${String([...shots][0]).padStart(2, '0')}`;
    return `分组 ${(worksCanvas.layout?.groups.length || 0) + 1}`;
  }

  function groupSelectedWorks() {
    const { layout, selected } = worksCanvas;
    if (!layout) return;
    const byId = worksCardsById();
    const ids = [...byId.keys()].filter(id => selected.has(id) && layout.cards[id]);
    if (ids.length < 2) return;
    // 一张卡只属于一个组
    for (const group of layout.groups) group.ids = group.ids.filter(id => !ids.includes(id));
    layout.groups = layout.groups.filter(group => group.ids.length >= 2);
    const frameX = Math.min(...ids.map(id => layout.cards[id].x)) - WORKS_CANVAS_GROUP_PAD;
    const frameY = Math.min(...ids.map(id => layout.cards[id].y)) - WORKS_CANVAS_GROUP_PAD - WORKS_CANVAS_GROUP_HEADER;
    const group = { id: `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: '', defaultName: worksDefaultGroupName(ids.map(id => byId.get(id))), ids };
    layout.groups.push(group);
    arrangeWorksGroupMembers(ids, frameX, frameY);
    // 被新分组框压住的其它卡片挪到空位
    const frame = worksGroupFrame(group);
    const width = layout.cardWidth || WORKS_CANVAS_DEFAULT_CARD_WIDTH;
    const grouped = new Set(layout.groups.flatMap(item => item.ids));
    for (const [id, card] of byId) {
      if (grouped.has(id) || !layout.cards[id]) continue;
      const pos = layout.cards[id];
      if (worksRectsOverlap({ x: pos.x, y: pos.y, w: width, h: worksCardHeight(id) }, frame)) {
        delete layout.cards[id];
        card.style.removeProperty('--nest-wc-cx');
      }
    }
    placeWorksCards([...byId.values()]);
    setWorksSelection(new Set());
    renderWorksGroups();
    scheduleWorksMinimap();
    markWorksCanvasOrderChanged();
    saveWorksCanvasLayout();
  }

  function ungroupWorks(groupId) {
    const { layout } = worksCanvas;
    if (!layout) return;
    layout.groups = layout.groups.filter(group => group.id !== groupId);
    renderWorksGroups();
    scheduleWorksMinimap();
    saveWorksCanvasLayout();
  }

  function worksGroupDisplayName(group) {
    return group.name || group.defaultName || '分组';
  }

  // 保存分组名：空或与默认名相同 = 恢复默认（「镜头 S01」）
  function renameWorksGroup(groupId, value) {
    const group = worksCanvas.layout?.groups.find(item => item.id === groupId);
    if (!group) return;
    const name = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    group.name = name === group.defaultName ? '' : name;
    renderWorksGroups();
    scheduleWorksMinimap();
    saveWorksCanvasLayout();
  }

  // 双击组名或点铅笔：组名就地变成输入框；回车或点别处保存，Esc 取消
  function startWorksGroupRename(groupId) {
    const node = document.getElementById(WORKS_CANVAS_GROUPS_ID)?.querySelector(`[data-nest-wc-group="${CSS.escape(groupId)}"]`);
    const group = worksCanvas.layout?.groups.find(item => item.id === groupId);
    const label = node?.querySelector('[data-nest-wc-group-name]');
    if (!node || !group || !label || node.querySelector('[data-nest-wc-group-input]')) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 60;
    input.value = worksGroupDisplayName(group);
    input.placeholder = group.defaultName || '分组名称';
    input.setAttribute('data-nest-wc-group-input', '');
    input.setAttribute('aria-label', '分组名称');
    label.hidden = true;
    label.insertAdjacentElement('afterend', input);
    let done = false;
    // 画布上按下鼠标会 preventDefault（框选、平移），焦点不一定离开输入框，所以「点别处保存」另外监听
    const outside = event => { if (event.target !== input) finish(true); };
    const finish = save => {
      if (done) return;
      done = true;
      document.removeEventListener('pointerdown', outside, true);
      const value = input.value;
      input.remove();
      label.hidden = false;
      if (save) renameWorksGroup(groupId, value);
    };
    // 输入框里的按键全部到此为止：不触发空格平移，也不触发 AI Flow 的快捷键
    input.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    });
    for (const type of ['keyup', 'keypress']) input.addEventListener(type, event => event.stopPropagation());
    input.addEventListener('blur', () => finish(true));
    document.addEventListener('pointerdown', outside, true);
    input.focus();
    input.select();
  }

  function ensureWorksGroupsLayer() {
    const { viewport } = worksCanvas;
    if (!viewport) return null;
    let layer = document.getElementById(WORKS_CANVAS_GROUPS_ID);
    if (layer && layer.parentElement === viewport) return layer;
    layer?.remove();
    layer = document.createElement('div');
    layer.id = WORKS_CANVAS_GROUPS_ID;
    layer.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null;
      const groupId = target?.closest('[data-nest-wc-group]')?.getAttribute('data-nest-wc-group');
      if (!groupId) return;
      if (target.closest('[data-nest-wc-ungroup]')) ungroupWorks(groupId);
      else if (target.closest('[data-nest-wc-rename]')) startWorksGroupRename(groupId);
    });
    layer.addEventListener('dblclick', event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('[data-nest-wc-group-name]')) return;
      startWorksGroupRename(target.closest('[data-nest-wc-group]')?.getAttribute('data-nest-wc-group'));
    });
    viewport.appendChild(layer);
    return layer;
  }

  // 分组框只在缺元素时才建 DOM；位置和文字有变化才写，避免和页面监听互相触发
  function renderWorksGroups() {
    const { layout } = worksCanvas;
    if (!layout) return;
    const layer = ensureWorksGroupsLayer();
    if (!layer) return;
    if (!worksCanvas.interaction) {
      for (const [id, card] of worksCardsById()) worksCanvas.heights.set(id, card.offsetHeight || worksCardHeight(id));
    }
    const present = new Set(worksCardsById().keys());
    const alive = new Set();
    for (const group of layout.groups) {
      const frame = worksGroupFrame(group, present);
      if (!frame) continue;
      alive.add(group.id);
      let node = [...layer.children].find(child => child.getAttribute('data-nest-wc-group') === group.id);
      if (!node) {
        node = document.createElement('div');
        node.setAttribute('data-nest-wc-group', group.id);
        node.innerHTML = '<div data-nest-wc-group-head title="拖这里移动整组；双击名字改名"><span data-nest-wc-group-name></span><button type="button" data-nest-wc-rename title="改分组名" aria-label="改分组名">✎</button><span data-nest-wc-group-count></span><button type="button" data-nest-wc-ungroup title="解散分组（卡片留在原处）">解组</button></div>';
        layer.appendChild(node);
      }
      node.style.left = `${Math.round(frame.x)}px`;
      node.style.top = `${Math.round(frame.y)}px`;
      node.style.width = `${Math.round(frame.w)}px`;
      node.style.height = `${Math.round(frame.h)}px`;
      const name = node.querySelector('[data-nest-wc-group-name]');
      const count = node.querySelector('[data-nest-wc-group-count]');
      const displayName = worksGroupDisplayName(group);
      if (name && name.textContent !== displayName) name.textContent = displayName;
      const countText = `${frame.count} 个版本`;
      if (count && count.textContent !== countText) count.textContent = countText;
    }
    for (const child of [...layer.children]) if (!alive.has(child.getAttribute('data-nest-wc-group'))) child.remove();
  }

  function setWorksSelection(next) {
    worksCanvas.selected = next;
    for (const card of worksGridCards()) {
      const selected = next.has(worksCardId(card));
      if (selected && card.dataset.nestWcSelected !== 'true') card.dataset.nestWcSelected = 'true';
      else if (!selected && card.dataset.nestWcSelected) delete card.dataset.nestWcSelected;
    }
    const button = document.querySelector(`#${WORKS_CANVAS_HUD_ID} [data-nest-wc-act="group"]`);
    if (button) {
      button.hidden = next.size < 2;
      const text = `打组（${next.size}）`;
      if (button.textContent !== text) button.textContent = text;
    }
    scheduleWorksMinimap();
  }

  // ---- 搜索：镜头号或关键词，回车依次定位 ----
  function worksSearchMatcher(query) {
    const text = String(query || '').trim();
    if (!text) return null;
    const shot = text.match(/^(?:镜头|shot|s)?\s*0*(\d{1,3})$/i);
    const terms = text.toLowerCase().split(/\s+/).filter(Boolean);
    const keyword = card => {
      const content = String(card.textContent || '').toLowerCase();
      return terms.every(term => content.includes(term));
    };
    if (!shot) return [keyword];
    const number = Number(shot[1]);
    // 先按任务名里的镜头号（S02）匹配；一个都没有再退回关键词
    return [card => worksCardShotNumber(card) === number, keyword];
  }

  function runWorksSearch(query) {
    const { layout, world } = worksCanvas;
    const search = worksCanvas.search;
    search.query = String(query || '');
    search.index = -1;
    search.hits = [];
    const matchers = worksSearchMatcher(search.query);
    const cards = worksGridCards();
    if (matchers && layout) {
      for (const matcher of matchers) {
        search.hits = cards.filter(matcher).map(worksCardId).filter(id => layout.cards[id]);
        if (search.hits.length) break;
      }
      search.hits.sort((a, b) => (layout.cards[a].y - layout.cards[b].y) || (layout.cards[a].x - layout.cards[b].x));
    }
    if (world) {
      if (matchers) world.dataset.nestWcSearching = 'true';
      else delete world.dataset.nestWcSearching;
    }
    markWorksSearchHits();
  }

  function markWorksSearchHits() {
    const { hits, index } = worksCanvas.search;
    const hitSet = new Set(hits);
    const current = hits[index];
    for (const card of worksGridCards()) {
      const id = worksCardId(card);
      const value = id === current ? 'current' : hitSet.has(id) ? 'match' : '';
      if (value && card.dataset.nestWcHit !== value) card.dataset.nestWcHit = value;
      else if (!value && card.dataset.nestWcHit) delete card.dataset.nestWcHit;
    }
    const count = document.querySelector(`#${WORKS_CANVAS_HUD_ID} [data-nest-wc-count]`);
    if (count) {
      const text = !worksCanvas.search.query.trim() ? '' : hits.length ? `${index >= 0 ? index + 1 : 0}/${hits.length}` : '无结果';
      if (count.textContent !== text) count.textContent = text;
    }
    scheduleWorksMinimap();
  }

  function stepWorksSearch(direction) {
    const search = worksCanvas.search;
    if (!search.hits.length) return;
    search.index = (search.index + direction + search.hits.length) % search.hits.length;
    markWorksSearchHits();
    flyWorksCanvasToCard(search.hits[search.index]);
  }

  function flyWorksCanvasTo(target) {
    const { layout } = worksCanvas;
    if (!layout) return;
    cancelAnimationFrame(worksCanvas.flyFrame);
    const start = { ...layout.camera };
    const startedAt = performance.now();
    const step = now => {
      const t = Math.min(1, (now - startedAt) / 280);
      const k = 1 - (1 - t) ** 3;
      layout.camera = {
        x: start.x + (target.x - start.x) * k,
        y: start.y + (target.y - start.y) * k,
        zoom: start.zoom + (target.zoom - start.zoom) * k,
      };
      markWorksCanvasMoving();
      applyWorksCanvasCamera();
      if (t < 1) worksCanvas.flyFrame = requestAnimationFrame(step);
      else saveWorksCanvasLayout();
    };
    worksCanvas.flyFrame = requestAnimationFrame(step);
  }

  // 让世界坐标 (x, y) 落在视口中央
  function worksCameraCenteredOn(x, y, zoom) {
    const { viewport } = worksCanvas;
    return { x: viewport.clientWidth / 2 - x * zoom, y: viewport.clientHeight / 2 - y * zoom, zoom };
  }

  function flyWorksCanvasToCard(id) {
    const { layout, viewport } = worksCanvas;
    const pos = layout?.cards[id];
    if (!pos || !viewport) return;
    const width = layout.cardWidth || WORKS_CANVAS_DEFAULT_CARD_WIDTH;
    const zoom = clampWorksCanvas(layout.camera.zoom < 0.6 ? 0.8 : layout.camera.zoom, WORKS_CANVAS_MIN_ZOOM, WORKS_CANVAS_MAX_ZOOM);
    flyWorksCanvasTo(worksCameraCenteredOn(pos.x + width / 2, pos.y + worksCardHeight(id) / 2, zoom));
  }

  // ---- 小地图 ----
  function ensureWorksMinimap() {
    if (document.getElementById(WORKS_CANVAS_MINIMAP_ID)) return;
    const minimap = document.createElement('div');
    minimap.id = WORKS_CANVAS_MINIMAP_ID;
    minimap.title = '小地图：点或拖动跳到对应位置';
    minimap.innerHTML = '<canvas></canvas>';
    const jump = event => {
      const geometry = worksCanvas.minimapGeometry;
      const { layout } = worksCanvas;
      if (!geometry || !layout) return;
      const rect = minimap.getBoundingClientRect();
      const x = geometry.minX + (event.clientX - rect.left - geometry.offsetX) / geometry.scale;
      const y = geometry.minY + (event.clientY - rect.top - geometry.offsetY) / geometry.scale;
      cancelAnimationFrame(worksCanvas.flyFrame);
      layout.camera = worksCameraCenteredOn(x, y, layout.camera.zoom);
      markWorksCanvasMoving();
      applyWorksCanvasCamera();
    };
    minimap.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      minimap.setPointerCapture?.(event.pointerId);
      worksCanvas.minimapDragging = true;
      jump(event);
    });
    minimap.addEventListener('pointermove', event => { if (worksCanvas.minimapDragging) jump(event); });
    const stop = () => {
      if (!worksCanvas.minimapDragging) return;
      worksCanvas.minimapDragging = false;
      saveWorksCanvasLayout();
    };
    minimap.addEventListener('pointerup', stop);
    minimap.addEventListener('pointercancel', stop);
    minimap.addEventListener('wheel', event => event.preventDefault(), { passive: false });
    document.body.appendChild(minimap);
  }

  function scheduleWorksMinimap() {
    if (worksCanvas.minimapScheduled || !worksCanvas.layout) return;
    worksCanvas.minimapScheduled = true;
    requestAnimationFrame(drawWorksMinimap);
  }

  function drawWorksMinimap() {
    worksCanvas.minimapScheduled = false;
    const { layout, viewport } = worksCanvas;
    const canvas = document.querySelector(`#${WORKS_CANVAS_MINIMAP_ID} canvas`);
    if (!layout || !viewport || !canvas?.getContext) return;
    const width = layout.cardWidth || WORKS_CANVAS_DEFAULT_CARD_WIDTH;
    const ids = [...worksCardsById().keys()].filter(id => layout.cards[id]);
    const { zoom } = layout.camera;
    const view = { x: -layout.camera.x / zoom, y: -layout.camera.y / zoom, w: viewport.clientWidth / zoom, h: viewport.clientHeight / zoom };
    const boxes = ids.map(id => ({ id, x: layout.cards[id].x, y: layout.cards[id].y, w: width, h: worksCardHeight(id) }));
    const present = new Set(ids);
    const frames = layout.groups.map(group => worksGroupFrame(group, present)).filter(Boolean);
    const all = [...boxes, ...frames, view];
    const minX = Math.min(...all.map(box => box.x));
    const minY = Math.min(...all.map(box => box.y));
    const maxX = Math.max(...all.map(box => box.x + box.w));
    const maxY = Math.max(...all.map(box => box.y + box.h));
    const ratio = window.devicePixelRatio || 1;
    const cssW = WORKS_CANVAS_MINIMAP_WIDTH;
    const cssH = WORKS_CANVAS_MINIMAP_HEIGHT;
    if (canvas.width !== cssW * ratio) canvas.width = cssW * ratio;
    if (canvas.height !== cssH * ratio) canvas.height = cssH * ratio;
    const pad = 8;
    const scale = Math.min((cssW - pad * 2) / Math.max(1, maxX - minX), (cssH - pad * 2) / Math.max(1, maxY - minY));
    const offsetX = (cssW - (maxX - minX) * scale) / 2;
    const offsetY = (cssH - (maxY - minY) * scale) / 2;
    worksCanvas.minimapGeometry = { minX, minY, scale, offsetX, offsetY };
    const theme = getComputedStyle(document.body);
    const accent = theme.getPropertyValue('--nest-theme-accent').trim() || '#6f9bff';
    const muted = theme.getPropertyValue('--nest-theme-muted').trim() || '#8b919c';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const project = box => [offsetX + (box.x - minX) * scale, offsetY + (box.y - minY) * scale, Math.max(1.5, box.w * scale), Math.max(1.5, box.h * scale)];
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = accent;
    for (const frame of frames) ctx.fillRect(...project(frame));
    const hits = new Set(worksCanvas.search.hits);
    const searching = Boolean(worksCanvas.search.query.trim());
    for (const box of boxes) {
      const strong = hits.has(box.id) || worksCanvas.selected.has(box.id);
      ctx.globalAlpha = strong ? 0.95 : searching ? 0.25 : 0.6;
      ctx.fillStyle = strong ? accent : muted;
      ctx.fillRect(...project(box));
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(...project(view));
  }

  function applyWorksCanvasCamera() {
    const { viewport, world, layout } = worksCanvas;
    if (!viewport || !world || !layout) return;
    const { x, y, zoom } = layout.camera;
    const transform = `translate(${x}px, ${y}px) scale(${zoom})`;
    world.style.setProperty('transform', transform, 'important');
    const layer = document.getElementById(WORKS_CANVAS_GROUPS_ID);
    if (layer) layer.style.transform = transform;
    viewport.style.setProperty('background-position', `${x}px ${y}px`);
    viewport.style.setProperty('background-size', `${20 * zoom}px ${20 * zoom}px, ${100 * zoom}px ${100 * zoom}px, ${100 * zoom}px ${100 * zoom}px`);
    const label = document.querySelector(`#${WORKS_CANVAS_HUD_ID} [data-nest-wc-act="zoom"]`);
    const text = `${Math.round(zoom * 100)}%`;
    if (label && label.textContent !== text) label.textContent = text;
    scheduleWorksMinimap();
  }

  // 平移/缩放期间才开 will-change，停下后去掉，免得放大后文字一直是模糊的位图
  function markWorksCanvasMoving() {
    const { viewport } = worksCanvas;
    if (!viewport) return;
    viewport.dataset.nestWcMoving = 'true';
    clearTimeout(worksCanvas.idleTimer);
    worksCanvas.idleTimer = setTimeout(() => { if (viewport.isConnected) viewport.dataset.nestWcMoving = 'false'; }, 180);
  }

  function worksCanvasOrigin() {
    // 世界层大小为 0，它的包围盒左上角 = 原点 + 平移量
    const rect = worksCanvas.world.getBoundingClientRect();
    return { x: rect.left - worksCanvas.layout.camera.x, y: rect.top - worksCanvas.layout.camera.y };
  }

  function zoomWorksCanvasAt(nextZoom, clientX, clientY) {
    const { layout, viewport } = worksCanvas;
    if (!layout || !viewport) return;
    cancelAnimationFrame(worksCanvas.flyFrame);
    const camera = layout.camera;
    const zoom = clampWorksCanvas(nextZoom, WORKS_CANVAS_MIN_ZOOM, WORKS_CANVAS_MAX_ZOOM);
    if (clientX === undefined) {
      const rect = viewport.getBoundingClientRect();
      clientX = rect.left + rect.width / 2;
      clientY = rect.top + rect.height / 2;
    }
    const origin = worksCanvasOrigin();
    const cursorX = clientX - origin.x;
    const cursorY = clientY - origin.y;
    camera.x = cursorX - ((cursorX - camera.x) * zoom) / camera.zoom;
    camera.y = cursorY - ((cursorY - camera.y) * zoom) / camera.zoom;
    camera.zoom = zoom;
    markWorksCanvasMoving();
    applyWorksCanvasCamera();
    saveWorksCanvasLayout();
  }

  function fitWorksCanvas() {
    const { layout, viewport, world } = worksCanvas;
    if (!layout || !viewport || !world) return;
    const width = layout.cardWidth || WORKS_CANVAS_DEFAULT_CARD_WIDTH;
    const boxes = [...world.children].map(card => ({ pos: layout.cards[worksCardId(card)], height: card.offsetHeight || WORKS_CANVAS_DEFAULT_CARD_HEIGHT })).filter(box => box.pos);
    if (!boxes.length) return;
    const left = Math.min(...boxes.map(box => box.pos.x));
    const top = Math.min(...boxes.map(box => box.pos.y)) - (layout.groups.length ? WORKS_CANVAS_GROUP_HEADER + WORKS_CANVAS_GROUP_PAD : 0);
    const right = Math.max(...boxes.map(box => box.pos.x + width));
    const bottom = Math.max(...boxes.map(box => box.pos.y + box.height));
    const pad = 32;
    const zoom = clampWorksCanvas(Math.min((viewport.clientWidth - pad * 2) / Math.max(1, right - left), (viewport.clientHeight - pad * 2) / Math.max(1, bottom - top)), WORKS_CANVAS_MIN_ZOOM, 1.5);
    cancelAnimationFrame(worksCanvas.flyFrame);
    layout.camera = {
      x: (viewport.clientWidth - (right - left) * zoom) / 2 - left * zoom,
      y: Math.max(pad, (viewport.clientHeight - (bottom - top) * zoom) / 2) - top * zoom,
      zoom,
    };
    applyWorksCanvasCamera();
    saveWorksCanvasLayout();
  }

  // 重排：分组整块先排（组内紧凑），其余作品再按网格补进空位；分组保留
  function resetWorksCanvasLayout() {
    const { layout, viewport, world } = worksCanvas;
    if (!layout || !viewport || !world) return;
    if (!window.confirm('把所有作品按网格重新排列？你拖过的位置会被覆盖，分组会保留。')) return;
    const byId = worksCardsById();
    layout.cards = {};
    layout.columns = Math.max(1, Math.floor((viewport.clientWidth - 24) / ((layout.cardWidth || WORKS_CANVAS_DEFAULT_CARD_WIDTH) + WORKS_CANVAS_GAP)));
    layout.camera = { x: 24, y: 24, zoom: 1 };
    worksCanvas.topZ = 1;
    const occupied = [];
    for (const group of layout.groups) {
      const ids = group.ids.filter(id => byId.has(id));
      if (!ids.length) continue;
      const size = worksGroupBlockSize(ids);
      const spot = findWorksFreeSpot(size.w, size.h, occupied);
      arrangeWorksGroupMembers(ids, spot.x, spot.y);
      occupied.push(spot);
    }
    for (const card of byId.values()) card.style.removeProperty('--nest-wc-cx');
    placeWorksCards([...byId.values()]);
    renderWorksGroups();
    applyWorksCanvasCamera();
    markWorksCanvasOrderChanged();
    saveWorksCanvasLayout();
  }

  function positionWorksCanvasOverlays() {
    const { viewport } = worksCanvas;
    const hud = document.getElementById(WORKS_CANVAS_HUD_ID);
    const minimap = document.getElementById(WORKS_CANVAS_MINIMAP_ID);
    const toggle = document.getElementById(WORKS_CANVAS_TOGGLE_ID);
    const floating = toggle?.dataset.placement === 'floating';
    if (!hud && !floating && !minimap) return;
    const target = viewport?.isConnected ? viewport : worksViewportFor(worksGridFromCards(worksTaskCards()));
    if (!target) return;
    const rect = target.getBoundingClientRect();
    if (hud) {
      hud.style.left = `${Math.round(rect.left + 12)}px`;
      hud.style.bottom = `${Math.round(window.innerHeight - rect.bottom + 12)}px`;
    }
    if (minimap) {
      // 页面右下角固定着「页面配色」「专注布局」两个按钮，作品区贴着窗口右边时小地图让到它们上面
      const bottom = window.innerHeight - rect.bottom + 12;
      const nearRightEdge = window.innerWidth - rect.right < 180;
      minimap.style.right = `${Math.round(window.innerWidth - rect.right + 12)}px`;
      minimap.style.bottom = `${Math.round(nearRightEdge ? Math.max(bottom, 108) : bottom)}px`;
    }
    if (floating) {
      toggle.style.setProperty('top', `${Math.round(rect.top + 10)}px`, 'important');
      toggle.style.setProperty('right', `${Math.round(window.innerWidth - rect.right + 12)}px`, 'important');
    }
  }

  function ensureWorksCanvasHud() {
    if (document.getElementById(WORKS_CANVAS_HUD_ID)) return;
    const hud = document.createElement('div');
    hud.id = WORKS_CANVAS_HUD_ID;
    hud.innerHTML = '<button type="button" data-nest-wc-act="out" title="缩小">−</button><button type="button" data-nest-wc-act="zoom" title="回到 100%">100%</button><button type="button" data-nest-wc-act="in" title="放大">+</button><button type="button" data-nest-wc-act="fit" title="让所有作品都显示在画面里">适应</button><button type="button" data-nest-wc-act="reset" title="按网格重新排列所有作品（分组保留）">重排</button><span data-nest-wc-sep></span><input type="search" data-nest-wc-search placeholder="镜头号 / 关键词，回车定位" title="输入镜头号（如 2、S02、镜头2）或关键词；回车跳到下一个，Shift+回车上一个，Esc 清空"><span data-nest-wc-count></span><button type="button" data-nest-wc-act="group" hidden title="把选中的作品归成一组">打组</button><span data-nest-wc-sep></span><span data-nest-wc-hint>拖空白处框选 · 中键或空格+拖平移 · Shift 加选</span>';
    hud.addEventListener('click', event => {
      const act = event.target instanceof Element ? event.target.closest('[data-nest-wc-act]')?.getAttribute('data-nest-wc-act') : '';
      const zoom = worksCanvas.layout?.camera.zoom || 1;
      if (act === 'in') zoomWorksCanvasAt(zoom * 1.2);
      else if (act === 'out') zoomWorksCanvasAt(zoom / 1.2);
      else if (act === 'zoom') zoomWorksCanvasAt(1);
      else if (act === 'fit') fitWorksCanvas();
      else if (act === 'reset') resetWorksCanvasLayout();
      else if (act === 'group') groupSelectedWorks();
    });
    const input = hud.querySelector('[data-nest-wc-search]');
    input?.addEventListener('input', () => runWorksSearch(input.value));
    // 输入框里的按键不传给 AI Flow，免得触发它的快捷键
    input?.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        if (worksCanvas.search.query !== input.value) runWorksSearch(input.value);
        stepWorksSearch(event.shiftKey ? -1 : 1);
      } else if (event.key === 'Escape') {
        input.value = '';
        runWorksSearch('');
      }
    });
    for (const type of ['keyup', 'keypress']) input?.addEventListener(type, event => event.stopPropagation());
    document.body.appendChild(hud);
    if (worksCanvas.search.query && input) input.value = worksCanvas.search.query;
  }

  function attachWorksCanvas(grid, cards) {
    const viewport = worksViewportFor(grid);
    if (!viewport) return;
    ensureWorksCanvasStyle();
    clearWorksListOrder(cards);
    updateWorksOrderButton(false);
    const key = worksCanvasLayoutKey();
    const layout = loadWorksCanvasLayout(key);
    // 卡片宽度和列数在切换前量好：画布初始排法和原来的网格一致
    if (!layout.cardWidth) layout.cardWidth = Math.round(cards[0]?.getBoundingClientRect().width) || WORKS_CANVAS_DEFAULT_CARD_WIDTH;
    if (!layout.columns) layout.columns = Math.max(1, Math.floor((viewport.clientWidth - 24) / (layout.cardWidth + WORKS_CANVAS_GAP)));
    Object.assign(worksCanvas, { viewport, world: grid, layout, layoutKey: key, savedScrollTop: viewport.scrollTop, topZ: 1, selected: new Set(), heights: new Map() });
    const height = viewport.clientHeight;
    viewport.scrollTop = 0;
    viewport.classList.add(WORKS_CANVAS_VIEWPORT_CLASS);
    for (let node = grid.parentElement; node && node !== viewport; node = node.parentElement) node.classList.add(WORKS_CANVAS_PASSTHROUGH_CLASS);
    grid.classList.add(WORKS_CANVAS_WORLD_CLASS);
    grid.style.setProperty('--nest-wc-card-w', `${layout.cardWidth}px`);
    // 视口高度原本靠内容撑开时，网格变成绝对定位后会塌成 0，给一个保底高度
    worksCanvas.savedMinHeight = false;
    if (viewport.clientHeight < 160) {
      viewport.style.setProperty('min-height', `${Math.max(320, height, window.innerHeight - viewport.getBoundingClientRect().top - 16)}px`, 'important');
      worksCanvas.savedMinHeight = true;
    }
    ensureWorksCanvasHud();
    ensureWorksMinimap();
    ensureWorksGroupsLayer();
    applyWorksCanvasCamera();
    if (typeof ResizeObserver === 'function') {
      worksCanvas.resizeObserver = new ResizeObserver(() => { positionWorksCanvasOverlays(); scheduleWorksMinimap(); });
      worksCanvas.resizeObserver.observe(viewport);
    }
  }

  function detachWorksCanvas() {
    // 退出画布前立刻存盘，列表马上按最新位置排
    writeWorksCanvasLayout();
    worksCanvas.listCache = null;
    const { viewport, world } = worksCanvas;
    cancelAnimationFrame(worksCanvas.flyFrame);
    if (world) {
      world.classList.remove(WORKS_CANVAS_WORLD_CLASS);
      world.style.removeProperty('transform');
      world.style.removeProperty('--nest-wc-card-w');
      delete world.dataset.nestWcSearching;
      for (const card of world.children) {
        for (const name of ['--nest-wc-cx', '--nest-wc-cy', '--nest-wc-z']) card.style?.removeProperty(name);
        if (card.dataset) for (const key of ['nestWcDragging', 'nestWcSelected', 'nestWcHit']) delete card.dataset[key];
      }
    }
    document.querySelectorAll(`.${WORKS_CANVAS_PASSTHROUGH_CLASS}`).forEach(node => node.classList.remove(WORKS_CANVAS_PASSTHROUGH_CLASS));
    if (viewport) {
      viewport.classList.remove(WORKS_CANVAS_VIEWPORT_CLASS);
      viewport.style.removeProperty('background-position');
      viewport.style.removeProperty('background-size');
      if (worksCanvas.savedMinHeight) viewport.style.removeProperty('min-height');
      delete viewport.dataset.nestWcMoving;
      delete viewport.dataset.nestWcSpace;
      if (viewport.isConnected) viewport.scrollTop = worksCanvas.savedScrollTop;
    }
    worksCanvas.resizeObserver?.disconnect();
    for (const id of [WORKS_CANVAS_HUD_ID, WORKS_CANVAS_MINIMAP_ID, WORKS_CANVAS_GROUPS_ID, WORKS_CANVAS_MARQUEE_ID]) document.getElementById(id)?.remove();
    delete document.body.dataset.nestWcInteracting;
    Object.assign(worksCanvas, { viewport: null, world: null, layout: null, layoutKey: '', interaction: null, resizeObserver: null, savedMinHeight: false, selected: new Set(), minimapGeometry: null });
    worksCanvas.search = { query: worksCanvas.search.query, hits: [], index: -1 };
  }

  function updateWorksCanvasToggle() {
    const button = document.getElementById(WORKS_CANVAS_TOGGLE_ID);
    if (!button) return;
    const enabled = String(worksCanvas.enabled);
    const text = worksCanvas.enabled ? '退出画布' : '无限画布';
    if (button.dataset.enabled !== enabled) button.dataset.enabled = enabled;
    if (button.textContent !== text) button.textContent = text;
    button.title = worksCanvas.enabled ? '回到 AI Flow 原来的作品网格（画布上的位置会记住）' : '把作品摆在可平移、缩放的画布上，卡片能拖动；按钮照常使用';
  }

  let worksCanvasToggleRetryTimer = 0;
  function retryWorksCanvasToggle(delay) {
    if (worksCanvasToggleRetryTimer) return;
    worksCanvasToggleRetryTimer = window.setTimeout(() => {
      worksCanvasToggleRetryTimer = 0;
      scheduleWorksCanvasSync();
    }, Math.max(0, delay));
  }

  function injectWorksCanvasToggle() {
    let button = document.getElementById(WORKS_CANVAS_TOGGLE_ID);
    if (button?.dataset.placement === 'title') return;
    // 找「作品」标题要扫一片 DOM，没找到时最多每 1.5 秒再找一次。
    // 只有作品网格已出现时才计时；节流期间到点自己补一次，不靠 AI Flow 下一次页面变动——
    // 以前刷新后卡片还没出来就先占掉 1.5 秒，之后页面一安静，按钮要等很久才出现。
    const cards = worksTaskCards();
    const grid = worksCanvas.world?.isConnected ? worksCanvas.world : worksGridFromCards(cards);
    if (!grid) return;
    const now = Date.now();
    const sinceSearch = now - worksCanvas.titleSearchAt;
    if (sinceSearch < WORKS_CANVAS_TITLE_RETRY_MS) {
      retryWorksCanvasToggle(WORKS_CANVAS_TITLE_RETRY_MS - sinceSearch);
      return;
    }
    worksCanvas.titleSearchAt = now;
    ensureWorksCanvasStyle();
    const title = worksCanvasTitle(grid);
    if (!button) {
      button = document.createElement('button');
      button.id = WORKS_CANVAS_TOGGLE_ID;
      button.type = 'button';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        setWorksCanvasEnabled(!worksCanvas.enabled);
      });
    }
    if (title) {
      worksCanvas.titleRetries = 0;
      button.dataset.placement = 'title';
      button.style.removeProperty('top');
      button.style.removeProperty('right');
      title.insertAdjacentElement('afterend', button);
    } else {
      if (!button.isConnected) {
        button.dataset.placement = 'floating';
        document.body.appendChild(button);
      }
      // 先浮在作品区右上角，标题渲染出来后自动挪到标题旁；最多自己补找 10 次，之后只随页面变动再找
      if (worksCanvas.titleRetries < 10) {
        worksCanvas.titleRetries += 1;
        retryWorksCanvasToggle(WORKS_CANVAS_TITLE_RETRY_MS);
      }
    }
    updateWorksCanvasToggle();
    positionWorksCanvasOverlays();
  }

  function syncWorksCanvas() {
    worksCanvas.scheduled = false;
    if (!document.body) return;
    injectWorksCanvasToggle();
    if (!worksCanvas.enabled) {
      syncWorksListOrder();
      return;
    }
    const cards = worksTaskCards();
    const grid = worksGridFromCards(cards);
    if (!grid) {
      if (worksCanvas.world) detachWorksCanvas();
      return;
    }
    if (grid !== worksCanvas.world || !worksCanvas.viewport?.isConnected) {
      detachWorksCanvas();
      attachWorksCanvas(grid, cards);
    } else if (worksCanvasLayoutKey() !== worksCanvas.layoutKey) {
      // 换了项目：同一个网格，换一份位置
      worksCanvas.layoutKey = worksCanvasLayoutKey();
      worksCanvas.layout = loadWorksCanvasLayout(worksCanvas.layoutKey);
      worksCanvas.layout.cardWidth ||= WORKS_CANVAS_DEFAULT_CARD_WIDTH;
      worksCanvas.layout.columns ||= 4;
      worksCanvas.selected = new Set();
      for (const card of cards) card.style.removeProperty('--nest-wc-cx');
      applyWorksCanvasCamera();
    }
    if (!worksCanvas.world) return;
    // 卡片都已有位置时不再量高度：AI Flow 刷新进度等频繁变动不会每帧触发一次排版
    const gridCards = cards.filter(card => card.parentElement === grid);
    const fresh = gridCards.some(card => !card.style.getPropertyValue('--nest-wc-cx'));
    if (!worksCanvas.interaction && fresh) {
      placeWorksCards(gridCards);
      renderWorksGroups();
      // AI Flow 重绘出的新卡片节点要补上选中和搜索标记
      setWorksSelection(worksCanvas.selected);
      if (worksCanvas.search.query) runWorksSearch(worksCanvas.search.query);
    } else if (!document.getElementById(WORKS_CANVAS_GROUPS_ID)) renderWorksGroups();
    positionWorksCanvasOverlays();
  }

  function scheduleWorksCanvasSync() {
    if (worksCanvas.scheduled) return;
    worksCanvas.scheduled = true;
    requestAnimationFrame(syncWorksCanvas);
  }

  function setWorksCanvasEnabled(enabled) {
    worksCanvas.enabled = Boolean(enabled);
    try { localStorage.setItem(WORKS_CANVAS_ENABLED_KEY, String(worksCanvas.enabled)); } catch { /* 存储被禁用时只在本次生效 */ }
    if (!worksCanvas.enabled) detachWorksCanvas();
    updateWorksCanvasToggle();
    syncWorksCanvas();
  }

  function isWorksCanvasFormField(target) {
    return Boolean(target.closest('input, textarea, select, option, [contenteditable=""], [contenteditable="true"]'));
  }

  function worksClientToWorld(clientX, clientY) {
    const origin = worksCanvasOrigin();
    const { camera } = worksCanvas.layout;
    return { x: (clientX - origin.x - camera.x) / camera.zoom, y: (clientY - origin.y - camera.y) / camera.zoom };
  }

  function startWorksCanvasPointer(event) {
    const { enabled, viewport, world, layout } = worksCanvas;
    const target = event.target instanceof Element ? event.target : null;
    if (!enabled || !viewport || !world || !layout || !target || !viewport.contains(target)) return;
    // 分组标题栏：拖动整组（「解组」按钮走自己的 click）
    const head = target.closest('[data-nest-wc-group-head]');
    if (head && event.button === 0) {
      // 「解组」、改名铅笔和改名输入框不算拖动
      if (target.closest('[data-nest-wc-ungroup], [data-nest-wc-rename]') || isWorksCanvasFormField(target)) return;
      const group = layout.groups.find(item => item.id === head.closest('[data-nest-wc-group]')?.getAttribute('data-nest-wc-group'));
      if (!group) return;
      event.preventDefault();
      const byId = worksCardsById();
      const members = group.ids.filter(id => byId.has(id) && layout.cards[id]).map(id => ({ id, card: byId.get(id), x: layout.cards[id].x, y: layout.cards[id].y }));
      worksCanvas.interaction = { kind: 'group', members, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
      document.body.dataset.nestWcInteracting = 'true';
      return;
    }
    const card = target.closest('.task-card');
    const onCard = card && card.parentElement === world;
    if (onCard && event.button === 0) {
      if (isWorksCanvasFormField(target)) return;
      const id = worksCardId(card);
      const pos = layout.cards[id];
      if (!id || !pos) return;
      // Shift+点卡片：加入/移出选择，这次点击不交给 AI Flow
      if (event.shiftKey) {
        event.preventDefault();
        const next = new Set(worksCanvas.selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setWorksSelection(next);
        worksCanvas.suppressClickUntil = Date.now() + 400;
        return;
      }
      if (event.altKey) return;
      // 卡片上不拦按下：移动超过 4px 才算拖动，否则就是普通点击，AI Flow 的按钮照常响应
      const ids = worksCanvas.selected.has(id) && worksCanvas.selected.size > 1 ? [...worksCanvas.selected] : [id];
      const byId = ids.length > 1 ? worksCardsById() : new Map([[id, card]]);
      const members = ids.filter(item => byId.has(item) && layout.cards[item]).map(item => ({ id: item, card: byId.get(item), x: layout.cards[item].x, y: layout.cards[item].y }));
      worksCanvas.interaction = { kind: 'card-pending', card, id, members, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: pos.x, y: pos.y };
      return;
    }
    if (event.button !== 1 && (event.button !== 0 || onCard)) return;
    if (event.button === 0 && isWorksCanvasFormField(target)) return;
    event.preventDefault();
    // 左键拖空白处 = 框选（Shift/Ctrl 加选）；中键或按住空格再拖 = 平移
    if (event.button === 0 && !worksCanvas.spaceHeld) {
      const additive = event.shiftKey || event.ctrlKey || event.metaKey;
      worksCanvas.interaction = { kind: 'marquee', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, additive, base: additive ? new Set(worksCanvas.selected) : new Set() };
      let marquee = document.getElementById(WORKS_CANVAS_MARQUEE_ID);
      if (!marquee) {
        marquee = document.createElement('div');
        marquee.id = WORKS_CANVAS_MARQUEE_ID;
        document.body.appendChild(marquee);
      }
      Object.assign(marquee.style, { left: `${event.clientX}px`, top: `${event.clientY}px`, width: '0px', height: '0px' });
      document.body.dataset.nestWcInteracting = 'true';
      return;
    }
    worksCanvas.interaction = { kind: 'pan', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: layout.camera.x, y: layout.camera.y, moved: false };
    cancelAnimationFrame(worksCanvas.flyFrame);
    document.body.dataset.nestWcInteracting = 'true';
  }

  function moveWorksMembers(members, dx, dy) {
    const { layout } = worksCanvas;
    for (const member of members) {
      const pos = layout.cards[member.id];
      if (!pos) continue;
      pos.x = member.x + dx / layout.camera.zoom;
      pos.y = member.y + dy / layout.camera.zoom;
      setWorksCardPosition(member.card, pos);
    }
    if (layout.groups.length) renderWorksGroups();
    scheduleWorksMinimap();
  }

  function moveWorksCanvasPointer(event) {
    const action = worksCanvas.interaction;
    const { layout } = worksCanvas;
    if (!action || !layout || event.pointerId !== action.pointerId) return;
    const dx = event.clientX - action.startX;
    const dy = event.clientY - action.startY;
    if (action.kind === 'pan') {
      if (Math.hypot(dx, dy) >= 4) action.moved = true;
      layout.camera.x = action.x + dx;
      layout.camera.y = action.y + dy;
      markWorksCanvasMoving();
      applyWorksCanvasCamera();
      return;
    }
    if (action.kind === 'marquee') {
      const marquee = document.getElementById(WORKS_CANVAS_MARQUEE_ID);
      if (marquee) {
        Object.assign(marquee.style, {
          left: `${Math.min(action.startX, event.clientX)}px`,
          top: `${Math.min(action.startY, event.clientY)}px`,
          width: `${Math.abs(dx)}px`,
          height: `${Math.abs(dy)}px`,
        });
      }
      action.endX = event.clientX;
      action.endY = event.clientY;
      return;
    }
    if (action.kind === 'group') {
      moveWorksMembers(action.members, dx, dy);
      return;
    }
    if (action.kind === 'card-pending') {
      if (Math.hypot(dx, dy) < 4) return;
      action.kind = 'card';
      for (const member of action.members) {
        worksCanvas.topZ += 1;
        layout.cards[member.id].z = worksCanvas.topZ;
      }
      action.card.dataset.nestWcDragging = 'true';
      document.body.dataset.nestWcInteracting = 'true';
      window.getSelection?.()?.removeAllRanges?.();
    }
    moveWorksMembers(action.members, dx, dy);
  }

  function finishWorksMarquee(action) {
    document.getElementById(WORKS_CANVAS_MARQUEE_ID)?.remove();
    const { layout } = worksCanvas;
    if (!layout) return;
    // 没拖开就是点了一下空白处：取消选择（加选模式下保持不变）
    if (action.endX === undefined || Math.hypot(action.endX - action.startX, action.endY - action.startY) < 4) {
      if (!action.additive && worksCanvas.selected.size) setWorksSelection(new Set());
      return;
    }
    const a = worksClientToWorld(action.startX, action.startY);
    const b = worksClientToWorld(action.endX, action.endY);
    const box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
    const width = layout.cardWidth || WORKS_CANVAS_DEFAULT_CARD_WIDTH;
    const next = new Set(action.base);
    for (const id of worksCardsById().keys()) {
      const pos = layout.cards[id];
      if (pos && worksRectsOverlap(box, { x: pos.x, y: pos.y, w: width, h: worksCardHeight(id) }, 0)) next.add(id);
    }
    setWorksSelection(next);
  }

  function endWorksCanvasPointer(event) {
    const action = worksCanvas.interaction;
    if (!action || (event.pointerId !== undefined && event.pointerId !== action.pointerId)) return;
    worksCanvas.interaction = null;
    delete document.body.dataset.nestWcInteracting;
    if (action.kind === 'card-pending') return;
    if (action.kind === 'marquee') {
      finishWorksMarquee(action);
      return;
    }
    if (action.kind === 'pan' && !action.moved) return;
    if (action.kind === 'card') {
      delete action.card.dataset.nestWcDragging;
      // 拖完松手会跟一个 click，吞掉它，免得误点到卡片上的按钮
      worksCanvas.suppressClickUntil = Date.now() + 400;
    }
    if (action.kind === 'card' || action.kind === 'group') {
      renderWorksGroups();
      markWorksCanvasOrderChanged();
    }
    saveWorksCanvasLayout();
  }

  document.addEventListener('pointerdown', startWorksCanvasPointer, true);
  window.addEventListener('pointermove', moveWorksCanvasPointer, true);
  window.addEventListener('pointerup', endWorksCanvasPointer, true);
  window.addEventListener('pointercancel', endWorksCanvasPointer, true);
  window.addEventListener('click', event => {
    if (Date.now() > worksCanvas.suppressClickUntil) return;
    worksCanvas.suppressClickUntil = 0;
    if (!(event.target instanceof Element) || !worksCanvas.viewport?.contains(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  // 画布上滚轮 = 以光标为中心缩放（和素材库参考板一致）
  document.addEventListener('wheel', event => {
    const { enabled, viewport, layout } = worksCanvas;
    if (!enabled || !viewport || !layout || !(event.target instanceof Element) || !viewport.contains(event.target)) return;
    event.preventDefault();
    zoomWorksCanvasAt(layout.camera.zoom * Math.exp(-event.deltaY * 0.0012), event.clientX, event.clientY);
  }, { capture: true, passive: false });
  // 卡片里的图片、视频原生拖拽会打断画布拖动；按住 Alt 时仍交给 AI Flow
  document.addEventListener('dragstart', event => {
    if (!worksCanvas.enabled || event.altKey || !(event.target instanceof Node) || !worksCanvas.world?.contains(event.target)) return;
    event.preventDefault();
  }, true);
  window.addEventListener('resize', positionWorksCanvasOverlays);
  const setWorksSpaceHeld = held => {
    if (worksCanvas.spaceHeld === held) return;
    worksCanvas.spaceHeld = held;
    const { viewport } = worksCanvas;
    if (!viewport) return;
    if (held) viewport.dataset.nestWcSpace = 'true';
    else delete viewport.dataset.nestWcSpace;
  };
  // 在输入框、提示词里打空格不算；只在画布开着时记录，不拦截空格本身
  window.addEventListener('keydown', event => {
    if (event.code !== 'Space' || !worksCanvas.enabled || !worksCanvas.viewport) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target && isWorksCanvasFormField(target)) return;
    setWorksSpaceHeld(true);
  }, true);
  window.addEventListener('keyup', event => { if (event.code === 'Space') setWorksSpaceHeld(false); }, true);
  window.addEventListener('blur', () => setWorksSpaceHeld(false));

  // ===== 引用素材侧栏（DEC-015）=====
  // AI Flow 把引用素材（#assetTags：@图片1、@音频1……）排在提示词下面，素材一多要往下翻。
  // 这里把整块引用区挪到提示词框右侧，竖着一行一个；只移动节点、不改 AI Flow 的内容和事件，
  // 原位置留注释占位，点「放回下方」原样还原。类名和 id 都不用 nest-aiflow- 前缀：
  // isNestOwnedNode 会把带这个前缀的祖先当成扩展自己的窗口，提示词框就会被误判。
  const ASSET_SIDE_ENABLED_KEY = 'nest-aiflow-asset-side-enabled';
  const ASSET_SIDE_STYLE_ID = 'nest-aiflow-asset-side-style';
  const assetSide = { split: null, side: null, editorBox: null, tagsBlock: null, editorMark: null, tagsMark: null, toggle: null };

  function assetSideEnabled() {
    try { return localStorage.getItem(ASSET_SIDE_ENABLED_KEY) !== 'false'; } catch { return true; }
  }

  // 引用区：从 #assetTags 往上找，把提示文字（"点击 ↓ 插入描述"）和「清除全部」一起带走；
  // 碰到包含输入框、或带有引用区以外按钮的祖先就停（那是「生成前审查」「找范例」所在的大区块）。
  function assetTagsBlock(tags, editor) {
    let block = tags;
    for (let parent = block.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      if (parent.contains(editor) || parent.querySelector('textarea, input:not([type="hidden"]), select')) break;
      const outsideButtons = [...parent.querySelectorAll('button, [role="button"]')]
        .filter(button => !tags.contains(button) && !/清除全部|清空/.test(String(button.textContent || '')));
      if (outsideButtons.length) break;
      if (String(parent.textContent || '').length - String(tags.textContent || '').length > 80) break;
      block = parent;
    }
    return block;
  }

  function ensureAssetSideStyle() {
    if (document.getElementById(ASSET_SIDE_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = ASSET_SIDE_STYLE_ID;
    style.textContent = `
      .nest-asset-split { display: grid !important; grid-template-columns: minmax(0, 1fr) minmax(220px, 36%) !important; gap: 10px !important; align-items: stretch !important; min-width: 0 !important; }
      .nest-asset-split > :first-child { min-width: 0 !important; }
      /* height:0 + min-height:100%：侧栏不撑高这一行，高度跟提示词框一致，素材多了在侧栏里滚动 */
      .nest-asset-side { display: flex !important; flex-direction: column !important; gap: 8px !important; height: 0 !important; min-height: 100% !important; min-width: 0 !important; box-sizing: border-box !important; padding: 8px !important; overflow: auto !important; overscroll-behavior: contain !important; border: 1px solid var(--nest-theme-border, #2a2f38) !important; border-radius: 12px !important; background: var(--nest-theme-field, #0b0d10) !important; }
      .nest-asset-side-head { display: flex !important; align-items: center !important; gap: 8px !important; flex: none !important; color: var(--nest-theme-muted, #8b919c) !important; font: 600 12px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important; }
      .nest-asset-side-head span { flex: 1 1 auto !important; }
      .nest-asset-side-toggle { flex: none !important; min-height: 24px !important; padding: 3px 10px !important; border: 1px solid var(--nest-theme-border, #2a2f38) !important; border-radius: 999px !important; background: transparent !important; color: var(--nest-theme-muted, #8b919c) !important; font: 600 11px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important; cursor: pointer !important; }
      .nest-asset-side-toggle:hover { border-color: var(--nest-theme-accent, #6f9bff) !important; color: var(--nest-theme-text, #e8eaee) !important; }
      .nest-asset-side-toggle[data-placement="below"] { align-self: flex-start !important; margin: 4px 0 !important; }
      /* 一行一个：和原来每个素材的样子一样，只是竖着排、占满侧栏宽度 */
      .nest-asset-side #assetTags { display: flex !important; flex-direction: column !important; flex-wrap: nowrap !important; align-items: stretch !important; gap: 6px !important; width: 100% !important; max-width: none !important; }
      .nest-asset-side #assetTags .asset-tag { width: 100% !important; max-width: none !important; min-width: 0 !important; margin: 0 !important; box-sizing: border-box !important; }
      .nest-asset-side .nest-asset-side-block { display: flex !important; flex-direction: column !important; gap: 6px !important; min-width: 0 !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function assetSideToggleButton() {
    if (assetSide.toggle) return assetSide.toggle;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nest-asset-side-toggle';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const next = !assetSideEnabled();
      try { localStorage.setItem(ASSET_SIDE_ENABLED_KEY, String(next)); } catch { /* 存储被禁用时只在本次生效 */ }
      if (next) injectAssetTagsSidebar();
      else restoreAssetTagsSidebar(true);
    });
    assetSide.toggle = button;
    return button;
  }

  // 还原：引用区和提示词框都回到注释占位处，拆掉分栏
  function restoreAssetTagsSidebar(showBelowToggle = false) {
    const { split, editorBox, tagsBlock, editorMark, tagsMark } = assetSide;
    // 已被 AI Flow 从页面拿掉的旧节点不放回去，免得重绘后出现两份
    if (tagsBlock?.isConnected && split?.contains(tagsBlock) && tagsMark?.parentNode) tagsMark.parentNode.insertBefore(tagsBlock, tagsMark);
    if (editorBox?.isConnected && split?.contains(editorBox) && editorMark?.parentNode) editorMark.parentNode.insertBefore(editorBox, editorMark);
    tagsMark?.remove();
    editorMark?.remove();
    split?.remove();
    tagsBlock?.classList?.remove('nest-asset-side-block');
    Object.assign(assetSide, { split: null, side: null, editorBox: null, tagsBlock: null, editorMark: null, tagsMark: null });
    const button = assetSideToggleButton();
    if (showBelowToggle && tagsBlock?.parentNode) {
      button.textContent = '放到提示词右侧';
      button.dataset.placement = 'below';
      tagsBlock.parentNode.insertBefore(button, tagsBlock);
    } else {
      button.remove();
    }
  }

  function injectAssetTagsSidebar() {
    const editor = document.getElementById('promptInput');
    const tags = document.getElementById('assetTags');
    if (!(editor instanceof Element) || !(tags instanceof Element)) {
      if (assetSide.split && !assetSide.split.isConnected) restoreAssetTagsSidebar();
      return;
    }
    if (!assetSideEnabled()) {
      // 关着时只保证「放到提示词右侧」按钮在引用区上方
      if (assetSide.split) restoreAssetTagsSidebar();
      const button = assetSideToggleButton();
      const block = assetTagsBlock(tags, editor);
      if (button.nextElementSibling === block) return;
      if (block.parentNode) {
        ensureAssetSideStyle();
        button.textContent = '放到提示词右侧';
        button.dataset.placement = 'below';
        block.parentNode.insertBefore(button, block);
      }
      return;
    }
    const { split, side } = assetSide;
    if (split?.isConnected && split.contains(editor) && side?.contains(tags)) return;
    // AI Flow 重绘换掉了节点：先把旧的还原，再重新挪
    if (split) restoreAssetTagsSidebar();
    const editorBox = editor.parentElement;
    if (!editorBox || editorBox === document.body || !editorBox.parentElement || editorBox.contains(tags)) return;
    const tagsBlock = assetTagsBlock(tags, editor);
    if (tagsBlock.contains(editorBox)) return;
    ensureAssetSideStyle();
    const editorMark = document.createComment('nest-asset-side:editor');
    const tagsMark = document.createComment('nest-asset-side:tags');
    const newSplit = document.createElement('div');
    newSplit.className = 'nest-asset-split';
    const newSide = document.createElement('div');
    newSide.className = 'nest-asset-side';
    const head = document.createElement('div');
    head.className = 'nest-asset-side-head';
    const label = document.createElement('span');
    label.textContent = '引用素材';
    const button = assetSideToggleButton();
    button.textContent = '放回下方';
    button.dataset.placement = 'side';
    head.append(label, button);
    editorBox.parentElement.insertBefore(editorMark, editorBox);
    tagsBlock.parentNode.insertBefore(tagsMark, tagsBlock);
    editorMark.parentNode.insertBefore(newSplit, editorMark);
    newSplit.appendChild(editorBox);
    tagsBlock.classList.add('nest-asset-side-block');
    newSide.append(head, tagsBlock);
    newSplit.appendChild(newSide);
    Object.assign(assetSide, { split: newSplit, side: newSide, editorBox, tagsBlock, editorMark, tagsMark });
  }

  function isLikelyPromptEditor(editor) {
    // Contenteditable content can contain DIV/BR nodes whose browser line layout
    // cannot be reproduced faithfully from textContent. Leave it entirely native
    // so the server's caret and Enter position can never drift from visible text.
    if (!(editor instanceof HTMLTextAreaElement)) return false;
    if (isVideoExtendPrompt(editor)) return true;
    const clues = [
      editor.id,
      editor.name,
      editor.className,
      editor.getAttribute('aria-label'),
      editor.getAttribute('placeholder'),
    ].join(' ').toLowerCase();
    const maxLength = Number(editor.getAttribute('maxlength') || editor.maxLength || 0);
    return maxLength >= 1000 || /prompt|提示|描述|创意|镜头|分镜|剧情/.test(clues);
  }

  function promptReferenceInventory(editor) {
    // assetTags is AI Flow's current attached-reference list, not the asset
    // library. Do not use this global list for unrelated dialog editors.
    if (editor.id !== 'promptInput') return null;
    const tags = document.getElementById('assetTags');
    if (!tags) return null;
    const inventory = new Set();
    for (const label of tags.querySelectorAll('.asset-tag[data-asset-id] .at-chip-label')) {
      const match = label.textContent.trim().match(/^@(图片|视频|音频|Img|Vid|Audio)\s*(\d+)$/i);
      if (!match) return null; // Unknown page format: avoid false missing alerts.
      const type = ({ img: '图片', vid: '视频', audio: '音频' })[match[1].toLowerCase()] || match[1];
      inventory.add(type + Number(match[2]));
    }
    if (tags.querySelectorAll('.asset-tag[data-asset-id]').length && !inventory.size) return null;
    return inventory;
  }

  function renderPromptReferences(target, value, inventory) {
    const fragment = document.createDocumentFragment();
    PROMPT_REFERENCE_TOKEN_RE.lastIndex = 0;
    let cursor = 0;
    let match;
    while ((match = PROMPT_REFERENCE_TOKEN_RE.exec(value))) {
      if (match.index > cursor) fragment.appendChild(document.createTextNode(value.slice(cursor, match.index)));
      const token = document.createElement('mark');
      token.className = `nest-aiflow-reference-token nest-aiflow-reference-${match[1] === '图片' ? 'image' : match[1] === '视频' ? 'video' : 'audio'}`;
      if (inventory && !inventory.has(match[1] + Number(match[2]))) {
        token.classList.add('nest-aiflow-reference-missing');
      }
      token.textContent = match[0];
      fragment.appendChild(token);
      cursor = match.index + match[0].length;
    }
    if (cursor < value.length) fragment.appendChild(document.createTextNode(value.slice(cursor)));
    target.replaceChildren(fragment);
  }

  function attachPromptHighlighter(editor) {
    const existing = promptHighlighters.get(editor);
    if (existing) {
      existing.refreshValue();
      return;
    }
    const parent = editor.parentElement;
    if (!parent) return;
    ensurePromptHighlightStyles();
    const parentComputed = getComputedStyle(parent);
    if (parentComputed.position === 'static') parent.style.position = 'relative';
    const layer = document.createElement('div');
    const content = document.createElement('div');
    layer.className = PROMPT_HIGHLIGHT_LAYER_CLASS;
    layer.setAttribute('aria-hidden', 'true');
    // The host page styles DIV/MARK elements. Isolate the mirror so those rules
    // cannot change its line breaks relative to the native textarea.
    const shadow = layer.attachShadow({ mode: 'open' });
    const mirrorStyle = document.createElement('style');
    mirrorStyle.textContent = `
      div { display:block; width:100%; min-height:100%; margin:0; padding:0; border:0; font:inherit; line-height:inherit;
        letter-spacing:inherit; word-spacing:inherit; white-space:inherit;
        overflow-wrap:inherit; word-break:inherit; word-wrap:inherit; color:transparent;
        -webkit-text-fill-color:transparent; }
      mark { all:unset; color:transparent; -webkit-text-fill-color:transparent;
        border-radius:3px; background:rgba(47,161,220,.48);
        box-shadow:inset 0 0 0 1px rgba(101,216,255,.85); }
      .nest-aiflow-reference-video { background:rgba(133,86,232,.48);
        box-shadow:inset 0 0 0 1px rgba(195,155,255,.85); }
      .nest-aiflow-reference-audio { background:rgba(39,179,126,.48);
        box-shadow:inset 0 0 0 1px rgba(124,240,188,.85); }
      .nest-aiflow-reference-missing { background:rgba(239,55,68,.58);
        box-shadow:inset 0 0 0 1px rgba(255,125,135,.95); }
    `;
    shadow.append(mirrorStyle, content);
    parent.insertBefore(layer, editor);
    editor.classList.add(PROMPT_HIGHLIGHT_CLASS);
    let lastPromptText = null;
    let lastInventoryKey = null;
    let disposed = false;
    let valueWatchTimer = null;
    let resizeObserver = null;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      if (valueWatchTimer !== null) window.clearInterval(valueWatchTimer);
      resizeObserver?.disconnect();
      layer.remove();
      promptHighlighters.delete(editor);
    };
    let lastGeometryKey = '';
    const sync = () => {
      if (!editor.isConnected) {
        dispose();
        return;
      }
      const style = getComputedStyle(editor), parentBox = parent.getBoundingClientRect(), editorBox = editor.getBoundingClientRect();
      // 每 180ms 的定时刷新以前会无条件重写三十来个内联样式，每次都让浏览器重算样式（LES-021）；
      // 现在先比对几何和字体，没变就跳过写入，只看文字和引用有没有变。
      const geometryKey = [editorBox.top - parentBox.top, editorBox.left - parentBox.left, parent.scrollTop, parent.scrollLeft,
        editor.clientWidth, editor.clientHeight, editor.scrollTop, editor.scrollLeft, style.font, style.padding,
        style.lineHeight, style.letterSpacing, style.wordSpacing, style.whiteSpace, style.textIndent].join('|');
      if (geometryKey !== lastGeometryKey) {
        lastGeometryKey = geometryKey;
      // offsetTop/offsetLeft use the offset parent and become wrong when AI Flow
      // moves the textarea inside a scrolled or transformed layout. Both boxes
      // describe the rendered positions, so translate them back into the
      // positioned parent's content coordinates before mirroring the text.
      layer.style.top = `${editorBox.top - parentBox.top - parent.clientTop + parent.scrollTop + editor.clientTop}px`;
      layer.style.left = `${editorBox.left - parentBox.left - parent.clientLeft + parent.scrollLeft + editor.clientLeft}px`;
      layer.style.width = `${editor.clientWidth}px`;
      layer.style.height = `${editor.clientHeight}px`;
      layer.style.boxSizing = 'border-box';
      layer.style.padding = style.padding;
      layer.style.font = style.font;
      layer.style.lineHeight = style.lineHeight;
      layer.style.letterSpacing = style.letterSpacing;
      layer.style.textAlign = style.textAlign;
      layer.style.tabSize = style.tabSize;
      for (const property of ['font-family', 'font-size', 'font-weight', 'font-style',
        'font-stretch', 'font-kerning', 'font-variant', 'font-feature-settings',
        'font-variation-settings', 'line-height', 'letter-spacing', 'word-spacing',
        'text-indent', 'text-transform', 'text-align', 'direction', 'tab-size',
        'white-space', 'overflow-wrap', 'word-break', 'word-wrap', 'writing-mode']) {
        layer.style.setProperty(property, style.getPropertyValue(property), 'important');
      }
      // Keep the server textarea as the real visual text source. The layer is
      // transparent except for @ reference tokens, so its layout can never move
      // the native caret or make Enter appear to land on another visual line.
      layer.style.background = 'transparent';
      content.style.transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`;
      }
      const currentText = promptEditorText(editor);
      const inventory = promptReferenceInventory(editor);
      const inventoryKey = inventory ? JSON.stringify([...inventory].sort()) : 'unknown';
      if (currentText === lastPromptText && inventoryKey === lastInventoryKey) return;
      lastPromptText = currentText;
      lastInventoryKey = inventoryKey;
      renderPromptReferences(content, currentText, inventory);
    };
    const refreshValue = () => {
      if (!editor.isConnected) {
        dispose();
        return;
      }
      // Remake can update font, wrapping and scroll position independently of
      // value (and without input/scroll events). Refresh geometry every tick.
      if (document.hidden) return;
      sync();
    };
    resizeObserver = new ResizeObserver(sync);
    resizeObserver.observe(editor);
    editor.addEventListener('input', sync);
    editor.addEventListener('scroll', sync);
    editor.addEventListener('compositionend', sync);
    promptHighlighters.set(editor, { layer, resizeObserver, sync, refreshValue, dispose });
    valueWatchTimer = window.setInterval(refreshValue, PROMPT_VALUE_WATCH_INTERVAL_MS);
    sync();
  }

  function injectPromptReferenceHighlights() {
    if (!isAIFlowWorkspace()) return;
    for (const editor of document.querySelectorAll('textarea, [contenteditable="true"]')) {
      // The original video-extend window uses the same real prompt editor as
      // the workbench. Keep one transparent mirror alive in both views.
      if (isLikelyPromptEditor(editor)) attachPromptHighlighter(editor);
    }
  }

  function requestVideoCopy(taskId, button) {
    const id = String(taskId || '').trim();
    if (!id || button.disabled) return;
    const originalLabel = button.innerHTML;
    button.disabled = true;
    button.textContent = '复制中…';
    sendRuntimeMessage({ action: 'copy-aiflow-video', srcUrl: videoUrl(id), pageUrl: location.href }, result => {
      button.disabled = false;
      button.textContent = result?.ok ? '已复制' : '复制失败';
      setTimeout(() => { if (button.isConnected) button.innerHTML = originalLabel; }, result?.ok ? 1500 : 2400);
    }, () => {
      button.disabled = false;
      button.textContent = '复制失败';
      setTimeout(() => { if (button.isConnected) button.innerHTML = originalLabel; }, 2400);
    });
  }

  function injectButton() {
    const menu = document.getElementById('ctxMenu');
    if (!menu || menu.classList.contains('hidden') || !pendingTaskId) return;
    let button = menu.querySelector(`#${BUTTON_ID}`);
    if (!button) {
      button = document.createElement('button');
      button.id = BUTTON_ID;
      button.type = 'button';
      button.className = 'ctx-item';
      button.innerHTML = '<span aria-hidden="true">▣</span><span>复制到小旺仔素材库</span>';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const taskId = pendingTaskId;
        menu.classList.add('hidden');
        requestVideoCopy(taskId, button);
      });
      menu.appendChild(button);
    }
    button.dataset.taskId = pendingTaskId;
  }

  function currentProjectId() {
    const values = [AI_FLOW_DOM?.projectId?.()];
    const selectors = [
      '.gen-current-project',
      '.gen-episode-list',
      '.gen-episode-item.active',
      '#projSwitchBadge',
      '#assetLibrary',
      '[data-project-id], [data-projectid]',
    ];
    const attributes = ['data-pid', 'data-project-id', 'data-projectid', 'data-current-project-id'];
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        for (const attribute of attributes) values.push(node.getAttribute(attribute));
      }
    }
    return values.map(value => String(value || '').trim()).find(value => /^\d{1,18}$/.test(value)) || '';
  }

  function currentProjectName() {
    const project = AI_FLOW_DOM?.project?.() || document.querySelector(
      '.gen-current-project[data-pid], [data-project-id], [data-projectid], [data-pid]',
    );
    const value = String(AI_FLOW_DOM?.projectName?.() || project?.textContent || '').trim().replace(/\s+/g, ' ');
    return value.slice(0, 120);
  }

  function currentFolderAssetId() {
    const value = String(AI_FLOW_DOM?.assets?.().map(AI_FLOW_DOM.assetId).find(Boolean) || document.querySelector('#assetLibrary .asset-lib-item[data-asset-id]')?.dataset?.assetId || '').trim();
    return /^\d{1,18}$/.test(value) ? value : '';
  }

  function currentFolderSelection() {
    const toolbar = AI_FLOW_DOM?.folderToolbar?.() || document.querySelector('#assetLibrary .als-folder-bar-in');
    const crumb = toolbar?.querySelector('.als-crumb-last[data-folder-id]')
      || toolbar?.querySelector('.als-crumb-root[data-folder-id=""]')
      || AI_FLOW_DOM?.folderCrumbs?.().find(node => node.getAttribute('aria-current') === 'page' || node.dataset?.active === 'true');
    if (!crumb) return null;
    const id = String(crumb.dataset?.folderId ?? '').trim();
    const isRoot = crumb.matches('.als-crumb-root[data-folder-id=""]');
    if (!id && !isRoot) return null;
    if (id && !/^\d{1,18}$/.test(id)) return null;
    return { id, name: String(crumb.textContent || '我的素材').trim() || '我的素材' };
  }

  function currentFolderId() {
    return currentFolderSelection()?.id ?? '';
  }

  function currentFolderName() {
    return currentFolderSelection()?.name || '我的素材';
  }

  function folderToolbar() {
    // AI Flow 2026 UI removed the old inner wrapper. Keep that selector first
    // for existing pages, then mount into the outer bar used by the new UI.
    return AI_FLOW_DOM?.folderToolbar?.()
      || document.querySelector('#assetLibrary .als-folder-bar-in')
      || document.querySelector('#assetLibrary .als-folder-bar');
  }

  function isSharedLibraryView() {
    const active = AI_FLOW_DOM?.activeFolderTab?.();
    return Boolean(active?.dataset?.tab === 'packs'
      || document.querySelector('#assetLibrary .als-tab[data-tab="packs"].als-tab-active'));
  }

  function controlContext() {
    const workspace = isAIFlowWorkspace();
    const projectId = currentProjectId();
    const folder = currentFolderSelection();
    const sharedLibrary = isSharedLibraryView();
    const themeStyle = getComputedStyle(document.body || document.documentElement);
    const theme = Object.fromEntries(['bg', 'surface', 'border', 'text', 'muted', 'accent', 'button'].map(key => [
      key,
      themeStyle.getPropertyValue(`--nest-theme-${key}`).trim(),
    ]).filter(([, value]) => value));
    const error = !workspace
      ? '当前页面不是已打开素材库的 AI Flow 页面'
      : sharedLibrary
        ? '公共资产包不支持实时同步，请打开“我的素材”中的文件夹'
        : !projectId || !folder
          ? '请在 AI Flow 的“我的素材”中打开具体文件夹'
          : '';
    return {
      ok: !error,
      workspace,
      pageUrl: location.href,
      projectId,
      projectName: currentProjectName(),
      folderId: folder?.id || '',
      folderName: folder?.name || '',
      sharedLibrary,
      theme,
      error,
    };
  }

  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  function refreshAIFlowAssetLibrary() {
    const button = AI_FLOW_DOM?.refreshButton?.() || document.getElementById('assetLibReload');
    if (button instanceof HTMLElement) button.click();
  }

  function openAIFlowAssetRoot() {
    const root = AI_FLOW_DOM?.folderCrumbs?.().find(node => node.classList.contains('als-crumb-root') && node.dataset?.folderId === '')
      || document.querySelector('#assetLibrary .als-crumb-root[data-folder-id=""]');
    if (root instanceof HTMLElement) root.click();
  }

  function visibleElement(element) {
    const rect = element?.getBoundingClientRect?.();
    return Boolean(rect && rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden');
  }

  async function attachUploadedVideoExtendReferences(remoteAssetIds) {
    const ids = [...new Set((Array.isArray(remoteAssetIds) ? remoteAssetIds : [])
      .map(id => String(id || '').trim()).filter(id => /^\d{1,18}$/.test(id)))];
    const editor = currentVideoExtendEditor();
    const dialog = editor && videoExtendContainer(editor);
    if (!ids.length || !dialog) return null;
    const sourceButton = [...dialog.querySelectorAll('button')].find(button => /^@?素材$/.test(String(button.textContent || '').trim()));
    if (!sourceButton) return { attached: 0, attachedIds: [], missing: ids, error: '引用未能加入视频延长窗口：未找到“素材”按钮' };
    sourceButton.click();
    const deadline = Date.now() + 12 * 1000;
    const attachedIds = [];
    while (attachedIds.length < ids.length && Date.now() < deadline) {
      for (const id of ids) {
        if (attachedIds.includes(id)) continue;
        const card = dialog.querySelector(`[data-refpick="${id}"]`);
        if (!card) continue;
        card.click();
        attachedIds.push(id);
      }
      if (attachedIds.length < ids.length) await wait(240);
    }
    return {
      attached: attachedIds.length,
      attachedIds,
      missing: ids.filter(id => !attachedIds.includes(id)),
      ...(attachedIds.length ? {} : { error: '引用未能加入视频延长窗口：AI Flow 素材选择器没有返回可选素材' }),
    };
  }

  async function attachUploadedReferences(remoteAssetIds) {
    const ids = [...new Set((Array.isArray(remoteAssetIds) ? remoteAssetIds : [])
      .map(id => String(id || '').trim())
      .filter(id => /^\d{1,18}$/.test(id)))];
    if (!ids.length || !isAIFlowWorkspace()) return { attached: 0, attachedIds: [], missing: ids };
    const videoExtendResult = await attachUploadedVideoExtendReferences(ids);
    if (videoExtendResult) return videoExtendResult;
    const referenceMode = document.querySelector('.mode-tab[data-mode="reference"]');
    if (referenceMode instanceof HTMLElement && !referenceMode.classList.contains('active')) referenceMode.click();
    refreshAIFlowAssetLibrary();
    const deadline = Date.now() + 12 * 1000;
    const rootFallbackAt = Date.now() + 5 * 1000;
    let rootFallback = false;
    let missing = ids.slice();
    while (missing.length && Date.now() < deadline) {
      missing = ids.filter(id => !(AI_FLOW_DOM?.assetById?.(id) || document.querySelector(`#assetLibrary .asset-lib-item[data-asset-id="${id}"]`)));
      if (!missing.length) break;
      if (!rootFallback && Date.now() >= rootFallbackAt) {
        // Some AI Flow roles force uploaded files back to “我的素材”根目录.
        // Fall back once so the uploaded cards can still enter the top reference bar.
        openAIFlowAssetRoot();
        refreshAIFlowAssetLibrary();
        rootFallback = true;
      }
      await wait(260);
      if (Date.now() + 1800 >= deadline) refreshAIFlowAssetLibrary();
    }
    const attachedIds = [];
    for (const id of ids) {
      const card = AI_FLOW_DOM?.assetById?.(id) || document.querySelector(`#assetLibrary .asset-lib-item[data-asset-id="${id}"]`);
      if (!card) continue;
      card.click();
      attachedIds.push(id);
    }
    return { attached: attachedIds.length, attachedIds, missing: ids.filter(id => !attachedIds.includes(id)), rootFallback };
  }

  function requestReferenceUpload() {
    const toolbar = folderToolbar();
    const projectId = currentProjectId();
    if (!toolbar || !projectId || isSharedLibraryView() || Date.now() < bridgeRetryAfter) return;
    sendRuntimeMessage({
      action: REFERENCE_UPLOAD_ACTION,
      pageUrl: location.href,
      projectId,
      folderId: currentFolderId(),
      folderName: currentFolderName(),
    }, result => { updateBridgeConnectionState(result); }, error => { updateBridgeConnectionState(null, error); });
  }

  function currentFolderSnapshot() {
    const projectId = currentProjectId();
    const folder = currentFolderSelection();
    if (!projectId || !folder || isSharedLibraryView()) return null;
    return {
      projectId,
      folderId: folder.id,
      folderName: String(folder.name || '当前文件夹').trim().slice(0, 120) || '当前文件夹',
    };
  }

  function isCurrentFolderSnapshot(snapshot) {
    const current = currentFolderSnapshot();
    return Boolean(current
      && snapshot
      && current.projectId === snapshot.projectId
      && current.folderId === snapshot.folderId);
  }

  function removeFolderDiffPreview() {
    document.getElementById(FOLDER_DIFF_PANEL_ID)?.remove();
  }

  function ensureFolderDiffPreviewStyles() {
    if (document.getElementById(FOLDER_DIFF_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = FOLDER_DIFF_STYLE_ID;
    style.textContent = `
      #${FOLDER_DIFF_PANEL_ID} {
        display: grid !important; gap: 12px !important; margin: 10px 0 12px !important; padding: 14px !important;
        border: 1px solid var(--nest-theme-border, #2a2f38) !important; border-radius: 14px !important;
        background: var(--nest-theme-overlay, #1c1f26) !important;
        color: var(--nest-theme-text, #e8eaee) !important; box-shadow: 0 12px 30px rgba(0, 0, 0, .3) !important;
        font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-header { display: flex !important; align-items: flex-start !important; gap: 10px !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-title { margin: 0 !important; color: var(--nest-theme-text, #e8eaee) !important; font-size: 15px !important; font-weight: 700 !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-copy { margin: 2px 0 0 !important; color: var(--nest-theme-muted, #8b919c) !important; font-size: 12px !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-close { margin-left: auto !important; min-width: 30px !important; min-height: 30px !important; border: 1px solid var(--nest-theme-border, #2a2f38) !important; border-radius: 999px !important; background: var(--nest-theme-button, #1d2027) !important; color: var(--nest-theme-muted, #8b919c) !important; cursor: pointer !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-close:hover { border-color: var(--nest-theme-accent, #6f9bff) !important; color: var(--nest-theme-text, #e8eaee) !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-metrics { display: grid !important; grid-template-columns: repeat(5, minmax(100px, 1fr)) !important; gap: 8px !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-metric { min-width: 0 !important; padding: 9px 10px !important; border: 0 !important; border-radius: 10px !important; background: var(--nest-theme-field, #0b0d10) !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-metric strong { display: block !important; color: var(--nest-theme-text, #e8eaee) !important; font-size: 18px !important; line-height: 1.1 !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-metric span { display: block !important; margin-top: 3px !important; color: var(--nest-theme-muted, #8b919c) !important; font-size: 11px !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-section { padding-top: 10px !important; border-top: 1px solid var(--nest-theme-border, #2a2f38) !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-section h4 { margin: 0 0 6px !important; color: var(--nest-theme-text, #e8eaee) !important; font-size: 12px !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-section ul { display: grid !important; gap: 4px !important; margin: 0 !important; padding-left: 18px !important; color: var(--nest-theme-muted, #8b919c) !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-note { margin: 0 !important; color: var(--nest-theme-muted, #8b919c) !important; font-size: 12px !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-warning { padding: 9px 10px !important; border: 1px solid rgba(232, 170, 92, .35) !important; border-radius: 10px !important; background: rgba(232, 170, 92, .08) !important; color: #f0cf9f !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-actions { display: flex !important; align-items: center !important; gap: 8px !important; flex-wrap: wrap !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-actions button { min-height: 34px !important; padding: 7px 12px !important; border: 0 !important; border-radius: 999px !important; background: var(--nest-theme-primary, #3f6fe6) !important; color: var(--nest-theme-primary-text, #ffffff) !important; font: 700 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important; cursor: pointer !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-actions button:hover:not(:disabled) { background: color-mix(in srgb, var(--nest-theme-primary, #3f6fe6) 88%, #fff) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--nest-theme-primary, #3f6fe6) 22%, transparent) !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-actions button:disabled { cursor: not-allowed !important; opacity: .55 !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-status { color: var(--nest-theme-muted, #8b919c) !important; font-size: 12px !important; }
      @media (max-width: 920px) { #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-metrics { grid-template-columns: repeat(2, minmax(110px, 1fr)) !important; } }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function diffNumber(diff, key) {
    return Math.max(0, Number(diff?.summary?.[key]) || 0);
  }

  function kindLabel(kind) {
    return kind === 'image' ? '图片' : kind === 'video' ? '视频' : kind === 'audio' ? '音频' : '素材';
  }

  function safeDiffText(value, fallback = '') {
    const text = String(value ?? '')
      .normalize('NFKC')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\b(?:https?|file):\/\/[^\s]+/gi, '[链接已隐藏]')
      .replace(/[a-z]:[\\/][^\s]*/gi, '[路径已隐藏]')
      .replace(/\\\\[^\s]*/g, '[路径已隐藏]')
      .replace(/(^|[\s(=,:;])\/(?:users|home|var|tmp|private|mnt|volumes)\/[^\s]*/gi, '$1[路径已隐藏]')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220);
    return text || fallback;
  }

  function displayDiffAsset(asset) {
    const name = safeDiffText(asset?.name, '未命名素材');
    const size = Math.max(0, Number(asset?.size) || 0);
    return `${name} · ${kindLabel(String(asset?.kind || ''))}${size ? ` · ${Math.round(size / 1024)} KB` : ''}`;
  }

  function appendDiffSection(panel, title, items, format) {
    if (!Array.isArray(items) || !items.length) return;
    const section = document.createElement('section');
    section.className = 'nest-aiflow-diff-section';
    const heading = document.createElement('h4');
    heading.textContent = title;
    const list = document.createElement('ul');
    for (const item of items) {
      const row = document.createElement('li');
      row.textContent = format(item);
      list.appendChild(row);
    }
    section.append(heading, list);
    panel.appendChild(section);
  }

  function requestCurrentFolderSync(snapshot, callback) {
    if (!isCurrentFolderSnapshot(snapshot)) {
      callback({ ok: false, error: '文件夹已切换，请重新执行同步前检查' });
      return;
    }
    sendRuntimeMessage({
      action: FOLDER_SYNC_ACTION,
      pageUrl: location.href,
      projectId: snapshot.projectId,
      folderId: snapshot.folderId,
      folderName: snapshot.folderName,
      sharedLibrary: false,
    }, result => {
      if (!isCurrentFolderSnapshot(snapshot)) {
        callback({ ok: false, error: '文件夹已切换，未继续同步' });
        return;
      }
      callback(result || { ok: false, error: '同步未收到响应' });
    }, error => callback({ ok: false, error: String(error?.message || error || '扩展通信失败') }));
  }

  function renderFolderDiffPreview(snapshot, diff) {
    removeFolderDiffPreview();
    ensureFolderDiffPreviewStyles();
    const anchor = folderToolbar();
    if (!anchor || !isCurrentFolderSnapshot(snapshot)) return;
    const panel = document.createElement('section');
    panel.id = FOLDER_DIFF_PANEL_ID;
    panel.dataset.projectId = snapshot.projectId;
    panel.dataset.folderId = snapshot.folderId;
    const header = document.createElement('div');
    header.className = 'nest-aiflow-diff-header';
    const copy = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'nest-aiflow-diff-title';
    title.textContent = `同步前检查 · ${safeDiffText(diff?.folder?.name || snapshot.folderName, snapshot.folderName)}`;
    const intro = document.createElement('p');
    intro.className = 'nest-aiflow-diff-copy';
    intro.textContent = '仅比较当前文件夹；此预览不会上传、下载或删除素材。';
    copy.append(title, intro);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'nest-aiflow-diff-close';
    close.textContent = '×';
    close.title = '关闭同步前检查';
    close.addEventListener('click', removeFolderDiffPreview);
    header.append(copy, close);
    panel.appendChild(header);

    const metrics = document.createElement('div');
    metrics.className = 'nest-aiflow-diff-metrics';
    for (const [key, label] of [
      ['linked', '已关联'], ['localNew', '本地新增'], ['possibleDuplicates', '可能重复'], ['remoteOnly', '仅远端'], ['mappingIssues', '映射异常'],
    ]) {
      const metric = document.createElement('div');
      metric.className = 'nest-aiflow-diff-metric';
      const value = document.createElement('strong');
      value.textContent = String(diffNumber(diff, key));
      const name = document.createElement('span');
      name.textContent = label;
      metric.append(value, name);
      metrics.appendChild(metric);
    }
    panel.appendChild(metrics);
    appendDiffSection(panel, '本地新增', diff?.localNew, displayDiffAsset);
    appendDiffSection(panel, '可能重复（不会自动合并）', diff?.possibleDuplicates, item => `${displayDiffAsset(item?.local)} ⇄ ${displayDiffAsset(item?.remote)}（${safeDiffText(item?.reason, '需人工确认')}）`);
    appendDiffSection(panel, '仅远端（不会自动下载）', diff?.remoteOnly, displayDiffAsset);
    appendDiffSection(panel, '映射异常', diff?.mappingIssues, item => `${safeDiffText(item?.name, '当前文件夹')}：${safeDiffText(item?.message, '需要重新确认对应关系')}`);
    if (diff?.truncated) {
      const note = document.createElement('p');
      note.className = 'nest-aiflow-diff-note';
      note.textContent = '列表仅展示前 30 项，其余项目仍已计入上方数量。';
      panel.appendChild(note);
    }

    const actions = document.createElement('div');
    actions.className = 'nest-aiflow-diff-actions';
    const sync = document.createElement('button');
    sync.type = 'button';
    const hasIssues = diffNumber(diff, 'mappingIssues') > 0;
    sync.textContent = hasIssues ? '先处理映射异常' : '确认同步当前文件夹';
    sync.disabled = hasIssues;
    const status = document.createElement('span');
    status.className = 'nest-aiflow-diff-status';
    status.textContent = hasIssues ? '请先执行“同步目录和素材”修复目录对应，再重新检查。' : '确认后才会开始复制当前文件夹素材。';
    sync.addEventListener('click', () => {
      if (sync.disabled) return;
      sync.disabled = true;
      sync.textContent = '同步中…';
      status.textContent = '正在同步当前文件夹，请保持在此 AI Flow 页面。';
      requestCurrentFolderSync(snapshot, result => {
        if (!panel.isConnected) return;
        const errors = Array.isArray(result?.errors) ? result.errors : [];
        const changed = Number(result?.imported || 0) + Number(result?.duplicates || 0);
        if (!result?.ok) {
          status.textContent = safeDiffText(result?.error || errors[0], '当前文件夹同步失败');
          sync.textContent = '重新同步当前文件夹';
          sync.disabled = false;
        } else if (result.empty) {
          status.textContent = '当前文件夹暂无可同步素材。';
          sync.textContent = '同步完成';
        } else if (errors.length) {
          status.textContent = `已处理 ${changed} 项，仍有 ${errors.length} 项未完成：${safeDiffText(errors[0], '部分素材同步失败')}`;
          sync.textContent = '重新同步当前文件夹';
          sync.disabled = false;
        } else {
          status.textContent = `同步完成：复制 ${Number(result.imported || 0)} 项，跳过 ${Number(result.duplicates || 0)} 项重复。`;
          sync.textContent = '同步完成';
        }
      });
    });
    actions.append(sync, status);
    panel.appendChild(actions);
    anchor.insertAdjacentElement('afterend', panel);
  }

  function injectFolderSyncButton() {
    const toolbar = folderToolbar();
    const snapshot = currentFolderSnapshot();
    const existingPanel = document.getElementById(FOLDER_DIFF_PANEL_ID);
    if (!snapshot) {
      toolbar?.querySelector(`#${FOLDER_SYNC_BUTTON_ID}`)?.remove();
      existingPanel?.remove();
      return;
    }
    if (existingPanel && (existingPanel.dataset.projectId !== snapshot.projectId || existingPanel.dataset.folderId !== snapshot.folderId)) existingPanel.remove();
    if (!toolbar || toolbar.querySelector(`#${FOLDER_SYNC_BUTTON_ID}`)) return;
    const button = document.createElement('button');
    button.id = FOLDER_SYNC_BUTTON_ID;
    button.type = 'button';
    button.className = 'als-fb-btn';
    button.title = '先检查当前 AI Flow 文件夹与小旺仔目录的差异；确认后才会同步，不会自动上传、下载或删除';
    button.innerHTML = '<span aria-hidden="true">⌕</span><span>同步前检查</span>';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const selected = currentFolderSnapshot();
      const originalLabel = button.innerHTML;
      const finish = (label, duration = 2400, title = '') => {
        button.disabled = false;
        button.innerHTML = `<span aria-hidden="true">${label === '已生成预览' ? '✓' : '×'}</span><span>${label}</span>`;
        button.title = title || button.title;
        setTimeout(() => {
          if (button.isConnected) {
            button.innerHTML = originalLabel;
            button.title = '先检查当前 AI Flow 文件夹与小旺仔目录的差异；确认后才会同步，不会自动上传、下载或删除';
          }
        }, duration);
      };
      if (!selected) {
        finish('检查失败', 2800, '请在“我的素材”的有效文件夹中重试');
        return;
      }
      button.disabled = true;
      button.textContent = '检查中…';
      sendRuntimeMessage({
        action: FOLDER_DIFF_ACTION,
        pageUrl: location.href,
        projectId: selected.projectId,
        folderId: selected.folderId,
        folderName: selected.folderName,
        sharedLibrary: false,
      }, result => {
        if (!isCurrentFolderSnapshot(selected)) {
          if (button.isConnected) {
            button.disabled = false;
            button.innerHTML = originalLabel;
          }
          return;
        }
        if (!result?.ok) {
          finish('检查失败', 3000, safeDiffText(result?.error, '读取同步前差异失败'));
          return;
        }
        renderFolderDiffPreview(selected, result);
        finish('已生成预览', 1500);
      }, error => finish('检查失败', 3000, safeDiffText(error?.message || error, '扩展通信失败')));
    });
    const viewToggle = toolbar.querySelector('.als-view-toggle');
    toolbar.insertBefore(button, viewToggle || null);
  }

  function injectFolderStructureLinkButton() {
    const toolbar = folderToolbar();
    if (!toolbar || !currentProjectId() || isSharedLibraryView() || toolbar.querySelector('[data-nest-folder-link-only]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.nestFolderLinkOnly = 'true';
    button.className = 'als-fb-btn';
    button.title = '仅在小旺仔选定目录中建立 AI Flow 文件夹对应；不下载、不上传、不复制素材';
    button.innerHTML = '<span aria-hidden="true">⇄</span><span>建立目录对应</span>';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const projectId = currentProjectId();
      const originalLabel = button.innerHTML;
      if (!projectId) return;
      button.disabled = true;
      button.textContent = '建立中…';
      sendRuntimeMessage({ action: FOLDER_STRUCTURE_ONLY_ACTION, pageUrl: location.href, projectId }, result => {
        button.disabled = false;
        button.innerHTML = result?.ok ? '<span aria-hidden="true">✓</span><span>对应已建立</span>' : '<span aria-hidden="true">×</span><span>建立失败</span>';
        button.title = result?.ok ? '目录对应已建立；现在可使用“同步前检查”。未复制任何素材。' : safeDiffText(result?.error, '建立目录对应失败');
        setTimeout(() => { if (button.isConnected) { button.innerHTML = originalLabel; button.title = '仅在小旺仔选定目录中建立 AI Flow 文件夹对应；不下载、不上传、不复制素材'; } }, 2800);
      }, error => {
        button.disabled = false;
        button.innerHTML = '<span aria-hidden="true">×</span><span>建立失败</span>';
        button.title = safeDiffText(error?.message || error, '建立目录对应失败');
        setTimeout(() => { if (button.isConnected) { button.innerHTML = originalLabel; button.title = '仅在小旺仔选定目录中建立 AI Flow 文件夹对应；不下载、不上传、不复制素材'; } }, 2800);
      });
    });
    const currentFolderButton = toolbar.querySelector(`#${FOLDER_SYNC_BUTTON_ID}`);
    toolbar.insertBefore(button, currentFolderButton || toolbar.firstChild);
  }

  function injectFolderStructureSyncButton() {
    const toolbar = folderToolbar();
    if (!toolbar || !currentProjectId() || isSharedLibraryView() || toolbar.querySelector(`#${FOLDER_STRUCTURE_SYNC_BUTTON_ID}`)) return;
    const button = document.createElement('button');
    button.id = FOLDER_STRUCTURE_SYNC_BUTTON_ID;
    button.type = 'button';
    button.className = 'als-fb-btn';
    button.title = '将 AI Flow“我的素材”的私有目录及其中素材同步到小旺仔选定文件夹中；根目录未归档素材不会同步';
    button.innerHTML = '<span aria-hidden="true">▤</span><span>同步目录和素材</span>';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (!window.confirm('将同步 AI Flow“我的素材”的私有目录及其中图片、视频、音频到小旺仔；根目录未归档素材不会同步。已有同内容素材会跳过，不会删除或移动任一端素材。数量较多时需要等待。是否继续？')) return;
      const selectedProjectId = currentProjectId();
      const originalLabel = button.innerHTML;
      if (!selectedProjectId || isSharedLibraryView()) {
        button.innerHTML = '<span aria-hidden="true">×</span><span>同步失败</span>';
        setTimeout(() => {
          if (button.isConnected) button.innerHTML = originalLabel;
        }, 2400);
        return;
      }
      button.disabled = true;
      button.textContent = '同步中…';
      sendRuntimeMessage({
        action: FOLDER_STRUCTURE_SYNC_ACTION,
        pageUrl: location.href,
        projectId: selectedProjectId,
      }, result => {
        button.disabled = false;
        button.innerHTML = result?.ok ? '<span aria-hidden="true">✓</span><span>已同步</span>' : '<span aria-hidden="true">×</span><span>同步失败</span>';
        setTimeout(() => {
          if (button.isConnected) button.innerHTML = originalLabel;
        }, 1600);
      }, () => {
        button.disabled = false;
        button.innerHTML = '<span aria-hidden="true">×</span><span>同步失败</span>';
        setTimeout(() => {
          if (button.isConnected) button.innerHTML = originalLabel;
        }, 2400);
      });
    });
    const viewToggle = toolbar.querySelector('.als-view-toggle');
    toolbar.insertBefore(button, viewToggle || null);
  }

  function publishBridgeConnectionState(connection) {
    document.documentElement.dataset.nestBridgeState = connection.state;
    window.dispatchEvent(new CustomEvent('nest:bridge-connection-state', { detail: connection }));
  }

  function scheduleBridgeRecoveryProbe() {
    if (bridgeHealthTimer) return;
    bridgeHealthTimer = window.setTimeout(() => {
      bridgeHealthTimer = null;
      sendRuntimeMessage({ action: BRIDGE_RECOVERY_PROBE_ACTION }, result => {
        const connection = globalThis.NestConnectionState.classifyConnection(result?.connection
          || (result?.ok ? { state: 'connected' } : { error: result?.error || '扩展桥接暂不可用' }));
        publishBridgeConnectionState(connection);
        if (connection.state === 'connected') {
          bridgeFailureCount = 0;
          bridgeRetryAfter = 0;
          requestLiveSync();
          return;
        }
        scheduleBridgeRecoveryProbe();
      }, () => scheduleBridgeRecoveryProbe());
    }, BRIDGE_RECOVERY_PROBE_MS);
  }

  function updateBridgeConnectionState(result, error = null) {
    const connection = globalThis.NestConnectionState.classifyConnection(result?.connection
      || (result?.ok ? { state: 'connected' } : { error: error || result?.error || '扩展桥接暂不可用' }));
    publishBridgeConnectionState(connection);
    if (connection.state === 'connected') {
      bridgeFailureCount = 0;
      bridgeRetryAfter = 0;
      if (bridgeHealthTimer) window.clearTimeout(bridgeHealthTimer);
      bridgeHealthTimer = null;
      return true;
    }
    bridgeFailureCount += 1;
    bridgeRetryAfter = Date.now() + globalThis.NestConnectionState.retryDelayForFailure(bridgeFailureCount);
    scheduleBridgeRecoveryProbe();
    return false;
  }

  // 页面在后台时降频到 LIVE_SYNC_HIDDEN_INTERVAL_MS，生成完成照样会同步进素材库，只是不再每 3 秒查一次。
  const LIVE_SYNC_HIDDEN_INTERVAL_MS = 15 * 1000;
  let lastLiveSyncAt = 0;
  function requestLiveSync() {
    if (Date.now() < bridgeRetryAfter) return;
    if (document.hidden && Date.now() - lastLiveSyncAt < LIVE_SYNC_HIDDEN_INTERVAL_MS) return;
    lastLiveSyncAt = Date.now();
    const toolbar = folderToolbar();
    const projectId = currentProjectId();
    if (!toolbar || !projectId || isSharedLibraryView()) return;
    sendRuntimeMessage({
      action: LIVE_SYNC_ACTION,
      pageUrl: location.href,
      projectId,
    }, result => {
      if (updateBridgeConnectionState(result)) requestReferenceUpload();
    }, error => { updateBridgeConnectionState(null, error); });
  }

  function ensureLiveSyncTimer() {
    if (liveSyncTimer) return;
    liveSyncTimer = setInterval(requestLiveSync, LIVE_SYNC_INTERVAL_MS);
    setTimeout(requestLiveSync, 500);
  }

  function retryBridgeWhenPageReturns() {
    if (document.hidden || !bridgeRetryAfter) return;
    bridgeRetryAfter = 0;
    requestLiveSync();
  }

  window.addEventListener('focus', retryBridgeWhenPageReturns);
  window.addEventListener('blur', () => {
    if (bridgeRetryAfter) window.setTimeout(retryBridgeWhenPageReturns, 500);
  });
  document.addEventListener('visibilitychange', retryBridgeWhenPageReturns);

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    // Clicks inside our floating UI do not change AI Flow's native extend window.
    // In particular, don't queue whole-page scans for repeated clicks on blank
    // space in the workbench or its material library.
    if (target.closest('[id^="nest-aiflow-"]')) return;
    const card = AI_FLOW_DOM?.taskFromTarget?.(event.target)
      || target.closest('.task-card[data-taskid]');
    const taskId = String(AI_FLOW_DOM?.taskId?.(card) || card?.dataset?.taskid || '').trim();
    if (taskId) lastVideoExtendTaskId = taskId;
    const actionButton = target.closest('button, [role="button"]');
    const actionText = String(actionButton?.textContent || actionButton?.getAttribute('title') || '').replace(/\s+/g, '');
    const extendAction = /^(重制|延长)$/.test(actionText);
    const nativeDialog = target.closest('[role="dialog"], [aria-modal="true"], [class*="modal"], [class*="dialog"]');
    // Blank page clicks cannot open or close the native dialog. Only inspect
    // after a task-card click, an extend/rebuild action, or dialog interaction.
    if (!taskId && !extendAction && !nativeDialog) return;
    // AI Flow can reuse a hidden dialog after a click changes only its style.
    setTimeout(injectVideoExtendWorkbench, 80);
    setTimeout(injectVideoExtendWorkbench, 400);
    // 延长出来的视频点「重制」也会打开 AI Flow 的延长窗口，但它要先读任务参数，窗口来得晚；
    // 点「重制」「延长」后多查到 2 秒，保证弹出的是小旺仔延长工作台
    if (extendAction) for (const delay of [800, 1300, 2000]) setTimeout(injectVideoExtendWorkbench, delay);
  }, true);

  document.addEventListener('contextmenu', event => {
    const card = AI_FLOW_DOM?.taskFromTarget?.(event.target)
      || (event.target instanceof Element ? event.target.closest('.task-card[data-taskid]') : null);
    pendingTaskId = String(AI_FLOW_DOM?.taskId?.(card) || card?.dataset?.taskid || '').trim();
    if (!pendingTaskId) return;
    setTimeout(injectButton, 0);
    setTimeout(injectButton, 40);
  }, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action === CONTROL_CONTEXT_ACTION) {
      sendResponse(controlContext());
      return undefined;
    }
    if (message?.action === CONTROL_SYNC_NOW_ACTION) {
      const context = controlContext();
      if (!context.ok) {
        sendResponse({ ok: false, error: context.error });
        return undefined;
      }
      sendRuntimeMessage({
        action: LIVE_SYNC_ACTION,
        pageUrl: context.pageUrl,
        projectId: context.projectId,
        source: 'control-center',
        forceRetry: message?.forceRetry === true,
      }, result => sendResponse(result || { ok: false, error: '同步控制台未收到响应' }), error => sendResponse({ ok: false, error: String(error?.message || error) }));
      return true;
    }
    if (message?.action !== REFERENCE_ATTACH_ACTION) return undefined;
    attachUploadedReferences(message.remoteAssetIds).then(
      result => sendResponse({ ok: true, ...result }),
      error => sendResponse({ ok: false, attached: 0, attachedIds: [], missing: Array.isArray(message.remoteAssetIds) ? message.remoteAssetIds : [], error: String(error?.message || error) }),
    );
    return true;
  });

  let pageScanTimer = 0;
  let lastPageScanAt = 0;
  function runPageScan() {
    pageScanTimer = 0;
    lastPageScanAt = Date.now();
    injectButton();
    injectFolderSyncButton();
    injectFolderStructureLinkButton();
    injectFolderStructureSyncButton();
    injectPromptReferenceHighlights();
    injectAssetTagsSidebar();
    injectVideoExtendLibraryPanel();
    injectVideoExtendAutoMatchButton();
    injectVideoExtendWorkbench();
    injectAIFlowThemeSwitcher();
    injectAIFlowFocusLayoutToggle();
    scheduleWorksCanvasSync();
    document.getElementById(LEGACY_UPLOAD_BUTTON_ID)?.remove();
    ensureLiveSyncTimer();
  }
  function schedulePageScan() {
    if (pageScanTimer) return;
    const wait = Math.max(0, PAGE_SCAN_MIN_INTERVAL_MS - (Date.now() - lastPageScanAt));
    pageScanTimer = window.setTimeout(() => requestAnimationFrame(runPageScan), wait);
  }

  pageMutationObserver = new MutationObserver(records => {
    if (records.every(isNestOnlyMutation)) return;
    schedulePageScan();
  });
  pageMutationObserver.observe(document.documentElement, PAGE_OBSERVER_OPTIONS);
  injectFolderSyncButton();
  injectFolderStructureLinkButton();
  injectFolderStructureSyncButton();
      injectPromptReferenceHighlights();
      injectAssetTagsSidebar();
      injectVideoExtendLibraryPanel();
      injectVideoExtendAutoMatchButton();
      injectVideoExtendWorkbench();
      injectAIFlowThemeSwitcher();
      injectAIFlowFocusLayoutToggle();
      scheduleWorksCanvasSync();
  document.getElementById(LEGACY_UPLOAD_BUTTON_ID)?.remove();
  ensureLiveSyncTimer();
})();

















