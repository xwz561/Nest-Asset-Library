const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const layoutModule = () => import(pathToFileURL(path.join(root, 'src', 'card-layout.js')).href);
const viewport = { width: 1440, height: 900 };

const memoryStorage = () => {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k), data };
};

test('卡片放下后记住离最近两条边的距离：左上角的贴左上，右下角的贴右下', async () => {
  const { anchorCard } = await layoutModule();
  assert.deepEqual(anchorCard({ left: 120, top: 80, width: 260, height: 300 }, viewport), { x: 'left', dx: 120, y: 'top', dy: 80, w: 260, h: null });
  assert.deepEqual(anchorCard({ left: 1100, top: 560, width: 300, height: 280 }, viewport), { x: 'right', dx: 40, y: 'bottom', dy: 60, w: 300, h: null });
  // 长卡片（内容被截断，或者下边缘出了窗口）放在哪就停在哪：贴顶边，不会往上长满整个窗口
  assert.deepEqual(anchorCard({ left: 794, top: 284, width: 306, height: 608 }, viewport, { capped: true }), { x: 'right', dx: 340, y: 'top', dy: 284, w: 306, h: null });
  assert.equal(anchorCard({ left: 794, top: 284, width: 306, height: 884 }, viewport).y, 'top');
  // 拉过高度的卡片高度固定，贴底边没问题
  assert.equal(anchorCard({ left: 794, top: 284, width: 306, height: 608 }, viewport, { capped: true, h: 608 }).y, 'bottom');
  // 宽度有上下限
  assert.equal(anchorCard({ left: 0, top: 0, width: 80, height: 80 }, viewport).w, 200);
  assert.equal(anchorCard({ left: 0, top: 0, width: 2000, height: 80 }, viewport).w, 640);
});

test('窗口变小后卡片不会跑出窗口，也不会比窗口还宽', async () => {
  const { cardStyle } = await layoutModule();
  const card = { x: 'left', dx: 1200, y: 'top', dy: 860, w: 300, h: 500, z: 1 };
  const small = { width: 900, height: 600 };
  const style = cardStyle(card, small);
  assert.equal(style.width, 300);
  assert.equal(style.left, 900 - 300 - 8, '右边缘留 8px');
  assert.equal(style.top, 600 - 48, '至少露出 48px 的标题');
  assert.equal(style.maxHeight, 48);
  assert.equal(style.height, 48, '固定高度也不超过可用高度');
  const narrow = cardStyle({ ...card, w: 600 }, { width: 400, height: 600 });
  assert.equal(narrow.width, 384);
  // 贴右下的卡片用 right/bottom 定位，窗口变大时跟着右下角走
  const anchored = cardStyle({ x: 'right', dx: 40, y: 'bottom', dy: 60, w: 300, h: null, z: 1 }, viewport);
  assert.deepEqual(anchored, { width: 300, maxHeight: 900 - 60 - 8, right: 40, bottom: 60 });
});

test('放手时：放得下的卡片整张推进窗口，比窗口还高的停在原处、在卡片里滚动', async () => {
  const { fitCardRect } = await layoutModule();
  // 磁盘卡片拖到右下角太靠外：往里推到完整露出
  assert.deepEqual(fitCardRect({ left: 1188, top: 815 }, 314, 98, viewport), { left: 1440 - 314 - 8, top: 900 - 8 - 98, width: 314, height: 98, capped: false });
  // 很长的文件夹树：顶边停在放手的位置
  assert.deepEqual(fitCardRect({ left: 794, top: 276 }, 306, 2400, viewport), { left: 794, top: 276, width: 306, height: 900 - 276 - 8, capped: true });
  // 拖到窗口外面也拉得回来
  assert.deepEqual(fitCardRect({ left: -500, top: -40 }, 260, 200, viewport), { left: 8, top: 8, width: 260, height: 200, capped: false });
});

