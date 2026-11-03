(() => {
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
  const VIDEO_COPY_BUTTON_CLASS = 'nest-aiflow-video-copy-direct';
  const VIDEO_COPY_STYLE_ID = 'nest-aiflow-video-copy-style';
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
  const VIDEO_EXTEND_WORKBENCH_THEME_KEY = 'nest-aiflow-workbench-theme';
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

  function ensureDirectVideoCopyStyles() {
    if (document.getElementById(VIDEO_COPY_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = VIDEO_COPY_STYLE_ID;
    style.textContent = `
      .task-card[data-taskid] .${VIDEO_COPY_BUTTON_CLASS} {
        position: absolute !important; top: 9px !important; left: 9px !important; z-index: 24 !important;
        display: inline-flex !important; align-items: center !important; gap: 6px !important;
        min-height: 30px !important; padding: 6px 10px !important;
        border: 1px solid rgba(76, 226, 179, .92) !important; border-radius: 7px !important;
        background: rgba(5, 37, 31, .94) !important; color: #e8fff6 !important;
        font: 600 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        letter-spacing: .01em !important; box-shadow: 0 5px 16px rgba(0, 0, 0, .38), 0 0 0 1px rgba(3, 14, 12, .35) !important;
        cursor: pointer !important; transition: background .14s ease, border-color .14s ease, transform .14s ease, box-shadow .14s ease !important;
      }
      .task-card[data-taskid] .${VIDEO_COPY_BUTTON_CLASS}:hover:not(:disabled) {
        background: rgba(12, 100, 77, .98) !important; border-color: #7af3c9 !important;
        box-shadow: 0 6px 18px rgba(0, 0, 0, .42), 0 0 0 2px rgba(47, 207, 158, .16) !important; transform: translateY(-1px) !important;
      }
      .task-card[data-taskid] .${VIDEO_COPY_BUTTON_CLASS}:disabled { cursor: wait !important; opacity: .7 !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
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
    return Boolean(document.querySelector('#assetLibrary, .gen-current-project, .task-card[data-taskid]'));
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
    return { token, filename };
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

  function mountNativeVideoExtendPicker(panel, dialog) {
    const slot = panel.querySelector('[data-nest-native-picker]');
    const sourceButton = dialog.querySelector('#sd25RefAdd')
      || [...dialog.querySelectorAll('button')].find(button => /^@?素材$/.test(String(button.textContent || '').trim()));
    if (!slot || !sourceButton) return;
    const findPicker = () => [...dialog.querySelectorAll('div, section')]
      .filter(node => node.querySelector('[data-refpick]') && node.querySelector('input'))
      .sort((left, right) => right.querySelectorAll('[data-refpick]').length - left.querySelectorAll('[data-refpick]').length)[0];
    let nativePickerObserver = null;
    let nativePickerRefreshTimer = null;
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
      nativePickerObserver?.disconnect();
      nativePickerObserver = new MutationObserver(scheduleNativePickerSync);
      nativePickerObserver.observe(nativePicker, { childList: true, subtree: true, characterData: true });
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

  function injectVideoExtendLibraryPanel() {
    const editor = [...document.querySelectorAll('textarea')].find(isVideoExtendPrompt);
    const dialog = editor && videoExtendContainer(editor);
    const existing = document.getElementById(VIDEO_EXTEND_LIBRARY_PANEL_ID);
    if (!editor || !dialog) { existing?.remove(); return; }
    if (existing) return;
    const panel = document.createElement('aside');
    panel.id = VIDEO_EXTEND_LIBRARY_PANEL_ID;
    panel.style.cssText = 'position:fixed;z-index:2147483646;width:360px;min-width:260px;max-width:calc(100vw - 24px);min-height:260px;max-height:calc(100vh - 24px);height:min(760px,calc(100vh - 24px));resize:both;overflow:hidden;display:flex;flex-direction:column;background:#191713;border:1px solid #9b7b3a;border-radius:10px;box-shadow:0 18px 50px #000b;color:#eee;font:12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
    const rect = dialog.getBoundingClientRect();
    panel.style.left = `${rect.right + 14 + 300 <= window.innerWidth ? rect.right + 14 : Math.max(12, rect.left - 314)}px`;
    panel.style.top = `${Math.max(12, Math.min(rect.top, window.innerHeight - 300))}px`;
    panel.innerHTML = '<header data-nest-library-drag style="display:flex;align-items:center;gap:7px;padding:10px 12px;border-bottom:1px solid #5a4827;cursor:move"><button type="button" data-nest-library-back title="返回上级文件夹" style="border:1px solid #796033;border-radius:5px;background:#292218;color:#e7d4a4;padding:3px 7px;cursor:pointer">←</button><b data-nest-library-title style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">视频延长素材库</b><button type="button" data-nest-library-refresh title="刷新素材" style="border:1px solid #796033;border-radius:5px;background:#292218;color:#e7d4a4;padding:3px 7px;cursor:pointer">刷新</button></header><div style="padding:7px 10px;color:#bfae82;border-bottom:1px solid #392e1b">点击素材即刻写入提示词光标处；拖动标题栏，右下角可缩放</div><details open style="border-bottom:1px solid #5a4827"><summary style="padding:8px 10px;cursor:pointer;color:#f0dfac;font-weight:600">AI Flow 原生素材</summary><div data-nest-native-picker style="max-height:230px;overflow:auto;padding:0 8px 8px">正在读取 AI Flow 原生素材…</div></details><div data-nest-assets style="display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));align-content:start;gap:8px;padding:9px;overflow:auto;min-height:120px;flex:1">读取素材中…</div>';
    const list = panel.querySelector('[data-nest-assets]');
    const title = panel.querySelector('[data-nest-library-title]');
    const backButton = panel.querySelector('[data-nest-library-back]');
    const refreshButton = panel.querySelector('[data-nest-library-refresh]');
    let currentFolderId = '';
    let parentFolderId = null;
    const render = result => {
      if (!list) return;
      list.replaceChildren();
      if (!result?.ok) { list.textContent = result?.error || '素材库读取失败'; return; }
      if (title) title.textContent = result.folderId ? `素材库 / ${result.folderName || '文件夹'}` : '视频延长素材库';
      parentFolderId = result.parentId || null;
      if (backButton instanceof HTMLButtonElement) backButton.disabled = !result.folderId;
      for (const folder of result.folders || []) {
        const button = document.createElement('button');
        button.type = 'button'; button.dataset.nestLibraryFolder = folder.id;
        button.title = `打开文件夹：${folder.name}`;
        button.style.cssText = 'grid-column:1/-1;display:flex;align-items:center;gap:7px;min-width:0;border:1px solid #6c572b;border-radius:6px;background:#292218;color:#f0dfac;padding:7px;text-align:left;cursor:pointer';
        const icon = document.createElement('span'); icon.textContent = '📁';
        const label = document.createElement('span'); label.textContent = folder.name; label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        button.append(icon, label); button.addEventListener('click', () => load(folder.id)); list.appendChild(button);
      }
      if (!result.folders?.length && !result.assets?.length) { list.textContent = '这个文件夹暂无可展示的媒体'; return; }
      for (const asset of result.assets) {
        const card = document.createElement('button');
        card.type = 'button'; card.dataset.nestLibraryAsset = asset.id;
        card.title = asset.name;
        card.style.cssText = 'min-width:0;border:0;padding:0;background:transparent;color:#ddd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;cursor:pointer';
        if (asset.thumbnail) {
          const image = document.createElement('img');
          image.src = asset.thumbnail; image.alt = asset.name;
          image.style.cssText = 'display:block;width:100%;aspect-ratio:4/3;object-fit:contain;background:#17130d;border-radius:5px;border:1px solid #51442d;margin-bottom:3px';
          card.appendChild(image);
        } else {
          const icon = document.createElement('div');
          icon.textContent = String(asset.type || '').startsWith('video/') ? '视频' : '音频';
          icon.style.cssText = 'display:grid;place-items:center;aspect-ratio:1;background:#292218;border:1px solid #51442d;border-radius:5px;color:#d8b667;margin-bottom:3px';
          card.appendChild(icon);
        }
        const label = document.createElement('span'); label.textContent = asset.name; label.style.cssText = 'display:block;white-space:normal;overflow-wrap:anywhere;line-height:1.25'; card.appendChild(label);
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
      const start = { x: event.clientX, y: event.clientY, left: panel.offsetLeft, top: panel.offsetTop };
      const move = moveEvent => { panel.style.left = `${Math.max(4, Math.min(window.innerWidth - 80, start.left + moveEvent.clientX - start.x))}px`; panel.style.top = `${Math.max(4, Math.min(window.innerHeight - 50, start.top + moveEvent.clientY - start.y))}px`; };
      const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', end, { once: true });
    });
    document.body.appendChild(panel); mountNativeVideoExtendPicker(panel, dialog); load();
  }

  function ensureVideoExtendWorkbenchStyle() {
    if (document.getElementById(VIDEO_EXTEND_WORKBENCH_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = VIDEO_EXTEND_WORKBENCH_STYLE_ID;
    style.textContent = `
      .nest-aiflow-video-extend-native-hidden { opacity: 0 !important; pointer-events: none !important; }
      #${VIDEO_EXTEND_WORKBENCH_ID} { position:fixed; z-index:2147483645; left:50%; top:50%; width:min(760px,calc(100vw - 28px)); max-height:calc(100vh - 28px); transform:translate(-50%,-50%); overflow:auto; border:1px solid #75603a; border-radius:13px; background:#171510; box-shadow:0 28px 88px #000d; color:#f2eee4; font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
      #${VIDEO_EXTEND_WORKBENCH_ID} * { box-sizing:border-box; }
      #${VIDEO_EXTEND_WORKBENCH_ID} header { display:flex; align-items:center; gap:10px; padding:13px 16px; border-bottom:1px solid #4c4028; background:linear-gradient(100deg,#241e12,#171510); cursor:move; }
      #${VIDEO_EXTEND_WORKBENCH_ID} h2 { margin:0; font-size:16px; color:#f7e6ae; } #${VIDEO_EXTEND_WORKBENCH_ID} header small { color:#b6a98b; margin-right:auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      #${VIDEO_EXTEND_WORKBENCH_ID} button { border:1px solid #80693d; border-radius:6px; background:#2a2418; color:#f3dda0; padding:7px 10px; cursor:pointer; font:inherit; }
      #${VIDEO_EXTEND_WORKBENCH_ID} select { border:1px solid #80693d; border-radius:6px; background:#2a2418; color:#f3dda0; padding:6px; font:inherit; cursor:pointer; }
      #${VIDEO_EXTEND_WORKBENCH_ID} button:hover:not(:disabled) { background:#4a3b1d; } #${VIDEO_EXTEND_WORKBENCH_ID} button:disabled { opacity:.55; cursor:wait; }
      #${VIDEO_EXTEND_WORKBENCH_ID} [data-nest-workbench-direction][data-active="true"] { background:#8a743f; border-color:#e2c473; color:#161209; box-shadow:0 0 0 2px #c79f4740; font-weight:700; }
      #${VIDEO_EXTEND_WORKBENCH_ID} .nest-workbench-body { display:grid; grid-template-columns:minmax(270px,1fr) minmax(300px,1.15fr); gap:14px; padding:14px; }
      #${VIDEO_EXTEND_WORKBENCH_ID} .nest-workbench-preview { display:grid; place-items:center; min-height:270px; border:1px solid #40351f; border-radius:9px; background:#080807; overflow:hidden; } #${VIDEO_EXTEND_WORKBENCH_ID} video { display:block; width:100%; max-height:420px; object-fit:contain; }
      #${VIDEO_EXTEND_WORKBENCH_ID} label { display:block; color:#cbbf9c; font-size:11px; margin:0 0 5px; } #${VIDEO_EXTEND_WORKBENCH_ID} textarea { width:100%; min-height:190px; max-height:calc(100vh - 250px); resize:vertical; border:1px solid #655231; border-radius:8px; background:#25211a; color:#f3f0e7; padding:11px 12px; font:14px/1.6 inherit; outline:none; } #${VIDEO_EXTEND_WORKBENCH_ID} textarea:focus { border-color:#cfaa58; box-shadow:0 0 0 2px #c79f4730; }
      #${VIDEO_EXTEND_WORKBENCH_ID} input[type=number] { width:76px; border:1px solid #655231; border-radius:6px; background:#25211a; color:#f3f0e7; padding:7px; } #${VIDEO_EXTEND_WORKBENCH_ID} .nest-workbench-row { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:10px 0; }
      #${VIDEO_EXTEND_WORKBENCH_ID} .nest-workbench-chips { display:flex; flex-wrap:wrap; gap:6px; min-height:32px; padding:7px; border:1px solid #40351f; border-radius:7px; background:#201d17; color:#d8c99c; }
      #${VIDEO_EXTEND_WORKBENCH_ID} .nest-workbench-chip { display:inline-flex; align-items:center; min-width:0; max-width:100%; border-radius:14px; background:#39301d; font-size:11px; }
      #${VIDEO_EXTEND_WORKBENCH_ID} .nest-workbench-chip [data-nest-workbench-reference-insert] { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; border:0; border-radius:14px 0 0 14px; background:transparent; color:inherit; padding:3px 5px 3px 7px; }
      #${VIDEO_EXTEND_WORKBENCH_ID} .nest-workbench-chip [data-nest-workbench-reference-remove] { border:0; border-left:1px solid #80693d; border-radius:0 14px 14px 0; background:transparent; color:inherit; padding:3px 7px; font-weight:700; line-height:1; }
      #${VIDEO_EXTEND_WORKBENCH_ID} .nest-workbench-chip [data-nest-workbench-reference-remove]:hover { background:#6d312d; color:#fff; }
      #${VIDEO_EXTEND_WORKBENCH_ID} .nest-workbench-prompt-head { display:flex; align-items:center; gap:8px; margin-top:10px; } #${VIDEO_EXTEND_WORKBENCH_ID} .nest-workbench-prompt-head label { margin:0 auto 0 0; } #${VIDEO_EXTEND_WORKBENCH_ID} [data-nest-workbench-count] { color:#96855d; font-size:11px; } #${VIDEO_EXTEND_WORKBENCH_ID} [data-nest-workbench-clear] { padding:3px 7px; font-size:11px; }
      #${VIDEO_EXTEND_WORKBENCH_ID} [data-nest-workbench-reference-hints] { display:flex; flex-wrap:wrap; gap:5px; min-height:20px; padding-top:6px; color:#c9b06c; font-size:11px; }
      #${VIDEO_EXTEND_WORKBENCH_ID} footer { display:flex; gap:9px; padding:12px 14px; border-top:1px solid #4c4028; } #${VIDEO_EXTEND_WORKBENCH_ID} [data-nest-workbench-submit] { flex:1; background:#8a743f; color:#161209; font-weight:700; }
      #${VIDEO_EXTEND_WORKBENCH_ID}[data-theme="ocean"] { border-color:#397fa3; background:#101b24; } #${VIDEO_EXTEND_WORKBENCH_ID}[data-theme="ocean"] header { border-color:#284c60; background:linear-gradient(100deg,#102b3b,#101b24); } #${VIDEO_EXTEND_WORKBENCH_ID}[data-theme="ocean"] button,#${VIDEO_EXTEND_WORKBENCH_ID}[data-theme="ocean"] select { border-color:#367ca2; background:#173246; color:#bdeaff; } #${VIDEO_EXTEND_WORKBENCH_ID}[data-theme="ocean"] [data-nest-workbench-submit],#${VIDEO_EXTEND_WORKBENCH_ID}[data-theme="ocean"] [data-nest-workbench-direction][data-active="true"] { background:#3b91bc; color:#07161d; }
      #${VIDEO_EXTEND_WORKBENCH_ID}[data-theme="forest"] { border-color:#3b8a65; background:#112119; } #${VIDEO_EXTEND_WORKBENCH_ID}[data-theme="forest"] header { border-color:#285b43; background:linear-gradient(100deg,#163523,#112119); } #${VIDEO_EXTEND_WORKBENCH_ID}[data-theme="forest"] button,#${VIDEO_EXTEND_WORKBENCH_ID}[data-theme="forest"] select { border-color:#438c68; background:#193827; color:#c9f5d6; } #${VIDEO_EXTEND_WORKBENCH_ID}[data-theme="forest"] [data-nest-workbench-submit],#${VIDEO_EXTEND_WORKBENCH_ID}[data-theme="forest"] [data-nest-workbench-direction][data-active="true"] { background:#4d9b70; color:#08160d; }
      #${VIDEO_EXTEND_WORKBENCH_ID}[data-theme="violet"] { border-color:#8666ab; background:#1d1628; } #${VIDEO_EXTEND_WORKBENCH_ID}[data-theme="violet"] header { border-color:#593f74; background:linear-gradient(100deg,#31203f,#1d1628); } #${VIDEO_EXTEND_WORKBENCH_ID}[data-theme="violet"] button,#${VIDEO_EXTEND_WORKBENCH_ID}[data-theme="violet"] select { border-color:#8967ae; background:#38274b; color:#e8d6ff; } #${VIDEO_EXTEND_WORKBENCH_ID}[data-theme="violet"] [data-nest-workbench-submit],#${VIDEO_EXTEND_WORKBENCH_ID}[data-theme="violet"] [data-nest-workbench-direction][data-active="true"] { background:#9670c0; color:#160d1f; }
      @media (max-width:720px) { #${VIDEO_EXTEND_WORKBENCH_ID} .nest-workbench-body { grid-template-columns:1fr; } #${VIDEO_EXTEND_WORKBENCH_ID} .nest-workbench-preview { min-height:180px; } }
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
        const back = document.createElement('button');
        back.id = VIDEO_EXTEND_WORKBENCH_RETURN_ID;
        back.type = 'button'; back.textContent = '返回小旺仔工作台';
        back.title = '切回小旺仔自定义视频延长窗口';
        back.style.cssText = 'position:fixed;z-index:2147483647;right:20px;bottom:20px;border:1px solid #8a6d39;border-radius:7px;background:#2a2217;color:#f3dba0;padding:8px 11px;cursor:pointer;box-shadow:0 6px 20px #0009';
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
    const video = dialog.querySelector('video');
    const source = String(video?.currentSrc || video?.src || '');
    const seconds = dialog.querySelector('input[type=number]');
    const workbench = document.createElement('section');
    workbench.id = VIDEO_EXTEND_WORKBENCH_ID;
    workbench.innerHTML = `<header data-nest-workbench-drag><div><h2>小旺仔延长工作台</h2><small data-nest-workbench-source>AI Flow 视频延长</small></div><select data-nest-workbench-theme title="切换主题配色"><option value="amber">琥珀</option><option value="ocean">海洋</option><option value="forest">森林</option><option value="violet">紫罗兰</option></select><button type="button" data-nest-workbench-close>关闭</button></header><div class="nest-workbench-body"><div class="nest-workbench-preview">${source ? `<video controls src="${source.replace(/"/g, '&quot;')}"></video>` : '<span>正在读取视频预览…</span>'}</div><div><label>延长方向</label><div class="nest-workbench-row"><button type="button" data-nest-workbench-direction="end">向后延长（接结尾）</button><button type="button" data-nest-workbench-direction="start">向前延长（补开头）</button></div><div class="nest-workbench-row"><label style="margin:0">延长秒数</label><input type="number" min="4" max="30" data-nest-workbench-seconds><button type="button" data-nest-workbench-match>自动匹配人物</button></div><label>延长参考素材</label><div class="nest-workbench-chips" data-nest-workbench-chips>暂无参考素材</div><div class="nest-workbench-prompt-head"><label>延长提示词</label><span data-nest-workbench-count>0</span><button type="button" data-nest-workbench-clear>清空</button></div><textarea data-nest-workbench-prompt placeholder="写接着做什么，例如人物转身走向门口；可直接输入 @图片1、@视频1 等引用…"></textarea><div data-nest-workbench-reference-hints></div></div></div><footer><button type="button" data-nest-workbench-native>打开 AI Flow 原窗口</button><button type="button" data-nest-workbench-submit>提交延长</button></footer>`;
    const prompt = workbench.querySelector('[data-nest-workbench-prompt]');
    const secondsInput = workbench.querySelector('[data-nest-workbench-seconds]');
    const chips = workbench.querySelector('[data-nest-workbench-chips]');
    const promptCount = workbench.querySelector('[data-nest-workbench-count]');
    const referenceHints = workbench.querySelector('[data-nest-workbench-reference-hints]');
    const themeSelect = workbench.querySelector('[data-nest-workbench-theme]');
    let savedTheme = 'amber';
    try { savedTheme = localStorage.getItem(VIDEO_EXTEND_WORKBENCH_THEME_KEY) || 'amber'; } catch {}
    if (!['amber', 'ocean', 'forest', 'violet'].includes(savedTheme)) savedTheme = 'amber';
    workbench.dataset.theme = savedTheme;
    if (themeSelect instanceof HTMLSelectElement) {
      themeSelect.value = savedTheme;
      themeSelect.addEventListener('change', () => { workbench.dataset.theme = themeSelect.value; try { localStorage.setItem(VIDEO_EXTEND_WORKBENCH_THEME_KEY, themeSelect.value); } catch {} });
    }
    const resizeWorkbenchPrompt = (force = false) => {
      if (!(prompt instanceof HTMLTextAreaElement)) return;
      if (force || prompt.dataset.nestManualResize !== 'true') {
        prompt.style.height = 'auto';
        prompt.style.height = `${Math.min(window.innerHeight - 250, Math.max(190, prompt.scrollHeight))}px`;
      }
      if (promptCount) { const limit = Number(editor.maxLength); promptCount.textContent = `${prompt.value.length}${limit > 0 ? ` / ${limit}` : ''}`; }
      if (referenceHints) {
        referenceHints.replaceChildren();
        const tags = [...new Set([...prompt.value.matchAll(/@(图片|视频|音频)\s*\d+/g)].map(match => match[0].replace(/\s+/g, '')))];
        if (tags.length) referenceHints.textContent = `已在提示词中引用：${tags.join(' · ')}`;
      }
    };
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
      if (chips) {
        chips.replaceChildren();
        // Keep AI Flow's actual token. Its chip list can be displayed in a
        // different order from the token numbers, so never renumber by index.
        const referenceItems = nativeVideoExtendReferences(dialog);
        const knownTokens = new Set(referenceItems.map(item => item.token));
        for (const match of String(editor.value || '').matchAll(/@(图片|视频|音频)\s*(\d+)/g)) {
          const token = `@${match[1]}${match[2]}`;
          if (!knownTokens.has(token)) { knownTokens.add(token); referenceItems.push({ token, filename: '' }); }
        }
        if (!referenceItems.length) chips.textContent = '暂无参考素材；从右侧小旺仔素材库点击素材即可加入。';
        referenceItems.sort((left, right) => left.token.localeCompare(right.token, 'zh-CN', { numeric: true }));
        for (const { token, filename } of referenceItems) {
          const chip = document.createElement('span');
          chip.className = 'nest-workbench-chip';
          chip.dataset.nestWorkbenchReferenceToken = token;
          const insert = document.createElement('button');
          insert.type = 'button'; insert.dataset.nestWorkbenchReferenceInsert = token;
          insert.textContent = filename ? `${token} · ${filename}` : token;
          insert.title = `点击在当前光标插入 ${token}`;
          insert.addEventListener('click', () => {
            if (!(prompt instanceof HTMLTextAreaElement)) return;
            insertVideoExtendReferenceToken(prompt, token, { start: prompt.selectionStart, end: prompt.selectionEnd });
          });
          const remove = document.createElement('button');
          remove.type = 'button'; remove.dataset.nestWorkbenchReferenceRemove = token;
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
            setTimeout(sync, 160);
          });
          chip.append(insert, remove); chips.appendChild(chip);
        }
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
      back.style.cssText = 'position:fixed;z-index:2147483647;right:20px;bottom:20px;border:1px solid #8a6d39;border-radius:7px;background:#2a2217;color:#f3dba0;padding:8px 11px;cursor:pointer;box-shadow:0 6px 20px #0009';
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
    const panel = document.createElement('section');
    panel.id = 'nest-aiflow-people-find-replace'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', '人物查找和替换');
    panel.style.cssText = 'position:absolute;z-index:20;inset:12px;min-height:270px;padding:16px;border:1px solid #9d6b95;border-radius:10px;background:#25121f;color:#fff2fa;box-shadow:0 16px 52px #000d;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;align-content:start;gap:10px';
    panel.innerHTML = '<div style="display:flex;align-items:center;gap:8px"><strong style="font-size:16px">人物查找和替换</strong><span data-nest-person-position style="opacity:.7"></span><button type="button" data-nest-person-close style="margin-left:auto">关闭</button></div><div data-nest-person-status style="min-height:18px;color:#f5c6d9"></div><label>查找<input data-nest-person-find readonly></label><label>替换为<input data-nest-person-replace placeholder="请选择图片参考"></label><label>使用参考图<select data-nest-person-reference><option value="">选择 @图片引用</option></select></label><div style="display:flex;flex-wrap:wrap;gap:7px"><button type="button" data-nest-person-prev>上一个</button><button type="button" data-nest-person-next>下一个</button><button type="button" data-nest-person-replace-one>替换当前</button><button type="button" data-nest-person-replace-all>全部替换</button></div>';
    for (const control of panel.querySelectorAll('input,select,button')) control.style.cssText += ';width:100%;border:1px solid #9d6b95;border-radius:6px;background:#170b14;color:#fff2fa;padding:7px;font:inherit';
    for (const control of panel.querySelectorAll('button')) control.style.cssText += ';width:auto;cursor:pointer;background:#4f2544';
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
      body[data-nest-aiflow-theme] button { border-color:var(--nest-theme-border) !important; background-color:var(--nest-theme-button) !important; color:var(--nest-theme-text) !important; }
      body[data-nest-aiflow-theme] button:hover:not(:disabled) { background-color:var(--nest-theme-button-hover) !important; border-color:var(--nest-theme-accent) !important; color:var(--nest-theme-text) !important; }
      body[data-nest-aiflow-theme] :is(button.active, button.selected, button[aria-pressed="true"], button[aria-checked="true"], button[class*="active"], button[class*="selected"], button[class*="checked"], button[class*="primary"], button[class*="submit"], button[class*="generate"], .active > button, .selected > button, [class*="active"] > button, [class*="selected"] > button) { background:var(--nest-theme-primary) !important; color:var(--nest-theme-primary-text) !important; border-color:var(--nest-theme-primary) !important; box-shadow:0 0 0 1px color-mix(in srgb,var(--nest-theme-primary) 32%,transparent),0 8px 24px color-mix(in srgb,var(--nest-theme-primary) 16%,transparent) !important; }
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

  function injectDirectVideoCopyButtons() {
    ensureDirectVideoCopyStyles();
    for (const card of document.querySelectorAll('.task-card[data-taskid]')) {
      const taskId = String(card.dataset.taskid || '').trim();
      if (!taskId) continue;
      if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
      let button = card.querySelector(`.${VIDEO_COPY_BUTTON_CLASS}`);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = VIDEO_COPY_BUTTON_CLASS;
        button.innerHTML = '<span aria-hidden="true">⇩</span><span>复制到小旺仔</span>';
        button.addEventListener('pointerdown', event => event.stopPropagation());
        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          requestVideoCopy(button.dataset.taskId, button);
        });
        card.appendChild(button);
      }
      button.dataset.taskId = taskId;
      button.title = '复制此视频到小旺仔素材库';
    }
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
    const project = document.querySelector(
      '.gen-current-project[data-pid], [data-project-id], [data-projectid], [data-pid]',
    );
    const value = String(
      project?.dataset?.pid || project?.dataset?.projectId || project?.dataset?.projectid || '',
    ).trim();
    return /^\d{1,18}$/.test(value) ? value : '';
  }

  function currentProjectName() {
    const project = document.querySelector(
      '.gen-current-project[data-pid], [data-project-id], [data-projectid], [data-pid]',
    );
    const value = String(project?.textContent || '').trim().replace(/\s+/g, ' ');
    return value.slice(0, 120);
  }

  function currentFolderAssetId() {
    const value = String(document.querySelector('#assetLibrary .asset-lib-item[data-asset-id]')?.dataset?.assetId || '').trim();
    return /^\d{1,18}$/.test(value) ? value : '';
  }

  function currentFolderSelection() {
    const toolbar = document.querySelector('#assetLibrary .als-folder-bar-in');
    const crumb = toolbar?.querySelector('.als-crumb-last[data-folder-id]')
      || toolbar?.querySelector('.als-crumb-root[data-folder-id=""]');
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
    return document.querySelector('#assetLibrary .als-folder-bar-in')
      || document.querySelector('#assetLibrary .als-folder-bar');
  }

  function isSharedLibraryView() {
    return Boolean(document.querySelector('#assetLibrary .als-tab[data-tab="packs"].als-tab-active'));
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
    const button = document.getElementById('assetLibReload');
    if (button instanceof HTMLElement) button.click();
  }

  function openAIFlowAssetRoot() {
    const root = document.querySelector('#assetLibrary .als-crumb-root[data-folder-id=""]');
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
      missing = ids.filter(id => !document.querySelector(`#assetLibrary .asset-lib-item[data-asset-id="${id}"]`));
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
      const card = document.querySelector(`#assetLibrary .asset-lib-item[data-asset-id="${id}"]`);
      if (!card) continue;
      card.click();
      attachedIds.push(id);
    }
    return { attached: attachedIds.length, attachedIds, missing: ids.filter(id => !attachedIds.includes(id)), rootFallback };
  }

  function requestReferenceUpload() {
    const toolbar = document.querySelector('#assetLibrary .als-folder-bar');
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
    const anchor = document.querySelector('#assetLibrary .als-folder-bar');
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

  document.addEventListener('contextmenu', event => {
    const card = event.target instanceof Element ? event.target.closest('.task-card[data-taskid]') : null;
    pendingTaskId = String(card?.dataset?.taskid || '').trim();
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
    injectButton();
    injectDirectVideoCopyButtons();
        injectFolderSyncButton();
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
  injectFolderStructureSyncButton();
  injectDirectVideoCopyButtons();
      injectPromptReferenceHighlights();
      injectVideoExtendLibraryPanel();
      injectVideoExtendAutoMatchButton();
      injectVideoExtendWorkbench();
      injectAIFlowThemeSwitcher();
      injectAIFlowFocusLayoutToggle();
  document.getElementById(LEGACY_UPLOAD_BUTTON_ID)?.remove();
  ensureLiveSyncTimer();
})();

















