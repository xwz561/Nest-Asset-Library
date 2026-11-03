const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const root = path.join(__dirname, '..');
const width = 150;
const height = 57;

async function main() {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  const logo = await loadImage(path.join(root, 'build', 'icon.png'));
  context.drawImage(logo, 103, 8, 41, 41);
  const rgba = context.getImageData(0, 0, width, height).data;
  const rowBytes = Math.ceil((width * 3) / 4) * 4;
  const pixels = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y += 1) {
    const sourceY = height - 1 - y;
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
  header.writeUInt32LE(54 + pixels.length, 2);
  header.writeUInt32LE(54, 10);
  header.writeUInt32LE(40, 14);
  header.writeInt32LE(width, 18);
  header.writeInt32LE(height, 22);
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(24, 28);
  header.writeUInt32LE(pixels.length, 34);
  fs.writeFileSync(path.join(root, 'build', 'installerHeader.bmp'), Buffer.concat([header, pixels]));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
