const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const transitionModule = () => import(pathToFileURL(path.join(root, 'src', 'view-transition.js')).href);

function mockEnvironment({ supported = true, reducedMotion = false, scrolling = false, deskWindow = false } = {}) {
  let finish;
  const transition = {
    skipped: 0,
    skipTransition() { this.skipped += 1; },
    finished: new Promise((resolve) => { finish = resolve; }),
  };
  const attrs = new Map();
  const properties = new Map();
  const document = {
    documentElement: {
      clientWidth: 1440,
      clientHeight: 900,
      dataset: Object.create(null),
      style: {
        setProperty(name, value) { properties.set(name, value); },
        removeProperty(name) { properties.delete(name); },
      },
    },
    body: { classList: { contains(name) { return deskWindow && name === 'soft-desk-window'; } } },
    querySelector(selector) {
      if (selector === 'main.is-scrolling' && scrolling) return {};
      if (selector === '.soft-desk-root' && deskWindow) return {};
      return null;
    },
    ...(supported ? { startViewTransition(callback) { callback(); return transition; } } : {}),
  };
  const window = { matchMedia: () => ({ matches: reducedMotion }) };
  return { document, window, transition, attrs, properties, finish: () => finish?.() };
}

async function withEnvironment(options, run) {
  const previousDocument = global.document;
  const previousWindow = global.window;
  const env = mockEnvironment(options);
  global.document = env.document;
  global.window = env.window;
  try { await run(env, await transitionModule()); }
  finally {
    env.finish();
    if (previousDocument === undefined) delete global.document; else global.document = previousDocument;
    if (previousWindow === undefined) delete global.window; else global.window = previousWindow;
  }
}

test('withViewTransition 在不支持、减少动态效果、滚动和桌面小窗口时直接更新', async () => {
  for (const options of [
    { supported: false },
    { reducedMotion: true },
    { scrolling: true },
    { deskWindow: true },
  ]) {
    await withEnvironment(options, async (env, { withViewTransition }) => {
      let updates = 0;
      const result = withViewTransition(() => { updates += 1; }, { kind: 'fade' });
      assert.equal(result, null);
      assert.equal(updates, 1);
      assert.equal(env.document.documentElement.dataset.vt, undefined);
    });
  }
});

test('withViewTransition 在 VT 回调内同步执行更新，并写入临时动效类型', async () => {
  await withEnvironment({}, async (env, { withViewTransition }) => {
    let updated = false;
    const result = withViewTransition(() => { updated = true; }, { kind: 'folder-forward' });
    assert.equal(updated, true);
    assert.ok(result);
    assert.equal(env.document.documentElement.dataset.vt, 'folder-forward');
    env.finish();
    await result.finished;
    await Promise.resolve();
    assert.equal(env.document.documentElement.dataset.vt, undefined);
  });
});

test('主题点击位置写入 View Transition 圆形揭示坐标', async () => {
  await withEnvironment({}, async (env, { withViewTransition }) => {
    withViewTransition(() => {}, { kind: 'theme', point: { x: 120, y: 80 }, viewport: { width: 1440, height: 900 } });
    assert.equal(env.document.documentElement.dataset.vt, 'theme');
    assert.equal(env.properties.get('--vt-x'), '120px');
    assert.equal(env.properties.get('--vt-y'), '80px');
    assert.ok(Number.parseFloat(env.properties.get('--vt-radius')) >= 1440);
  });
});

test('连续触发时跳过上一段未完成的 View Transition', async () => {
  await withEnvironment({}, async (env, { withViewTransition }) => {
    withViewTransition(() => {}, { kind: 'fade' });
    const previous = env.transition;
    withViewTransition(() => {}, { kind: 'module' });
    assert.equal(previous.skipped, 1);
    assert.equal(env.document.documentElement.dataset.vt, 'module');
  });
});

test('页面切换只给内容区命名，减少动态效果和滚动时关闭过渡', () => {
  const main = read('src/main.jsx');
  const transitions = read('src/view-transition.js');
  const css = read('src/motion-polish.css') + read('src/interaction-motion.css');
  assert.match(main, /className="view-transition-content"/);
  assert.match(transitions, /flushSync\(/);
  assert.match(css, /view-transition-name:\s*nest-content/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(transitions, /main\.is-scrolling/);
  assert.doesNotMatch(read('src/soft-ui.css'), /@keyframes|@starting-style/);
});

test('开关统一使用轨道与圆钮，只动画 transform 和颜色并提供焦点光圈', () => {
  const main = read('src/main.jsx');
  const updates = read('src/components/automatic-update-settings.jsx');
  const pets = read('src/pet-settings.jsx');
  const css = read('src/motion-polish.css');
  assert.match(main, /className="switch-track"/);
  assert.match(updates, /role="switch"/);
  assert.match(pets, /role="switch"/);
  assert.match(css, /\[role="switch"\]/);
  assert.match(css, /switch-thumb/);
  assert.match(css, /260ms\s+var\(--motion-spring\)/);
  assert.match(css, /120ms\s+var\(--motion-spring\)/);
  assert.match(css, /focus-visible/);
});

test('选中底色使用独立滑块，颜色标记只补边框过渡', () => {
  const main = read('src/main.jsx');
  const aiSettings = read('src/components/ai-settings.jsx');
  const css = read('src/motion-polish.css') + read('src/interaction-motion.css') + read('src/soft-ui-panels.css');
  assert.match(main, /rail-selection-highlight/);
  assert.match(aiSettings, /settings-selection-highlight/);
  assert.match(css, /240ms\s+var\(--apple-ease\)/);
  assert.match(main, /--asset-mark/);
  assert.match(css, /180ms\s+var\(--motion-ease\)/);
});
