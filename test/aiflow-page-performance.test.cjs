const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// LES-021：扩展让浏览器发卡——页面监听每条变动同步全页扫描、提示词高亮每 180ms 无条件重写样式。
const page = fs.readFileSync(path.join(__dirname, '..', 'browser-extension', 'aiflow-page.js'), 'utf8');

function loadMutationFilter() {
  const start = page.indexOf('function isNestOwnedNode(node)');
  const ownedEnd = page.indexOf('\n  }\n', start) + 4;
  const filterStart = page.indexOf('function isNestClassToken(token)');
  const filterEnd = page.indexOf('\n  }\n', page.indexOf('function isNestOnlyMutation(record)')) + 4;
  class Element {
    constructor({ id = '', classes = [], parent = null } = {}) { this.id = id; this.classList = classes; this.parentElement = parent; this.nodeType = 1; this.cls = classes.join(' '); }
    getAttribute(name) { return name === 'class' ? this.cls : null; }
  }
  const body = new Element();
  const sandbox = { Element, document: { body } };
  vm.runInNewContext(`${page.slice(start, ownedEnd)}\n${page.slice(filterStart, filterEnd)}\nthis.isNestOnlyMutation = isNestOnlyMutation;`, sandbox);
  return { ...sandbox, body };
}

test('页面监听按批节流，不再每条变动同步跑整轮注入', () => {
  assert.match(page, /PAGE_SCAN_MIN_INTERVAL_MS = 250/);
  assert.match(page, /attributeOldValue: true/);
  const observer = page.slice(page.indexOf('pageMutationObserver = new MutationObserver('));
  assert.match(observer.slice(0, 200), /if \(records\.every\(isNestOnlyMutation\)\) return;\s*schedulePageScan\(\);/);
  assert.match(page, /function schedulePageScan\(\) \{\s*if \(pageScanTimer\) return;/);
  assert.match(page, /function runPageScan\(\) \{[\s\S]*?injectVideoExtendWorkbench\(\);[\s\S]*?scheduleWorksCanvasSync\(\);/);
});

test('扩展自己造成的变动不触发重扫，AI Flow 自己的变动照常触发', () => {
  const { isNestOnlyMutation, Element, body } = loadMutationFilter();
  const card = new Element({ classes: ['task-card', 'nest-works-canvas-passthrough'], parent: body });
  assert.equal(isNestOnlyMutation({ type: 'attributes', target: card, oldValue: 'task-card' }), true, '只加了 nest-* class');
  const progress = new Element({ classes: ['progress', 'running'], parent: body });
  assert.equal(isNestOnlyMutation({ type: 'attributes', target: progress, oldValue: 'progress' }), false, 'AI Flow 改了自己的 class');
  const panel = new Element({ id: 'nest-aiflow-works-canvas-hud', parent: body });
  const inner = new Element({ parent: panel });
  assert.equal(isNestOnlyMutation({ type: 'childList', target: inner, addedNodes: [], removedNodes: [] }), true, '扩展浮窗内部的变动');
  const layer = new Element({ classes: ['nest-aiflow-prompt-highlight-layer'] });
  assert.equal(isNestOnlyMutation({ type: 'childList', target: body, addedNodes: [layer], removedNodes: [] }), true, '插入高亮层');
  const newCard = new Element({ classes: ['task-card'] });
  assert.equal(isNestOnlyMutation({ type: 'childList', target: body, addedNodes: [newCard, layer], removedNodes: [] }), false, '新作品卡片要触发');
});

test('提示词高亮几何没变就不重写样式，页面在后台不刷新', () => {
  assert.match(page, /if \(geometryKey !== lastGeometryKey\) \{\s*lastGeometryKey = geometryKey;/);
  assert.match(page, /const refreshValue = \(\) => \{[\s\S]*?if \(document\.hidden\) return;\s*sync\(\);/);
});

test('实时同步在页面后台时降频而不是停掉', () => {
  assert.match(page, /LIVE_SYNC_HIDDEN_INTERVAL_MS = 15 \* 1000/);
  assert.match(page, /if \(document\.hidden && Date\.now\(\) - lastLiveSyncAt < LIVE_SYNC_HIDDEN_INTERVAL_MS\) return;/);
});
