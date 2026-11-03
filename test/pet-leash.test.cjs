const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

// pet-leash.js is a plain browser script (UMD), so load it the way the app does.
const loadLeash = () => {
  const sandbox = { module: { exports: {} }, Math, Number };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../electron/pet-leash.js'), 'utf8'), sandbox);
  return sandbox.module.exports;
};
const inside = (p, box, slack = 0) => p.x >= box.x - slack && p.x <= box.x + box.w + slack && p.y >= box.y - slack && p.y <= box.y + box.h + slack;

const ASSET_DIR = path.join(__dirname, '../public/pets/maid-leash-kitten');

test('牵猫散步素材：24 帧 512×512 透明 PNG，20 fps，规格和 pet-leash.js 一致', () => {
  const L = loadLeash();
  const manifest = JSON.parse(fs.readFileSync(path.join(ASSET_DIR, 'animation.json'), 'utf8'));
  assert.equal(manifest.frames, L.FRAMES);
  assert.equal(manifest.fps, L.FPS);
  assert.deepEqual(manifest.canvas, [512, 512]);
  assert.equal(manifest.alpha, true);
  for (let i = 0; i < L.FRAMES; i++) {
    const file = path.join(ASSET_DIR, L.frameName(i));
    const head = fs.readFileSync(file).subarray(0, 26);
    assert.equal(head.toString('latin1', 1, 4), 'PNG', `${L.frameName(i)} 是 PNG`);
    assert.deepEqual([head.readUInt32BE(16), head.readUInt32BE(20)], [512, 512], '512×512');
    assert.equal(head[25], 6, '带透明通道（RGBA）');
  }
  assert.equal(L.frameUrl(0), '../dist/pets/maid-leash-kitten/frame-000.png');
  assert.equal(L.frameName(L.FRAMES), 'frame-000.png', '循环');
  const c = L.CROP;
  assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= 512 && c.y + c.h <= 512, '裁剪区在画布内');
});

test('按 20 fps 换帧，1.2 秒一个循环', () => {
  const L = loadLeash();
  assert.equal(L.frameAt(0), 0);
  assert.equal(L.frameAt(49), 0);
  assert.equal(L.frameAt(50), 1);
  assert.equal(L.frameAt(1150), 23);
  assert.equal(L.frameAt(1200), 0);
  assert.equal(L.frameAt(-5), 0);
});

test('牵绳布局：和单只桌宠一样高，宽度按素材比例；向左走时左右对调', () => {
  const L = loadLeash();
  for (const scale of [0.5, 1, 2]) {
    const right = L.layout(scale, 1), left = L.layout(scale, -1);
    assert.equal(right.height, Math.round(124 * scale));
    assert.ok(Math.abs(right.width / right.height - L.CROP.w / L.CROP.h) < 0.02, '宽高比与素材一致，不会拉伸');
    assert.equal(right.width, left.width);
    assert.ok(right.whale.x < right.kitten.x, '向右走：女仆在左、小猫在右');
    assert.ok(left.kitten.x < left.whale.x, '向左走：镜像');
    for (const l of [right, left]) for (const box of [l.whale, l.kitten]) {
      assert.ok(box.x >= 0 && box.x + box.w <= l.width && box.w > 0);
      assert.equal(box.y + box.h, l.height, '脚底贴窗口底部');
    }
    assert.ok(right.kitten.h < right.whale.h * 0.7, '小猫比女仆矮');
  }
});

function makeController(t, petId) {
  const { createPetController } = require('../electron/desktop-pet.cjs');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'Nest-Pet-QA-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const handlers = new Map(), actions = [];
  let win;
  class Window extends EventEmitter {
    constructor(options) { super(); this.webContents = { send: (channel, value) => { if (channel === 'pet:action') actions.push(value); }, setWindowOpenHandler() {}, on() {} }; this.bounds = { x: 0, y: 0, width: options.width, height: options.height }; win = this; }
    loadFile() { return Promise.resolve(); }
    setPosition(x, y) { this.bounds.x = x; this.bounds.y = y; }
    getPosition() { return [this.bounds.x, this.bounds.y]; }
    getBounds() { return { ...this.bounds }; }
    setBounds(b) { Object.assign(this.bounds, b); }
    setSize(w, h) { this.bounds.width = w; this.bounds.height = h; }
    isDestroyed() { return !!this.dead; }
    destroy() { this.dead = true; this.emit('closed'); }
    showInactive() {}
  }
  const area = { x: 0, y: 0, width: 1600, height: 900 };
  const screen = { getPrimaryDisplay: () => ({ workArea: area }), getDisplayNearestPoint: () => ({ workArea: area }), getCursorScreenPoint: () => ({ x: 800, y: 500 }), on() {} };
  const controller = createPetController({ app: { getPath: () => temp }, BrowserWindow: Window, screen, ipcMain: { handle: (k, v) => handlers.set(k, v) }, isTrustedSender: () => true });
  controller.update({ enabled: true, petId, autonomyEnabled: false });
  win.setPosition(700, 600);
  t.after(() => controller.shutdown());
  return { controller, handlers, actions, win: () => win };
}

