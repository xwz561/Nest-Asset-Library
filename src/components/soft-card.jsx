import React from "react";
import { createPortal, flushSync } from "react-dom";
import { CARD_MARGIN, CARD_MIN_HEIGHT, canGoToDesk, cardLabel, cardLimits, cardStyle, clampDragPosition, edgeAt, edgeOrient, fitCardRect, naturalOrient, resolveOverlaps } from "../card-layout.js";
import { readViewport } from "../hooks/useCardLayout.js";
import { DeskCard, useDeskWindow } from "./desk-window.jsx";

const DRAG_THRESHOLD = 4;
// 浮动卡片的层级：70 起按叠放名次往上加，拖动中的放最上面；都低于详情面板（80）和右键菜单、弹窗
const Z_BASE = 69;
const Z_DRAGGING = 79;
const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
// 左上角是窗口的红黄绿三个按钮（Windows 页面自己画，macOS 系统画），卡片要让开这块
const WINDOW_LIGHTS_WIDTH = 84;
const WINDOW_LIGHTS_HEIGHT = 52;
const SNAP_CLASSES = ["soft-snap-top", "soft-snap-bottom", "soft-snap-left", "soft-snap-right"];
const px = (value) => (value === undefined || value === null ? undefined : `${Math.round(value)}px`);

// 位置写成 CSS 变量，由 soft-ui.css 里的 .soft-float-card / .soft-float-self 用 !important 读出来，
// 这样能压过旧主题给顶栏、工具栏写的 position / top / margin !important。
function positionVars(style, zIndex) {
  return {
    "--card-left": px(style.left),
    "--card-right": px(style.right),
    "--card-top": px(style.top),
    "--card-bottom": px(style.bottom),
    "--card-w": px(style.width),
    "--card-h": px(style.height),
    "--card-max-h": px(style.maxHeight),
    "--card-z": zIndex,
  };
}

