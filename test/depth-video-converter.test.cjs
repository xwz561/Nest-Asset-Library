const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  isVideoAsset,
  resolveConverterPaths,
  buildConverterArgs,
  isDepthVideoCancelledError,
  runDepthVideoConverter,
} = require('../electron/depth-video-converter.cjs');
const { EventEmitter } = require('node:events');

test('recognizes only supported material-library video assets', () => {
  assert.equal(isVideoAsset({ type: 'video/mp4', file: 'clip.txt' }), true);
  assert.equal(isVideoAsset({ type: '', file: 'clip.MOV' }), true);
  assert.equal(isVideoAsset({ type: 'image/png', file: 'still.png' }), false);
});

test('resolves packaged converter beside Electron resources', () => {
  const paths = resolveConverterPaths({
    isPackaged: true,
    resourcesPath: 'C:/Program Files/Nest/resources',
    appPath: 'ignored',
  });
  assert.equal(paths.executable, path.join('C:/Program Files/Nest/resources', 'depth-video-converter', 'DepthVideoConverter.exe'));
  assert.equal(paths.model, path.join('C:/Program Files/Nest/resources', 'depth-video-converter', 'depth-anything-v2-small-quantized.onnx'));
});

test('uses a fixed argument array for a grayscale conversion', () => {
  assert.deepEqual(buildConverterArgs({ input: 'in.mp4', output: 'out.mp4', model: 'model.onnx' }), [
    '--input', 'in.mp4', '--output', 'out.mp4', '--model', 'model.onnx', '--style', '灰度深度',
  ]);
});

test('cancellation terminates the active converter and returns a distinct cancelled result', async () => {
  const controller = new AbortController();
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 987654;
  let terminated = 0;
  const conversion = runDepthVideoConverter({
    executable: 'converter.exe', input: 'in.mp4', output: 'out.mp4', model: 'model.onnx', signal: controller.signal,
    spawnProcess: () => child,
    terminateChild: process => {
      terminated += 1;
      setImmediate(() => process.emit('close', 1));
    },
  });
  controller.abort();
  await assert.rejects(conversion, isDepthVideoCancelledError);
  assert.equal(terminated, 1);
});
