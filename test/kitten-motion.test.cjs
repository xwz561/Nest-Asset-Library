const test = require('node:test');
const assert = require('node:assert/strict');
// pet-kitten.js 是页面里的普通脚本（工程 package.json 可能声明 type:module），这里用 vm 按 CommonJS 方式载入
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const sandbox = { module: { exports: {} }, Math, Number, Array, Object, console };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../electron/pet-kitten.js'), 'utf8'), sandbox);
const KM = sandbox.module.exports;

const seeded = (seed = 7) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
function run(c, from, to, step = 16, each) {
  for (let t = from; t <= to; t += step) { c.update(t); if (each) each(t, c.frame()); }
}
const shown = (c) => c.state.cur.join(',');

test('小猫待机：呼吸、眨眼、张望都会发生，且始终回到坐姿', () => {
  const c = KM.createController({ random: seeded(3) });
  const seen = new Set();
  run(c, 0, 60000, 16, () => seen.add(shown(c)));
  assert.ok(seen.has('0,0'), '坐姿');
  assert.ok(seen.has('0,1'), '眨眼');
  assert.ok([...seen].some((k) => ['0,2', '0,4', '0,3'].includes(k)), '张望或竖耳');
  // 没有动作片段、没有视线跟随时一定是坐姿
  let rest = 0;
  run(c, 61000, 90000, 16, () => { if (!c.state.clip && c.state.gaze.cell === null) { rest++; assert.equal(shown(c), '0,0'); } });
  assert.ok(rest > 1000);
  // 呼吸：纵向缩放随时间变化但幅度很小
  let min = 9, max = 0;
  run(c, 70000, 76000, 16, (t, f) => { min = Math.min(min, f.sy); max = Math.max(max, f.sy); });
  assert.ok(max - min > 0.01 && max - min < 0.06, `breath ${min}-${max}`);
});

test('所有输出都是有限数值，透明度在 0..1', () => {
  const c = KM.createController({ random: seeded(11) });
  const actions = [() => c.walk(1), () => c.walk(-1), () => c.idle(), () => c.interact(), () => c.sleep(), () => c.wake(),
    () => c.dragStart(), () => c.dragMove(40, 16), () => c.dragEnd(), () => c.feed(), () => c.setHunger(0), () => c.setHunger(8), () => c.lookAt(100)];
  let t = 0;
  for (let i = 0; i < 400; i++) {
    t += 40; if (i % 9 === 0) actions[(i / 9) % actions.length | 0]();
    c.update(t); const f = c.frame();
    for (const k of ['tx', 'ty', 'sx', 'sy', 'rot', 'shadow', 'dim']) assert.ok(Number.isFinite(f[k]), `${k} @${t}`);
    for (const l of f.layers) { assert.ok(l.alpha >= 0 && l.alpha <= 1); assert.ok(l.row >= 0 && l.row <= 10 && l.col >= 0 && l.col <= 7); }
  }
});

test('小猫走路：按方向用右走 / 左走行，循环 8 帧，帧间有交叉淡化', () => {
  const c = KM.createController({ random: seeded(1) });
  c.update(0); c.walk(1);
  const cols = new Set(); let sawFade = false;
  run(c, 16, 3000, 16, (t, f) => { cols.add(shown(c)); if (f.layers.length === 2) sawFade = true; });
  assert.deepEqual([...cols].every((k) => k.startsWith('1,')), true);
  assert.equal(cols.size, 8);
  assert.ok(sawFade, '走路帧之间应有淡化');
  c.walk(-1); run(c, 3016, 4500, 16);
  assert.ok(shown(c).startsWith('2,'));
  // 起步由慢到快
  const d = KM.createController({ random: seeded(1) }); d.update(0); d.walk(1);
  let first = 0, second = 0, last = d.state.cur.join(); let changes = [];
  run(d, 16, 2500, 8, () => { if (d.state.cur.join() !== last) { last = d.state.cur.join(); changes.push(d.state.now); } });
  const gap1 = changes[1] - changes[0], gapN = changes[changes.length - 1] - changes[changes.length - 2];
  assert.ok(gapN < gap1, `起步 ${gap1}ms → 稳定 ${gapN}ms`);
});

test('走路时身体有起伏与前倾，停下来有缓冲', () => {
  const c = KM.createController({ random: seeded(5) });
  c.update(0); c.walk(1);
  let minTy = 0, rot = 0;
  run(c, 16, 2000, 16, (t, f) => { minTy = Math.min(minTy, f.ty); rot = f.rot; });
  assert.ok(minTy < -1, `bob ${minTy}`);
  assert.ok(rot > 0, '向右走略微前倾');
  c.idle(); c.update(2016);
  assert.equal(c.state.mode, 'idle');
  assert.ok(c.state.impulses.some((i) => i.kind === 'settle'));
  run(c, 2032, 3000);
  assert.equal(shown(c), '0,0');
});

