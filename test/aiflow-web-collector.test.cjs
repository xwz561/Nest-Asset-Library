const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAIFlowVideoSource, resolveSelectedFolder } = require('../electron/aiflow-web-collector.cjs');

test('accepts only a current AI Flow video endpoint and returns its task id', () => {
  assert.deepEqual(
    parseAIFlowVideoSource('https://aiflow.example.com/videos/task_01-2.mp4?download=1', 'https://aiflow.example.com'),
    { taskId: 'task_01-2' },
  );
  assert.throws(
    () => parseAIFlowVideoSource('https://other.example.com/videos/task_01.mp4', 'https://aiflow.example.com'),
    /当前 AI Flow 服务/,
  );
  assert.throws(
    () => parseAIFlowVideoSource('https://aiflow.example.com/files/task_01.mp4', 'https://aiflow.example.com'),
    /未识别到 AI Flow 视频任务/,
  );
  assert.throws(
    () => parseAIFlowVideoSource('blob:https://aiflow.example.com/anything', 'https://aiflow.example.com'),
    /视频地址无效/,
  );
});

test('requires a still-existing selected library folder', () => {
  const library = { folders: [{ id: 'folder-a', name: '第 01 集' }] };
  assert.deepEqual(resolveSelectedFolder(library, 'folder-a'), { id: 'folder-a', name: '第 01 集' });
  assert.throws(() => resolveSelectedFolder(library, null), /选定接收视频的文件夹/);
  assert.throws(() => resolveSelectedFolder(library, 'gone'), /不存在或已被删除/);
});
