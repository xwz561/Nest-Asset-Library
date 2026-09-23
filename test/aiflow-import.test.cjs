const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  isWithinRoot,
  listLocalAssets,
  listLocalVideos,
  validateLocalAssetSelections,
  validateLocalVideoSelections,
} = require('../electron/aiflow-import.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-aiflow-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(root, 'latest.mp4'), 'video');
  fs.writeFileSync(path.join(root, 'nested', 'other.webm'), 'video');
  fs.writeFileSync(path.join(root, 'portrait.png'), 'image');
  fs.writeFileSync(path.join(root, 'nested', 'voice.mp3'), 'audio');
  fs.writeFileSync(path.join(root, 'nested', 'brief.md'), 'document');
  fs.writeFileSync(path.join(root, 'nested', 'archive.zip'), 'unsupported');
  fs.writeFileSync(path.join(root, 'nested', 'notes.txt'), 'not a video');
  return root;
}

test('lists only supported local AI Flow video files and keeps relative paths', async t => {
  const root = fixture(t);
  const result = await listLocalVideos(root);
  assert.equal(result.videos.length, 2);
  assert.deepEqual(
    result.videos.map(video => video.relativePath).sort(),
    ['latest.mp4', 'nested/other.webm'],
  );
  assert.equal(result.videos.every(video => video.size > 0), true);
});

test('lists local AI Flow materials of every importable type and records kind', async t => {
  const root = fixture(t);
  const result = await listLocalAssets(root);
  assert.deepEqual(
    result.assets.map(asset => asset.relativePath).sort(),
    ['latest.mp4', 'nested/brief.md', 'nested/notes.txt', 'nested/other.webm', 'nested/voice.mp3', 'portrait.png'],
  );
  assert.deepEqual(
    [...new Set(result.assets.map(asset => asset.kind))].sort(),
    ['audio', 'document', 'image', 'video'],
  );
});

test('does not accept a selection outside the configured AI Flow root', async t => {
  const root = fixture(t);
  const outside = path.join(os.tmpdir(), `nest-aiflow-outside-${Date.now()}.mp4`);
  fs.writeFileSync(outside, 'outside');
  t.after(() => fs.rmSync(outside, { force: true }));
  const selected = await validateLocalVideoSelections(root, [
    path.join(root, 'latest.mp4'),
    outside,
    path.join(root, 'nested', 'notes.txt'),
  ]);
  assert.deepEqual(selected, [fs.realpathSync(path.join(root, 'latest.mp4'))]);
});

test('accepts an in-root material reached through a path alias after realpath canonicalization', async t => {
  const root = fixture(t);
  const alias = `${root}-alias`;
  try {
    fs.symlinkSync(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    t.skip(`无法创建测试链接：${error.message}`);
    return;
  }
  t.after(() => fs.rmSync(alias, { recursive: true, force: true }));
  const selected = await validateLocalVideoSelections(alias, [path.join(alias, 'latest.mp4')]);
  assert.deepEqual(selected, [fs.realpathSync(path.join(root, 'latest.mp4'))]);
});

test('does not accept unsupported or out-of-root local AI Flow material selections', async t => {
  const root = fixture(t);
  const outside = path.join(os.tmpdir(), `nest-aiflow-outside-${Date.now()}.png`);
  fs.writeFileSync(outside, 'outside');
  t.after(() => fs.rmSync(outside, { force: true }));
  const selected = await validateLocalAssetSelections(root, [
    path.join(root, 'portrait.png'),
    path.join(root, 'nested', 'brief.md'),
    path.join(root, 'nested', 'archive.zip'),
    outside,
  ]);
  assert.deepEqual(selected, [
    fs.realpathSync(path.join(root, 'portrait.png')),
    fs.realpathSync(path.join(root, 'nested', 'brief.md')),
  ]);
});

test('path containment rejects sibling-prefix paths', () => {
  const root = path.join('C:', 'AI Flow', 'Assets save-dev');
  assert.equal(isWithinRoot(root, path.join(root, 'user', 'clip.mp4')), true);
  assert.equal(isWithinRoot(root, path.join('C:', 'AI Flow', 'Assets save-dev-old', 'clip.mp4')), false);
});

test('reports when a bounded scan stops before remaining videos', async t => {
  const root = fixture(t);
  const result = await listLocalVideos(root, { limit: 1 });
  assert.equal(result.videos.length, 1);
  assert.equal(result.truncated, true);
});

test('rejects a missing local AI Flow output root', async () => {
  await assert.rejects(
    listLocalVideos(path.join(os.tmpdir(), `nest-aiflow-missing-${Date.now()}`)),
    /本地视频目录不存在/,
  );
});

test('skips symbolic links when scanning local AI Flow output', async t => {
  const root = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-aiflow-link-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'outside.mp4'), 'outside');
  const link = path.join(root, 'outside-link');
  try {
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    t.skip(`无法创建测试链接：${error.message}`);
    return;
  }
  const result = await listLocalVideos(root);
  assert.equal(result.videos.some(video => video.name === 'outside.mp4'), false);
});