test('放下、放回、置顶和叠放顺序', async () => {
  const { placeCard, dockCard, bringCardToFront, cardStackOrder, allCardsFloating } = await layoutModule();
  let layout = {};
  layout = placeCard(layout, 'folders', { left: 300, top: 100, width: 260, height: 400 }, viewport);
  layout = placeCard(layout, 'tags', { left: 320, top: 140, width: 240, height: 200 }, viewport);
  assert.deepEqual(cardStackOrder(layout), { folders: 1, tags: 2 });
  layout = bringCardToFront(layout, 'folders');
  assert.deepEqual(cardStackOrder(layout), { tags: 1, folders: 2 });
  assert.equal(bringCardToFront(layout, 'folders'), layout, '已经在最上面就不改');
  // 再次移动保留之前拉过的高度；拉大小时更新高度
  layout = placeCard(layout, 'tags', { left: 320, top: 140, width: 240, height: 333 }, viewport, { h: 333 });
  layout = placeCard(layout, 'tags', { left: 500, top: 100, width: 240, height: 333 }, viewport);
  assert.equal(layout.tags.h, 333);
  assert.equal(placeCard(layout, 'unknown', { left: 0, top: 0, width: 200, height: 100 }, viewport), layout, '不认识的卡片不记');
  assert.equal(allCardsFloating(layout, ['folders', 'tags']), true);
  assert.equal(allCardsFloating(layout, ['folders', 'tags', 'import']), false);
  assert.equal(allCardsFloating({}, []), false);
  layout = dockCard(layout, 'folders');
  assert.deepEqual(Object.keys(layout), ['tags']);
  assert.equal(dockCard(layout, 'folders'), layout);
});

test('保存和读取：坏数据丢掉，空布局不留存储', async () => {
  const { CARD_LAYOUT_KEY, loadCardLayout, saveCardLayout, normalizeCardLayout } = await layoutModule();
  const storage = memoryStorage();
  assert.deepEqual(loadCardLayout(storage), {});
  saveCardLayout({ disk: { x: 'right', dx: 20, y: 'bottom', dy: 20, w: 240, h: null, z: 3 } }, storage);
  assert.deepEqual(loadCardLayout(storage), { disk: { x: 'right', dx: 20, y: 'bottom', dy: 20, w: 240, h: null, z: 3 } });
  saveCardLayout({}, storage);
  assert.equal(storage.data.has(CARD_LAYOUT_KEY), false);
  storage.setItem(CARD_LAYOUT_KEY, '{not json');
  assert.deepEqual(loadCardLayout(storage), {});
  assert.deepEqual(normalizeCardLayout({ hacker: { dx: 1, dy: 1, w: 300 }, tags: { dx: 'a', dy: 1, w: 300 }, import: { x: 'middle', dx: -5, dy: 10.6, w: 9999, h: 10 } }), {
    import: { x: 'left', y: 'top', dx: 0, dy: 11, w: 640, h: 64, z: 0 },
  });
  assert.deepEqual(normalizeCardLayout([1, 2]), {});
});

test('编辑时有没有改动：位置、大小、放回都算，叠放只比先后', async () => {
  const { sameCardLayout, placeCard, bringCardToFront, dockCard } = await layoutModule();
  const base = placeCard(placeCard({}, 'folders', { left: 300, top: 100, width: 260, height: 400 }, viewport), 'tags', { left: 600, top: 100, width: 240, height: 200 }, viewport);
  assert.equal(sameCardLayout(base, { ...base }), true);
  assert.equal(sameCardLayout(base, placeCard(base, 'tags', { left: 620, top: 100, width: 240, height: 200 }, viewport)), false);
  assert.equal(sameCardLayout(base, dockCard(base, 'tags')), false);
  assert.equal(sameCardLayout(base, bringCardToFront(base, 'folders')), false, '叠放先后变了');
  assert.equal(sameCardLayout(base, bringCardToFront(base, 'tags')), true, '本来就在最上面');
  assert.equal(sameCardLayout({}, {}), true);
});

