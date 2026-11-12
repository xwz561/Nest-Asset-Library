const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// DEC-014：AI Flow「作品」区可切换成无限画布；卡片仍是 AI Flow 自己的节点，只加类名和样式。
const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'browser-extension', 'aiflow-page.js'), 'utf8');
const blockStart = page.indexOf('  // ===== 「作品」区无限画布');
const blockEnd = page.indexOf('  function isLikelyPromptEditor(editor) {');
const block = page.slice(blockStart, blockEnd);
const constants = page.match(/^ {2}const WORKS_CANVAS_[A-Z_]+ = [^\n]+$/gm).join('\n');

class FakeClassList {
  constructor() { this.set = new Set(); }
  add(name) { this.set.add(name); }
  remove(name) { this.set.delete(name); }
  contains(name) { return this.set.has(name); }
}

class FakeStyle {
  constructor() { this.props = new Map(); }
  setProperty(name, value) { this.props.set(name, String(value)); }
  getPropertyValue(name) { return this.props.get(name) || ''; }
  removeProperty(name) { this.props.delete(name); }
}

let created = [];

class FakeElement {
  constructor({ id = '', className = '', taskid = '', height = 400, parent = null, text = '' } = {}) {
    this.id = id;
    this.classList = new FakeClassList();
    if (className) this.classList.add(className);
    this.dataset = taskid ? { taskid } : {};
    this.attributes = new Map();
    this.style = new FakeStyle();
    this.offsetHeight = height;
    this.children = [];
    this.parentElement = null;
    this.clientWidth = 1000;
    this.clientHeight = 900;
    this.scrollTop = 0;
    this.isConnected = true;
    this.textContent = text;
    this.hidden = false;
    created.push(this);
    if (parent) parent.append(this);
  }
  append(child) { child.parentElement = this; this.children.push(child); }
  appendChild(child) { this.append(child); return child; }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
    this.parentElement = null;
    created = created.filter(node => node !== this);
  }
  addEventListener() {}
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  querySelector() { return null; }
  contains(node) { for (let n = node; n; n = n.parentElement) if (n === this) return true; return false; }
  // 「作品」标题搜索用；假节点里没有标题，开关会浮在作品区右上角
  querySelectorAll() { return []; }
  closest(selector) {
    const attr = selector.match(/^\[([\w-]+)\]$/);
    for (let n = this; n; n = n.parentElement) {
      if (selector === '.task-card' && n.classList.contains('task-card')) return n;
      if (attr && n.attributes.has(attr[1])) return n;
    }
    return null;
  }
  matches(selector) { return selector === '.task-card' && this.classList.contains('task-card'); }
  getBoundingClientRect() { return { left: 0, top: 0, right: this.clientWidth, bottom: this.clientHeight, width: this.clientWidth, height: this.clientHeight }; }
}

function loadCanvas({ stored = {}, confirm = true } = {}) {
  created = [];
  let pageCards = [];
  const storage = new Map(Object.entries(stored));
  const listeners = [];
  const timers = [];
  const body = new FakeElement();
  const sandbox = {
    AI_FLOW_DOM: null,
    Element: FakeElement,
    Node: FakeElement,
    HTMLElement: FakeElement,
    Date,
    Math,
    JSON,
    Number,
    String,
    Object,
    Set,
    Map,
    Array,
    performance: { now: () => 0 },
    localStorage: {
      getItem: key => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
    },
    document: {
      body,
      head: null,
      documentElement: new FakeElement(),
      addEventListener: (type, fn) => listeners.push([type, fn]),
      getElementById: id => created.find(node => node.id === id) || null,
      querySelector: () => null,
      // 页面上的作品卡片（列表顺序测试里设置）；其它选择器返回空
      querySelectorAll: selector => (/task-card/.test(selector) ? pageCards : []),
      createElement: () => new FakeElement(),
    },
    window: {
      addEventListener: (type, fn) => listeners.push([type, fn]),
      setTimeout: () => 1, // 标题补找的定时器在测试里不触发
      innerHeight: 1000,
      innerWidth: 2000,
      devicePixelRatio: 1,
      confirm: () => confirm,
      prompt: () => null,
      getSelection: () => null,
    },
    getComputedStyle: () => ({ overflowY: 'auto', getPropertyValue: () => '' }),
    // 动画直接跳到终点
    requestAnimationFrame: fn => fn(10000),
    cancelAnimationFrame: () => {},
    setTimeout: fn => { timers.push(fn); return timers.length; },
    clearTimeout: () => {},
    isNestOwnedNode: () => false,
    currentProjectId: () => 'p1',
  };
  vm.createContext(sandbox);
  vm.runInContext(`${constants}\n${block}\nglobalThis.api = { worksCanvas, placeWorksCards, loadWorksCanvasLayout, attachWorksCanvas, detachWorksCanvas, startWorksCanvasPointer, moveWorksCanvasPointer, endWorksCanvasPointer, setWorksCanvasEnabled, groupSelectedWorks, ungroupWorks, setWorksSelection, runWorksSearch, stepWorksSearch, resetWorksCanvasLayout, worksGroupFrame, worksCameraCenteredOn, renameWorksGroup, worksGroupDisplayName, worksCardShotNumber, worksCanvasListSequence, syncWorksListOrder, setWorksListOrder };`, sandbox);
  const flush = () => { while (timers.length) timers.shift()(); };
  const listener = type => listeners.filter(([name]) => name === type).map(([, fn]) => fn);
  const setPageCards = cards => { pageCards = cards; };
  return { api: sandbox.api, storage, flush, listener, body, setPageCards };
}

