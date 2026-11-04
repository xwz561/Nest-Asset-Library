// 界面卡片自由摆放：哪些卡片能拖、位置怎么记、窗口缩放后怎么摆回可见区域。
// 一张卡片没有记录 = 在默认位置；有记录 = 浮在窗口上。
// frame 卡片是界面骨架（图标栏、侧栏面板、顶栏、工具栏），原地浮起来；
// 其余五张是侧栏面板里的小卡片，浮起来时挂到浮层里，可以拖回侧栏面板。
export const CARD_LAYOUT_KEY = "nest-card-layout-v1";

// orient：卡片本来的方向（v 竖排 / h 横排）。拖到窗口左右边缘会变成竖排，拖到顶部或底部变成横排。
// limits：横排、竖排各自的宽度上下限 [最小, 最大]
export const LAYOUT_CARDS = [
  { id: "rail", label: "图标栏", frame: true, orient: "v", limits: { v: [56, 120], h: [200, 2400] } },
  { id: "panel", label: "侧栏面板", frame: true, orient: "v", limits: { h: [400, 2400] } },
  { id: "library", label: "资源库", orient: "h" },
  { id: "import", label: "导入", orient: "v" },
  { id: "folders", label: "文件夹", orient: "v" },
  { id: "tags", label: "标签", orient: "v" },
  { id: "disk", label: "磁盘", orient: "h" },
  { id: "header", label: "顶栏", frame: true, orient: "h", limits: { h: [360, 2400], v: [200, 480] } },
  { id: "toolbar", label: "工具栏", frame: true, orient: "h", limits: { h: [320, 2400], v: [160, 400] } },
];
export const PANEL_CARDS = LAYOUT_CARDS.filter((card) => !card.frame).map(({ id }) => id);

export const CARD_MARGIN = 8;
export const CARD_MIN_WIDTH = 200;
export const CARD_MAX_WIDTH = 640;
export const CARD_MIN_HEIGHT = 64;
// 卡片至少留这么高在窗口里，保证标题还能抓到
const CARD_VISIBLE = 48;
// 拖动时鼠标离窗口边缘这么近，就吸附到那条边并换方向
export const EDGE_SNAP = 56;
// 卡片之间互相挤开时留的缝
export const CARD_GAP = 8;
const EDGES = ["top", "bottom", "left", "right"];

const validIds = new Set(LAYOUT_CARDS.map(({ id }) => id));
const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

export function cardLabel(id) {
  return LAYOUT_CARDS.find((card) => card.id === id)?.label || id;
}

export function naturalOrient(id) {
  return LAYOUT_CARDS.find((card) => card.id === id)?.orient || "v";
}

// 每张卡片在某个方向上的宽度上下限：竖着的图标栏很窄，顶栏和工具栏很宽，其余用默认值
export function cardLimits(id, orient) {
  const card = LAYOUT_CARDS.find((item) => item.id === id);
  const o = orient || card?.orient || "v";
  const [minW, maxW] = card?.limits?.[o] || (o === "h" ? [CARD_MIN_WIDTH, 1200] : [CARD_MIN_WIDTH, CARD_MAX_WIDTH]);
  return { minW, maxW };
}

// 鼠标靠近哪条窗口边：返回 top / bottom / left / right，都不靠近返回 null（取最近的那条）
export function edgeAt(x, y, viewport) {
  const distances = [["top", y], ["bottom", viewport.height - y], ["left", x], ["right", viewport.width - x]].filter(([, d]) => d <= EDGE_SNAP);
  if (!distances.length) return null;
  return distances.sort((a, b) => a[1] - b[1])[0][0];
}

export const edgeOrient = (edge) => (edge === "top" || edge === "bottom" ? "h" : edge === "left" || edge === "right" ? "v" : null);

