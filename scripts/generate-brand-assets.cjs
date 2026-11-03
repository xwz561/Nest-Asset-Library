const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const root = path.resolve(__dirname, '..');
const build = path.join(root, 'build');
const iconPath = path.join(build, 'icon.png');
const appVersion = require(path.join(root, 'package.json')).version;

function roundedPath(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function drawRoundedImage(context, image, x, y, width, height, radius) {
  context.save();
  roundedPath(context, x, y, width, height, radius);
  context.clip();
  context.drawImage(image, x, y, width, height);
  context.restore();
}

function canvasToBmp(canvas) {
  const { width, height } = canvas;
  const rgba = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  const rowBytes = Math.ceil((width * 3) / 4) * 4;
  const pixels = Buffer.alloc(rowBytes * height);

  for (let y = 0; y < height; y += 1) {
    const sourceY = height - y - 1;
    for (let x = 0; x < width; x += 1) {
      const source = (sourceY * width + x) * 4;
      const target = y * rowBytes + x * 3;
      pixels[target] = rgba[source + 2];
      pixels[target + 1] = rgba[source + 1];
      pixels[target + 2] = rgba[source];
    }
  }

  const header = Buffer.alloc(54);
  header.write('BM');
  header.writeUInt32LE(header.length + pixels.length, 2);
  header.writeUInt32LE(header.length, 10);
  header.writeUInt32LE(40, 14);
  header.writeInt32LE(width, 18);
  header.writeInt32LE(height, 22);
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(24, 28);
  header.writeUInt32LE(pixels.length, 34);
  return Buffer.concat([header, pixels]);
}

async function createIcon(image) {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const frames = sizes.map(size => {
    const canvas = createCanvas(size, size);
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, size, size);
    return { size, data: canvas.toBuffer('image/png') };
  });
  const directorySize = 6 + frames.length * 16;
  const directory = Buffer.alloc(directorySize);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(frames.length, 4);

  let offset = directorySize;
  for (const [index, frame] of frames.entries()) {
    const entry = 6 + index * 16;
    directory.writeUInt8(frame.size === 256 ? 0 : frame.size, entry);
    directory.writeUInt8(frame.size === 256 ? 0 : frame.size, entry + 1);
    directory.writeUInt8(0, entry + 2);
    directory.writeUInt8(0, entry + 3);
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(frame.data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += frame.data.length;
  }

  const icon = Buffer.concat([directory, ...frames.map(frame => frame.data)]);
  fs.writeFileSync(path.join(build, 'icon.ico'), icon);
  fs.writeFileSync(path.join(build, 'desktop-shortcut-icon.ico'), icon);
}

function createInstallerSidebar(image) {
  const canvas = createCanvas(164, 314);
  const context = canvas.getContext('2d');
  const background = context.createLinearGradient(0, 0, 164, 314);
  background.addColorStop(0, '#271633');
  background.addColorStop(0.58, '#301b3b');
  background.addColorStop(1, '#142643');
  context.fillStyle = background;
  context.fillRect(0, 0, 164, 314);

  context.fillStyle = 'rgba(214, 106, 205, 0.10)';
  context.beginPath();
  context.ellipse(154, 73, 84, 104, -0.42, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = 'rgba(111, 142, 220, 0.11)';
  context.beginPath();
  context.ellipse(12, 294, 100, 123, 0.45, 0, Math.PI * 2);
  context.fill();

  roundedPath(context, 15, 20, 88, 18, 9);
  context.fillStyle = '#E975C5';
  context.fill();
  context.font = 'bold 7px Arial';
  context.fillStyle = '#321934';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('ASSET LIBRARY', 59, 29);

  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillStyle = '#FFFFFF';
  context.font = 'bold 19px "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';
  context.fillText('小旺仔', 15, 65);
  context.font = 'bold 14px "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';
  context.fillText('素材库', 15, 85);
  context.fillStyle = '#DED5E3';
  context.font = '8px "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';
  context.fillText('灵感 · 素材 · 创作', 15, 104);

  roundedPath(context, 19, 133, 116, 115, 14);
  context.fillStyle = 'rgba(255,255,255,0.10)';
  context.fill();
  context.strokeStyle = 'rgba(255,255,255,0.12)';
  context.lineWidth = 1;
  context.stroke();
  drawRoundedImage(context, image, 29, 143, 96, 96, 12);

  context.fillStyle = '#FFFFFF';
  context.font = 'bold 11px "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';
  context.fillText('小旺仔素材库', 15, 271);
  context.fillStyle = '#C8C0D0';
  context.font = '9px Arial';
  context.fillText(`${appVersion}  ·  Windows`, 15, 286);
  roundedPath(context, 15, 292, 32, 3, 1.5);
  context.fillStyle = '#E975C5';
  context.fill();

  fs.writeFileSync(path.join(build, 'installerSidebar.bmp'), canvasToBmp(canvas));
}

function createInstallerHeader(image) {
  const canvas = createCanvas(150, 57);
  const context = canvas.getContext('2d');
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawRoundedImage(context, image, 101, 7, 42, 42, 7);
  fs.writeFileSync(path.join(build, 'installerHeader.bmp'), canvasToBmp(canvas));
}

async function main() {
  if (!fs.existsSync(iconPath)) throw new Error(`Brand icon is missing: ${iconPath}`);
  const image = await loadImage(iconPath);
  await createIcon(image);
  createInstallerSidebar(image);
  createInstallerHeader(image);
  console.log(`Generated the shared ${appVersion} app, shortcut, and installer branding assets.`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