function buildGrid(count, heights = [], texts = []) {
  const viewport = new FakeElement({ className: 'works-scroll' });
  const grid = new FakeElement({ parent: viewport });
  const cards = Array.from({ length: count }, (_, i) => new FakeElement({ className: 'task-card', taskid: `t${i}`, height: heights[i] || 400, parent: grid, text: texts[i] || '' }));
  for (const card of cards) card.getBoundingClientRect = () => ({ width: 230 });
  return { viewport, grid, cards };
}

// 打开画布并摆好卡片；世界层的包围盒跟着镜头走（真实浏览器里 transform 的效果）
function openCanvas(api, count, options = {}) {
  const built = buildGrid(count, options.heights, options.texts);
  api.setWorksCanvasEnabled(true);
  api.attachWorksCanvas(built.grid, built.cards);
  built.grid.getBoundingClientRect = () => ({ left: api.worksCanvas.layout.camera.x, top: api.worksCanvas.layout.camera.y });
  api.placeWorksCards(built.cards);
  return built;
}

const pos = (api, id) => { const p = api.worksCanvas.layout.cards[id]; return [p.x, p.y]; };

test('画布默认关闭，开关状态记在 localStorage', () => {
  assert.equal(loadCanvas().api.worksCanvas.enabled, false);
  assert.equal(loadCanvas({ stored: { 'nest-aiflow-works-canvas-enabled': 'true' } }).api.worksCanvas.enabled, true);
});

test('打开画布：网格和视口只加类名，卡片按原网格顺序从左到右排开', () => {
  const { api } = loadCanvas();
  const { viewport, grid, cards } = buildGrid(5);
  api.attachWorksCanvas(grid, cards);
  assert.ok(viewport.classList.contains('nest-works-canvas-viewport'));
  assert.ok(grid.classList.contains('nest-works-canvas-world'));
  assert.equal(grid.style.getPropertyValue('--nest-wc-card-w'), '230px');
  api.placeWorksCards(cards);
  // 视口 1000 宽、卡片 230 + 间距 20 → 一行 3 张
  const positions = cards.map(card => [card.style.getPropertyValue('--nest-wc-cx'), card.style.getPropertyValue('--nest-wc-cy')]);
  assert.deepEqual(positions, [['0px', '0px'], ['250px', '0px'], ['500px', '0px'], ['0px', '440px'], ['250px', '440px']]);
  // 卡片节点仍在原网格里，没有被搬走或克隆
  assert.deepEqual(grid.children, cards);
});

test('新作品放进第一个空位，不压住拖过的卡片', () => {
  const { api } = loadCanvas();
  const { grid, cards } = buildGrid(3);
  api.attachWorksCanvas(grid, cards);
  api.worksCanvas.layout.columns = 3;
  api.worksCanvas.layout.cardWidth = 230;
  api.worksCanvas.layout.cards = { t0: { x: 0, y: 0, z: 1 }, t1: { x: 250, y: 0, z: 1 } };
  api.placeWorksCards(cards);
  assert.equal(cards[2].style.getPropertyValue('--nest-wc-cx'), '500px');
  // 新卡片出现在网格最前面（AI Flow 新作品排第一），也只补到空位里
  const fresh = new FakeElement({ className: 'task-card', taskid: 'new', height: 400 });
  api.placeWorksCards([fresh, ...cards]);
  assert.equal(fresh.style.getPropertyValue('--nest-wc-cx'), '0px');
  assert.equal(fresh.style.getPropertyValue('--nest-wc-cy'), '440px');
});

test('拖动卡片：超过 4px 才算拖，松手吞掉随后的 click，位置写回 localStorage', () => {
  const { api, storage, flush, listener } = loadCanvas();
  const { grid, cards } = buildGrid(2);
  api.setWorksCanvasEnabled(true);
  api.attachWorksCanvas(grid, cards);
  api.placeWorksCards(cards);
  api.worksCanvas.layout.camera.zoom = 2;
  const target = cards[1];
  api.startWorksCanvasPointer({ target, button: 0, pointerId: 1, clientX: 100, clientY: 100 });
  api.moveWorksCanvasPointer({ pointerId: 1, clientX: 102, clientY: 101 });
  assert.equal(api.worksCanvas.interaction.kind, 'card-pending', '小幅抖动仍算点击');
  api.moveWorksCanvasPointer({ pointerId: 1, clientX: 140, clientY: 160 });
  api.endWorksCanvasPointer({ pointerId: 1 });
  const pos = api.worksCanvas.layout.cards.t1;
  assert.deepEqual([pos.x, pos.y], [250 + 20, 30], '画布放大 2 倍时，鼠标移动 40/60 像素 = 卡片移动 20/30');
  let blocked = false;
  const click = { target, preventDefault() {}, stopImmediatePropagation() { blocked = true; } };
  for (const fn of listener('click')) fn(click);
  assert.ok(blocked, '拖动结束后的 click 不能落到 AI Flow 按钮上');
  flush();
  const saved = JSON.parse(storage.get('nest-aiflow-works-canvas-layout:p1'));
  assert.equal(saved.cards.t1.x, 270);
});

