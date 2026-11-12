const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const load = () => import(pathToFileURL(path.join(root, 'src', 'magnetic-pull.js')).href);
const rect = { left: 100, top: 100, width: 100, height: 40 }; // 中心 (150, 120)

test('空状态彩蛋：鼠标靠近时按钮被轻轻吸向鼠标，场外不动，位移有上限', async () => {
  const { magneticOffset, MAGNETIC_PULL_DEFAULTS } = await load();
  assert.deepEqual(magneticOffset(rect, { x: 150, y: 120 }), { x: 0, y: 0 }, '鼠标在中心不动，随时点得到');
  const right = magneticOffset(rect, { x: 215, y: 120 });
  assert.ok(right.x > 0 && right.y === 0, '朝鼠标方向（右）移动，不是躲开');
  const left = magneticOffset(rect, { x: 85, y: 120 });
  assert.equal(left.x, -right.x, '左右对称');
  assert.deepEqual(magneticOffset(rect, { x: 200 + MAGNETIC_PULL_DEFAULTS.radius, y: 120 }), { x: 0, y: 0 }, '场边缘衰减到 0');
  assert.deepEqual(magneticOffset(rect, { x: 500, y: 500 }), { x: 0, y: 0 });
  // 越靠近越强；任何位置都不超过 maxOffset（轻微）
  assert.ok(magneticOffset(rect, { x: 205, y: 120 }).x > magneticOffset(rect, { x: 250, y: 120 }).x);
  for (let x = 0; x <= 320; x += 7) for (let y = 0; y <= 240; y += 7) {
    const o = magneticOffset(rect, { x, y });
    assert.ok(Math.abs(o.x) <= MAGNETIC_PULL_DEFAULTS.maxOffset && Math.abs(o.y) <= MAGNETIC_PULL_DEFAULTS.maxOffset, `${x},${y}`);
  }
  assert.ok(MAGNETIC_PULL_DEFAULTS.strength <= 0.25 && MAGNETIC_PULL_DEFAULTS.maxOffset <= 12, '用户要的是轻微吸力');
});

function fakeDom({ reduce = false } = {}) {
  const listeners = {};
  const winListeners = {};
  const frames = [];
  const makeButton = (disabled = false) => {
    const vars = {};
    return {
      disabled, vars,
      getBoundingClientRect: () => ({ ...rect }),
      style: { setProperty: (k, v) => { vars[k] = v; } },
    };
  };
  const buttons = [makeButton(), makeButton(true)];
  const win = {
    matchMedia: (q) => ({ matches: reduce && q.includes('reduce') }),
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelAnimationFrame: () => {},
    getComputedStyle: () => ({ translate: 'none' }),
    addEventListener: (t, fn) => { winListeners[t] = fn; },
    removeEventListener: (t) => { delete winListeners[t]; },
  };
  const container = {
    ownerDocument: { defaultView: win },
    querySelectorAll: () => buttons,
    addEventListener: (t, fn) => { listeners[t] = fn; },
    removeEventListener: (t) => { delete listeners[t]; },
  };
  const flush = () => { while (frames.length) frames.shift()(); };
  return { container, buttons, listeners, winListeners, flush };
}

test('彩蛋只写 CSS 变量：触摸忽略、禁用按钮不动、离开归零、减少动态效果时不动、清理后不留监听', async () => {
  const { attachMagneticPull } = await load();
  const dom = fakeDom();
  const cleanup = attachMagneticPull(dom.container, { selector: '.empty-library-actions button' });
  const [btn, disabledBtn] = dom.buttons;
  dom.listeners.pointermove({ pointerType: 'touch', clientX: 215, clientY: 120 });
  dom.flush();
  assert.equal(btn.vars['--magnet-x'], undefined, '触摸不触发');
  dom.listeners.pointermove({ pointerType: 'mouse', clientX: 215, clientY: 120 });
  dom.flush();
  assert.ok(parseFloat(btn.vars['--magnet-x']) > 0);
  assert.equal(btn.vars['--magnet-y'], '0px');
  assert.equal(disabledBtn.vars['--magnet-x'], '0px', '禁用按钮不动');
  dom.listeners.pointerleave();
  assert.equal(btn.vars['--magnet-x'], '0px', '离开后回到原位');
  cleanup();
  assert.deepEqual(Object.keys(dom.listeners), []);
  assert.deepEqual(Object.keys(dom.winListeners), []);

  const reduced = fakeDom({ reduce: true });
  attachMagneticPull(reduced.container);
  reduced.listeners.pointermove({ pointerType: 'mouse', clientX: 215, clientY: 120 });
  reduced.flush();
  assert.equal(reduced.buttons[0].vars['--magnet-x'], '0px', '减少动态效果时不位移');
  assert.equal(attachMagneticPull(null), undefined);
});

test('彩蛋只挂在空状态区域，样式限定在新界面下，不改按钮的点击和键盘行为', () => {
  const main = read('src/main.jsx');
  assert.match(main, /import \{ attachMagneticPull \} from "\.\/magnetic-pull\.js";/);
  assert.match(main, /const magneticEmptyActions = \(node\) => attachMagneticPull\(node, \{ selector: "\.empty-library-actions button" \}\);/, '模块级回调 ref，身份稳定');
  assert.equal((main.match(/ref=\{magneticEmptyActions\}/g) || []).length, 1);
  assert.match(main, /<section ref=\{magneticEmptyActions\} className="empty-library-state"/);
  // 素材网格（masonry）里没有磁吸
  assert.doesNotMatch(main.slice(main.indexOf('className="masonry'), main.indexOf('<section ref={magneticEmptyActions}')), /magnetic/i);
  const src = read('src/magnetic-pull.js');
  assert.doesNotMatch(src, /tabIndex|tabindex|aria-hidden|preventDefault|\.blur\(|setAttribute/, '不碰按钮的焦点、读屏属性和点击');
  assert.match(src, /passive: true/);
  const css = read('src/soft-ui.css');
  assert.match(css, /\.app\.soft-ui\.ready-ui\.ui-refresh \.empty-library-actions button \{\s*translate: var\(--magnet-x, 0px\) var\(--magnet-y, 0px\);/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.app\.soft-ui\.ready-ui\.ui-refresh \.empty-library-actions button \{ translate: none; \}/);
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /--magnet-[xy][^;]*transform|transform:[^;]*--magnet/, '用独立 translate，不和按下时的 transform 抢');
});
