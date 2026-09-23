const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { WINDOWS_RECYCLE_SCRIPT, moveToRecycleBin } = require('../electron/recycle-bin.cjs');

function spawnResult({ code = 0, output = '' } = {}, calls = []) {
  return (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    queueMicrotask(() => {
      if (output) child.stderr.emit('data', output);
      child.emit('close', code);
    });
    return child;
  };
}

test('uses Electron recycle bin before the Windows fallback', async () => {
  const result = await moveToRecycleBin('D:\\素材\\镜头.png', { trashItem: async () => {} });
  assert.deepEqual(result, { method: 'electron' });
});

test('uses the Windows recycle-bin fallback without putting the path in the command text', async () => {
  const calls = [];
  const result = await moveToRecycleBin('D:\\素材\\镜头.png', {
    platform: 'win32',
    trashItem: async () => { throw new Error('Failed to perform delete operation'); },
    spawnImpl: spawnResult({}, calls),
    env: { TEST_VALUE: 'kept' },
  });
  assert.deepEqual(result, { method: 'windows-shell' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'powershell.exe');
  assert.match(WINDOWS_RECYCLE_SCRIPT, /SendToRecycleBin/);
  assert.match(WINDOWS_RECYCLE_SCRIPT, /UICancelOption\]::ThrowException/);
  assert.match(WINDOWS_RECYCLE_SCRIPT, /Shell\.Application/);
  assert.match(WINDOWS_RECYCLE_SCRIPT, /MoveHere/);
  assert.doesNotMatch(calls[0].args.at(-1), /镜头\.png/);
  assert.equal(calls[0].options.env.NEST_RECYCLE_TARGET, 'D:\\素材\\镜头.png');
});

test('keeps the asset when both recycle-bin paths fail', async () => {
  await assert.rejects(
    () => moveToRecycleBin('D:\\素材\\镜头.png', {
      platform: 'win32',
      trashItem: async () => { throw new Error('Failed to perform delete operation'); },
      spawnImpl: spawnResult({ code: 1, output: 'access denied' }),
    }),
    /系统回收站无法处理该项目，素材未删除。请关闭正在使用该目录或素材的程序后重试。/,
  );
});