test('牵猫散步：窗口加宽、横向走一段，走完缩回当前桌宠的大小', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] });
  const L = loadLeash();
  for (const petId of ['maid-deepseek-whale', 'silver-kitten']) {
    const { controller, actions, win } = makeController(t, petId);
    const before = win().getBounds();
    assert.equal(controller.perform('leash-walk'), true);
    const sent = actions.find((a) => a.action === 'leash-walk');
    assert.ok(sent, petId);
    assert.ok(sent.direction === 1 || sent.direction === -1);
    const wide = win().getBounds();
    assert.equal(wide.width, L.layout(1, 1).width, '加宽到能放下两只');
    assert.equal(wide.height, before.height);
    const startX = wide.x;
    t.mock.timers.tick(1500);
    const midX = win().getBounds().x;
    assert.ok(Math.sign(midX - startX) === sent.direction, '朝发送给窗口的方向走');
    t.mock.timers.tick(20000);
    const after = win().getBounds();
    assert.deepEqual([after.width, after.height], [before.width, before.height], '走完恢复原尺寸');
    assert.equal(actions.at(-1).action, 'idle');
  }
});

test('散步途中被拖动或换成别的动作，会立刻收起加宽的窗口', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] });
  const { controller, handlers, win } = makeController(t, 'maid-deepseek-whale');
  const before = win().getBounds();
  controller.perform('leash-walk');
  t.mock.timers.tick(800);
  assert.ok(win().getBounds().width > before.width);
  handlers.get('pet:drag-start')({ sender: win().webContents });
  assert.equal(win().getBounds().width, before.width, '拖动开始时恢复');
  handlers.get('pet:drag-end')({ sender: win().webContents });
  controller.perform('leash-walk');
  t.mock.timers.tick(800);
  controller.perform('sleep');
  assert.equal(win().getBounds().width, before.width, '换成别的动作时恢复');
});

test('只有女仆和小猫会牵绳散步；其他桌宠退回普通散步', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] });
  const { controller, actions } = makeController(t, 'glasses-buddy');
  controller.perform('leash-walk');
  assert.ok(!actions.some((a) => a.action === 'leash-walk'));
  assert.ok(actions.some((a) => a.action === 'walk'));
});

test('桌宠窗口加载牵绳脚本，按帧播放素材，向左时镜像，其他动作会先收起', () => {
  const html = fs.readFileSync(path.join(__dirname, '../electron/pet-window.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '../electron/pet-window.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../electron/pet-window.css'), 'utf8');
  assert.ok(html.indexOf('pet-leash.js') > -1 && html.indexOf('pet-leash.js') < html.indexOf('pet-window.js'), '先加载 pet-leash.js');
  assert.match(html, /<canvas id="leash-canvas"/);
  assert.match(js, /PetLeash\.frameUrl\(/, '从素材目录加载帧');
  assert.match(js, /A\.frameAt\(now-leash\.start\)/, '按经过时间换帧');
  assert.match(js, /if\(leash\.dir<0\)\{ctx\.translate\(w,0\);ctx\.scale\(-1,1\);\}/, '向左走时镜像');
  assert.match(js, /ctx\.drawImage\(img,c\.x,c\.y,c\.w,c\.h,0,0,w,h\)/, '只画裁剪区');
  assert.match(js, /action==='leash-walk'/);
  assert.match(js, /if\(leash&&action!=='leash-walk'/, '其他动作会先收起散步画面');
  assert.match(css, /body\.leash-walk video,body\.leash-walk #pet-sprite,body\.leash-walk #kitten/, '散步时藏起单只桌宠');
});