export function normalizeCardLayout(value) {
  const result = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [id, raw] of Object.entries(value)) {
    if (!validIds.has(id) || !raw || typeof raw !== "object") continue;
    const dx = num(raw.dx), dy = num(raw.dy), w = num(raw.w);
    if (dx === null || dy === null || w === null) continue;
    const h = num(raw.h);
    const o = (raw.o === "h" || raw.o === "v") && raw.o !== naturalOrient(id) ? raw.o : undefined;
    const e = EDGES.includes(raw.e) ? raw.e : undefined;
    const { minW, maxW } = cardLimits(id, o);
    result[id] = {
      x: raw.x === "right" ? "right" : "left",
      y: raw.y === "bottom" ? "bottom" : "top",
      dx: Math.max(0, Math.round(dx)),
      dy: Math.max(0, Math.round(dy)),
      w: Math.round(clamp(w, minW, maxW)),
      h: h === null ? null : Math.round(Math.max(CARD_MIN_HEIGHT, h)),
      z: num(raw.z) ?? 0,
      ...(o ? { o } : {}),
      ...(e ? { e } : {}),
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
export function anchorCard(rect, viewport, { h = null, capped = false, id, o } = {}) {
  const { minW, maxW } = cardLimits(id, o);
  const width = clamp(Math.round(rect.width), minW, maxW);
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
  // 方向：这次给了就用这次的，否则沿用之前的；和本来方向一样就不记
  const wanted = "o" in options ? options.o : previous?.o;
  const o = wanted && wanted !== naturalOrient(id) ? wanted : undefined;
  // 贴着哪条窗口边（贴边的卡片会让素材区让位）：这次给了就用这次的（null = 不贴边），否则沿用
  const edge = "e" in options ? options.e : previous?.e;
  const e = EDGES.includes(edge) ? edge : undefined;
  const z = options.keepZ && previous ? previous.z : topZ(layout) + 1;
  return { ...layout, [id]: { ...anchorCard(rect, viewport, { h, capped: Boolean(options.capped), id, o }), z, ...(o ? { o } : {}), ...(e ? { e } : {}) } };
}

// 一次挪好几张卡片（被挤开的那些），叠放顺序不变；被挤离了原来贴的那条边，就不再算贴边
export function placeCards(layout, updates, viewport) {
  return Object.entries(updates).reduce((next, [id, rect]) => {
    const bottom = rect.top + rect.height >= viewport.height - CARD_MARGIN - 1;
    const touches = { top: rect.top <= CARD_MARGIN + 1, bottom, left: rect.left <= CARD_MARGIN + 1, right: rect.left + rect.width >= viewport.width - CARD_MARGIN - 1 };
    const edge = next[id]?.e;
    return placeCard(next, id, rect, viewport, { keepZ: true, capped: bottom, e: edge && touches[edge] ? edge : null });
  }, layout);
}

const overlaps = (a, b) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

// 卡片不能互相遮挡：刚放下的卡片不动，压到的卡片往上下左右里挪得最少、又不出窗口、
// 不压到已经摆好的卡片的方向推开；被推开的卡片再去推它压到的卡片（每张最多推一次）。
// rects: { id: {left, top, width, height} }（窗口坐标），返回被挪动的卡片的新位置。
export function resolveOverlaps(movedId, rects, viewport) {
  const current = Object.fromEntries(Object.entries(rects).map(([id, rect]) => [id, { ...rect }]));
  if (!current[movedId]) return {};
  const settled = new Set([movedId]);
  const moved = new Set();
  const queue = [movedId];
  const inside = (r) => r.left >= CARD_MARGIN && r.top >= CARD_MARGIN && r.left + r.width <= viewport.width - CARD_MARGIN && r.top + r.height <= viewport.height - CARD_MARGIN;
  let guard = 0;
  while (queue.length && guard++ < 200) {
    const pusher = current[queue.shift()];
    for (const [id, card] of Object.entries(current)) {
      if (settled.has(id) || !overlaps(pusher, card)) continue;
      const options = [
        { left: pusher.left - card.width - CARD_GAP, top: card.top },
        { left: pusher.left + pusher.width + CARD_GAP, top: card.top },
        { left: card.left, top: pusher.top - card.height - CARD_GAP },
        { left: card.left, top: pusher.top + pusher.height + CARD_GAP },
      ].map((pos) => {
        const rect = { ...card, ...pos };
        return { rect, cost: Math.abs(pos.left - card.left) + Math.abs(pos.top - card.top), fits: inside(rect), clear: [...settled].every((other) => !overlaps(rect, current[other])) };
      });
      // 四个方向都放不下又不压别人时，在窗口里按网格找离原位最近的空位
      const clearOf = (rect) => [...settled].every((other) => !overlaps(rect, current[other]));
      let pick = options.filter((o) => o.fits && o.clear).sort((a, b) => a.cost - b.cost)[0];
      if (!pick) {
        for (let top = CARD_MARGIN; top + card.height <= viewport.height - CARD_MARGIN; top += 16) {
          for (let left = CARD_MARGIN; left + card.width <= viewport.width - CARD_MARGIN; left += 16) {
            const rect = { ...card, left, top };
            const cost = Math.abs(left - card.left) + Math.abs(top - card.top);
            if ((!pick || cost < pick.cost) && clearOf(rect)) pick = { rect, cost };
          }
        }
      }
      pick = pick || options.filter((o) => o.fits).sort((a, b) => a.cost - b.cost)[0] || options.sort((a, b) => a.cost - b.cost)[0];
      const rect = pick.rect;
      rect.left = Math.round(clamp(rect.left, CARD_MARGIN, viewport.width - rect.width - CARD_MARGIN));
      rect.top = Math.round(clamp(rect.top, CARD_MARGIN, viewport.height - rect.height - CARD_MARGIN));
      current[id] = rect;
      settled.add(id);
      moved.add(id);
      queue.push(id);
    }
  }
  return Object.fromEntries([...moved].map((id) => [id, current[id]]));
}

// 没贴边的浮动卡片从哪条边让位：分别算从上 / 下 / 左 / 右让位要让出窗口的几成，选让得最少的那条边
// （又宽又扁、靠上的顶栏就从上边让位，而不是因为离右边近就从右边让出一整块）
export function nearestEdge(rect, viewport) {
  const cost = [
    ["top", (rect.top + rect.height) / viewport.height],
    ["bottom", (viewport.height - rect.top) / viewport.height],
    ["left", (rect.left + rect.width) / viewport.width],
    ["right", (viewport.width - rect.left) / viewport.width],
  ];
  return cost.sort((a, b) => a[1] - b[1])[0][0];
}

// 素材区至少留这么大，浮动卡片再多也不会把它挤没
export const CONTENT_MIN = { width: 360, height: 240 };

// 浮动卡片占掉窗口四周多少：每张卡片从它贴着（或最靠近）的那条边让出空间，返回四条边各要让出的宽度。
// 让得太多、素材区不够 CONTENT_MIN 时，按比例缩小两边的让位（reserved：侧栏等本来就占着的宽高）。
export function dockInsets(cards, viewport, reserved = { width: 0, height: 0 }) {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const { edge: wanted, rect } of cards) {
    if (!rect || !rect.width || !rect.height) continue;
    const edge = wanted || nearestEdge(rect, viewport);
    if (edge === "top") insets.top = Math.max(insets.top, Math.round(rect.top + rect.height));
    if (edge === "bottom") insets.bottom = Math.max(insets.bottom, Math.round(viewport.height - rect.top));
    if (edge === "left") insets.left = Math.max(insets.left, Math.round(rect.left + rect.width));
    if (edge === "right") insets.right = Math.max(insets.right, Math.round(viewport.width - rect.left));
  }
  const fit = (a, b, room) => {
    const total = insets[a] + insets[b];
    if (total <= room || total <= 0) return;
    const scale = Math.max(0, room) / total;
    insets[a] = Math.floor(insets[a] * scale);
    insets[b] = Math.floor(insets[b] * scale);
  };
  fit("left", "right", viewport.width - CONTENT_MIN.width - (reserved.width || 0));
  fit("top", "bottom", viewport.height - CONTENT_MIN.height - (reserved.height || 0));
  return insets;
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
export function cardStyle(card, viewport, id) {
  const { minW, maxW } = cardLimits(id, card.o);
  const room = Math.max(0, viewport.width - CARD_MARGIN * 2);
  const width = Math.round(Math.min(clamp(card.w, minW, maxW), room));
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
  const fields = ["x", "y", "dx", "dy", "w", "h", "o", "e"];
  if (!ids.every((id) => fields.every((field) => a[id][field] === b[id][field]))) return false;
  const orderA = cardStackOrder(a), orderB = cardStackOrder(b);
  return ids.every((id) => orderA[id] === orderB[id]);
}

// 疯狂模式：拖到桌面上的卡片（屏幕坐标），以及开关本身。顶栏的样式离不开素材区，不能拖到桌面
export const CARD_DESK_KEY = "nest-card-desk-v1";
export const CARD_CRAZY_KEY = "nest-card-crazy-v1";
export const canGoToDesk = (id) => validIds.has(id) && id !== "header";

export function normalizeDeskCards(value) {
  const result = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [id, raw] of Object.entries(value)) {
    if (!canGoToDesk(id) || !raw || typeof raw !== "object") continue;
    const x = num(raw.x), y = num(raw.y), w = num(raw.w), h = num(raw.h);
    if ([x, y, w, h].some((v) => v === null)) continue;
    result[id] = { x: Math.round(x), y: Math.round(y), w: Math.round(clamp(w, 120, 2400)), h: Math.round(clamp(h, 64, 2000)) };
  }
  return result;
}

export function loadDeskCards(storage = globalThis.localStorage) {
  try {
    return normalizeDeskCards(JSON.parse(storage?.getItem(CARD_DESK_KEY) || "null"));
  } catch {
    return {};
  }
}

export function allCardsFloating(layout, availableIds) {
  return availableIds.length > 0 && availableIds.every((id) => id in layout);
}
