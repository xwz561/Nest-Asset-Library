const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

app.whenReady().then(async () => {
  if (process.platform !== 'darwin') throw new Error('Mac 图标必须在 macOS 上生成');
  const root = path.resolve(__dirname, '..');
  const source = path.join(root, 'build', 'icon.png');
  const iconset = path.join(root, 'build', 'icon.iconset');
  fs.rmSync(iconset, { recursive: true, force: true });
  fs.mkdirSync(iconset, { recursive: true });
  const sourceImage = nativeImage.createFromPath(source);
  if (sourceImage.isEmpty()) throw new Error(`无法读取图标：${source}`);
  const image = sourceImage.resize({ width: 1024, height: 1024, quality: 'best' });
  const variants = [[16,'icon_16x16.png'],[32,'icon_16x16@2x.png'],[32,'icon_32x32.png'],[64,'icon_32x32@2x.png'],[128,'icon_128x128.png'],[256,'icon_128x128@2x.png'],[256,'icon_256x256.png'],[512,'icon_256x256@2x.png'],[512,'icon_512x512.png'],[1024,'icon_512x512@2x.png']];
  for (const [size, name] of variants) fs.writeFileSync(path.join(iconset, name), image.resize({ width: size, height: size, quality: 'best' }).toPNG());
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(root, 'build', 'icon.icns')], { stdio: 'inherit' });
  fs.rmSync(iconset, { recursive: true, force: true });
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