// 一张可以拖走的卡片。平时锁定；打开"编辑布局"开关后，整张卡片都能抓住拖到窗口任意位置，
// 浮起来以后右下角可以拉大小，双击放回原位（编辑时卡片里的按钮暂不响应，免得误点）。
// - 默认（侧栏面板里的小卡片）：外面包一层 .soft-card-slot，浮起来时挂到浮层里，可以拖回侧栏面板。
// - self（图标栏、侧栏面板、顶栏、工具栏）：不包外层，直接在元素本身上原地浮起，旧样式照样生效。
export function SoftCard({ id, cards, className = "", self = false, children }) {
  const record = cards.layout[id];
  const [drag, setDrag] = React.useState(null);
  const rootRef = React.useRef(null);
  const session = React.useRef(null);
  const frame = React.useRef(0);
  const refocus = React.useRef(false);
  const label = cardLabel(id);
  const floating = Boolean(record || drag);
  // 只有侧栏面板里的小卡片能"拖回去"；骨架卡片双击或一键重置回原位
  const dockable = !self;
  // 疯狂模式：这张卡片在桌面上时，渲染进它自己的小窗口
  const deskBounds = cards.desk?.[id];
  const desk = useDeskWindow({ id, bounds: deskBounds, title: `${label} · 小旺仔素材库`, onClosed: () => cards.fromDesk(id), onMove: (bounds) => cards.moveDesk(id, bounds) });

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
    document.body.classList.remove("soft-card-dragging", "soft-card-resizing", "soft-card-tearing", ...SNAP_CLASSES);
    cards.dockRef.current?.classList.remove("soft-dock-target");
    session.current = null;
  }, [cards.dockRef]);

  React.useEffect(() => stop, [stop]);

  // 键盘挪动后卡片换了位置（侧栏 ↔ 浮层会重新挂载），把焦点还给小横条
  React.useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    rootRef.current?.querySelector(":scope > .soft-card-grip")?.focus();
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

  // 卡片完整显示需要多高：拉过高度的就是那个高度，否则是外框 + 里面滚动区多出来的部分
  const naturalHeight = (fallback, keepHeight = true) => {
    if (keepHeight && record?.h) return record.h;
    const el = rootRef.current;
    if (!el) return fallback;
    const overflow = (node) => Math.max(0, node.scrollHeight - node.clientHeight);
    const scrollers = [...el.querySelectorAll(".soft-float-body, .sidebar-scroll-content")].filter((node) => !node.closest(".soft-float-card") || node.closest(".soft-float-card") === el);
    return Math.ceil(el.offsetHeight + overflow(el) + scrollers.reduce((sum, node) => sum + overflow(node), 0));
  };
  const placeAt = (position, width, fallbackHeight, options = {}) => {
    const rect = fitCardRect(position, width, naturalHeight(fallbackHeight, options.h !== null), readViewport());
    cards.place(id, rect, { ...options, capped: rect.capped });
    return rect;
  };
  // 卡片不能互相遮挡：放下以后，把压到的其他浮动卡片挤开
  const pushOthers = (rect) => {
    const rects = { [id]: rect };
    for (const el of document.querySelectorAll(".soft-float-card, .soft-float-self")) {
      const other = el.dataset.softCard;
      if (!other || other === id) continue;
      const box = el.getBoundingClientRect();
      if (box.width && box.height) rects[other] = { left: box.left, top: box.top, width: box.width, height: box.height };
    }
    const moved = resolveOverlaps(id, rects, readViewport());
    if (Object.keys(moved).length) cards.placeMany(moved);
  };

  // 编辑时整张卡片都是把手；嵌在里面的另一张卡片（侧栏面板里的小卡片）归它自己管
  const isHandle = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!cards.editing || !target || !rootRef.current?.contains(target) || target.closest(".soft-float-resize")) return false;
    return target.closest("[data-soft-card]") === rootRef.current;
  };

  const beginMove = (event) => {
    if (event.button !== 0 || session.current) return;
    if (!isHandle(event)) {
      if (record && rootRef.current?.contains(event.target) && event.target.closest?.("[data-soft-card]") === rootRef.current) cards.front(id);
      return;
    }
    event.stopPropagation();
    if (record) cards.front(id);
    const box = rootRef.current.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY };
    // 拖动开始时的方向；鼠标靠近窗口边缘时换成那条边对应的方向（左右竖排、上下横排）
    const startOrient = (floating && record?.o) || naturalOrient(id);
    const grab = { x: start.x - box.left, y: start.y - box.top };
    const current = {
      pointerId: event.pointerId,
      moved: false,
      dock: false,
      edge: null,
      orient: startOrient,
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
        const viewport = readViewport();
        // 疯狂模式下拖出了窗口：松手就放到桌面上（这时不吸附窗口边缘）
        current.outside = Boolean(cards.crazy && canGoToDesk(id) && (move.clientX < 0 || move.clientY < 0 || move.clientX >= viewport.width || move.clientY >= viewport.height));
        document.body.classList.toggle("soft-card-tearing", current.outside);
        const edge = current.outside ? null : edgeAt(move.clientX, move.clientY, viewport);
        current.edge = edge;
        current.orient = edgeOrient(edge) || current.orient;
        const flipped = current.orient !== startOrient;
        // 换了方向卡片形状会变，改成抓着卡片左上角附近，免得卡片离鼠标太远
        const hold = flipped ? { x: Math.min(grab.x, 28), y: Math.min(grab.y, 20) } : grab;
        current.hold = hold;
        const size = rootRef.current?.getBoundingClientRect() || box;
        let left = move.clientX - hold.x, top = move.clientY - hold.y;
        if (edge === "top") top = CARD_MARGIN;
        if (edge === "bottom") top = viewport.height - CARD_MARGIN - size.height;
        if (edge === "left") left = CARD_MARGIN;
        if (edge === "right") left = viewport.width - CARD_MARGIN - size.width;
        current.position = clampDragPosition(left, top, flipped ? size.width : box.width, viewport);
        for (const name of SNAP_CLASSES) document.body.classList.toggle(name, name === `soft-snap-${edge}`);
        current.dock = dockable && !edge && overDock(move);
        setDockHint(current.dock);
        current.last = { ...current.position, width: flipped ? null : box.width, height: !flipped && record?.h ? box.height : null, orient: current.orient, edge };
        schedule(current.last);
      },
      onUp: (up) => {
        if (up.pointerId !== current.pointerId) return;
        stop();
        if (!current.moved) return;
        if (current.outside) {
          // 在窗口外松手：在鼠标位置开一个桌面小窗口（多留出标题条和内边距）
          const size = rootRef.current?.getBoundingClientRect() || box;
          const hold = current.hold || grab;
          const maxHeight = (window.screen?.availHeight || 1080) - 40;
          cards.toDesk(id, { x: up.screenX - hold.x - 12, y: up.screenY - hold.y - 44, w: Math.round(size.width + 24), h: Math.round(Math.min(maxHeight, size.height + 56)) });
          setDrag(null);
          return;
        }
        if (current.dock) cards.dock(id);
        else {
          // 先把最后一帧（可能刚换了方向）画出来，再按卡片实际尺寸算贴边位置
          if (current.last) flushSync(() => setDrag(current.last));
          const flipped = current.orient !== startOrient;
          const size = rootRef.current?.getBoundingClientRect() || box;
          const viewport = readViewport();
          const position = { ...current.position };
          if (current.edge === "right") position.left = viewport.width - CARD_MARGIN - size.width;
          if (current.edge === "bottom") position.top = viewport.height - CARD_MARGIN - size.height;
          if (/^(win32|darwin)$/.test(document.documentElement.dataset.platform || "") && position.left < WINDOW_LIGHTS_WIDTH && position.top < WINDOW_LIGHTS_HEIGHT) {
            if (current.edge === "left") position.top = WINDOW_LIGHTS_HEIGHT;
            else position.left = WINDOW_LIGHTS_WIDTH;
          }
          // 记下贴的是哪条边（贴边的卡片让素材区让位）；放在窗口中间就不算贴边
          const rect = placeAt(position, flipped ? size.width : box.width, size.height, { o: current.orient, e: current.edge, ...(flipped ? { h: null } : {}) });
          pushOthers(rect);
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
    const { minW, maxW } = cardLimits(id, record?.o);
    cards.front(id);
    const current = {
      pointerId: event.pointerId,
      size: { width: box.width, height: box.height },
      onMove: (move) => {
        if (move.pointerId !== current.pointerId) return;
        const viewport = readViewport();
        current.size = {
          width: Math.round(clamp(box.width + move.clientX - start.x, minW, Math.min(maxW, viewport.width - box.left - CARD_MARGIN))),
          height: Math.round(clamp(box.height + move.clientY - start.y, CARD_MIN_HEIGHT, viewport.height - box.top - CARD_MARGIN)),
        };
        document.body.classList.add("soft-card-resizing");
        schedule({ left: box.left, top: box.top, ...current.size });
      },
      onUp: (up) => {
        if (up.pointerId !== current.pointerId) return;
        stop();
        const rect = { left: box.left, top: box.top, ...current.size };
        cards.place(id, rect, { h: current.size.height });
        pushOthers(rect);
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
      event.stopPropagation();
      const box = rootRef.current.getBoundingClientRect();
      const position = clampDragPosition(box.left + delta[0], box.top + delta[1], box.width, readViewport());
      refocus.current = !record && !self;
      placeAt(position, box.width, box.height);
    } else if (event.key === "Enter" && record) {
      event.preventDefault();
      event.stopPropagation();
      refocus.current = !self;
      cards.dock(id);
    }
  };

  const grip = cards.editing && (
    <span
      key="soft-card-grip"
      className="soft-card-grip"
      role="button"
      tabIndex={0}
      aria-label={floating ? `移动「${label}」卡片，回车放回原处` : `移动「${label}」卡片`}
      title={floating ? (dockable ? "拖动换位置 · 拖回侧栏或双击放回原处" : "拖动换位置 · 双击放回原处") : "拖到窗口任意位置"}
      onKeyDown={onGripKey}
    />
  );
  const resize = floating && cards.editing && (
    <span key="soft-float-resize" className="soft-float-resize" aria-hidden="true" title="拖动调整大小" onPointerDown={beginResize} />
  );

  // 换了方向的卡片加 soft-orient-h / soft-orient-v，样式在 soft-ui.css 里按卡片分别写
  const orient = floating ? drag?.orient || record?.o : null;
  const orientClass = orient && orient !== naturalOrient(id) ? `soft-orient-${orient}` : "";
  const vars = floating
    ? positionVars(
        drag
          ? {
              left: drag.left,
              top: drag.top,
              width: drag.width ?? undefined,
              height: drag.height || undefined,
              // 贴底边时按整个窗口算最大高度：否则越往下拖卡片越矮，贴上去就锁成一条
              maxHeight: drag.edge === "bottom" ? cards.viewport.height - CARD_MARGIN * 2 : Math.max(48, cards.viewport.height - drag.top - CARD_MARGIN),
            }
          : cardStyle(record, cards.viewport, id),
        drag ? Z_DRAGGING : Z_BASE + (cards.order[id] || 1),
      )
    : null;

  if (deskBounds) {
    if (!desk) return null;
    const content = self
      ? React.cloneElement(React.Children.only(children), {
          "data-soft-card": id,
          className: [React.Children.only(children).props.className, "soft-card-self", "soft-desk-content", className].filter(Boolean).join(" "),
        })
      : children;
    return (
      <DeskCard target={desk} id={id} label={label} shell={cards.shellRef?.current} onReturn={() => cards.fromDesk(id)}>
        {content}
      </DeskCard>
    );
  }

  if (self) {
    const child = React.Children.only(children);
    const childRef = child.props.ref;
    const setRef = (node) => {
      rootRef.current = node;
      if (typeof childRef === "function") childRef(node);
      else if (childRef) childRef.current = node;
    };
    return React.cloneElement(
      child,
      {
        ref: setRef,
        "data-soft-card": id,
        className: [child.props.className, "soft-card-self", floating && "soft-float-self", orientClass, drag && "dragging", className].filter(Boolean).join(" "),
        style: vars ? { ...child.props.style, ...vars } : child.props.style,
        onPointerDown: (event) => {
          child.props.onPointerDown?.(event);
          beginMove(event);
        },
        onDoubleClick: (event) => {
          child.props.onDoubleClick?.(event);
          onDoubleClick(event);
        },
      },
      ...React.Children.toArray(child.props.children),
      grip,
      resize,
    );
  }

  if (!floating || !cards.layer) {
    return (
      <div ref={rootRef} className={`soft-card-slot ${className}`} data-soft-card={id} onPointerDown={beginMove}>
        {grip}
        {children}
      </div>
    );
  }

  return createPortal(
    <section
      ref={rootRef}
      className={`soft-float-card ${orientClass} ${drag ? "dragging" : ""} ${className}`}
      data-soft-card={id}
      aria-label={`${label}卡片`}
      style={vars}
      onPointerDown={beginMove}
      onDoubleClick={onDoubleClick}
    >
      {grip}
      <div className="soft-float-body">{children}</div>
      {resize}
    </section>,
    cards.layer,
  );
}
