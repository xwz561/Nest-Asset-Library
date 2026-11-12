// 空素材库的趣味彩蛋：鼠标靠近按钮时，按钮被轻轻“吸”向鼠标，离开后弹回原位。
// 只是视觉位移，始终点得到；键盘、读屏照常触发（不改按钮本身的属性和事件）。
// 位移写进按钮的 CSS 变量 --magnet-x / --magnet-y，由 soft-ui.css 用独立的 translate 属性
// 渲染，不和按钮按下时的 transform 冲突。只挂在空状态区域上，素材网格里没有任何监听（LES-007）。

export const MAGNETIC_PULL_DEFAULTS = Object.freeze({
  radius: 64,     // 按钮边缘外多少 px 开始吸引
  strength: 0.2,  // 按钮跟随鼠标偏移量的比例
  maxOffset: 10,  // 最多位移多少 px，保持“轻微”
});

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// rect: { left, top, width, height }；pointer: { x, y }。返回 { x, y }，单位 px，已四舍五入到 0.1。
export function magneticOffset(rect, pointer, options = {}) {
  const { radius, strength, maxOffset } = { ...MAGNETIC_PULL_DEFAULTS, ...options };
  if (!rect || !pointer || !(radius > 0) || !(strength > 0)) return { x: 0, y: 0 };
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  // 到按钮矩形边缘的距离；鼠标在按钮上时为 0（满强度）
  const outX = pointer.x < rect.left ? rect.left - pointer.x : pointer.x > right ? pointer.x - right : 0;
  const outY = pointer.y < rect.top ? rect.top - pointer.y : pointer.y > bottom ? pointer.y - bottom : 0;
  const distance = Math.hypot(outX, outY);
  if (distance >= radius) return { x: 0, y: 0 };
  // 场边缘平滑衰减到 0（smoothstep），不会在边界上突然一跳
  const t = 1 - distance / radius;
  const falloff = t * t * (3 - 2 * t);
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const round = (v) => Math.round(clamp(v, -maxOffset, maxOffset) * 10) / 10 || 0;
  return {
    x: round((pointer.x - cx) * strength * falloff),
    y: round((pointer.y - cy) * strength * falloff),
  };
}

const prefersReducedMotion = (win) => !!win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// 给容器里的按钮挂上磁吸效果，返回清理函数。可直接当 React 19 的回调 ref 用。
export function attachMagneticPull(container, { selector = "button", ...options } = {}) {
  if (!container) return undefined;
  const win = container.ownerDocument?.defaultView;
  if (!win) return undefined;
  let frame = 0;
  let pointer = null;
  const buttons = () => [...container.querySelectorAll(selector)];
  const write = (button, x, y) => {
    button.style.setProperty("--magnet-x", `${x}px`);
    button.style.setProperty("--magnet-y", `${y}px`);
  };
  const reset = () => {
    pointer = null;
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    for (const button of buttons()) write(button, 0, 0);
  };
  const update = () => {
    frame = 0;
    if (!pointer) return;
    if (prefersReducedMotion(win)) { reset(); return; }
    for (const button of buttons()) {
      if (button.disabled) { write(button, 0, 0); continue; }
      // 量按钮的原始位置：当前矩形减去正在生效的 translate（回弹过渡中也准），避免“越吸越远”
      const r = button.getBoundingClientRect();
      const [dx = 0, dy = 0] = (win.getComputedStyle(button).translate || "").split(" ").map((v) => parseFloat(v) || 0);
      const rect = { left: r.left - dx, top: r.top - dy, width: r.width, height: r.height };
      const { x, y } = magneticOffset(rect, pointer, options);
      write(button, x, y);
    }
  };
  const move = (event) => {
    if (event.pointerType === "touch") return;
    pointer = { x: event.clientX, y: event.clientY };
    if (!frame) frame = win.requestAnimationFrame(update);
  };
  container.addEventListener("pointermove", move, { passive: true });
  container.addEventListener("pointerleave", reset);
  win.addEventListener("blur", reset);
  return () => {
    container.removeEventListener("pointermove", move);
    container.removeEventListener("pointerleave", reset);
    win.removeEventListener("blur", reset);
    reset();
  };
}
