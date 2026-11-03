/*
 * 银渐层小猫 · 新动作引擎
 *
 * 取代原来“按固定时长硬切精灵图帧”的做法：
 *  - 帧与帧之间做交叉淡化，姿态之间不再跳变；
 *  - 待机有呼吸、随机眨眼 / 张望 / 竖耳，鼠标靠近时视线平滑跟随；
 *  - 走路按步伐起伏、轻微前倾，起步由慢到快；
 *  - 被拎起时像真的被提着一样摇摆（弹簧阻尼），松手有落地缓冲；
 *  - 点击会随机做招手 / 作揖 / 歪头 / 眨眼 / 托腮，并带一下小蹦跳；
 *  - 睡觉：低头 → 趴下 → 闭眼呼吸；醒来反向伸懒腰；
 *  - 饿到 0：趴在地上不动（不再旋转），喂食后抬头弹起；
 *  - 喂食：低头咀嚼点头，吃完眨眼开心蹦一下。
 *
 * 本文件分两层：控制器（纯逻辑，可在 Node 里测试）与渲染器（canvas，仅浏览器）。
 * 精灵图规格：8 列 × 11 行，单格 192×208（行：0 待机 1 右走 2 左走 3 招手 4 跳 5 低落/趴下
 * 6 讨好 7 玩耍 8 思考 9-10 十六个视线方向）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KittenMotion = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CELL_W = 192;
  const CELL_H = 208;
  const GROUND_Y = 200;       // 猫脚底在单格里的纵坐标（各行已基本对齐）
  const PIVOT_X = 96;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

  // 各行单格内的重心 x（离线测得），走路时用来抵消左右抖动
  const CX = {
    1: [87, 98, 97, 99, 96, 96, 91, 92],
    2: [96, 99, 99, 95, 96, 95, 98, 101],
  };
  const CX_MEAN = { 1: 94.5, 2: 97.4 };

  // ---------- 动作片段（f = [行, 列]，ms = 停留，fade = 从上一帧淡入的时长） ----------
  const S = (row, col, ms, fade) => ({ f: [row, col], ms, fade: fade === undefined ? 70 : fade });

  const CLIPS = {
    blink: [S(0, 1, 110, 35), S(0, 0, 0, 55)],
    glanceUp: [S(0, 2, 1100, 140), S(0, 0, 0, 170)],
    glanceUp2: [S(0, 4, 1000, 140), S(0, 0, 0, 170)],
    perk: [S(0, 3, 900, 120), S(0, 0, 0, 150)],
    settle: [S(0, 5, 380, 90), S(0, 0, 0, 160)],
    sadLookDown: [S(5, 1, 1500, 160), S(5, 0, 0, 200)],
    sadBlink: [S(5, 6, 420, 120), S(5, 0, 0, 160)],
    sadSigh: [S(5, 7, 900, 160), S(5, 0, 0, 200)],
    sleepDown: [S(5, 1, 260, 120), S(5, 2, 320, 120), S(5, 3, 520, 60), S(5, 4, 0, 200)],
    wakeUp: [S(5, 3, 280, 140), S(5, 2, 300, 60), S(5, 1, 220, 120), S(0, 0, 0, 200)],
    collapseDown: [S(5, 1, 260, 120), S(5, 2, 320, 120), S(5, 3, 420, 60), S(5, 5, 0, 220)],
    rise: [S(5, 3, 360, 160), S(5, 2, 300, 60), S(0, 4, 700, 140), S(0, 0, 0, 160)],
    wave: [S(3, 0, 120, 60), S(3, 1, 160, 60), S(3, 2, 260, 50), S(3, 1, 150, 50), S(3, 2, 260, 50), S(3, 3, 180, 60), S(0, 0, 0, 150)],
    beg: [S(6, 1, 220, 100), S(6, 2, 240, 90), S(6, 3, 800, 110), S(6, 5, 260, 100), S(0, 0, 0, 150)],
    tilt: [S(6, 4, 1000, 140), S(6, 5, 260, 100), S(0, 0, 0, 150)],
    wink: [S(7, 3, 260, 90), S(7, 4, 640, 60), S(7, 3, 240, 60), S(0, 0, 0, 150)],
    think: [S(8, 1, 1200, 140), S(8, 0, 300, 120), S(0, 0, 0, 150)],
    shy: [S(8, 2, 900, 140), S(8, 0, 260, 120), S(0, 0, 0, 150)],
    grab: [S(4, 1, 100, 40), S(4, 2, 0, 60)],
    land: [S(4, 3, 90, 40), S(4, 4, 150, 40), S(0, 5, 220, 50), S(0, 0, 0, 160)],
    eat: [S(5, 1, 1500, 150)],
    happy: [S(7, 4, 600, 70), S(3, 1, 200, 60), S(3, 2, 380, 60), S(0, 0, 0, 160)],
    stretch: [S(8, 0, 420, 100), S(0, 5, 360, 100), S(0, 0, 0, 160)],
    groom: [S(8, 1, 460, 120), S(8, 0, 220, 70), S(8, 1, 460, 70), S(8, 0, 220, 70), S(8, 1, 460, 70), S(8, 0, 260, 90), S(0, 0, 0, 150)],
    pounce: [S(4, 0, 130, 50), S(4, 1, 140, 40), S(4, 2, 200, 40), S(4, 3, 150, 40), S(4, 4, 170, 40), S(0, 5, 240, 50), S(0, 0, 0, 150)],
  };
  const INTERACT_ORDER = ['wave', 'beg', 'tilt', 'wink', 'think', 'shy'];

  // ---------- 叠加动作（不改变帧，只改变身体形变） ----------
  const IMPULSES = {
    hop: { dur: 520, fn: (u, k) => {
      const h = 7 * (k || 1), arc = Math.sin(Math.PI * u);
      const sq = (u < 0.2 ? (1 - u / 0.2) : 0) * 0.07 + (u > 0.8 ? (u - 0.8) / 0.2 : 0) * 0.07;
      const sy = 1 + 0.045 * arc - sq;
      return { ty: -h * Math.pow(arc, 0.85), sy, sx: 1 / Math.sqrt(sy) };
    } },
    land: { dur: 460, fn: (u) => {
      const s = -0.13 * Math.exp(-5.5 * u) * Math.cos(15 * u);
      return { sy: 1 + s, sx: 1 - s * 0.7 };
    } },
    settle: { dur: 360, fn: (u) => {
      const s = -0.045 * Math.exp(-5 * u) * Math.cos(13 * u);
      return { sy: 1 + s, sx: 1 - s * 0.6 };
    } },
    stretch: { dur: 900, fn: (u) => {
      const a = Math.sin(Math.PI * smooth(u));
      return { sx: 1 + 0.045 * a, sy: 1 - 0.035 * a, ty: 0 };
    } },
    nod: { dur: 1500, fn: (u) => {
      const env = Math.sin(Math.PI * clamp(u, 0, 1));
      const w = Math.sin(2 * Math.PI * u * 5);
      return { ty: 1.8 * w * env, rot: 0.02 * w * env };
    } },
    rumble: { dur: 700, fn: (u) => {
      const env = Math.sin(Math.PI * u);
      const w = Math.sin(2 * Math.PI * u * 9);
      return { tx: 0.8 * w * env, sy: 1 - 0.012 * Math.abs(w) * env };
    } },
    flop: { dur: 520, fn: (u) => {
      const s = 0.1 * Math.exp(-5 * u) * Math.cos(14 * u);
      return { sy: 1 + s, sx: 1 - s * 0.5 };
    } },
  };

  function createController(opts) {
    const random = (opts && opts.random) || Math.random;
    const st = {
      now: 0, started: false,
      mode: 'idle',            // idle | walk | sleep | collapsed | drag | action
      hunger: 10,
      cur: [0, 0], prev: null, fadeMs: 0, fadeAt: 0,
      clip: null, clipStep: 0, clipAt: 0, clipDone: null,
      hold: null,              // 片段结束后保持的帧
      walk: { dir: 1, at: 0, step: 0, stepAt: 0 },
      idleAt: 0,
      gaze: { target: null, cell: null, changedAt: 0, deg: null },
      drag: { rot: 0, vel: 0, vx: 0, lastAt: 0 },
      impulses: [],
      interactIndex: Math.floor(random() * INTERACT_ORDER.length),
      sleeping: false,
      starved: false,
    };

    const hungry = () => st.hunger <= 4;
    const baseFrame = () => (st.starved ? [5, 5] : st.sleeping ? [5, 4] : hungry() ? [5, 0] : [0, 0]);

    function show(frame, fade) {
      if (st.cur[0] === frame[0] && st.cur[1] === frame[1]) return;
      st.prev = st.cur;
      st.cur = [frame[0], frame[1]];
      st.fadeMs = fade || 0;
      st.fadeAt = st.now;
    }

    function startClip(name, onDone) {
      const clip = typeof name === 'string' ? CLIPS[name] : name;
      st.clip = clip; st.clipStep = 0; st.clipDone = onDone || null;
      st.clipAt = st.now;
      show(clip[0].f, clip[0].fade);
    }

    function stopClip() { st.clip = null; st.clipDone = null; }

    function addImpulse(kind, k) {
      st.impulses.push({ kind, at: st.now, k: k || 1 });
    }

    function scheduleIdle() {
      st.idleAt = st.now + 1800 + random() * 3600;
    }

    function backToIdle(fade) {
      st.mode = 'idle';
      stopClip();
      show(baseFrame(), fade === undefined ? 160 : fade);
      scheduleIdle();
    }

    // ---------- 对外动作 ----------
    const api = {
      state: st,

      setHunger(value, instant) {
        const n = clamp(Number.isFinite(Number(value)) ? Number(value) : 10, 0, 10);
        const before = st.hunger;
        st.hunger = n;
        if (n <= 0 && !st.starved) {
          st.starved = true; st.sleeping = false;
          if (st.mode === 'drag') return;
          if (instant) { stopClip(); st.mode = 'collapsed'; show([5, 5], 0); return; }
          st.mode = 'collapsed';
          startClip('collapseDown', () => { show([5, 5], 200); });
          addImpulse('flop');
        } else if (n > 0 && st.starved) {
          st.starved = false;
          st.mode = 'action';
          startClip('rise', () => backToIdle(160));
          addImpulse('hop', 1.2);
        } else if (st.mode === 'idle' && !st.clip && before !== n) {
          show(baseFrame(), 220);
        }
      },

      sleep() {
        if (st.starved) return;
        st.sleeping = true; st.mode = 'sleep';
        startClip('sleepDown', () => { show([5, 4], 220); });
      },

      wake() {
        if (!st.sleeping) return;
        st.sleeping = false;
        st.mode = 'action';
        startClip('wakeUp', () => { addImpulse('stretch'); backToIdle(160); });
      },

      idle() {
        if (st.mode === 'sleep') { api.wake(); return; }
        if (st.mode === 'collapsed') return;
        if (st.mode === 'drag') return;
        if (st.mode === 'walk') {
          st.mode = 'idle'; stopClip();
          show(baseFrame(), 180);
          addImpulse('settle');
          scheduleIdle();
          return;
        }
        if (st.mode === 'action') return;
        if (!st.clip) show(baseFrame(), 200);
      },

      walk(direction) {
        if (st.starved || st.mode === 'drag') return;
        if (st.sleeping) { st.sleeping = false; }
        const dir = direction < 0 ? -1 : 1;
        if (st.mode !== 'walk') { st.walk.at = st.now; st.walk.step = 0; st.walk.stepAt = st.now; }
        else if (st.walk.dir === dir) return;
        st.mode = 'walk'; stopClip(); st.walk.dir = dir; st.walk.step = 0; st.walk.stepAt = st.now;
        show([dir > 0 ? 1 : 2, 0], 130);
      },

      interact(kind) {
        if (st.starved) { addImpulse('rumble'); return; }
        if (st.mode === 'sleep') { api.wake(); return; }
        if (st.mode === 'drag') return;
        if (st.mode === 'walk') { st.mode = 'idle'; stopClip(); show(baseFrame(), 140); }
        let name = kind;
        if (!name) { st.interactIndex = (st.interactIndex + 1) % INTERACT_ORDER.length; name = INTERACT_ORDER[st.interactIndex]; }
        st.mode = 'action';
        startClip(name, () => backToIdle(160));
        addImpulse('hop', name === 'wave' ? 1 : 0.7);
      },

      /** 右键菜单里的专属动作：groom 舔爪 / stretch 伸懒腰 / pounce 扑 / meow 喵 / beg 要抱抱。 */
      emote(name) {
        if (st.starved) { addImpulse('rumble'); return; }
        if (st.mode === 'sleep') { api.wake(); return; }
        if (st.mode === 'drag') return;
        if (st.mode === 'walk') { st.mode = 'idle'; stopClip(); show(baseFrame(), 140); }
        const table = {
          groom: ['groom', null],
          stretch: ['stretch', ['stretch', 1]],
          pounce: ['pounce', ['hop', 1.9]],
          meow: ['tilt', ['hop', 0.6]],
          beg: ['beg', null],
        };
        const pick = table[name];
        if (!pick) { api.interact(); return; }
        st.mode = 'action';
        startClip(pick[0], () => backToIdle(160));
        if (pick[1]) addImpulse(pick[1][0], pick[1][1]);
      },

      feed() {
        const wasStarved = st.starved;
        if (wasStarved) return;           // 恢复动作由 setHunger 触发
        if (st.mode === 'sleep') { st.sleeping = false; }
        st.mode = 'action';
        startClip('eat', () => {
          addImpulse('hop', 1);
          startClip('happy', () => backToIdle(160));
        });
        addImpulse('nod');
      },

      dragStart() {
        if (st.mode === 'drag') return;
        st.sleeping = false;
        st.mode = 'drag'; stopClip();
        st.drag.rot = 0; st.drag.vel = 0; st.drag.vx = 0; st.drag.lastAt = st.now;
        startClip('grab');
      },

      dragMove(dx, dtMs) {
        if (st.mode !== 'drag') api.dragStart();
        const v = dx / Math.max(4, dtMs || 16) * 1000;
        st.drag.vx = lerp(st.drag.vx, v, 0.45);
        st.drag.lastAt = st.now;
      },

      dragEnd() {
        if (st.mode !== 'drag') return;
        st.mode = 'action';
        const starved = st.starved;
        startClip('land', () => backToIdle(160));
        addImpulse('land');
        if (starved) { stopClip(); st.mode = 'collapsed'; show([5, 5], 160); addImpulse('flop'); }
      },

      /** 0-15 的视线方向格；null 取消。 */
      lookAt(deg) {
        if (deg === null || deg === undefined) { st.gaze.target = null; st.gaze.deg = null; return; }
        const d = ((deg % 360) + 360) % 360;
        if (st.gaze.deg !== null) {
          const diff = Math.abs(((d - st.gaze.deg + 540) % 360) - 180);
          if (diff < 14) return;
        }
        st.gaze.deg = d;
        st.gaze.target = Math.round(d / 22.5) % 16;
      },

      update(nowMs) {
        const prevNow = st.started ? st.now : nowMs;
        st.now = nowMs; st.started = true;
        const dt = clamp(nowMs - prevNow, 0, 100);

        // 片段推进
        if (st.clip) {
          let guard = 0;
          while (st.clip && guard++ < 8) {
            const step = st.clip[st.clipStep];
            if (!step || step.ms <= 0 && st.clipStep >= st.clip.length - 1) {
              const done = st.clipDone; st.clip = null; st.clipDone = null;
              if (done) done();
              break;
            }
            if (nowMs - st.clipAt >= step.ms) {
              st.clipAt += step.ms; st.clipStep++;
              const next = st.clip[st.clipStep];
              if (next) show(next.f, next.fade);
              else { const done = st.clipDone; st.clip = null; st.clipDone = null; if (done) done(); }
            } else break;
          }
        }

        // 走路：循环帧，起步由慢到快
        if (st.mode === 'walk') {
          const age = nowMs - st.walk.at;
          const frameMs = lerp(175, 118, smooth(age / 700));
          if (nowMs - st.walk.stepAt >= frameMs) {
            st.walk.stepAt += frameMs; st.walk.step = (st.walk.step + 1) % 8;
            if (nowMs - st.walk.stepAt > frameMs * 3) st.walk.stepAt = nowMs;
            show([st.walk.dir > 0 ? 1 : 2, st.walk.step], Math.min(52, frameMs * 0.42));
          }
        }

        // 待机：随机眨眼 / 张望 / 竖耳
        if (st.mode === 'idle' && !st.clip) {
          const gazing = st.gaze.target !== null && !st.starved;
          if (gazing) {
            if (st.gaze.cell !== st.gaze.target && nowMs - st.gaze.changedAt > 90) {
              st.gaze.cell = st.gaze.target; st.gaze.changedAt = nowMs;
              show([st.gaze.cell < 8 ? 9 : 10, st.gaze.cell % 8], 120);
            }
          } else {
            if (st.gaze.cell !== null) { st.gaze.cell = null; show(baseFrame(), 200); }
            if (!st.idleAt) scheduleIdle();
            if (nowMs >= st.idleAt) {
              const r = random();
              if (st.hunger <= 4) {
                const name = r < 0.45 ? 'sadBlink' : r < 0.8 ? 'sadLookDown' : 'sadSigh';
                startClip(name, () => { show(baseFrame(), 200); });
                if (r >= 0.8) addImpulse('rumble');
                if (r >= 0.45 && r < 0.8) addImpulse('rumble');
              } else {
                const name = r < 0.58 ? 'blink' : r < 0.74 ? 'glanceUp' : r < 0.84 ? 'glanceUp2' : r < 0.94 ? 'perk' : 'settle';
                startClip(name, () => { show(baseFrame(), 160); });
              }
              scheduleIdle();
            }
          }
        } else if (st.mode !== 'idle') {
          st.gaze.cell = null;
        }

        // 被拎起：弹簧摇摆
        if (st.mode === 'drag') {
          st.drag.vx *= Math.exp(-dt / 140);
          const target = clamp(-st.drag.vx * 0.00055, -0.42, 0.42);
          const k = 70, c = 7.5, sdt = dt / 1000;
          st.drag.vel += (-k * (st.drag.rot - target) - c * st.drag.vel) * sdt;
          st.drag.rot += st.drag.vel * sdt;
        } else {
          st.drag.rot *= Math.exp(-dt / 90); st.drag.vel = 0;
        }

        // 清理过期叠加动作
        st.impulses = st.impulses.filter((i) => nowMs - i.at < IMPULSES[i.kind].dur);
      },

      /** 当前应绘制的状态。 */
      frame() {
        const now = st.now;
        const out = { layers: [], tx: 0, ty: 0, sx: 1, sy: 1, rot: 0, pivot: 'feet', shadow: 1, dim: 0 };
        const fadeT = st.fadeMs > 0 ? clamp((now - st.fadeAt) / st.fadeMs, 0, 1) : 1;
        if (st.prev && fadeT < 1) {
          out.layers.push({ row: st.prev[0], col: st.prev[1], alpha: 1 });
          out.layers.push({ row: st.cur[0], col: st.cur[1], alpha: smooth(fadeT) });
        } else {
          out.layers.push({ row: st.cur[0], col: st.cur[1], alpha: 1 });
        }

        // 常驻的程序化动作
        if (st.mode === 'idle' || st.mode === 'sleep' || st.mode === 'collapsed') {
          const slow = st.mode === 'sleep' ? 3300 : st.mode === 'collapsed' ? 4200 : hungry() ? 3400 : 2700;
          const amp = st.mode === 'sleep' ? 0.02 : st.mode === 'collapsed' ? 0.008 : hungry() ? 0.009 : 0.013;
          const b = Math.sin((2 * Math.PI * now) / slow);
          out.sy *= 1 + amp * b;
          out.sx *= 1 - amp * 0.45 * b;
          if (hungry() && st.mode === 'idle') out.ty += 1.5;
        } else if (st.mode === 'walk') {
          const frameMs = lerp(175, 118, smooth((now - st.walk.at) / 700));
          const phase = (st.walk.step + clamp((now - st.walk.stepAt) / frameMs, 0, 1)) / 8;
          const bob = Math.abs(Math.sin(Math.PI * phase * 2));
          out.ty += -2.2 * bob;
          out.sy *= 1 + 0.012 * bob;
          out.rot += st.walk.dir * 0.014;
          // 重心稳定：抵消格内左右漂移
          const row = st.walk.dir > 0 ? 1 : 2;
          const cx = CX[row][st.walk.step % 8];
          out.tx += (CX_MEAN[row] - cx) * 0.55;
        } else if (st.mode === 'drag') {
          out.rot += st.drag.rot;
          out.pivot = 'top';
          out.ty += -3;
          out.shadow = 0.55;
        }

        if (st.starved || (st.mode === 'sleep')) out.dim = st.starved ? 0.2 : 0.06;

        for (const imp of st.impulses) {
          const spec = IMPULSES[imp.kind];
          const u = clamp((now - imp.at) / spec.dur, 0, 1);
          const r = spec.fn(u, imp.k);
          if (r.sx) out.sx *= r.sx;
          if (r.sy) out.sy *= r.sy;
          if (r.ty) { out.ty += r.ty; out.shadow *= clamp(1 + r.ty / 40, 0.5, 1); }
          if (r.tx) out.tx += r.tx;
          if (r.rot) out.rot += r.rot;
        }
        return out;
      },
    };
    return api;
  }

  // ---------- 渲染器（仅浏览器） ----------
  function createRenderer(canvas, image, controller, opts) {
    const ctx = canvas.getContext('2d');
    let raf = 0, running = false, lastDraw = 0, dpr = 1, width = 0, height = 0;
    const onFrame = opts && opts.onFrame;

    function resize() {
      dpr = Math.max(1, Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (w !== width || h !== height) { width = w; height = h; canvas.width = w; canvas.height = h; }
    }

    function drawCell(row, col, alpha, scale) {
      ctx.globalAlpha = alpha;
      ctx.drawImage(image, col * CELL_W, row * CELL_H, CELL_W, CELL_H, 0, 0, CELL_W * scale, CELL_H * scale);
    }

    function draw(now) {
      resize();
      controller.update(now);
      const f = controller.frame();
      const scale = Math.min(width / CELL_W, height / CELL_H);
      const offX = (width - CELL_W * scale) / 2, offY = height - CELL_H * scale;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';

      // 地面阴影（随起跳高度变淡变小）
      const lift = Math.max(0, -f.ty);
      const shadowW = 46 * scale * (1 - Math.min(0.35, lift / 60)) * (0.9 + 0.1 * f.sx);
      ctx.save();
      ctx.translate(offX + PIVOT_X * scale, offY + (GROUND_Y + 2) * scale);
      ctx.scale(1, 0.2);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, shadowW);
      const a = 0.28 * f.shadow * (f.dim ? 0.9 : 1);
      g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, shadowW, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // 猫本体：以脚底（或被拎起时的头顶）为支点做缩放 / 旋转
      const pivotY = f.pivot === 'top' ? 20 : GROUND_Y;
      ctx.save();
      ctx.translate(offX + (PIVOT_X + f.tx) * scale, offY + (pivotY + f.ty) * scale);
      ctx.rotate(f.rot);
      ctx.scale(f.sx, f.sy);
      ctx.translate(-PIVOT_X * scale, -pivotY * scale);
      if (f.dim) ctx.filter = `saturate(${1 - f.dim * 1.6}) brightness(${1 - f.dim * 0.6})`;
      for (const layer of f.layers) drawCell(layer.row, layer.col, layer.alpha, scale);
      ctx.restore();
      ctx.globalAlpha = 1;
      if (onFrame) onFrame(f);
    }

    function loop(now) {
      if (!running) return;
      const st = controller.state;
      const busy = st.mode === 'walk' || st.mode === 'drag' || st.mode === 'action' || st.impulses.length || st.clip ||
        (st.fadeMs > 0 && now - st.fadeAt < st.fadeMs + 30);
      if (busy || now - lastDraw >= 33) { lastDraw = now; draw(now); }
      raf = requestAnimationFrame(loop);
    }

    return {
      start() { if (running) return; running = true; lastDraw = 0; raf = requestAnimationFrame(loop); },
      stop() { running = false; cancelAnimationFrame(raf); raf = 0; },
      drawNow(now) { draw(now); },
      get running() { return running; },
    };
  }

  return { CELL_W, CELL_H, CLIPS, IMPULSES, INTERACT_ORDER, createController, createRenderer };
});
