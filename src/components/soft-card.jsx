import React from "react";
import { createPortal } from "react-dom";
import { CARD_MARGIN, CARD_MAX_WIDTH, CARD_MIN_HEIGHT, CARD_MIN_WIDTH, cardLabel, cardStyle, clampDragPosition, fitCardRect } from "../card-layout.js";
import { readViewport } from "../hooks/useCardLayout.js";

const DRAG_THRESHOLD = 4;
const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

// 侧栏里一张可以拖走的卡片。平时锁定；打开"编辑布局"开关后，整张卡片都能抓住拖到窗口任意位置，
// 拖回侧栏或双击放回原位，浮起来以后右下角可以拉大小（编辑时卡片里的按钮暂不响应，免得误点）。
export function SoftCard({ id, cards, className = "", children }) {
  const record = cards.layout[id];
  const [drag, setDrag] = React.useState(null);
  const rootRef = React.useRef(null);
  const session = React.useRef(null);
  const frame = React.useRef(0);
  const refocus = React.useRef(false);
  const label = cardLabel(id);
  const floating = Boolean(record || drag);

  const setDockHint = (on) => cards.dockRef.current?.classList.toggle("soft-dock-target", on);
  const overDock = (event) => {
    const box = cards.dockRef.current?.getBoundingClientRect();
    return Boolean(box && event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom);
  };

  const stop = React.useCallback(() => {
    const current = session.current;
    if (!current) return;
    window.removeEventListener("pointermove", current.onMove);
    window.removeEventListener("pointerup", current.onUp);
    window.removeEventListener("pointercancel", current.onCancel);
    window.removeEventListener("keydown", current.onKey, true);
    cancelAnimationFrame(frame.current);
    document.body.classList.remove("soft-card-dragging", "soft-card-resizing");
    cards.dockRef.current?.classList.remove("soft-dock-target");
    session.current = null;
  }, [cards.dockRef]);

  React.useEffect(() => stop, [stop]);

  // 键盘挪动后卡片换了位置（侧栏 ↔ 浮层会重新挂载），把焦点还给小横条
  React.useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    rootRef.current?.querySelector(".soft-card-grip")?.focus();
  });

  const listen = (current) => {
    session.current = current;
    window.addEventListener("pointermove", current.onMove);
    window.addEventListener("pointerup", current.onUp);
    window.addEventListener("pointercancel", current.onCancel);
    window.addEventListener("keydown", current.onKey, true);
  };

  const schedule = (next) => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setDrag(next));
  };

  const cancel = () => {
    stop();
    setDrag(null);
  };

  // 卡片完整显示需要多高：拉过高度的就是那个高度，否则是外框 + 全部内容
  const naturalHeight = (fallback) => {
    if (record?.h) return record.h;
    const el = rootRef.current;
    if (!el) return fallback;
    const body = el.querySelector(".soft-float-body");
    return Math.ceil(body ? el.offsetHeight - body.clientHeight + body.scrollHeight : el.offsetHeight);
  };
  const placeAt = (position, width, fallbackHeight) => {
    const rect = fitCardRect(position, width, naturalHeight(fallbackHeight), readViewport());
    cards.place(id, rect, { capped: rect.capped });
  };

  const isHandle = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    return Boolean(cards.editing && target && rootRef.current?.contains(target) && !target.closest(".soft-float-resize"));
  };

  const beginMove = (event) => {
    if (event.button !== 0 || session.current) return;
    if (record) cards.front(id);
    if (!isHandle(event)) return;
    const box = rootRef.current.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY };
    const current = {
      pointerId: event.pointerId,
      moved: false,
      dock: false,
      position: { left: box.left, top: box.top },
      onMove: (move) => {
        if (move.pointerId !== current.pointerId) return;
        const dx = move.clientX - start.x, dy = move.clientY - start.y;
        if (!current.moved) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
          current.moved = true;
          document.body.classList.add("soft-card-dragging");
          window.getSelection?.()?.removeAllRanges();
        }
        current.position = clampDragPosition(box.left + dx, box.top + dy, box.width, readViewport());
        current.dock = overDock(move);
        setDockHint(current.dock);
        schedule({ ...current.position, width: box.width, height: record?.h ? box.height : null });
      },
      onUp: (up) => {
        if (up.pointerId !== current.pointerId) return;
        stop();
        if (!current.moved) return;
        if (current.dock) cards.dock(id);
        else {
          placeAt(current.position, box.width, box.height);
        }
        setDrag(null);
      },
      onCancel: cancel,
      onKey: (key) => {
        if (key.key !== "Escape") return;
        key.preventDefault();
        key.stopPropagation();
        cancel();
      },
    };
    listen(current);
  };

  const beginResize = (event) => {
    if (event.button !== 0 || session.current || !cards.editing) return;
    event.preventDefault();
    event.stopPropagation();
    const box = rootRef.current.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY };
    cards.front(id);
    const current = {
      pointerId: event.pointerId,
      size: { width: box.width, height: box.height },
      onMove: (move) => {
        if (move.pointerId !== current.pointerId) return;
        const viewport = readViewport();
        current.size = {
          width: Math.round(clamp(box.width + move.clientX - start.x, CARD_MIN_WIDTH, Math.min(CARD_MAX_WIDTH, viewport.width - box.left - CARD_MARGIN))),
          height: Math.round(clamp(box.height + move.clientY - start.y, CARD_MIN_HEIGHT, viewport.height - box.top - CARD_MARGIN)),
        };
        document.body.classList.add("soft-card-resizing");
        schedule({ left: box.left, top: box.top, ...current.size });
      },
      onUp: (up) => {
        if (up.pointerId !== current.pointerId) return;
        stop();
        cards.place(id, { left: box.left, top: box.top, ...current.size }, { h: current.size.height });
        setDrag(null);
      },
      onCancel: cancel,
      onKey: (key) => {
        if (key.key !== "Escape") return;
        key.preventDefault();
        key.stopPropagation();
        cancel();
      },
    };
    listen(current);
  };

  const onDoubleClick = (event) => {
    if (record && isHandle(event)) cards.dock(id);
  };

  const onGripKey = (event) => {
    if (!cards.editing) return;
    const step = event.shiftKey ? 40 : 10;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (delta) {
      event.preventDefault();
      const box = rootRef.current.getBoundingClientRect();
      const position = clampDragPosition(box.left + delta[0], box.top + delta[1], box.width, readViewport());
      refocus.current = !record;
      placeAt(position, box.width, box.height);
    } else if (event.key === "Enter" && record) {
      event.preventDefault();
      refocus.current = true;
      cards.dock(id);
    }
  };

  const grip = cards.editing && (
    <span
      className="soft-card-grip"
      role="button"
      tabIndex={0}
      aria-label={floating ? `移动「${label}」卡片，回车放回侧栏` : `移动「${label}」卡片`}
      title={floating ? "拖动换位置 · 拖回侧栏或双击放回原处" : "拖到窗口任意位置"}
      onKeyDown={onGripKey}
    />
  );

  if (!floating || !cards.layer) {
    return (
      <div ref={rootRef} className={`soft-card-slot ${className}`} data-soft-card={id} onPointerDown={beginMove}>
        {grip}
        {children}
      </div>
    );
  }

  const style = drag
    ? { left: drag.left, top: drag.top, width: drag.width, ...(drag.height ? { height: drag.height } : {}), maxHeight: Math.max(48, cards.viewport.height - drag.top - CARD_MARGIN) }
    : cardStyle(record, cards.viewport);
  return createPortal(
    <section
      ref={rootRef}
      className={`soft-float-card ${drag ? "dragging" : ""} ${className}`}
      data-soft-card={id}
      aria-label={`${label}卡片`}
      style={{ ...style, zIndex: drag ? 99 : cards.order[id] || 1 }}
      onPointerDown={beginMove}
      onDoubleClick={onDoubleClick}
    >
      {grip}
      <div className="soft-float-body">{children}</div>
      {cards.editing && <span className="soft-float-resize" aria-hidden="true" title="拖动调整大小" onPointerDown={beginResize} />}
    </section>,
    cards.layer,
  );
}
