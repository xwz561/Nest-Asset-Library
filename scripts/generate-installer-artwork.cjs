const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const ffmpegPath = require('ffmpeg-static');

const root = path.resolve(__dirname, '..');
const artworkDirectory = path.join(root, 'build', 'installer-artwork');
const width = 240;
const height = 108;
const frameRate = 12;
const frameCount = 24;
const background = '#F4F6FA';

function alphaBounds(imageData, imageWidth, imageHeight) {
  const data = imageData.data;
  let left = imageWidth;
  let top = imageHeight;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < imageHeight; y += 1) {
    for (let x = 0; x < imageWidth; x += 1) {
      if (data[(y * imageWidth + x) * 4 + 3] < 32) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) throw new Error('Installer character image has no visible pixels.');
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

async function drawContained(context, image, bounds, x, y, maxWidth, maxHeight, bob) {
  const scale = Math.min(maxWidth / bounds.width, maxHeight / bounds.height);
  const drawWidth = bounds.width * scale;
  const drawHeight = bounds.height * scale;
  context.drawImage(
    image,
    bounds.x, bounds.y, bounds.width, bounds.height,
    x + (maxWidth - drawWidth) / 2,
    y + (maxHeight - drawHeight) / 2 + bob,
    drawWidth,
    drawHeight,
  );
}

function writeBitmap(pathname, imageData) {
  const rowBytes = Math.ceil((width * 3) / 4) * 4;
  const pixelsLength = rowBytes * height;
  const file = Buffer.alloc(54 + pixelsLength);
  file.write('BM', 0, 'ascii');
  file.writeUInt32LE(file.length, 2);
  file.writeUInt32LE(54, 10);
  file.writeUInt32LE(40, 14);
  file.writeInt32LE(width, 18);
  file.writeInt32LE(height, 22);
  file.writeUInt16LE(1, 26);
  file.writeUInt16LE(24, 28);
  file.writeUInt32LE(0, 30);
  file.writeUInt32LE(pixelsLength, 34);
  for (let y = 0; y < height; y += 1) {
    const sourceY = height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const source = (sourceY * width + x) * 4;
      const target = 54 + y * rowBytes + x * 3;
      file[target] = imageData[source + 2];
      file[target + 1] = imageData[source + 1];
      file[target + 2] = imageData[source];
    }
  }
  fs.writeFileSync(pathname, file);
}

async function main() {
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) throw new Error('The bundled ffmpeg executable is unavailable.');
  const person = await loadImage(path.join(artworkDirectory, 'person.png'));
  const mascot = await loadImage(path.join(artworkDirectory, 'mascot.png'));
  const personProbe = createCanvas(person.width, person.height).getContext('2d');
  const mascotProbe = createCanvas(mascot.width, mascot.height).getContext('2d');
  personProbe.drawImage(person, 0, 0);
  mascotProbe.drawImage(mascot, 0, 0);
  const personBounds = alphaBounds(personProbe.getImageData(0, 0, person.width, person.height), person.width, person.height);
  const mascotBounds = alphaBounds(mascotProbe.getImageData(0, 0, mascot.width, mascot.height), mascot.width, mascot.height);

  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  const outputPath = path.join(artworkDirectory, 'installer-characters.avi');
  const previewPath = path.join(artworkDirectory, 'installer-characters-preview.png');
  const bitmapPath = path.join(artworkDirectory, 'installer-characters.bmp');
  const ffmpeg = spawn(ffmpegPath, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${width}x${height}`,
    '-framerate', String(frameRate), '-i', 'pipe:0', '-an',
    '-c:v', 'rawvideo', '-pix_fmt', 'bgr24', '-vtag', 'DIB', '-r', String(frameRate),
    '-f', 'avi', outputPath,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  let ffmpegError = '';
  ffmpeg.stderr.setEncoding('utf8');
  ffmpeg.stderr.on('data', chunk => { ffmpegError += chunk; });

  for (let frame = 0; frame < frameCount; frame += 1) {
    const phase = (frame / frameCount) * Math.PI * 2;
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    await drawContained(context, person, personBounds, 3, -4, 114, 114, Math.sin(phase) * 2.5);
    await drawContained(context, mascot, mascotBounds, 123, -4, 114, 114, Math.sin(phase + Math.PI / 2) * 3.5);
    const pixels = context.getImageData(0, 0, width, height).data;
    if (frame === 0) {
      fs.writeFileSync(previewPath, canvas.toBuffer('image/png'));
      writeBitmap(bitmapPath, pixels);
    }
    if (!ffmpeg.stdin.write(Buffer.from(pixels))) await once(ffmpeg.stdin, 'drain');
  }
  ffmpeg.stdin.end();
  const [code] = await once(ffmpeg, 'close');
  if (code !== 0) throw new Error(`ffmpeg could not encode the installer animation: ${ffmpegError.trim()}`);
  const stat = fs.statSync(outputPath);
  console.log(`Generated ${path.relative(root, outputPath)} (${stat.size} bytes, ${frameCount} frames, ${width}x${height} at ${frameRate} fps).`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
