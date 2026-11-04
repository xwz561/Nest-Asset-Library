// 侧栏卡片自由摆放：哪些卡片能拖、位置怎么记、窗口缩放后怎么摆回可见区域。
// 一张卡片没有记录 = 在侧栏里（默认位置）；有记录 = 浮在窗口上。
export const CARD_LAYOUT_KEY = "nest-card-layout-v1";

export const LAYOUT_CARDS = [
  { id: "library", label: "资源库" },
  { id: "import", label: "导入" },
  { id: "folders", label: "文件夹" },
  { id: "tags", label: "标签" },
  { id: "disk", label: "磁盘" },
];

export const CARD_MARGIN = 8;
export const CARD_MIN_WIDTH = 200;
export const CARD_MAX_WIDTH = 640;
export const CARD_MIN_HEIGHT = 64;
// 卡片至少留这么高在窗口里，保证标题还能抓到
const CARD_VISIBLE = 48;

const validIds = new Set(LAYOUT_CARDS.map(({ id }) => id));
const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

export function cardLabel(id) {
  return LAYOUT_CARDS.find((card) => card.id === id)?.label || id;
}

export function normalizeCardLayout(value) {
  const result = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [id, raw] of Object.entries(value)) {
    if (!validIds.has(id) || !raw || typeof raw !== "object") continue;
    const dx = num(raw.dx), dy = num(raw.dy), w = num(raw.w);
    if (dx === null || dy === null || w === null) continue;
    const h = num(raw.h);
    result[id] = {
      x: raw.x === "right" ? "right" : "left",
      y: raw.y === "bottom" ? "bottom" : "top",
      dx: Math.max(0, Math.round(dx)),
      dy: Math.max(0, Math.round(dy)),
      w: Math.round(clamp(w, CARD_MIN_WIDTH, CARD_MAX_WIDTH)),
      h: h === null ? null : Math.round(Math.max(CARD_MIN_HEIGHT, h)),
      z: num(raw.z) ?? 0,
    };
  }
  return result;
}

export function loadCardLayout(storage = globalThis.localStorage) {
  try {
    return normalizeCardLayout(JSON.parse(storage?.getItem(CARD_LAYOUT_KEY) || "null"));
  } catch {
    return {};
  }
}

export function saveCardLayout(layout, storage = globalThis.localStorage) {
  try {
    if (Object.keys(layout).length) storage?.setItem(CARD_LAYOUT_KEY, JSON.stringify(layout));
    else storage?.removeItem(CARD_LAYOUT_KEY);
  } catch {
    // 存不下时本次运行照样能拖，只是下次启动回到默认位置
  }
}

const topZ = (layout) => Object.values(layout).reduce((max, card) => Math.max(max, card.z || 0), 0);

// 把屏幕上的矩形记成"离最近的左/右边多远、离最近的上/下边多远"，
// 这样窗口变大变小时，放在右下角的卡片还贴着右下角。
// 贴底边的卡片内容变多会往上长，所以只有完整显示（没被截断）的卡片才贴底边；
// 内容比可用高度还长的卡片（比如展开很多的文件夹树）一律贴顶边，放在哪就停在哪。
export function anchorCard(rect, viewport, { h = null, capped = false } = {}) {
  const width = clamp(Math.round(rect.width), CARD_MIN_WIDTH, CARD_MAX_WIDTH);
  const right = viewport.width - (rect.left + rect.width);
  const bottom = viewport.height - (rect.top + rect.height);
  const toRight = rect.left + rect.width / 2 > viewport.width / 2;
  const toBottom = bottom >= 0 && bottom < rect.top && (!capped || h !== null);
  return {
    x: toRight ? "right" : "left",
    dx: Math.max(0, Math.round(toRight ? right : rect.left)),
    y: toBottom ? "bottom" : "top",
    dy: Math.max(0, Math.round(toBottom ? bottom : rect.top)),
    w: width,
    h: h === null ? null : Math.round(Math.max(CARD_MIN_HEIGHT, h)),
  };
}

