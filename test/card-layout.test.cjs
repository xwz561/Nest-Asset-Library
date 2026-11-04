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
  assert.match(main, /cardLayout\.editing \? "soft-layout-editing" : ""/);
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
  assert.match(card, /return Boolean\(cards\.editing && target/, '不在编辑模式就不能拖');
  assert.match(card, /if \(event\.button !== 0 \|\| session\.current \|\| !cards\.editing\) return;/, '不在编辑模式就不能拉大小');
  assert.match(card, /const grip = cards\.editing && \(/);
  assert.match(read('src/soft-ui.css'), /\.soft-layout-editing \.soft-card-slot > :not\(\.soft-card-grip\),\s*\.app\.soft-ui\.ready-ui\.ui-refresh\.soft-layout-editing \.soft-float-body \{ pointer-events: none; \}/, '编辑时卡片里的按钮不响应');
});

test('侧栏五张卡片都包在 SoftCard 里，浮层挂在 .app 里，设置里能恢复默认布局', () => {
  const main = read('src/main.jsx');
  for (const id of ['library', 'import', 'folders', 'tags', 'disk']) {
    assert.match(main, new RegExp(`<SoftCard id="${id}" cards=\\{cardLayout\\}>`), id);
  }
  assert.match(main, /<div className="soft-float-layer" ref=\{cardLayout\.setLayer\} \/>/);
  assert.match(main, /cardLayout\.panelEmpty \? "soft-panel-empty" : ""/);
  assert.match(main, /"--sidebar-width": `\$\{cardLayout\.panelEmpty \? softRailWidth : sidebarWidth \+ softRailWidth\}px`/);
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
  assert.match(css, /\.soft-float-layer \{\s*position: fixed;\s*inset: 0;\s*z-index: 76;/);
  assert.match(css, /-webkit-app-region: no-drag;/, '浮动卡片盖在顶栏拖动区上时还能点');
});
