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
  const FOCUS_LAYOUT_STYLE_ID = 'nest-aiflow-focus-layout-style';
  const FOCUS_LAYOUT_TOGGLE_ID = 'nest-aiflow-focus-layout-toggle';
  const FOCUS_LAYOUT_CLASS = 'nest-aiflow-focus-layout';
  const FOCUS_LAYOUT_STORAGE_KEY = 'nest-aiflow-focus-layout-enabled';
  // A long-poll wake-up makes imports immediate; this remains the recovery poll.
  const LIVE_SYNC_INTERVAL_MS = 3 * 1000;
  let pendingTaskId = '';
  // 最近一次点过的 AI Flow 任务卡片：延长弹窗里的视频接不上时，用这张卡片的视频文件做预览
  let lastVideoExtendTaskId = '';
  let liveSyncTimer = null;
  let referenceUploadOfflineUntil = 0;
  let contextRecoveryScheduled = false;
  let pageMutationObserver = null;
  const promptHighlighters = new WeakMap();
  const videoExtendReferenceSessions = new Map();
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
      .${PROMPT_HIGHLIGHT_CLASS}::selection { background: rgba(88, 147, 255, .42) !important; }
      .${PROMPT_HIGHLIGHT_LAYER_CLASS} .nest-aiflow-reference-token {
        border-radius: 3px !important; font: inherit !important; font-weight: inherit !important;
        font-style: inherit !important; font-stretch: inherit !important; font-kerning: inherit !important;
        font-variant: inherit !important; font-feature-settings: inherit !important; font-variation-settings: inherit !important;
        letter-spacing: inherit !important; word-spacing: inherit !important; text-transform: inherit !important;
        text-decoration: underline !important;
        text-decoration-thickness: 1px !important; text-underline-offset: 2px !important;
        box-shadow: inset 0 -1px 0 currentColor !important;
      }
      .${PROMPT_HIGHLIGHT_LAYER_CLASS} .nest-aiflow-reference-image { color: #65d8ff !important; background: rgba(47, 161, 220, .20) !important; }
      .${PROMPT_HIGHLIGHT_LAYER_CLASS} .nest-aiflow-reference-video { color: #c39bff !important; background: rgba(133, 86, 232, .22) !important; }
      .${PROMPT_HIGHLIGHT_LAYER_CLASS} .nest-aiflow-reference-audio { color: #7cf0bc !important; background: rgba(39, 179, 126, .20) !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function isAIFlowWorkspace() {
    return Boolean(AI_FLOW_DOM?.workspace?.() || document.querySelector('#assetLibrary, .gen-current-project, .task-card[data-taskid]'));
  }

  function promptEditorText(editor) {
    return editor instanceof HTMLTextAreaElement ? editor.value : editor.textContent || '';
  }

  function isVideoExtendPrompt(editor) {
    // AI Flow has changed the modal class names more than once. The two visible
    // labels are stable, so walk upward from the editor instead of relying on a
    // particular dialog class.
    let container = editor.parentElement;
    while (container && container !== document.body) {
      const text = String(container.textContent || '');
      if (text.includes('延长秒数') && text.includes('提交延长')) return true;
      container = container.parentElement;
    }
    return false;
  }

  function videoExtendContainer(editor) {
    let container = editor.parentElement;
    while (container && container !== document.body) {
      const text = String(container.textContent || '');
      if (text.includes('延长秒数') && text.includes('提交延长')) return container;
      container = container.parentElement;
    }
    return null;
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
    const editor = [...document.querySelectorAll('textarea')].find(isVideoExtendPrompt);
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
        --nx-bg: var(--nest-theme-overlay, #141a23);
        --nx-raise: var(--nest-theme-surface, #1c2430);
        --nx-field: var(--nest-theme-field, #0e131a);
        --nx-line: color-mix(in srgb, var(--nest-theme-border, #2d3a4c) 75%, transparent);
        --nx-text: var(--nest-theme-text, #e6edf7);
        --nx-muted: var(--nest-theme-muted, #8f9cb0);
        --nx-accent: var(--nest-theme-accent, #2f7dff);
        --nx-primary: var(--nest-theme-primary, var(--nx-accent));
        --nx-on-primary: var(--nest-theme-primary-text, #ffffff);
        --nx-soft: color-mix(in srgb, var(--nx-text) 7%, transparent);
        --nx-soft-hover: color-mix(in srgb, var(--nx-text) 13%, transparent);
        --nx-tint: color-mix(in srgb, var(--nx-accent) 16%, transparent);
        --nx-danger: #ff6b6b;
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
      :is(${W}, ${L}) .nx-mark { flex: none !important; display: grid !important; place-items: center !important; width: 34px !important; height: 34px !important; border-radius: 12px !important; background: linear-gradient(135deg, color-mix(in srgb, var(--nx-primary) 70%, #fff), var(--nx-primary)) !important; color: var(--nx-on-primary) !important; font-size: 13px !important; font-weight: 800 !important; }
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
      :is(${W}, ${L}, ${P}) .nx-go { background: linear-gradient(135deg, color-mix(in srgb, var(--nx-primary) 78%, #fff), var(--nx-primary)) !important; color: var(--nx-on-primary) !important; box-shadow: 0 10px 24px color-mix(in srgb, var(--nx-primary) 32%, transparent) !important; }
      :is(${W}, ${L}, ${P}) .nx-go:hover:not(:disabled) { background: var(--nx-primary) !important; color: var(--nx-on-primary) !important; transform: translateY(-1px) !important; }
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
    const editor = [...document.querySelectorAll('textarea')].find(isVideoExtendPrompt);
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
    const editor = [...document.querySelectorAll('textarea')].find(isVideoExtendPrompt);
    const dialog = editor && videoExtendContainer(editor);
    const existing = document.getElementById(VIDEO_EXTEND_WORKBENCH_ID);
    if (!editor || !dialog) {
      existing?.remove();
      document.getElementById(VIDEO_EXTEND_WORKBENCH_RETURN_ID)?.remove();
      document.querySelector('.nest-aiflow-video-extend-native-hidden')?.classList.remove('nest-aiflow-video-extend-native-hidden');
      return;
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
      pageMutationObserver?.disconnect();
      if (liveSyncTimer) { clearInterval(liveSyncTimer); liveSyncTimer = null; }
      document.getElementById(VIDEO_EXTEND_LIBRARY_PANEL_ID)?.remove();
      promptHighlighters.get(editor)?.dispose();
      editor.classList.remove(PROMPT_HIGHLIGHT_CLASS);
      dialog.classList.remove('nest-aiflow-video-extend-native-hidden');
      workbench.remove();
      nativeSubmit.click();
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
      workbench.style.display = 'none';
      document.getElementById(VIDEO_EXTEND_WORKBENCH_RETURN_ID)?.remove();
      const back = document.createElement('button');
      back.id = VIDEO_EXTEND_WORKBENCH_RETURN_ID;
      back.type = 'button'; back.textContent = '返回小旺仔工作台';
      back.title = '切回小旺仔自定义视频延长窗口';
      back.addEventListener('click', () => {
        delete dialog.dataset.nestWorkbenchDisabled;
        dialog.classList.add('nest-aiflow-video-extend-native-hidden');
        workbench.style.display = '';
        pageMutationObserver?.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
        ensureLiveSyncTimer();
        back.remove();
      });
      document.body.appendChild(back);
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
    const editor = [...document.querySelectorAll('textarea')].find(isVideoExtendPrompt);
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
      body[data-nest-aiflow-theme] { --nest-theme-bg:#07101d; --nest-theme-sidebar:#091729; --nest-theme-surface:#122238; --nest-theme-field:#07101d; --nest-theme-overlay:#102239; --nest-theme-border:#29435f; --nest-theme-text:#dce7f7; --nest-theme-muted:#8298b3; --nest-theme-accent:#2f7dff; --nest-theme-button:#122238; --nest-theme-button-hover:#142b47; --nest-theme-selected:#17365a; --nest-theme-primary:#2f7dff; --nest-theme-primary-text:#ffffff; }
      body[data-nest-aiflow-theme="polar-purple"] { --nest-theme-bg:#0d0b18; --nest-theme-sidebar:#131023; --nest-theme-surface:#1b1730; --nest-theme-field:#0d0b18; --nest-theme-overlay:#211b38; --nest-theme-border:#40375c; --nest-theme-text:#eeeaff; --nest-theme-muted:#a099bb; --nest-theme-accent:#8b6cff; --nest-theme-button:#1b1730; --nest-theme-button-hover:#292145; --nest-theme-selected:#352963; --nest-theme-primary:#8b6cff; --nest-theme-primary-text:#ffffff; }
      body[data-nest-aiflow-theme="emerald"] { --nest-theme-bg:#071512; --nest-theme-sidebar:#0a1d19; --nest-theme-surface:#102923; --nest-theme-field:#071512; --nest-theme-overlay:#14322b; --nest-theme-border:#285548; --nest-theme-text:#e0f7f0; --nest-theme-muted:#86aa9f; --nest-theme-accent:#26c99a; --nest-theme-button:#102923; --nest-theme-button-hover:#173a31; --nest-theme-selected:#1a4c3f; --nest-theme-primary:#26c99a; --nest-theme-primary-text:#09111c; }
      body[data-nest-aiflow-theme="graphite"] { --nest-theme-bg:#111315; --nest-theme-sidebar:#171a1e; --nest-theme-surface:#20242a; --nest-theme-field:#111315; --nest-theme-overlay:#252a31; --nest-theme-border:#3b424b; --nest-theme-text:#edf1f5; --nest-theme-muted:#949da8; --nest-theme-accent:#8ea4be; --nest-theme-button:#20242a; --nest-theme-button-hover:#2a3037; --nest-theme-selected:#35404c; --nest-theme-primary:#8ea4be; --nest-theme-primary-text:#09111c; }
      body[data-nest-aiflow-theme="twilight-orange"] { --nest-theme-bg:#15100d; --nest-theme-sidebar:#1d1511; --nest-theme-surface:#2a1d17; --nest-theme-field:#15100d; --nest-theme-overlay:#34231b; --nest-theme-border:#5b3b2d; --nest-theme-text:#fff0e8; --nest-theme-muted:#b9a092; --nest-theme-accent:#ff8a45; --nest-theme-button:#2a1d17; --nest-theme-button-hover:#3a261d; --nest-theme-selected:#55311f; --nest-theme-primary:#ff8a45; --nest-theme-primary-text:#09111c; }
      body[data-nest-aiflow-theme="sakura"] { --nest-theme-bg:#160d14; --nest-theme-sidebar:#20121d; --nest-theme-surface:#2c1928; --nest-theme-field:#160d14; --nest-theme-overlay:#362031; --nest-theme-border:#5c3850; --nest-theme-text:#fff0f7; --nest-theme-muted:#b99aaa; --nest-theme-accent:#f47cab; --nest-theme-button:#2c1928; --nest-theme-button-hover:#3d2337; --nest-theme-selected:#592a47; --nest-theme-primary:#f47cab; --nest-theme-primary-text:#09111c; }
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
      body[data-nest-aiflow-theme] :is([class*="Create"], [class*="create"], [class*="Generate"], [class*="generate"], [class*="Submit"], [class*="submit"]) button, body[data-nest-aiflow-theme] button:has(:is(svg, span)):is([class*="primary"], [class*="submit"], [class*="generate"]) { background:linear-gradient(135deg,color-mix(in srgb,var(--nest-theme-primary) 90%,#fff),var(--nest-theme-primary)) !important; border-color:var(--nest-theme-primary) !important; color:var(--nest-theme-primary-text) !important; }
      body[data-nest-aiflow-theme] :is([style*="rgb(168"], [style*="#a855"], [style*="#9333"], [style*="purple"], [style*="violet"], [style*="rgba(168"], [style*="rgba(147"]) { background-color:var(--nest-theme-selected) !important; border-color:var(--nest-theme-accent) !important; color:var(--nest-theme-text) !important; }
      #${AIFLOW_THEME_SWITCHER_ID} { position:fixed;right:18px;bottom:62px;z-index:2147483647;font:600 12px/1.1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
      #${AIFLOW_THEME_SWITCHER_ID} button { border:1px solid var(--nest-theme-border,#29435f);border-radius:8px;background:var(--nest-theme-button,#122238);color:var(--nest-theme-text,#dce7f7);padding:8px 10px;cursor:pointer;box-shadow:0 5px 18px #0007; }
      #${AIFLOW_THEME_SWITCHER_ID} [data-nest-theme-options] { display:none;position:absolute;right:0;bottom:42px;width:126px;padding:6px;border:1px solid var(--nest-theme-border,#29435f);border-radius:8px;background:var(--nest-theme-overlay,#102239);box-shadow:0 10px 26px #000a; }
      #${AIFLOW_THEME_SWITCHER_ID}[data-open="true"] [data-nest-theme-options] { display:grid;gap:4px; }
      #${AIFLOW_THEME_SWITCHER_ID} [data-nest-theme-options] button { width:100%;text-align:left;padding:7px 8px;background:var(--nest-theme-surface,#122238);color:var(--nest-theme-text,#dce7f7); }
      #${AIFLOW_THEME_SWITCHER_ID} [data-nest-theme-options] button[data-active="true"] { background:var(--nest-theme-primary,#2f7dff) !important;color:var(--nest-theme-primary-text,#fff) !important;border-color:var(--nest-theme-primary,#2f7dff) !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function injectAIFlowThemeSwitcher() {
    ensureAIFlowThemeStyle();
    let theme = 'deep-blue';
    try { theme = localStorage.getItem(AIFLOW_THEME_KEY) || 'deep-blue'; } catch {}
    if (!['deep-blue', 'polar-purple', 'emerald', 'graphite', 'twilight-orange', 'sakura'].includes(theme)) theme = 'deep-blue';
    document.body.dataset.nestAiflowTheme = theme;
    const existing = document.getElementById(AIFLOW_THEME_SWITCHER_ID);
    if (existing) {
      existing.querySelectorAll('[data-nest-theme]').forEach(button => { button.dataset.active = button.getAttribute('data-nest-theme') === theme ? 'true' : 'false'; });
      return;
    }
    const switcher = document.createElement('div');
    switcher.id = AIFLOW_THEME_SWITCHER_ID;
    switcher.innerHTML = '<button type="button" data-nest-theme-toggle>页面配色</button><div data-nest-theme-options><button type="button" data-nest-theme="deep-blue">深海蓝</button><button type="button" data-nest-theme="polar-purple">极夜紫</button><button type="button" data-nest-theme="emerald">翡翠青</button><button type="button" data-nest-theme="graphite">石墨灰</button><button type="button" data-nest-theme="twilight-orange">暮光橙</button><button type="button" data-nest-theme="sakura">樱粉</button></div>';
    const syncActiveTheme = value => switcher.querySelectorAll('[data-nest-theme]').forEach(button => { button.dataset.active = button.getAttribute('data-nest-theme') === value ? 'true' : 'false'; });
    syncActiveTheme(theme);
    switcher.querySelector('[data-nest-theme-toggle]')?.addEventListener('click', () => { switcher.dataset.open = switcher.dataset.open === 'true' ? 'false' : 'true'; });
    switcher.querySelectorAll('[data-nest-theme]').forEach(button => button.addEventListener('click', () => {
      const value = button.getAttribute('data-nest-theme') || 'deep-blue';
      document.body.dataset.nestAiflowTheme = value;
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
      body.${FOCUS_LAYOUT_CLASS} { --sidebar-w: 240px !important; --project-nav-width: 150px !important; }
      body.${FOCUS_LAYOUT_CLASS} .gen-navigation { width: 150px !important; min-width: 150px !important; }
      body.${FOCUS_LAYOUT_CLASS} #generatePanel > .sidebar {
        width: 240px !important; min-width: 220px !important; max-width: 240px !important;
      }
      #${FOCUS_LAYOUT_TOGGLE_ID} {
        position: fixed !important; right: 18px !important; bottom: 18px !important; z-index: 2147483646 !important;
        border: 1px solid rgba(225, 182, 75, .82) !important; border-radius: 8px !important;
        background: rgba(33, 27, 15, .96) !important; color: #ffe5a0 !important;
        padding: 8px 11px !important; font: 600 12px/1.1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        cursor: pointer !important; box-shadow: 0 5px 18px rgba(0, 0, 0, .42) !important;
      }
      #${FOCUS_LAYOUT_TOGGLE_ID}[data-enabled="true"] { background: rgba(76, 59, 17, .98) !important; color: #fff3cb !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function focusLayoutEnabled() {
    try { return localStorage.getItem(FOCUS_LAYOUT_STORAGE_KEY) === 'true'; } catch { return false; }
  }

  function setAIFlowFocusLayout(enabled) {
    document.body.classList.toggle(FOCUS_LAYOUT_CLASS, enabled);
    try { localStorage.setItem(FOCUS_LAYOUT_STORAGE_KEY, String(enabled)); } catch { /* storage can be blocked by the page */ }
    const button = document.getElementById(FOCUS_LAYOUT_TOGGLE_ID);
    if (button) {
      button.dataset.enabled = String(enabled);
      button.textContent = enabled ? '恢复布局' : '专注布局';
      button.title = enabled ? '恢复 AI Flow 原来的布局' : '压缩左侧导航与参数栏，扩大工作区域；不修改任何数据';
    }
  }

  function injectAIFlowFocusLayoutToggle() {
    if (!document.body || !document.getElementById('generatePanel')) return;
    ensureAIFlowFocusLayoutStyle();
    const existing = document.getElementById(FOCUS_LAYOUT_TOGGLE_ID);
    if (existing) return;
    const button = document.createElement('button');
    button.id = FOCUS_LAYOUT_TOGGLE_ID;
    button.type = 'button';
    button.addEventListener('click', () => setAIFlowFocusLayout(!document.body.classList.contains(FOCUS_LAYOUT_CLASS)));
    document.body.appendChild(button);
    setAIFlowFocusLayout(focusLayoutEnabled());
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
    const sync = () => {
      if (!editor.isConnected) {
        dispose();
        return;
      }
      const style = getComputedStyle(editor), parentBox = parent.getBoundingClientRect(), editorBox = editor.getBoundingClientRect();
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
    const editor = [...document.querySelectorAll('textarea')].find(isVideoExtendPrompt);
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
    if (!toolbar || !projectId || isSharedLibraryView() || Date.now() < referenceUploadOfflineUntil) return;
    sendRuntimeMessage({
      action: REFERENCE_UPLOAD_ACTION,
      pageUrl: location.href,
      projectId,
      folderId: currentFolderId(),
      folderName: currentFolderName(),
    }, result => {
      // Closing the desktop app cancels in-flight local work. Do not wake the
      // extension every three seconds while it is intentionally offline; a new
      // desktop upload still wakes the extension immediately through live sync.
      if (result?.offline) referenceUploadOfflineUntil = Date.now() + 60 * 1000;
    });
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
        border: 1px solid rgba(67, 206, 161, .48) !important; border-radius: 10px !important;
        background: linear-gradient(135deg, rgba(7, 47, 40, .97), rgba(8, 30, 43, .97)) !important;
        color: #e9fff6 !important; box-shadow: 0 10px 26px rgba(0, 0, 0, .24) !important;
        font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-header { display: flex !important; align-items: flex-start !important; gap: 10px !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-title { margin: 0 !important; color: #f5fffb !important; font-size: 15px !important; font-weight: 700 !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-copy { margin: 2px 0 0 !important; color: #a9d6c8 !important; font-size: 12px !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-close { margin-left: auto !important; min-width: 30px !important; min-height: 30px !important; border: 1px solid rgba(136, 185, 171, .46) !important; border-radius: 7px !important; background: rgba(5, 30, 36, .84) !important; color: #cce8df !important; cursor: pointer !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-close:hover { border-color: #72e6bf !important; color: #ffffff !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-metrics { display: grid !important; grid-template-columns: repeat(5, minmax(100px, 1fr)) !important; gap: 8px !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-metric { min-width: 0 !important; padding: 9px 10px !important; border: 1px solid rgba(105, 175, 157, .26) !important; border-radius: 8px !important; background: rgba(1, 19, 27, .5) !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-metric strong { display: block !important; color: #ffffff !important; font-size: 18px !important; line-height: 1.1 !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-metric span { display: block !important; margin-top: 3px !important; color: #a5c9bd !important; font-size: 11px !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-section { padding-top: 10px !important; border-top: 1px solid rgba(107, 179, 161, .2) !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-section h4 { margin: 0 0 6px !important; color: #dffbf1 !important; font-size: 12px !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-section ul { display: grid !important; gap: 4px !important; margin: 0 !important; padding-left: 18px !important; color: #b8d8ce !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-note { margin: 0 !important; color: #99c5b7 !important; font-size: 12px !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-warning { padding: 9px 10px !important; border: 1px solid rgba(239, 178, 89, .55) !important; border-radius: 7px !important; background: rgba(87, 54, 11, .25) !important; color: #ffe2a7 !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-actions { display: flex !important; align-items: center !important; gap: 8px !important; flex-wrap: wrap !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-actions button { min-height: 34px !important; padding: 7px 12px !important; border: 1px solid rgba(71, 214, 166, .8) !important; border-radius: 7px !important; background: #106f58 !important; color: #f2fff9 !important; font: 700 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important; cursor: pointer !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-actions button:hover:not(:disabled) { background: #168568 !important; box-shadow: 0 0 0 2px rgba(65, 231, 180, .14) !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-actions button:disabled { cursor: not-allowed !important; opacity: .55 !important; }
      #${FOLDER_DIFF_PANEL_ID} .nest-aiflow-diff-status { color: #bde5d9 !important; font-size: 12px !important; }
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

  function requestLiveSync() {
    const toolbar = folderToolbar();
    const projectId = currentProjectId();
    if (!toolbar || !projectId || isSharedLibraryView()) return;
    sendRuntimeMessage({
      action: LIVE_SYNC_ACTION,
      pageUrl: location.href,
      projectId,
    });
    requestReferenceUpload();
  }

  function ensureLiveSyncTimer() {
    if (liveSyncTimer) return;
    liveSyncTimer = setInterval(requestLiveSync, LIVE_SYNC_INTERVAL_MS);
    setTimeout(requestLiveSync, 500);
  }

  document.addEventListener('click', event => {
    const card = AI_FLOW_DOM?.taskFromTarget?.(event.target)
      || (event.target instanceof Element ? event.target.closest('.task-card[data-taskid]') : null);
    const taskId = String(AI_FLOW_DOM?.taskId?.(card) || card?.dataset?.taskid || '').trim();
    if (taskId) lastVideoExtendTaskId = taskId;
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

  pageMutationObserver = new MutationObserver(() => {
    injectButton();        injectFolderSyncButton();
        injectFolderStructureLinkButton();
        injectFolderStructureSyncButton();
        injectPromptReferenceHighlights();
        injectVideoExtendLibraryPanel();
        injectVideoExtendAutoMatchButton();
        injectVideoExtendWorkbench();
        injectAIFlowThemeSwitcher();
        injectAIFlowFocusLayoutToggle();
    document.getElementById(LEGACY_UPLOAD_BUTTON_ID)?.remove();
    ensureLiveSyncTimer();
  });
  pageMutationObserver.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class'],
  });
  injectFolderSyncButton();
  injectFolderStructureLinkButton();
  injectFolderStructureSyncButton();      injectPromptReferenceHighlights();
      injectVideoExtendLibraryPanel();
      injectVideoExtendAutoMatchButton();
      injectVideoExtendWorkbench();
      injectAIFlowThemeSwitcher();
      injectAIFlowFocusLayoutToggle();
  document.getElementById(LEGACY_UPLOAD_BUTTON_ID)?.remove();
  ensureLiveSyncTimer();
})();

