export function placeCard(layout, id, rect, viewport, options = {}) {
  if (!validIds.has(id)) return layout;
  const previous = layout[id];
  const h = "h" in options ? options.h : previous?.h ?? null;
  return { ...layout, [id]: { ...anchorCard(rect, viewport, { h, capped: Boolean(options.capped) }), z: topZ(layout) + 1 } };
}

export function dockCard(layout, id) {
  if (!(id in layout)) return layout;
  const next = { ...layout };
  delete next[id];
  return next;
}

export function bringCardToFront(layout, id) {
  const card = layout[id];
  if (!card) return layout;
  const z = topZ(layout);
  if (card.z === z && Object.values(layout).filter((other) => other.z === z).length === 1) return layout;
  return { ...layout, [id]: { ...card, z: z + 1 } };
}

// 浮动卡片在窗口里的实际位置：宽度不超过窗口，始终留在可见范围内。
export function cardStyle(card, viewport) {
  const room = Math.max(0, viewport.width - CARD_MARGIN * 2);
  const width = Math.round(Math.min(clamp(card.w, CARD_MIN_WIDTH, CARD_MAX_WIDTH), room));
  const dx = Math.round(clamp(card.dx, CARD_MARGIN, viewport.width - width - CARD_MARGIN));
  const dy = Math.round(clamp(card.dy, CARD_MARGIN, viewport.height - CARD_VISIBLE));
  const maxHeight = Math.max(CARD_VISIBLE, viewport.height - dy - CARD_MARGIN);
  const style = { width, maxHeight };
  style[card.x === "right" ? "right" : "left"] = dx;
  style[card.y === "bottom" ? "bottom" : "top"] = dy;
  if (card.h) style.height = Math.min(card.h, maxHeight);
  return style;
}

// 拖动过程中用的绝对位置，同样不让卡片整个跑出窗口
export function clampDragPosition(left, top, width, viewport) {
  return {
    left: Math.round(clamp(left, CARD_MARGIN - width + CARD_VISIBLE, viewport.width - CARD_VISIBLE)),
    top: Math.round(clamp(top, CARD_MARGIN, viewport.height - CARD_VISIBLE)),
  };
}

// 放手时把卡片收进窗口：放得下的整张露出来（往里推），
// 比窗口还高的就停在放手的位置，多出来的在卡片里滚动。
export function fitCardRect(position, width, naturalHeight, viewport) {
  const w = Math.min(width, Math.max(0, viewport.width - CARD_MARGIN * 2));
  const room = Math.max(CARD_VISIBLE, viewport.height - CARD_MARGIN * 2);
  const left = Math.round(clamp(position.left, CARD_MARGIN, viewport.width - w - CARD_MARGIN));
  if (naturalHeight <= room) {
    const top = Math.round(clamp(position.top, CARD_MARGIN, viewport.height - CARD_MARGIN - naturalHeight));
    return { left, top, width: w, height: naturalHeight, capped: false };
  }
  const top = Math.round(clamp(position.top, CARD_MARGIN, viewport.height - CARD_VISIBLE));
  return { left, top, width: w, height: Math.max(CARD_VISIBLE, viewport.height - top - CARD_MARGIN), capped: true };
}

// 叠放顺序：最后拖过的在最上面，按名次给 1..n
export function cardStackOrder(layout) {
  return Object.entries(layout)
    .sort(([, a], [, b]) => (a.z || 0) - (b.z || 0))
    .reduce((order, [id], index) => ({ ...order, [id]: index + 1 }), {});
}

// 两份摆放是否一样（编辑时用来判断"有改动还没保存"）；叠放顺序只比先后，不比具体数字
export function sameCardLayout(a, b) {
  const ids = Object.keys(a || {}).sort();
  if (ids.join() !== Object.keys(b || {}).sort().join()) return false;
  const fields = ["x", "y", "dx", "dy", "w", "h"];
  if (!ids.every((id) => fields.every((field) => a[id][field] === b[id][field]))) return false;
  const orderA = cardStackOrder(a), orderB = cardStackOrder(b);
  return ids.every((id) => orderA[id] === orderB[id]);
}

export function allCardsFloating(layout, availableIds) {
  return availableIds.length > 0 && availableIds.every((id) => id in layout);
}