test('只是点一下卡片按钮不会被拦：AI Flow 的下载、增强、重制、延长照常', () => {
  const { api, listener } = loadCanvas();
  const { grid, cards } = buildGrid(1);
  api.setWorksCanvasEnabled(true);
  api.attachWorksCanvas(grid, cards);
  api.placeWorksCards(cards);
  let prevented = false;
  api.startWorksCanvasPointer({ target: cards[0], button: 0, pointerId: 1, clientX: 10, clientY: 10, preventDefault() { prevented = true; } });
  api.endWorksCanvasPointer({ pointerId: 1 });
  assert.equal(prevented, false);
  let blocked = false;
  for (const fn of listener('click')) fn({ target: cards[0], preventDefault() {}, stopImmediatePropagation() { blocked = true; } });
  assert.equal(blocked, false);
});

test('中键拖、按住空格左键拖都是平移；左键直接拖空白处不平移', () => {
  const { api, listener } = loadCanvas();
  const { viewport, grid, cards } = buildGrid(1);
  api.setWorksCanvasEnabled(true);
  api.attachWorksCanvas(grid, cards);
  const before = { ...api.worksCanvas.layout.camera };
  api.startWorksCanvasPointer({ target: viewport, button: 1, pointerId: 7, clientX: 0, clientY: 0, preventDefault() {} });
  api.moveWorksCanvasPointer({ pointerId: 7, clientX: 50, clientY: -30 });
  api.endWorksCanvasPointer({ pointerId: 7 });
  assert.deepEqual([api.worksCanvas.layout.camera.x, api.worksCanvas.layout.camera.y], [before.x + 50, before.y - 30]);
  assert.match(grid.style.getPropertyValue('transform'), /translate\(74px, -6px\) scale\(1\)/);
  // 左键直接拖：框选，镜头不动
  api.startWorksCanvasPointer({ target: viewport, button: 0, pointerId: 8, clientX: 0, clientY: 0, preventDefault() {} });
  api.moveWorksCanvasPointer({ pointerId: 8, clientX: 80, clientY: 80 });
  assert.equal(api.worksCanvas.interaction.kind, 'marquee');
  api.endWorksCanvasPointer({ pointerId: 8 });
  assert.equal(api.worksCanvas.layout.camera.x, before.x + 50);
  // 按住空格再左键拖：平移；画布显示抓手
  const down = listener('keydown');
  const up = listener('keyup');
  for (const fn of down) fn({ code: 'Space', target: viewport });
  assert.equal(viewport.dataset.nestWcSpace, 'true');
  api.startWorksCanvasPointer({ target: viewport, button: 0, pointerId: 9, clientX: 0, clientY: 0, preventDefault() {} });
  api.moveWorksCanvasPointer({ pointerId: 9, clientX: 10, clientY: 20 });
  api.endWorksCanvasPointer({ pointerId: 9 });
  assert.deepEqual([api.worksCanvas.layout.camera.x, api.worksCanvas.layout.camera.y], [before.x + 60, before.y - 10]);
  for (const fn of up) fn({ code: 'Space' });
  assert.equal(viewport.dataset.nestWcSpace, undefined);
});

test('左键拖空白处框选：替换原有选择；Shift/Ctrl 拖是加选', () => {
  const { api } = loadCanvas();
  const { viewport } = openCanvas(api, 4);
  api.setWorksSelection(new Set(['t3']));
  // 镜头 (24,24)，缩放 1：t0 x=0、t1 x=250、t2 x=500，第一行 y=0
  api.startWorksCanvasPointer({ target: viewport, button: 0, pointerId: 5, clientX: 30, clientY: 30, preventDefault() {} });
  api.moveWorksCanvasPointer({ pointerId: 5, clientX: 300, clientY: 100 });
  api.endWorksCanvasPointer({ pointerId: 5 });
  assert.deepEqual([...api.worksCanvas.selected].sort(), ['t0', 't1']);
  api.startWorksCanvasPointer({ target: viewport, button: 0, ctrlKey: true, pointerId: 6, clientX: 560, clientY: 30, preventDefault() {} });
  api.moveWorksCanvasPointer({ pointerId: 6, clientX: 600, clientY: 60 });
  api.endWorksCanvasPointer({ pointerId: 6 });
  assert.deepEqual([...api.worksCanvas.selected].sort(), ['t0', 't1', 't2']);
  // 加选模式下点一下空白处不清空；普通点一下清空
  api.startWorksCanvasPointer({ target: viewport, button: 0, shiftKey: true, pointerId: 7, clientX: 900, clientY: 800, preventDefault() {} });
  api.endWorksCanvasPointer({ pointerId: 7 });
  assert.equal(api.worksCanvas.selected.size, 3);
  api.startWorksCanvasPointer({ target: viewport, button: 0, pointerId: 8, clientX: 900, clientY: 800, preventDefault() {} });
  api.moveWorksCanvasPointer({ pointerId: 8, clientX: 901, clientY: 801 });
  api.endWorksCanvasPointer({ pointerId: 8 });
  assert.equal(api.worksCanvas.selected.size, 0);
});

test('关掉画布后把类名和内联样式全部撤掉，还原 AI Flow 原网格', () => {
  const { api } = loadCanvas();
  const { viewport, grid, cards } = buildGrid(2);
  viewport.scrollTop = 321;
  api.setWorksCanvasEnabled(true);
  api.attachWorksCanvas(grid, cards);
  api.placeWorksCards(cards);
  api.setWorksCanvasEnabled(false);
  assert.equal(viewport.classList.contains('nest-works-canvas-viewport'), false);
  assert.equal(grid.classList.contains('nest-works-canvas-world'), false);
  assert.equal(grid.style.props.size, 0);
  assert.equal(viewport.style.props.size, 0);
  for (const card of cards) assert.equal(card.style.props.size, 0);
  assert.equal(viewport.scrollTop, 321);
});

test('坏掉的存档不会让画布出错', () => {
  const { api } = loadCanvas({ stored: { bad: '{"cards":{"a":{"x":"NaN"},"b":{"x":1,"y":2}},"camera":{"zoom":99}}' } });
  const layout = api.loadWorksCanvasLayout('bad');
  assert.deepEqual(Object.keys(layout.cards), ['b']);
  assert.equal(layout.camera.zoom, 2.5);
  assert.equal(api.loadWorksCanvasLayout('missing').camera.zoom, 1);
});