test('小猫睡觉：低头 → 趴下 → 闭眼；醒来反向，不再播放招手帧', () => {
  const c = KM.createController({ random: seeded(2) });
  c.update(0); c.sleep();
  const order = [];
  run(c, 16, 2500, 8, () => { const k = shown(c); if (order[order.length - 1] !== k) order.push(k); });
  assert.deepEqual(order, ['5,1', '5,2', '5,3', '5,4']);
  assert.equal(order[order.length - 1], '5,4');
  assert.ok(!order.some((k) => k.startsWith('3,') || k.startsWith('6,')), '睡觉不应出现招手/讨好帧');
  c.wake();
  const wake = [];
  run(c, 2516, 5500, 8, () => { const k = shown(c); if (wake[wake.length - 1] !== k) wake.push(k); });
  assert.deepEqual(wake.slice(0, 3), ['5,3', '5,2', '5,1']);
  assert.equal(wake[wake.length - 1], '0,0');
  assert.equal(c.state.mode, 'idle');
});

test('饥饿：≤4 用低落坐姿，0 时趴下不动且不旋转，喂食后恢复', () => {
  const c = KM.createController({ random: seeded(4) });
  c.update(0); c.setHunger(3); c.update(500);
  assert.equal(shown(c), '5,0');
  c.setHunger(0); run(c, 516, 3000, 16);
  assert.equal(shown(c), '5,5');
  assert.equal(c.state.mode, 'collapsed');
  let maxRot = 0; run(c, 3016, 4000, 16, (t, f) => { maxRot = Math.max(maxRot, Math.abs(f.rot)); });
  assert.ok(maxRot < 0.02, '趴倒状态不应旋转');
  // 趴着时点击 / 散步都不会让它起身
  c.interact(); c.walk(1); run(c, 4016, 5000, 16);
  assert.equal(c.state.mode, 'collapsed');
  assert.equal(shown(c), '5,5');
  c.setHunger(1); run(c, 5016, 8000, 16);
  assert.equal(c.state.mode, 'idle');
  assert.equal(shown(c), '5,0');
  // 瞬时设置（重启时）直接趴着，不播放过渡
  const d = KM.createController({ random: seeded(4) });
  d.update(0); d.setHunger(0, true);
  assert.equal(shown(d), '5,5');
  assert.equal(d.state.clip, null);
});

test('被拎起摇摆并随速度收敛，松手后落地缓冲再回到待机', () => {
  const c = KM.createController({ random: seeded(6) });
  c.update(0); c.dragStart(); run(c, 16, 200, 16);
  assert.equal(c.state.mode, 'drag');
  assert.equal(shown(c), '4,2');
  // 持续向右拖动 → 向后摆（负角度）
  let rotMid = 0;
  for (let t = 216; t < 900; t += 16) { c.dragMove(18, 16); c.update(t); rotMid = c.frame().rot; }
  assert.ok(rotMid < -0.05, `swing ${rotMid}`);
  assert.equal(c.frame().pivot, 'top');
  // 停止拖动：摇摆衰减
  run(c, 916, 3200, 16);
  assert.ok(Math.abs(c.state.drag.rot) < 0.01);
  c.dragEnd();
  assert.ok(c.state.impulses.some((i) => i.kind === 'land'));
  run(c, 3216, 4500, 16);
  assert.equal(c.state.mode, 'idle');
  assert.equal(shown(c), '0,0');
});

test('点击互动：依次轮换不同动作并带蹦跳，结束后回到待机', () => {
  const c = KM.createController({ random: seeded(9) });
  c.update(0);
  const used = new Set(); let t = 0;
  for (let i = 0; i < 6; i++) {
    c.interact(); used.add(c.state.clip && c.state.clip[0].f.join(','));
    assert.ok(c.state.impulses.some((p) => p.kind === 'hop'));
    for (let k = 0; k < 200; k++) { t += 16; c.update(t); }
    assert.equal(c.state.mode, 'idle');
  }
  assert.ok(used.size >= 5, `互动种类 ${used.size}`);
});

test('喂食：低头咀嚼 → 开心蹦一下 → 回到待机', () => {
  const c = KM.createController({ random: seeded(8) });
  c.update(0); c.feed();
  assert.equal(shown(c), '5,1');
  assert.ok(c.state.impulses.some((i) => i.kind === 'nod'));
  let t = 0, sawHappy = false;
  for (let k = 0; k < 400; k++) { t += 16; c.update(t); if (shown(c) === '7,4') sawHappy = true; }
  assert.ok(sawHappy);
  assert.equal(c.state.mode, 'idle');
});

test('视线跟随：切换有节流与滞回，离开后回到坐姿', () => {
  const c = KM.createController({ random: seeded(12) });
  c.update(0); c.lookAt(90); run(c, 16, 400, 16);
  assert.equal(shown(c), '9,4');
  c.lookAt(95); run(c, 416, 600, 16);
  assert.equal(shown(c), '9,4', '小角度抖动不换格');
  c.lookAt(270); run(c, 616, 900, 16);
  assert.equal(shown(c), '10,4');
  c.lookAt(null); run(c, 916, 1500, 16);
  assert.equal(shown(c), '0,0');
});

test('渲染层：不存在读取像素的调用（file:// 图片会污染画布）', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../electron/pet-kitten.js'), 'utf8');
  assert.ok(!/getImageData|toDataURL|toBlob/.test(src));
});
