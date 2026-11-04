// 把"演示方法"动画录成视频：npm run render:usage-demo
//   --stills 3,12.5,40   只导出这几秒的静帧到 .codex-temp/usage-demo-stills/（检查画面用）
//   --out <文件>          视频输出位置，默认 src/assets/usage-demo.mp4
//   --fps 30             帧率
// 用离屏窗口加载 index.html，逐帧调用 renderAt(秒)，用调试协议 Page.captureScreenshot 截图
// （离屏窗口的 paint 事件有时给空图或上一帧，不可靠），交给 ffmpeg（ffmpeg-static）编码成 H.264 MP4。
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const ffmpegPath = require('ffmpeg-static');

const root = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const fps = Number(option('--fps')) || 30;
const out = path.resolve(root, option('--out') || 'src/assets/usage-demo.mp4');
const stills = option('--stills')?.split(',').map(Number).filter((n) => Number.isFinite(n));

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-gpu-vsync');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
  win.webContents.setUserAgent(`${win.webContents.getUserAgent()} NestUsageDemoRecorder`);
  win.webContents.setFrameRate(60);
  await win.loadFile(path.join(__dirname, 'index.html'));
  const duration = await win.webContents.executeJavaScript('window.demoReady');
  const cdp = win.webContents.debugger;
  cdp.attach('1.3');
  await cdp.sendCommand('Page.enable');

  const frameAt = async (seconds) => {
    await win.webContents.executeJavaScript(`window.renderAt(${seconds}); new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    const { data } = await cdp.sendCommand('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1280, height: 720, scale: 1 } });
    return Buffer.from(data, 'base64');
  };

  if (stills?.length) {
    const dir = path.join(root, '.codex-temp', 'usage-demo-stills');
    fs.mkdirSync(dir, { recursive: true });
    for (const s of stills) {
      const file = path.join(dir, `t-${String(s).replace('.', '_')}.png`);
      fs.writeFileSync(file, await frameAt(s));
      console.log('saved', file);
    }
    app.quit();
    return;
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const encoder = spawn(ffmpegPath, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(fps), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const total = Math.round(duration * fps);
  const started = Date.now();
  for (let f = 0; f < total; f++) {
    const png = await frameAt(f / fps);
    if (!encoder.stdin.write(png)) await once(encoder.stdin, 'drain');
    if (f % (fps * 5) === 0) console.log(`frame ${f}/${total} (${Math.round((Date.now() - started) / 1000)}s)`);
  }
  encoder.stdin.end();
  const [code] = await once(encoder, 'close');
  if (code !== 0) { console.error(`ffmpeg exited with ${code}`); app.exit(1); return; }
  console.log(`saved ${out} (${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB, ${duration}s @ ${fps}fps)`);
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });
