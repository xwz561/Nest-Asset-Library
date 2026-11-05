import { flushSync } from "react-dom";

let currentTransition = null;
let transitionSequence = 0;

function isDeskWindow(documentRef) {
  return Boolean(
    documentRef?.body?.classList?.contains?.("soft-desk-window") ||
    documentRef?.querySelector?.(".soft-desk-root"),
  );
}

function shouldSkip(documentRef, windowRef) {
  return (
    !documentRef?.startViewTransition ||
    windowRef?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ||
    documentRef?.querySelector?.("main.is-scrolling") ||
    isDeskWindow(documentRef)
  );
}

function setThemeOrigin(documentRef, point) {
  const root = documentRef.documentElement;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    root.dataset.vtOrigin = "center";
    return;
  }

  const width = Math.max(1, documentRef.documentElement.clientWidth || globalThis.window?.innerWidth || 1);
  const height = Math.max(1, documentRef.documentElement.clientHeight || globalThis.window?.innerHeight || 1);
  const x = Math.min(width, Math.max(0, point.x));
  const y = Math.min(height, Math.max(0, point.y));
  const radius = Math.max(
    Math.hypot(x, y),
    Math.hypot(width - x, y),
    Math.hypot(x, height - y),
    Math.hypot(width - x, height - y),
  );
  root.dataset.vtOrigin = "pointer";
  root.style.setProperty("--vt-x", `${x}px`);
  root.style.setProperty("--vt-y", `${y}px`);
  root.style.setProperty("--vt-radius", `${Math.ceil(radius + 2)}px`);
}

function clearTransitionState(documentRef) {
  const root = documentRef?.documentElement;
  if (!root) return;
  delete root.dataset.vt;
  delete root.dataset.vtOrigin;
  root.style.removeProperty("--vt-x");
  root.style.removeProperty("--vt-y");
  root.style.removeProperty("--vt-radius");
}

export function withViewTransition(update, { kind = "fade", point = null } = {}) {
  if (typeof update !== "function") throw new TypeError("withViewTransition 需要一个更新函数");

  const documentRef = globalThis.document;
  const windowRef = globalThis.window;
  if (shouldSkip(documentRef, windowRef)) {
    update();
    return null;
  }

  if (currentTransition) {
    try { currentTransition.skipTransition?.(); } catch { /* 已被浏览器结束 */ }
    currentTransition = null;
  }

  const sequence = ++transitionSequence;
  const root = documentRef.documentElement;
  root.dataset.vt = ["folder-forward", "folder-back", "fade", "module", "theme"].includes(kind) ? kind : "fade";
  if (root.dataset.vt === "theme") setThemeOrigin(documentRef, point);
  else delete root.dataset.vtOrigin;

  let transition;
  let updateStarted = false;
  try {
    transition = documentRef.startViewTransition(() => flushSync(() => {
      updateStarted = true;
      update();
    }));
  } catch (error) {
    if (sequence === transitionSequence) clearTransitionState(documentRef);
    if (!updateStarted) update();
    else throw error;
    return null;
  }

  currentTransition = transition;
  Promise.resolve(transition?.finished).then(
    () => {
      if (sequence !== transitionSequence) return;
      currentTransition = null;
      clearTransitionState(documentRef);
    },
    () => {
      if (sequence !== transitionSequence) return;
      currentTransition = null;
      clearTransitionState(documentRef);
    },
  );
  return transition;
}
