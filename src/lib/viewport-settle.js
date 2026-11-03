// 等待渲染进程的视口宽度真正变化到位。
// 原生窗口缩放对页面的生效是异步的：主进程 setBounds 返回时，页面里的 window.innerWidth 往往还是旧值。
// 过早切换布局会让素材网格"先按旧宽度重排、再按新宽度重排"，肉眼就是跳动。
// delta：预期变化的像素（正负均可，取绝对值）；超时后无论如何都会返回，避免界面卡住。
export function waitForViewportShift(startWidth, delta, { timeout = 320, win = window } = {}) {
  const target = Math.abs(Number(delta) || 0);
  if (target <= 0) return Promise.resolve(true);
  return new Promise(resolve => {
    let done = false;
    let timer = 0;
    const finish = ok => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      win.removeEventListener("resize", check);
      resolve(ok);
    };
    const check = () => { if (Math.abs(win.innerWidth - startWidth) >= target - 2) finish(true); };
    win.addEventListener("resize", check);
    timer = setTimeout(() => finish(false), timeout);
    check();
  });
}