test('样式约束：配色走 --nest-theme-* 带兜底色，不缩放悬停卡片，不写根级 :has(:active)', () => {
  const css = block.slice(block.indexOf('style.textContent = `'), block.indexOf('`;', block.indexOf('style.textContent = `')));
  assert.match(css, /var\(--nest-theme-bg,#0f1115\)/);
  assert.match(css, /var\(--nest-theme-accent,#6f9bff\)/);
  assert.doesNotMatch(css, /var\(--nest-theme-[\w-]+\)/, '每个 --nest-theme-* 都要带兜底色（AI Flow 原版配色下没有这些变量）');
  assert.doesNotMatch(css, /:hover[^{]*\{[^}]*scale/);
  assert.doesNotMatch(page, /(?:html|body)[^{,]*:has\([^)]*:active/);
});

test('加在 AI Flow 节点上的类名不用 nest-aiflow- 前缀，开关挂在「作品」标题旁并接入页面监听', () => {
  for (const name of ['VIEWPORT', 'WORLD', 'PASSTHROUGH']) {
    const value = page.match(new RegExp(`const WORKS_CANVAS_${name}_CLASS = '([^']+)'`))[1];
    assert.doesNotMatch(value, /^nest-aiflow-/);
  }
  assert.match(block, /String\(node\.textContent \|\| ''\)\.trim\(\) === '作品'/);
  assert.match(block, /title\.insertAdjacentElement\('afterend', button\)/);
  // 页面扫描一次、标题节流到点补找一次（retryWorksCanvasToggle）
  assert.equal((page.match(/scheduleWorksCanvasSync\(\);/g) || []).length, 3);
  assert.match(block, /'无限画布'/);
});

test('Shift+点卡片多选，这次点击不交给 AI Flow；点空白处取消选择', () => {
  const { api, listener } = loadCanvas();
  const { viewport, cards } = openCanvas(api, 3);
  let prevented = false;
  api.startWorksCanvasPointer({ target: cards[0], button: 0, shiftKey: true, pointerId: 1, clientX: 5, clientY: 5, preventDefault() { prevented = true; } });
  api.startWorksCanvasPointer({ target: cards[2], button: 0, shiftKey: true, pointerId: 2, clientX: 5, clientY: 5, preventDefault() {} });
  assert.ok(prevented);
  assert.deepEqual([...api.worksCanvas.selected], ['t0', 't2']);
  assert.equal(cards[0].dataset.nestWcSelected, 'true');
  let blocked = false;
  for (const fn of listener('click')) fn({ target: cards[2], preventDefault() {}, stopImmediatePropagation() { blocked = true; } });
  assert.ok(blocked);
  api.startWorksCanvasPointer({ target: viewport, button: 0, pointerId: 3, clientX: 900, clientY: 800, preventDefault() {} });
  api.endWorksCanvasPointer({ pointerId: 3 });
  assert.equal(api.worksCanvas.selected.size, 0);
  assert.equal(cards[0].dataset.nestWcSelected, undefined);
});

test('Shift+拖空白处也能框选（加选）', () => {
  const { api } = loadCanvas();
  const { viewport } = openCanvas(api, 4);
  // 镜头 (24,24)，缩放 1；卡片宽 230、间距 20，一行 3 张：t0 x=0、t1 x=250
  api.startWorksCanvasPointer({ target: viewport, button: 0, shiftKey: true, pointerId: 5, clientX: 30, clientY: 30, preventDefault() {} });
  api.moveWorksCanvasPointer({ pointerId: 5, clientX: 300, clientY: 100 });
  api.endWorksCanvasPointer({ pointerId: 5 });
  assert.deepEqual([...api.worksCanvas.selected].sort(), ['t0', 't1']);
});

test('打组：同镜头的版本排在一起，组名取镜头号，被压住的卡片挪走，分组存进 localStorage', () => {
  const { api, storage, flush } = loadCanvas();
  const texts = ['liwang_E09_S02_v01_HZ', 'liwang_E09_S03_v01_HZ', 'x', 'y', 'liwang_E09_S02_v02_HZ'];
  openCanvas(api, 5, { texts });
  api.setWorksSelection(new Set(['t0', 't4']));
  api.groupSelectedWorks();
  const group = api.worksCanvas.layout.groups[0];
  assert.equal(group.defaultName, '镜头 S02');
  assert.equal(group.name, '', '没改过名时 name 为空，显示默认名');
  assert.deepEqual([...group.ids], ['t0', 't4']);
  // 组内紧凑：同一行相邻
  const [x0, y0] = pos(api, 't0');
  const [x4, y4] = pos(api, 't4');
  assert.equal(y0, y4);
  assert.equal(x4 - x0, 250);
  // 分组框里不再有别的卡片
  const frame = api.worksGroupFrame(group);
  for (const id of ['t1', 't2', 't3']) {
    const [x, y] = pos(api, id);
    const inside = x < frame.x + frame.w && x + 230 > frame.x && y < frame.y + frame.h && y + 400 > frame.y;
    assert.equal(inside, false, `${id} 被分组框压住`);
  }
  assert.equal(api.worksCanvas.selected.size, 0);
  flush();
  assert.equal(JSON.parse(storage.get('nest-aiflow-works-canvas-layout:p1')).groups[0].defaultName, '镜头 S02');
});

test('拖分组标题栏整组移动；解组后卡片留在原处', () => {
  const { api } = loadCanvas();
  openCanvas(api, 3);
  api.setWorksSelection(new Set(['t0', 't1']));
  api.groupSelectedWorks();
  const group = api.worksCanvas.layout.groups[0];
  const before = [pos(api, 't0'), pos(api, 't1')];
  const head = new FakeElement();
  head.setAttribute('data-nest-wc-group-head', '');
  const frameNode = new FakeElement();
  frameNode.setAttribute('data-nest-wc-group', group.id);
  frameNode.append(head);
  api.worksCanvas.viewport.append(frameNode);
  api.startWorksCanvasPointer({ target: head, button: 0, pointerId: 9, clientX: 0, clientY: 0, preventDefault() {} });
  api.moveWorksCanvasPointer({ pointerId: 9, clientX: 100, clientY: 50 });
  api.endWorksCanvasPointer({ pointerId: 9 });
  assert.deepEqual([pos(api, 't0'), pos(api, 't1')], before.map(([x, y]) => [x + 100, y + 50]));
  api.ungroupWorks(group.id);
  assert.equal(api.worksCanvas.layout.groups.length, 0);
  assert.deepEqual(pos(api, 't0'), [before[0][0] + 100, before[0][1] + 50]);
});

test('选中多张后拖其中一张，整批一起移动', () => {
  const { api } = loadCanvas();
  const { cards } = openCanvas(api, 3);
  api.setWorksSelection(new Set(['t0', 't2']));
  const before = [pos(api, 't0'), pos(api, 't1'), pos(api, 't2')];
  api.startWorksCanvasPointer({ target: cards[0], button: 0, pointerId: 4, clientX: 0, clientY: 0 });
  api.moveWorksCanvasPointer({ pointerId: 4, clientX: 30, clientY: 40 });
  api.endWorksCanvasPointer({ pointerId: 4 });
  assert.deepEqual(pos(api, 't0'), [before[0][0] + 30, before[0][1] + 40]);
  assert.deepEqual(pos(api, 't1'), before[1]);
  assert.deepEqual(pos(api, 't2'), [before[2][0] + 30, before[2][1] + 40]);
});

test('搜索：镜头号按任务名里的 S 编号匹配，回车依次定位到画面中央', () => {
  const { api } = loadCanvas();
  const texts = ['E09_S02_v01 镜头3 镜头4', 'E09_S03_v01', 'E09_S12_v01', 'E09_S03_v02 hello'];
  const { cards } = openCanvas(api, 4, { texts });
  for (const query of ['3', 'S03', 's3', '镜头3', '镜头 03']) {
    api.runWorksSearch(query);
    assert.deepEqual([...api.worksCanvas.search.hits], ['t1', 't3'], query);
  }
  assert.equal(cards[0].dataset.nestWcHit, undefined, '提示词里的「镜头3」不算镜头号');
  assert.equal(api.worksCanvas.world.dataset.nestWcSearching, 'true');
  api.stepWorksSearch(1);
  assert.equal(cards[1].dataset.nestWcHit, 'current');
  assert.equal(cards[3].dataset.nestWcHit, 'match');
  // t1 在 (250,0)，卡片 230×400；视口 1000×900，缩放 1 → 卡片中心落到 (500,450)
  const { camera } = api.worksCanvas.layout;
  assert.deepEqual([camera.x, camera.y, camera.zoom], [500 - 365, 450 - 200, 1]);
  api.stepWorksSearch(1);
  assert.equal(cards[3].dataset.nestWcHit, 'current');
  api.stepWorksSearch(1);
  assert.equal(cards[1].dataset.nestWcHit, 'current', '到头后回到第一个');
});

test('搜索：关键词不分大小写、多个词都要有；镜头号没匹配时退回关键词；清空后去掉标记', () => {
  const { api } = loadCanvas();
  const { cards } = openCanvas(api, 3, { texts: ['Sacred Flame 废弃马厩', 'worthless wretch', '第 7 秒 Flame'] });
  api.runWorksSearch('flame 马厩');
  assert.deepEqual([...api.worksCanvas.search.hits], ['t0']);
  api.runWorksSearch('7');
  assert.deepEqual([...api.worksCanvas.search.hits], ['t2']);
  api.runWorksSearch('');
  assert.equal(api.worksCanvas.world.dataset.nestWcSearching, undefined);
  for (const card of cards) assert.equal(card.dataset.nestWcHit, undefined);
});

test('重排保留分组：组内卡片仍排在一起，其它卡片不进分组框', () => {
  const { api } = loadCanvas();
  openCanvas(api, 6);
  api.worksCanvas.layout.cards.t5 = { x: 2000, y: 3000, z: 1 };
  api.setWorksSelection(new Set(['t1', 't5']));
  api.groupSelectedWorks();
  api.resetWorksCanvasLayout();
  const group = api.worksCanvas.layout.groups[0];
  assert.deepEqual([...group.ids], ['t1', 't5']);
  const [x1, y1] = pos(api, 't1');
  const [x5, y5] = pos(api, 't5');
  assert.equal(y1, y5);
  assert.equal(x5 - x1, 250);
  const frame = api.worksGroupFrame(group);
  for (const id of ['t0', 't2', 't3', 't4']) {
    const [x, y] = pos(api, id);
    assert.ok(!(x < frame.x + frame.w && x + 230 > frame.x && y < frame.y + frame.h && y + 400 > frame.y), `${id} 在分组框里`);
  }
});

test('小地图跳转：把点到的世界坐标放到视口中央，缩放不变', () => {
  const { api } = loadCanvas();
  openCanvas(api, 1);
  api.worksCanvas.layout.camera.zoom = 0.5;
  assert.deepEqual({ ...api.worksCameraCenteredOn(1000, 600, 0.5) }, { x: 500 - 500, y: 450 - 300, zoom: 0.5 });
});

test('关掉画布时分组框、小地图、框选框、选中和搜索标记一并撤掉', () => {
  const { api } = loadCanvas();
  const { cards } = openCanvas(api, 3, { texts: ['a', 'b', 'c'] });
  api.setWorksSelection(new Set(['t0', 't1']));
  api.groupSelectedWorks();
  api.setWorksSelection(new Set(['t2']));
  api.runWorksSearch('c');
  assert.ok(created.some(node => node.id === 'nest-aiflow-works-canvas-minimap'));
  assert.ok(created.some(node => node.id === 'nest-aiflow-works-canvas-groups'));
  api.setWorksCanvasEnabled(false);
  for (const id of ['nest-aiflow-works-canvas-minimap', 'nest-aiflow-works-canvas-groups', 'nest-aiflow-works-canvas-hud']) {
    assert.ok(!created.some(node => node.id === id), `${id} 没撤掉`);
  }
  for (const card of cards) {
    assert.equal(card.dataset.nestWcSelected, undefined);
    assert.equal(card.dataset.nestWcHit, undefined);
    assert.equal(card.style.props.size, 0);
  }
});

test('浮条里有搜索框和打组按钮，搜索框按键不传给 AI Flow；小地图避开右下角固定按钮', () => {
  assert.match(block, /data-nest-wc-search placeholder="镜头号 \/ 关键词，回车定位"/);
  assert.match(block, /data-nest-wc-act="group" hidden/);
  assert.match(block, /input\?\.addEventListener\('keydown', event => \{\s*event\.stopPropagation\(\);/);
  assert.match(block, /nearRightEdge \? Math\.max\(bottom, 108\) : bottom/);
  assert.doesNotMatch(block, /\.task-card[^{]*:hover[^{]*\{[^}]*transform/);
});

test('分组自己命名：保存进 localStorage；清空或改回默认名都恢复「镜头 Sxx」', () => {
  const { api, storage, flush } = loadCanvas();
  openCanvas(api, 2, { texts: ['E09_S01_v01', 'E09_S01_v02'] });
  api.setWorksSelection(new Set(['t0', 't1']));
  api.groupSelectedWorks();
  const group = api.worksCanvas.layout.groups[0];
  assert.equal(api.worksGroupDisplayName(group), '镜头 S01');
  api.renameWorksGroup(group.id, '  Elena   低位 对峙  ');
  assert.equal(api.worksGroupDisplayName(group), 'Elena 低位 对峙');
  flush();
  let saved = JSON.parse(storage.get('nest-aiflow-works-canvas-layout:p1')).groups[0];
  assert.deepEqual([saved.name, saved.defaultName], ['Elena 低位 对峙', '镜头 S01']);
  // 重新载入后名字还在
  const reloaded = api.loadWorksCanvasLayout('nest-aiflow-works-canvas-layout:p1').groups[0];
  assert.equal(api.worksGroupDisplayName(reloaded), 'Elena 低位 对峙');
  api.renameWorksGroup(group.id, '   ');
  assert.equal(api.worksGroupDisplayName(group), '镜头 S01');
  api.renameWorksGroup(group.id, '镜头 S01');
  assert.equal(group.name, '');
  api.renameWorksGroup(group.id, 'x'.repeat(80));
  assert.equal(group.name.length, 60);
  flush();
  saved = JSON.parse(storage.get('nest-aiflow-works-canvas-layout:p1')).groups[0];
  assert.equal(saved.name.length, 60);
});

test('旧存档只有 name 时当作默认名读入', () => {
  const stored = { old: JSON.stringify({ cards: {}, groups: [{ id: 'g1', name: '镜头 S03', ids: ['a', 'b'] }] }) };
  const { api } = loadCanvas({ stored });
  const group = api.loadWorksCanvasLayout('old').groups[0];
  assert.deepEqual([group.name, group.defaultName], ['', '镜头 S03']);
});

test('改名输入框：按键不外传，回车/失焦保存、Esc 取消；在输入框里按下不会拖动整组', () => {
  const rename = block.slice(block.indexOf('function startWorksGroupRename'), block.indexOf('function ensureWorksGroupsLayer'));
  assert.match(rename, /input\.addEventListener\('keydown', event => \{\s*event\.stopPropagation\(\);/);
  assert.match(rename, /event\.key === 'Enter'[\s\S]*?finish\(true\)/);
  assert.match(rename, /event\.key === 'Escape'[\s\S]*?finish\(false\)/);
  assert.match(rename, /addEventListener\('blur', \(\) => finish\(true\)\)/);
  // 画布按下会 preventDefault，焦点不一定离开，点别处另外靠 pointerdown 保存
  assert.match(rename, /document\.addEventListener\('pointerdown', outside, true\)/);
  assert.match(rename, /document\.removeEventListener\('pointerdown', outside, true\)/);
  assert.match(block, /data-nest-wc-rename title="改分组名"/);
  assert.match(block, /target\.closest\('\[data-nest-wc-ungroup\], \[data-nest-wc-rename\]'\) \|\| isWorksCanvasFormField\(target\)/);
  // 空格平移只在非输入框里生效
  assert.match(block, /if \(target && isWorksCanvasFormField\(target\)\) return;\s*setWorksSpaceHeld\(true\);/);
  assert.doesNotMatch(block, /window\.prompt\('分组名称'/);
});

test('镜头号优先认 E09_S02 这种任务名', () => {
  const { api } = loadCanvas();
  assert.equal(api.worksCardShotNumber({ textContent: '提示词 S01 开头 AX33 · liwang_E09_S02_v01_HZ' }), 2);
  assert.equal(api.worksCardShotNumber({ textContent: 'shot S07 only' }), 7);
});

const orderOf = cards => cards.map(card => card.style.getPropertyValue('order'));

test('列表顺序：按画布从上到下、从左到右；同组连在一起；没摆过的新作品按原顺序放最前', () => {
  const { api } = loadCanvas();
  const layout = {
    cards: {
      a: { x: 500, y: 10 }, // 第一行最右
      b: { x: 0, y: 60 }, // y 差不到半张卡，仍算第一行，最左
      c: { x: 250, y: 0 },
      d: { x: 0, y: 900 }, // 第二行
      g1: { x: 900, y: 880 }, // 分组：组内最靠上靠左的是 g2
      g2: { x: 260, y: 870 },
    },
    groups: [{ id: 'g', ids: ['g1', 'g2'] }],
  };
  const sequence = api.worksCanvasListSequence(['new1', 'a', 'b', 'g1', 'new2', 'c', 'd', 'g2'], layout);
  assert.deepEqual([...sequence], ['new1', 'new2', 'b', 'c', 'a', 'd', 'g2', 'g1']);
});

test('退出画布后列表按画布顺序排：只写 CSS order，不动 AI Flow 的节点', () => {
  const { api, setPageCards } = loadCanvas();
  const { grid, cards } = openCanvas(api, 3);
  setPageCards(cards);
  // 把 t2 拖到最左上
  api.worksCanvas.layout.cards.t2 = { x: -300, y: -50, z: 2 };
  api.setWorksCanvasEnabled(false);
  assert.deepEqual(orderOf(cards), ['1', '2', '0']);
  assert.deepEqual(grid.children, cards, '节点顺序不变');
  // 新作品（画布里没摆过）出现在 AI Flow 列表最前，排第一
  const fresh = new FakeElement({ className: 'task-card', taskid: 'fresh', parent: grid });
  grid.children = [fresh, ...cards];
  setPageCards([fresh, ...cards]);
  api.syncWorksListOrder();
  assert.deepEqual(orderOf([fresh, ...cards]), ['0', '2', '3', '1']);
});

test('「恢复原顺序」去掉排序并记住；在画布里再动卡片后又按画布排', () => {
  const { api, setPageCards, storage } = loadCanvas();
  const { cards } = openCanvas(api, 3);
  setPageCards(cards);
  api.worksCanvas.layout.cards.t2 = { x: -300, y: -50, z: 2 };
  api.setWorksCanvasEnabled(false);
  api.setWorksListOrder('original');
  assert.deepEqual(orderOf(cards), ['', '', '']);
  for (const card of cards) assert.equal(card.dataset.nestWcOrdered, undefined);
  assert.equal(JSON.parse(storage.get('nest-aiflow-works-canvas-layout:p1')).listOrder, 'original');
  api.syncWorksListOrder();
  assert.deepEqual(orderOf(cards), ['', '', ''], '刷新后仍是原顺序');
  api.setWorksListOrder('canvas');
  assert.deepEqual(orderOf(cards), ['1', '2', '0']);
  api.setWorksListOrder('original');
  // 回到画布拖一张卡，再退出：列表重新跟着画布
  api.setWorksCanvasEnabled(true);
  api.attachWorksCanvas(cards[0].parentElement, cards);
  cards[0].parentElement.getBoundingClientRect = () => ({ left: api.worksCanvas.layout.camera.x, top: api.worksCanvas.layout.camera.y });
  assert.deepEqual(orderOf(cards), ['', '', ''], '画布模式下不加 order');
  api.startWorksCanvasPointer({ target: cards[1], button: 0, pointerId: 1, clientX: 0, clientY: 0 });
  api.moveWorksCanvasPointer({ pointerId: 1, clientX: -2000, clientY: -2000 });
  api.endWorksCanvasPointer({ pointerId: 1 });
  api.setWorksCanvasEnabled(false);
  assert.deepEqual(orderOf(cards), ['2', '0', '1']);
});

test('画布开着时把列表 order 撤掉；排序用 CSS order 而不是移动节点', () => {
  const { api, setPageCards } = loadCanvas();
  const { grid, cards } = openCanvas(api, 2);
  setPageCards(cards);
  api.setWorksCanvasEnabled(false);
  assert.ok(cards.every(card => card.dataset.nestWcOrdered));
  api.setWorksCanvasEnabled(true);
  api.attachWorksCanvas(grid, cards);
  assert.deepEqual(orderOf(cards), ['', '']);
  const listCode = block.slice(block.indexOf('function syncWorksListOrder'), block.indexOf('function syncWorksListOrder') + 2200);
  assert.match(listCode, /card\.style\.setProperty\('order'/);
  assert.doesNotMatch(listCode, /insertBefore|appendChild|\.prepend\(|\.append\(/);
});

test('刷新后「无限画布」按钮随作品网格出现立刻插入，不被提前占掉的节流窗口拖住', () => {
  const page = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'browser-extension', 'aiflow-page.js'), 'utf8');
  const fn = page.slice(page.indexOf('function injectWorksCanvasToggle('), page.indexOf('function syncWorksCanvas('));
  // 先确认作品网格存在，再开始计时
  assert.ok(fn.indexOf('if (!grid) return;') < fn.indexOf('worksCanvas.titleSearchAt = now;'));
  assert.ok(fn.indexOf('if (!grid) return;') < fn.indexOf('const sinceSearch'));
  // 节流期间到点自己补一次
  assert.match(fn, /if \(sinceSearch < WORKS_CANVAS_TITLE_RETRY_MS\) \{\s*retryWorksCanvasToggle\(WORKS_CANVAS_TITLE_RETRY_MS - sinceSearch\);\s*return;/);
  assert.match(page, /function retryWorksCanvasToggle\(delay\) \{\s*if \(worksCanvasToggleRetryTimer\) return;[\s\S]*?scheduleWorksCanvasSync\(\);/);
  // 没找到标题时先浮着，有限次补找
  assert.match(fn, /if \(worksCanvas\.titleRetries < 10\) \{\s*worksCanvas\.titleRetries \+= 1;\s*retryWorksCanvasToggle/);
});