test('平时卡片锁定，打开图标栏底部的"编辑布局"开关才能拖；底部操作栏有一键重置、取消、保存', () => {
  const main = read('src/main.jsx');
  assert.match(main, /<div className="soft-rail-bottom">\s*<Button\s+className=\{`soft-rail-item soft-layout-toggle/, '开关放在图标栏底部、回收站上面');
  assert.match(main, /role="switch"\s+aria-checked=\{cardLayout\.editing\}/);
  assert.match(main, /onClick=\{cardLayout\.editing \? cardLayout\.save : cardLayout\.startEditing\}/, '再点一次开关就是保存');
  assert.match(main, /cardLayout\.editing && "soft-layout-editing"/);
  assert.match(main, /\{cardLayout\.editing && \(\s*<div className="soft-layout-bar"/);
  assert.match(main, /onClick=\{cardLayout\.resetDraft\}[^>]*><RotateCcw size=\{14\} \/> 一键重置<\/Button>/);
  assert.match(main, /onClick=\{cardLayout\.cancel\}[^>]*>取消<\/Button>/);
  assert.match(main, /onClick=\{cardLayout\.save\}><Check size=\{14\} \/> 保存<\/Button>/);
  const hook = read('src/hooks/useCardLayout.js');
  assert.match(hook, /const \[draft, setDraft\] = React\.useState\(null\);/, '编辑时改的是草稿');
  assert.match(hook, /const layout = draft \?\? saved;/);
  assert.match(hook, /saveCardLayout\(saved\);/, '只有保存过的才写进本机');
  assert.match(hook, /if \(draft !== null\) setSaved\(draft\);\s*setDraft\(null\);/);
  const card = read('src/components/soft-card.jsx');
  assert.match(card, /if \(!cards\.editing \|\| !target \|\| !rootRef\.current\?\.contains\(target\)/, '不在编辑模式就不能拖');
  assert.match(card, /return target\.closest\("\[data-soft-card\]"\) === rootRef\.current;/, '嵌在侧栏面板里的小卡片归它自己管');
  assert.match(card, /if \(event\.button !== 0 \|\| session\.current \|\| !cards\.editing\) return;/, '不在编辑模式就不能拉大小');
  assert.match(card, /const grip = cards\.editing && \(/);
  assert.match(read('src/soft-ui.css'), /\.soft-layout-editing \.soft-card-slot > :not\(\.soft-card-grip\),\s*\.app\.soft-ui\.ready-ui\.ui-refresh\.soft-layout-editing \.soft-card-self > :not\(\.soft-card-grip\):not\(\.soft-float-resize\),\s*\.app\.soft-ui\.ready-ui\.ui-refresh\.soft-layout-editing \.soft-float-body \{ pointer-events: none; \}/, '编辑时卡片里的按钮不响应');
});

test('侧栏五张卡片都包在 SoftCard 里，浮层挂在 .app 里，设置里能恢复默认布局', () => {
  const main = read('src/main.jsx');
  for (const id of ['library', 'import', 'folders', 'tags', 'disk']) {
    assert.match(main, new RegExp(`<SoftCard id="${id}" cards=\\{cardLayout\\}>`), id);
  }
  // 骨架卡片原地浮起：图标栏、侧栏面板、顶栏、工具栏
  assert.match(main, /<SoftCard id="rail" cards=\{cardLayout\} self>\s*<nav className="soft-rail"/);
  assert.match(main, /<SoftCard id="panel" cards=\{cardLayout\} self>\s*<div className="soft-side-panel" ref=\{cardLayout\.dockRef\}>/, '小卡片拖回侧栏面板');
  assert.match(main, /<SoftCard id="header" cards=\{cardLayout\} self>\s*<header>/);
  assert.match(main, /<SoftCard id="toolbar" cards=\{cardLayout\} self>\s*<section\s+className=\{`toolbar/);
  assert.match(main, /<div className="soft-float-layer" ref=\{cardLayout\.setLayer\} \/>/);
  assert.match(main, /const sidePanelHidden = cardLayout\.panelEmpty && !cardLayout\.editing;/, '小卡片都拖走后平时藏起空面板，编辑时留着当拖回的位置');
  assert.match(main, /const asideWidth = \(cardLayout\.railOut \? 0 : softRailWidth\) \+ \(sidePanelDocked \? sidebarWidth \+ \(cardLayout\.railOut \? 4 : 0\) : 0\);/);
  assert.match(main, /"--sidebar-width": `\$\{asideWidth\}px`/);
  for (const name of ['soft-rail-out', 'soft-panel-out', 'soft-panel-hidden', 'soft-main-free', 'soft-header-out', 'soft-layout-editing']) assert.match(main, new RegExp('"' + name + '"'), name);
  assert.match(main, /onResetCardLayout=\{cardLayout\.resetAll\}/);
  const settings = read('src/components/ai-settings.jsx');
  assert.match(settings, /<h2>界面布局<\/h2>/);
  assert.match(settings, /打开图标栏底部的「编辑布局」开关后/);
  assert.match(settings, /onClick=\{onResetCardLayout\}>恢复默认布局<\/Button>/);
  // 极简模式下侧栏的文件夹卡片不能被一起藏掉
  assert.match(read('src/interaction-motion.css'), /:not\(\.compact-folder-tree\):not\(\[data-soft-card="folders"\]\)/);
  const card = read('src/components/soft-card.jsx');
  assert.match(card, /createPortal\(/);
  assert.match(card, /window\.addEventListener\("pointermove"/, '拖动跨越重新挂载，所以监听挂在 window 上');
  assert.match(card, /key\.key !== "Escape"/, 'Esc 取消拖动');
  const css = read('src/soft-ui.css');
  assert.match(css, /\.soft-float-layer \{ display: contents; \}/, '浮层不占位置，浮动卡片和骨架卡片在同一层里比先后');
  assert.match(css, /left: var\(--card-left, auto\) !important;/, '位置用变量 + !important，压过旧主题的定位');
  assert.match(css, /\.soft-main-free > main,\s*\.app\.soft-ui\.ready-ui\.ui-refresh\.soft-layout-editing > main \{ container-type: normal !important; \}/, '容器查询会困住 fixed 的顶栏和工具栏');
  assert.match(css, /-webkit-app-region: no-drag;/, '浮动卡片盖在顶栏拖动区上时还能点');
});

test('贴边换方向：鼠标靠近左右边缘变竖排，靠近顶部或底部变横排；横竖各有自己的宽度上下限', async () => {
  const { edgeAt, edgeOrient, naturalOrient, cardLimits, placeCard, normalizeCardLayout, anchorCard, EDGE_SNAP } = await layoutModule();
  assert.equal(edgeAt(700, 20, viewport), 'top');
  assert.equal(edgeAt(700, 880, viewport), 'bottom');
  assert.equal(edgeAt(10, 400, viewport), 'left');
  assert.equal(edgeAt(1430, 400, viewport), 'right');
  assert.equal(edgeAt(700, 400, viewport), null);
  assert.equal(edgeAt(EDGE_SNAP + 1, EDGE_SNAP + 1, viewport), null);
  assert.equal(edgeAt(20, 10, viewport), 'top', '角落取最近的那条边');
  assert.equal(edgeOrient('top'), 'h');
  assert.equal(edgeOrient('right'), 'v');
  assert.equal(edgeOrient(null), null);
  assert.equal(naturalOrient('rail'), 'v');
  assert.equal(naturalOrient('header'), 'h');
  assert.deepEqual(cardLimits('rail'), { minW: 56, maxW: 120 });
  assert.deepEqual(cardLimits('rail', 'h'), { minW: 200, maxW: 2400 });
  assert.deepEqual(cardLimits('header', 'v'), { minW: 200, maxW: 480 });
  assert.equal(anchorCard({ left: 600, top: 8, width: 809, height: 74 }, viewport, { id: 'rail', o: 'h' }).w, 809, '横排的图标栏不会被竖排的宽度上限压成 120');
  // 只在和本来方向不一样时才记方向
  let layout = placeCard({}, 'rail', { left: 600, top: 8, width: 809, height: 74 }, viewport, { o: 'h' });
  assert.equal(layout.rail.o, 'h');
  assert.equal(layout.rail.y, 'top');
  layout = placeCard(layout, 'rail', { left: 8, top: 100, width: 60, height: 700 }, viewport, { o: 'v' });
  assert.equal('o' in layout.rail, false);
  layout = placeCard(layout, 'header', { left: 1152, top: 150, width: 280, height: 716 }, viewport, { o: 'v' });
  assert.equal(layout.header.o, 'v');
  layout = placeCard(layout, 'header', { left: 1100, top: 150, width: 280, height: 716 }, viewport);
  assert.equal(layout.header.o, 'v', '没说换方向就沿用之前的');
  assert.deepEqual(normalizeCardLayout({ rail: { o: 'h', dx: 8, dy: 8, w: 809 }, header: { o: 'h', dx: 0, dy: 0, w: 900 }, tags: { o: 'x', dx: 0, dy: 0, w: 300 } }), {
    rail: { x: 'left', y: 'top', dx: 8, dy: 8, w: 809, h: null, z: 0, o: 'h' },
    header: { x: 'left', y: 'top', dx: 0, dy: 0, w: 900, h: null, z: 0 },
    tags: { x: 'left', y: 'top', dx: 0, dy: 0, w: 300, h: null, z: 0 },
  });
  const card = read('src/components/soft-card.jsx');
  assert.match(card, /const edge = current\.outside \? null : edgeAt\(move\.clientX, move\.clientY, viewport\);/);
  assert.match(card, /flushSync\(\(\) => setDrag\(current\.last\)\)/, '松手时先画出换了方向的最后一帧再量尺寸');
  assert.match(card, /WINDOW_LIGHTS_WIDTH/, '贴到左上角的卡片让开窗口的红黄绿按钮');
  const css = read('src/soft-ui.css');
  for (const rule of [/\.soft-rail\.soft-orient-h \{/, /> main > header\.soft-orient-v \{/, /\.toolbar\.soft-orient-v \{/, /\.soft-side-panel\.soft-orient-h \{ flex-direction: row; \}/, /body\.soft-ui-body\.soft-card-dragging\.soft-snap-top::after \{/]) assert.match(css, rule);
});

test('卡片不能互相遮挡：放下的卡片把压到的卡片挤开，连锁推开，实在没地方就找最近的空位', async () => {
  const { resolveOverlaps, placeCards, placeCard } = await layoutModule();
  // 往右挤是最近的方向
  const moved = resolveOverlaps('tags', { tags: { left: 300, top: 300, width: 200, height: 100 }, import: { left: 450, top: 320, width: 200, height: 100 } }, viewport);
  assert.deepEqual(moved, { import: { left: 508, top: 320, width: 200, height: 100 } });
  // 连锁：import 被挤开后又压到 disk，disk 也要让开，最后谁也不压谁
  const rects = { tags: { left: 300, top: 300, width: 200, height: 100 }, import: { left: 450, top: 300, width: 200, height: 100 }, disk: { left: 560, top: 300, width: 200, height: 100 } };
  const chain = resolveOverlaps('tags', rects, viewport);
  const all = { ...rects, ...chain };
  const ids = Object.keys(all);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = all[ids[i]], b = all[ids[j]];
    assert.equal(a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height, false, ids[i] + ' 和 ' + ids[j] + ' 还重叠');
  }
  // 四个方向都放不下（很宽的卡片夹在中间）就在窗口里找最近的空位
  const wide = resolveOverlaps('tags', { tags: { left: 600, top: 400, width: 300, height: 200 }, folders: { left: 200, top: 450, width: 1000, height: 300 } }, viewport);
  assert.ok(wide.folders, '文件夹卡片被挪开');
  const f2 = wide.folders, t = { left: 600, top: 400, width: 300, height: 200 };
  assert.equal(f2.left < t.left + t.width && t.left < f2.left + f2.width && f2.top < t.top + t.height && t.top < f2.top + f2.height, false);
  // 被挤离了原来贴的边，就不再算贴边（不再占位）
  let layout = placeCard({}, 'folders', { left: 200, top: 632, width: 1000, height: 260 }, viewport, { e: 'bottom', o: 'h' });
  assert.equal(layout.folders.e, 'bottom');
  layout = placeCards(layout, { folders: { left: 200, top: 300, width: 1000, height: 260 } }, viewport);
  assert.equal('e' in layout.folders, false);
  layout = placeCard(layout, 'folders', { left: 200, top: 632, width: 1000, height: 260 }, viewport, { e: 'bottom' });
  layout = placeCards(layout, { folders: { left: 300, top: 632, width: 1000, height: 260 } }, viewport);
  assert.equal(layout.folders.e, 'bottom', '只是横着挪了一下，还贴着底边');
});

test('贴边的卡片占住窗口四周，素材区让位：按贴边卡片算出四条边各让多少', async () => {
  const { dockInsets, normalizeCardLayout } = await layoutModule();
  assert.deepEqual(dockInsets([
    { edge: 'bottom', rect: { left: 432, top: 632, width: 1000, height: 260 } },
    { edge: 'left', rect: { left: 8, top: 60, width: 220, height: 300 } },
    { edge: 'top', rect: { left: 500, top: 8, width: 600, height: 74 } },
    { edge: 'right', rect: { left: 1152, top: 150, width: 280, height: 400 } },
    { edge: 'top', rect: { left: 0, top: 0, width: 0, height: 0 } },
  ], viewport), { top: 82, right: 288, bottom: 268, left: 228 });
  assert.equal(normalizeCardLayout({ tags: { dx: 0, dy: 0, w: 300, e: 'bottom' } }).tags.e, 'bottom');
  assert.equal('e' in normalizeCardLayout({ tags: { dx: 0, dy: 0, w: 300, e: 'middle' } }).tags, false);
  const main = read('src/main.jsx');
  assert.match(main, /const observer = new ResizeObserver\(measure\);/, '贴边卡片大小变了也要重新算');
  assert.match(main, /"--dock-top": `\$\{dockInsets\.top\}px`/);
  const css = read('src/soft-ui.css');
  assert.match(css, /\.soft-docked \{\s*box-sizing: border-box;\s*padding: var\(--dock-top, 0px\) var\(--dock-right, 0px\) var\(--dock-bottom, 0px\) var\(--dock-left, 0px\) !important;/);
  assert.match(css, /bottom: calc\(var\(--dock-bottom, 0px\) \+ 18px\);/, '编辑操作栏停在底部卡片上面');
  const card = read('src/components/soft-card.jsx');
  assert.match(card, /const moved = resolveOverlaps\(id, rects, readViewport\(\)\);/);
  assert.match(card, /e: current\.edge/, '记下贴的是哪条边');
});

test('文件夹卡片横着时换成访达那样的分栏', () => {
  const main = read('src/main.jsx');
  assert.match(main, /\{cardLayout\.layout\.folders\?\.o === "h" \? \(\s*<FolderColumns/);
  const columns = read('src/components/folder-columns.jsx');
  assert.match(columns, /const columns = \[null, \.\.\.path\]/, '一级文件夹一栏，选中的每一级在右边多一栏');
  assert.match(columns, /onOpen\(folder\);/, '点文件夹同时打开它');
  assert.match(columns, /scroller\.scrollTo\(\{ left: scroller\.scrollWidth/, '展开新一栏后滚到最右');
  assert.match(columns, /onDropAssets\(event, folder\.id\)/, '素材可以拖到分栏里的文件夹上');
  assert.match(read('src/soft-ui.css'), /\.soft-float-card\.soft-orient-h\[data-soft-card="folders"\] \{ height: var\(--card-h, 260px\) !important;/);
});

test('疯狂模式：卡片拖出窗口变成桌面小窗口（只浮在素材库上面），可以放回，关掉开关全部回来', async () => {
  const { canGoToDesk, normalizeDeskCards } = await layoutModule();
  assert.equal(canGoToDesk('folders'), true);
  assert.equal(canGoToDesk('rail'), true);
  assert.equal(canGoToDesk('header'), false, '顶栏的样式离不开素材区');
  assert.deepEqual(normalizeDeskCards({ folders: { x: 2000.4, y: 584, w: 9999, h: 10 }, header: { x: 0, y: 0, w: 300, h: 300 }, tags: { x: 'a', y: 0, w: 1, h: 1 } }), { folders: { x: 2000, y: 584, w: 2400, h: 64 } });
  const mainProcess = read('electron/main.cjs');
  assert.match(mainProcess, /if \(url === 'about:blank' && \/\^nest-card-\[a-z\]\+\$\/\.test\(frameName \|\| ''\)\) return \{ action: 'allow', overrideBrowserWindowOptions: deskCardWindowOptions\(win\) \};/, '只放行空白的卡片小窗口');
  assert.match(mainProcess, /function deskCardWindowOptions\(parent\) \{ return \{ parent, frame: false,/, '挂在主窗口上、无边框');
  assert.match(mainProcess, /child\.webContents\.on\('will-navigate', event => event\.preventDefault\(\)\);/, '小窗口不能跳转到别处');
  const desk = read('src/components/desk-window.jsx');
  assert.match(desk, /window\.open\("about:blank", `nest-card-\$\{id\}`, features\)/);
  assert.match(desk, /window\.addEventListener\("pagehide", closeWithPage\);/, '主窗口刷新时先关掉小窗口');
  assert.match(desk, /<RendererProvider renderer=\{target\.renderer\} targetDocument=\{target\.doc\}>/, '界面库样式写进小窗口');
  assert.match(desk, /if \(win\.closed\) \{/, '小窗口被直接关掉时把卡片收回来');
  const card = read('src/components/soft-card.jsx');
  assert.match(card, /current\.outside = Boolean\(cards\.crazy && canGoToDesk\(id\)/, '只有疯狂模式下拖出窗口才放到桌面');
  assert.match(card, /cards\.toDesk\(id, \{ x: up\.screenX/);
  const hook = read('src/hooks/useCardLayout.js');
  assert.match(hook, /if \(!on\) setDesk\(\{\}\);/, '关掉疯狂模式时桌面上的卡片全部回来');
  assert.match(hook, /const away = \{ \.\.\.onDesk, \.\.\.layout \};/, '放到桌面上的卡片也算离开了原位');
  const main = read('src/main.jsx');
  assert.match(main, /className=\{`soft-layout-crazy/);
  assert.match(main, /role="switch"\s+aria-checked=\{cardLayout\.crazy\}/);
  assert.match(main, /cardLayout\.shellRef\.current = \{ className:/);
  assert.match(read('src/ready-ui.jsx'), /<FluentProvider theme=\{fluent\} targetDocument=\{targetDocument\}/);
});

test('窗口按钮做成 macOS 那样左上角的红黄绿圆点，右边的面板不用再给它留位置', () => {
  const jsx = read('src/components/window-controls.jsx');
  const order = ['close', 'minimize', 'maximize'].map((name) => jsx.indexOf('className="window-control ' + name + '"'));
  assert.ok(order.every((index) => index > 0) && order[0] < order[1] && order[1] < order[2], '顺序是关闭、最小化、最大化');
  const css = read('src/window-controls.css');
  assert.match(css, /\.window-controls \{\s*position: fixed;\s*top: 30px;\s*left: 21px;\s*right: auto;/);
  assert.match(css, /\.window-controls \.window-control\.close \{ background: #ff5f57 !important; \}/);
  assert.match(css, /\.window-controls:hover \.window-control svg/, '移上去才显示图标');
  const soft = read('src/soft-ui.css');
  assert.doesNotMatch(soft, /minmax\(0, 1fr\) auto auto 120px/, '顶栏不再给右上角按钮留一列');
  assert.doesNotMatch(soft, /button\.window-control \{/, '不再画成圆角方块');
  assert.match(soft, /html\[data-platform="win32"\] \.app\.soft-ui\.ready-ui\.ui-refresh \.soft-rail \{ padding-top: 50px; \}/, '图标栏顶部给圆点留位置');
});

test('没贴边的浮动卡片也让素材区让位：从让得最少的那条边让，素材区至少留 360×240', async () => {
  const { nearestEdge, dockInsets } = await layoutModule();
  // 又宽又扁靠上的顶栏离右边只有 9px，但应该从上边让位
  assert.equal(nearestEdge({ left: 431, top: 40, width: 1000, height: 112 }, viewport), 'top');
  assert.equal(nearestEdge({ left: 1152, top: 150, width: 280, height: 716 }, viewport), 'right');
  assert.equal(nearestEdge({ left: 8, top: 300, width: 220, height: 300 }, viewport), 'left');
  assert.deepEqual(dockInsets([{ rect: { left: 431, top: 40, width: 1000, height: 112 } }], viewport), { top: 152, right: 0, bottom: 0, left: 0 });
  // 侧栏本来就占 444px，左右让位加起来不能把素材区挤到 360 以下
  const squeezed = dockInsets([{ edge: 'right', rect: { left: 400, top: 100, width: 1000, height: 300 } }], viewport, { width: 444 });
  assert.ok(viewport.width - 444 - squeezed.left - squeezed.right >= 360, JSON.stringify(squeezed));
  const main = read('src/main.jsx');
  assert.match(main, /const docked = Object\.entries\(cardLayout\.layout\);/, '所有浮动卡片都算，不只贴边的');
  assert.match(main, /\{ width: asideWidth \}\);/);
});

test('界面出错时显示提示和"重新加载"，不再整个窗口黑掉；桌面小窗口单独兜底', () => {
  const main = read('src/main.jsx');
  assert.match(main, /render\(<ErrorBoundary><ReadyUI><App \/><\/ReadyUI><\/ErrorBoundary>\)/);
  const boundary = read('src/components/error-boundary.jsx');
  assert.match(boundary, /static getDerivedStateFromError\(error\)/);
  assert.match(boundary, /onClick=\{\(\) => window\.location\.reload\(\)\}>重新加载<\/button>/);
  assert.match(boundary, /dynamically imported module/, '软件开着时被重新构建，按需加载的页面找不到旧文件');
  const desk = read('src/components/desk-window.jsx');
  assert.match(desk, /<ErrorBoundary compact onReset=\{onReturn\}>\{children\}<\/ErrorBoundary>/);
  assert.match(desk, /w: win\.innerWidth, h: win\.innerHeight/, '记内容区大小，重开不会越来越大');
  const mainProcess = read('electron/main.cjs');
  assert.match(mainProcess, /function keepDeskCardReachable\(child\)/, '小窗口的标题条留在屏幕里，拖得回来');
  assert.match(mainProcess, /child\.on\('moved', \(\) => keepDeskCardReachable\(child\)\);/);
});
