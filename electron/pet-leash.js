/*
 * 鲸鱼女仆牵小猫散步：素材规格与窗口布局。
 *
 * 动画素材在 public/pets/maid-leash-kitten/（构建后在 dist/pets/…）：
 * 24 帧 512×512 透明 PNG，20 fps，一个循环 1.2 秒；女仆在左、小猫在右，原地朝右走。
 *
 * 主进程用 layout() 算加宽后的窗口尺寸，并在散步结束后把窗口缩回当前桌宠所在的位置；
 * 桌宠窗口用 FRAMES / FRAME_MS / CROP / frameUrl() 播放帧。两边共用同一份数字。
 * 纯数据和纯函数，可在 Node 里测试（UMD：主进程用 vm 加载，窗口用 <script> 加载）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PetLeash = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FRAMES = 24, FPS = 20, FRAME_MS = 1000 / FPS;
  const DIR = 'pets/maid-leash-kitten';
  // 24 帧不透明区域合起来的边框；只画这一块，四周的透明空白裁掉。
  const CROP = { x: 34, y: 41, w: 444, h: 432 };
  // 裁剪区里女仆和小猫各自占的位置（比例）。向左走时整幅镜像。
  const MAID = { x0: 0, x1: 0.62 };
  const CAT = { x0: 0.63, x1: 1, top: 0.49 };
  const BASE_HEIGHT = 124; // 和单只桌宠窗口一样高

  const frameName = (i) => `frame-${String(((i % FRAMES) + FRAMES) % FRAMES).padStart(3, '0')}.png`;
  /** 桌宠窗口里第 i 帧的地址（pet-window.html 在 electron/ 下，素材在 ../dist/）。 */
  const frameUrl = (i) => `../dist/${DIR}/${frameName(i)}`;
  /** 散步开始后 elapsed 毫秒时应该显示第几帧。 */
  const frameAt = (elapsed) => Math.floor(Math.max(0, Number(elapsed) || 0) / FRAME_MS) % FRAMES;

  /** 窗口布局：高度和单只桌宠相同，宽度按素材比例；whale / kitten 是两只各自的框。 */
  function layout(scale, dir) {
    const s = Math.min(2, Math.max(0.5, Number(scale) || 1));
    const right = dir >= 0;
    const height = Math.round(BASE_HEIGHT * s), width = Math.round(height * CROP.w / CROP.h);
    const span = (a, b) => (right ? [a, b] : [1 - b, 1 - a]).map((v) => Math.round(v * width));
    const [wx0, wx1] = span(MAID.x0, MAID.x1), [kx0, kx1] = span(CAT.x0, CAT.x1);
    const ky = Math.round(CAT.top * height);
    return {
      scale: s, dir: right ? 1 : -1, width, height,
      whale: { x: wx0, y: 0, w: wx1 - wx0, h: height },
      kitten: { x: kx0, y: ky, w: kx1 - kx0, h: height - ky },
    };
  }

  return { FRAMES, FPS, FRAME_MS, DIR, CROP, BASE_HEIGHT, frameName, frameUrl, frameAt, layout };
});
