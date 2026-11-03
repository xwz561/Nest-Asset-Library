const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const renderer = require('./source-tree.cjs').readSource(path.join(root, 'src', 'main.jsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');

test('video cards expose compact playback, seek, time, and mute controls', () => {
  assert.match(renderer, /function VideoCardMedia/);
  assert.match(renderer, /aria-label="视频卡片控制栏"/);
  assert.match(renderer, /aria-label=\{playing \? "暂停视频" : "播放视频"\}/);
  assert.match(renderer, /aria-label="视频播放进度"/);
  assert.match(renderer, /aria-label=\{muted \? "开启视频声音" : "静音视频"\}/);
  assert.match(renderer, /video\.currentTime = next/);
  assert.match(renderer, /video\.muted = next/);
});

test('video card controls appear on hover or keyboard focus without permanently covering the image', () => {
  assert.match(styles, /\.video-card-controls\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s);
  assert.match(styles, /\.video-card-media:hover \.video-card-controls/);
  assert.match(styles, /\.video-card-media:focus-within \.video-card-controls/);
  assert.match(styles, /\.video-card-media:hover \.video-card-controls,[^{]*\{[^}]*opacity:\s*1;/s);
});

