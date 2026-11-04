import React from "react";
import { createPortal } from "react-dom";
import { RendererProvider, createDOMRenderer } from "@fluentui/react-components";
import { Undo2 } from "lucide-react";
import { ReadyUI } from "../ready-ui.jsx";
import { ErrorBoundary } from "./error-boundary.jsx";

// 疯狂模式：把卡片放到桌面上的小窗口。
// 用 window.open 打开同源的空白页（主进程只放行 nest-card-* 这个名字，见 electron/main.cjs），
// 卡片内容由主窗口的 React 直接渲染进去，数据和主窗口是同一份，不用另外同步。
// bounds 是屏幕坐标 {x, y, w, h}；窗口被用户关掉时 onClosed，被挪动 / 拉大小时 onMove。
export function useDeskWindow({ id, bounds, title, onClosed, onMove }) {
  const [target, setTarget] = React.useState(null);
  const open = Boolean(bounds);
  const initial = React.useRef(bounds);
  const latest = React.useRef({ onClosed, onMove });
  latest.current = { onClosed, onMove };
  if (!open) initial.current = null;
  else if (!initial.current) initial.current = bounds;

  React.useEffect(() => {
    if (!open) return undefined;
    const b = initial.current;
    const features = `popup=yes,left=${Math.round(b.x)},top=${Math.round(b.y)},width=${Math.round(b.w)},height=${Math.round(b.h)}`;
    let win = null;
    let doc = null;
    try {
      win = window.open("about:blank", `nest-card-${id}`, features);
      doc = win?.document;
    } catch {
      doc = null;
    }
    if (!win || !doc) {
      try { win?.close(); } catch { /* 窗口已经没了 */ }
      latest.current.onClosed?.();
      return undefined;
    }
    doc.head.replaceChildren();
    doc.body.replaceChildren();
    doc.title = title;
    doc.documentElement.lang = "zh-CN";
    doc.documentElement.dataset.platform = document.documentElement.dataset.platform || "";
    // 主窗口的样式表搬过去（link 用绝对地址）；界面库运行时插入的样式由 RendererProvider 写进小窗口
    for (const node of document.querySelectorAll('link[rel="stylesheet"]')) {
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = node.href;
      doc.head.appendChild(link);
    }
    for (const node of document.querySelectorAll("style")) {
      if (!node.textContent) continue;
      const style = doc.createElement("style");
      style.textContent = node.textContent;
      doc.head.appendChild(style);
    }
    const root = doc.createElement("div");
    root.className = "soft-desk-root";
    doc.body.appendChild(root);
    setTarget({ win, doc, root, renderer: createDOMRenderer(doc) });

    // 位置记窗口外框的左上角，大小记内容区（window.open 的 width / height 就是内容区），否则每次重开都会多出一圈边框
    let last = { x: win.screenX, y: win.screenY, w: win.innerWidth, h: win.innerHeight };
    const timer = window.setInterval(() => {
      if (win.closed) {
        window.clearInterval(timer);
        setTarget(null);
        latest.current.onClosed?.();
        return;
      }
      const next = { x: win.screenX, y: win.screenY, w: win.innerWidth, h: win.innerHeight };
      if (Object.keys(next).some((key) => next[key] !== last[key])) {
        last = next;
        latest.current.onMove?.(next);
      }
    }, 700);
    // 主窗口刷新 / 关闭时先关掉小窗口：不然新页面再打开同名窗口会拿到这个旧窗口，内容被它重新加载冲掉
    const closeWithPage = () => {
      try { win.close(); } catch { /* 已经关了 */ }
    };
    window.addEventListener("pagehide", closeWithPage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", closeWithPage);
      setTarget(null);
      closeWithPage();
    };
  }, [open, id, title]);

  return target;
}

// 桌面小窗口里的卡片外壳：顶部一条标题条（按住拖动窗口），右边"放回"按钮
export function DeskCard({ target, id, label, shell, onReturn, children }) {
  React.useEffect(() => {
    target.doc.body.className = `${document.body.className} soft-desk-window`;
  });
  return createPortal(
    <RendererProvider renderer={target.renderer} targetDocument={target.doc}>
      <ReadyUI targetDocument={target.doc}>
        <div className={`${shell?.className || "app eagle-ui ready-ui ui-refresh soft-ui"} soft-desk-app`} style={shell?.style}>
          <section className="soft-desk-card" data-soft-desk={id} aria-label={`${label}卡片`}>
            <div className="soft-desk-bar">
              <span className="soft-desk-grip" aria-hidden="true" />
              <strong>{label}</strong>
              <button type="button" className="soft-desk-return" title="放回素材库窗口" onClick={onReturn}>
                <Undo2 size={13} /> 放回
              </button>
            </div>
            <div className="soft-desk-body">
              <ErrorBoundary compact onReset={onReturn}>{children}</ErrorBoundary>
            </div>
          </section>
        </div>
      </ReadyUI>
    </RendererProvider>,
    target.root,
  );
}
