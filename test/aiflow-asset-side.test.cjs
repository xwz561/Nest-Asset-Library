const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// DEC-015：AI Flow 提示词下面的引用素材（#assetTags）挪到提示词框右侧竖排，可放回下方。
const page = fs.readFileSync(path.join(__dirname, '..', 'browser-extension', 'aiflow-page.js'), 'utf8');
const source = page.slice(page.indexOf('  // ===== 引用素材侧栏'), page.indexOf('  function isLikelyPromptEditor(editor) {'));

class Node {
  constructor(nodeType) { this.nodeType = nodeType; this.childNodes = []; this.parentNode = null; }
  get parentElement() { return this.parentNode instanceof Element ? this.parentNode : null; }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === doc.documentElement; }
  remove() { if (this.parentNode) { const list = this.parentNode.childNodes; list.splice(list.indexOf(this), 1); this.parentNode = null; } }
}
class Comment extends Node { constructor(text) { super(8); this.data = text; } get textContent() { return ''; } }
class Element extends Node {
  constructor(tag, { id = '', text = '', cls = [], attrs = {} } = {}) {
    super(1); this.tagName = tag.toUpperCase(); this.id = id; this.ownText = text; this.attrs = attrs; this.dataset = {};
    this.listeners = {}; this.style = {}; const set = new Set(cls);
    this.classList = { add: c => set.add(c), remove: c => set.delete(c), contains: c => set.has(c), get size() { return set.size; } };
    this._className = () => [...set].join(' ');
  }
  set className(v) { v.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c)); }
  get className() { return this._className(); }
  set textContent(v) { this.ownText = String(v); this.childNodes.forEach(c => (c.parentNode = null)); this.childNodes = []; }
  get textContent() { return this.ownText + this.childNodes.map(c => c.textContent).join(''); }
  get children() { return this.childNodes.filter(c => c instanceof Element); }
  get nextElementSibling() { if (!this.parentNode) return null; const s = this.parentNode.children; return s[s.indexOf(this) + 1] || null; }
  get previousElementSibling() { if (!this.parentNode) return null; const s = this.parentNode.children; return s[s.indexOf(this) - 1] || null; }
  insertBefore(node, ref) { node.remove(); const i = ref ? this.childNodes.indexOf(ref) : this.childNodes.length; if (i < 0) throw new Error('ref not child'); this.childNodes.splice(i, 0, node); node.parentNode = this; return node; }
  appendChild(node) { return this.insertBefore(node, null); }
  append(...nodes) { nodes.forEach(n => this.appendChild(n)); }
  contains(node) { for (let n = node; n; n = n.parentNode) if (n === this) return true; return false; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  click() { this.listeners.click?.({ preventDefault() {}, stopPropagation() {} }); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  descendants() { return this.children.flatMap(c => [c, ...c.descendants()]); }
  querySelectorAll(selector) {
    const all = this.descendants();
    if (/textarea/.test(selector)) return all.filter(e => ['TEXTAREA', 'SELECT'].includes(e.tagName) || (e.tagName === 'INPUT' && e.attrs.type !== 'hidden'));
    if (/button/.test(selector)) return all.filter(e => e.tagName === 'BUTTON' || e.attrs.role === 'button');
    throw new Error(`unsupported selector ${selector}`);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
let doc;
function el(tag, opts, ...kids) { const e = new Element(tag, opts); kids.forEach(k => e.appendChild(k)); return e; }

function buildPage() {
  const html = el('html');
  const head = el('head');
  const body = el('body');
  html.append(head, body);
  doc = {
    documentElement: html, head, body,
    getElementById: id => [html, ...html.descendants()].find(e => e.id === id) || null,
    createElement: tag => new Element(tag),
    createComment: text => new Comment(text),
  };
  const editor = el('textarea', { id: 'promptInput' });
  const editorBox = el('div', { cls: ['prompt-box'] }, editor);
  const chip = n => el('div', { cls: ['asset-tag'], text: `@图片${n} 素材${n}` }, el('button', { text: '×' }));
  const tags = el('div', { id: 'assetTags' }, chip(1), chip(2), chip(3));
  const tagsWrap = el('div', { cls: ['asset-area'] }, el('div', { text: '点击 ↓ 插入描述 · 拖动可调整顺序' }), tags, el('button', { text: '清除全部 (3)' }));
  const tools = el('div', { cls: ['prompt-tools'] }, el('button', { text: '生成前审查' }), el('button', { text: '找范例' }), el('span', { text: '4026 / 2000' }));
  const panel = el('div', { cls: ['sidebar'] }, editorBox, tools, tagsWrap);
  body.appendChild(panel);
  return { editor, editorBox, tags, tagsWrap, tools, panel };
}

function load() {
  const store = new Map();
  const sandbox = {
    Element, document: doc,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
  };
  vm.runInNewContext(`${source}\nthis.api = { injectAssetTagsSidebar, restoreAssetTagsSidebar, assetSide, assetTagsBlock };`, sandbox);
  return { api: sandbox.api, store };
}

test('引用区整块（提示文字、素材、清除全部）挪到提示词框右侧，「生成前审查」「找范例」留在原处', () => {
  const dom = buildPage();
  const { api } = load();
  api.injectAssetTagsSidebar();
  const split = dom.panel.children[0];
  assert.ok(split.classList.contains('nest-asset-split'));
  assert.equal(split.children[0], dom.editorBox, '提示词框在左');
  const side = split.children[1];
  assert.ok(side.classList.contains('nest-asset-side'));
  assert.ok(side.contains(dom.tagsWrap), '整块引用区在右');
  assert.equal(dom.tools.parentNode, dom.panel, '工具行没被带走');
  assert.equal(doc.getElementById('promptInput'), dom.editor, 'AI Flow 照样按 id 找得到');
  assert.equal(doc.getElementById('assetTags'), dom.tags);
  assert.match(side.children[0].textContent, /引用素材\s*放回下方/);
  // 再扫一次不重复挪
  api.injectAssetTagsSidebar();
  assert.equal(dom.panel.children.filter(c => c.classList.contains('nest-asset-split')).length, 1);
});

test('「放回下方」原样还原顺序并记住；再点「放到提示词右侧」又挪过去', () => {
  const dom = buildPage();
  const { api, store } = load();
  api.injectAssetTagsSidebar();
  api.assetSide.toggle.click();
  assert.equal(store.get('nest-aiflow-asset-side-enabled'), 'false');
  const order = dom.panel.childNodes.filter(n => n.nodeType === 1);
  assert.deepEqual(order.map(n => n.className), ['prompt-box', 'prompt-tools', 'nest-asset-side-toggle', 'asset-area']);
  assert.equal(dom.panel.childNodes.filter(n => n.nodeType === 8).length, 0, '占位注释都清掉了');
  assert.equal(api.assetSide.toggle.textContent, '放到提示词右侧');
  api.injectAssetTagsSidebar();
  assert.equal(dom.panel.children.length, 4, '关着时扫描不再改动');
  api.assetSide.toggle.click();
  assert.equal(store.get('nest-aiflow-asset-side-enabled'), 'true');
  assert.ok(dom.panel.children[0].classList.contains('nest-asset-split'));
});

test('AI Flow 重绘换掉了引用列表：还原旧节点后对新节点重新挪', () => {
  const dom = buildPage();
  const { api } = load();
  api.injectAssetTagsSidebar();
  // AI Flow 把引用区整个重画了一份放回原位置（侧栏里的旧块被移除）
  dom.tagsWrap.remove();
  const fresh = el('div', { cls: ['asset-area'] }, el('div', { id: 'assetTags' }, el('div', { cls: ['asset-tag'], text: '@音频1' })));
  dom.panel.appendChild(fresh);
  api.injectAssetTagsSidebar();
  const side = dom.panel.children[0].children[1];
  assert.ok(side.contains(doc.getElementById('assetTags')));
  assert.equal(dom.panel.children.filter(c => c.classList.contains('nest-asset-split')).length, 1);
  assert.equal(doc.documentElement.descendants().filter(e => e.id === 'assetTags').length, 1, '旧列表没有被放回来');
  assert.equal(dom.panel.childNodes.filter(n => n.nodeType === 8).length, 2, '只剩新一轮的两个占位');
});

test('没有引用列表或提示词框时什么都不做', () => {
  const dom = buildPage();
  dom.tagsWrap.remove();
  const { api } = load();
  api.injectAssetTagsSidebar();
  assert.equal(dom.panel.children[0], dom.editorBox);
});

test('接入页面扫描；类名不用 nest-aiflow- 前缀，侧栏高度跟提示词框走、竖排一行一个', () => {
  assert.match(page, /function runPageScan\(\) \{[\s\S]*?injectPromptReferenceHighlights\(\);\s*injectAssetTagsSidebar\(\);/);
  assert.doesNotMatch(source, /className = 'nest-aiflow-/);
  assert.match(source, /\.nest-asset-side \{[^}]*height: 0 !important; min-height: 100% !important;/);
  assert.match(source, /\.nest-asset-side #assetTags \{[^}]*flex-direction: column !important;[^}]*flex-wrap: nowrap !important;/);
});
