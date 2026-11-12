const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// DEC-016：「专注布局」隐藏顶栏和左侧「军团 + 分集」栏，只留生成表单和作品区。
const page = fs.readFileSync(path.join(__dirname, '..', 'browser-extension', 'aiflow-page.js'), 'utf8');
const source = page.slice(page.indexOf('  function focusLayoutCandidate('), page.indexOf('  function injectAIFlowFocusLayoutToggle('));
const ownedSource = page.slice(page.indexOf('  function isNestOwnedNode(node)'), page.indexOf('\n  }\n', page.indexOf('  function isNestOwnedNode(node)')) + 4);

class El {
  constructor(tag, { id = '', cls = [], text = '', rect = [0, 0, 0, 0], attrs = {} } = {}, kids = []) {
    this.tagName = tag.toUpperCase(); this.id = id; this.ownText = text; this.attrs = attrs; this.dataset = {};
    const set = new Set(cls);
    this.classList = { add: c => set.add(c), remove: c => set.delete(c), contains: c => set.has(c), toggle: (c, on) => (on ? set.add(c) : set.delete(c)) };
    const [left, top, width, height] = rect; this.rect = { left, top, width, height };
    this.children = kids; this.parentElement = null; kids.forEach(k => (k.parentElement = this));
  }
  get childElementCount() { return this.children.length; }
  get textContent() { return this.ownText + this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this.ownText = String(v); }
  getBoundingClientRect() { return this.rect; }
  all() { return this.children.flatMap(c => [c, ...c.all()]); }
  matches(sel) {
    return sel.split(',').map(x => x.trim()).some(one => {
      if (one === '#generatePanel') return this.id === 'generatePanel';
      if (one === 'input[placeholder*="搜索成员"]') return this.tagName === 'INPUT' && String(this.attrs.placeholder || '').includes('搜索成员');
      if (/^\.[\w-]+$/.test(one)) return this.classList.contains(one.slice(1));
      const m = one.match(/^\.([\w-]+)\[data-nest-focus="(\w+)"\]$/);
      if (m) return this.classList.contains(m[1]) && this.dataset.nestFocus === m[2];
      return one.toUpperCase() === this.tagName;
    });
  }
  querySelectorAll(sel) { return this.all().filter(e => e.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

function buildPage() {
  const W = 2000, H = 1000;
  const brand = new El('span', { text: 'AI Flow', rect: [40, 10, 60, 20] });
  const header = new El('div', { cls: ['topbar'], rect: [0, 0, W, 56] }, [new El('div', { rect: [20, 8, 200, 40] }, [brand]), new El('button', { text: '生成区', rect: [300, 8, 90, 40] })]);
  const search = new El('input', { attrs: { placeholder: '搜索成员' }, rect: [20, 100, 180, 30] });
  const team = new El('div', { cls: ['team'], rect: [10, 70, 200, 240] }, [search]);
  const episodes = new El('div', { cls: ['gen-navigation'], rect: [10, 320, 200, 680] }, [new El('div', { cls: ['gen-episode-list'], rect: [10, 340, 200, 640] })]);
  const leftCol = new El('div', { cls: ['left-col'], rect: [0, 56, 220, 944] }, [team, episodes]);
  const form = new El('div', { id: 'generatePanel', rect: [220, 56, 700, 944] }, [new El('div', { cls: ['sidebar'], rect: [220, 56, 700, 944] })]);
  const works = new El('div', { cls: ['works'], text: '作品', rect: [920, 56, 1080, 944] });
  const main = new El('div', { cls: ['main'], rect: [0, 56, W, 944] }, [leftCol, form, works]);
  const body = new El('body', { rect: [0, 0, W, H] }, [header, main]);
  const html = new El('html', { rect: [0, 0, W, H] }, [body]);
  const toggle = new El('button', { id: 'nest-aiflow-focus-layout-toggle' });
  const store = new Map();
  const document = {
    body, documentElement: html,
    querySelectorAll: sel => html.querySelectorAll(sel),
    querySelector: sel => html.querySelector(sel),
    getElementById: id => (id === toggle.id ? toggle : html.all().find(e => e.id === id) || null),
  };
  const sandbox = {
    document, window: { innerWidth: W, innerHeight: H },
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
    FOCUS_LAYOUT_CLASS: 'nest-aiflow-focus-layout', FOCUS_HIDE_CLASS: 'nest-focus-hidden',
    FOCUS_LAYOUT_STORAGE_KEY: 'nest-aiflow-focus-layout-enabled', FOCUS_LAYOUT_TOGGLE_ID: toggle.id,
  };
  vm.runInNewContext(`${ownedSource}\n${source}\nthis.setAIFlowFocusLayout = setAIFlowFocusLayout;`, sandbox);
  return { ...sandbox, header, leftCol, form, works, main, toggle, store, body };
}

test('打开专注布局：顶栏和整列「军团 + 分集」被标记隐藏，生成表单和作品区不动', () => {
  const p = buildPage();
  p.setAIFlowFocusLayout(true);
  assert.ok(p.body.classList.contains('nest-aiflow-focus-layout'));
  assert.ok(p.header.classList.contains('nest-focus-hidden'), '顶栏');
  assert.equal(p.header.dataset.nestFocus, 'top');
  assert.ok(p.leftCol.classList.contains('nest-focus-hidden'), '左侧整列（军团和分集一起）');
  assert.equal(p.leftCol.dataset.nestFocus, 'side');
  for (const kept of [p.form, p.works, p.main]) assert.equal(kept.classList.contains('nest-focus-hidden'), false);
  assert.equal(p.toggle.textContent, '恢复布局');
  assert.equal(p.store.get('nest-aiflow-focus-layout-enabled'), 'true');
});

test('恢复布局只去掉 body 类，标记留着也不会隐藏任何东西', () => {
  const p = buildPage();
  p.setAIFlowFocusLayout(true);
  p.setAIFlowFocusLayout(false);
  assert.equal(p.body.classList.contains('nest-aiflow-focus-layout'), false);
  assert.equal(p.toggle.textContent, '专注布局');
  assert.match(page, /body\.\$\{FOCUS_LAYOUT_CLASS\} \.\$\{FOCUS_HIDE_CLASS\} \{ display: none !important; \}/);
});

test('隐藏只挂在 body 类下；参数栏不再被压到 240px', () => {
  const css = page.slice(page.indexOf('function ensureAIFlowFocusLayoutStyle'), page.indexOf('function focusLayoutEnabled'));
  assert.doesNotMatch(css, /#generatePanel > \.sidebar/);
  assert.match(css, /body\.\$\{FOCUS_LAYOUT_CLASS\} \.gen-navigation,/);
  assert.match(css, /--project-nav-width: 0px/);
});

test('AI Flow 重绘后补认顶栏和左侧栏，最多 5 次、间隔 2 秒', () => {
  const fn = page.slice(page.indexOf('  function injectAIFlowFocusLayoutToggle('), page.indexOf('  // ===== 「作品」区无限画布'));
  assert.match(fn, /focusLayoutRemarkTries < 5 && Date\.now\(\) - focusLayoutRemarkAt > 2000/);
  assert.match(fn, /classList\.remove\(FOCUS_LAYOUT_CLASS\);\s*markFocusLayoutTargets\(\);\s*document\.body\.classList\.add\(FOCUS_LAYOUT_CLASS\);/);
});
