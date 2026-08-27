const test = require('node:test');
const assert = require('node:assert/strict');
const { createTaskQueue } = require('../electron/task-queue.cjs');

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

test('concurrent imports execute in strict submission order', async () => {
  const queue = createTaskQueue();
  const events = [];
  const jobs = Array.from({ length: 50 }, (_, index) => queue(async () => {
    events.push(`start:${index}`);
    await delay(index % 3);
    events.push(`end:${index}`);
    return index;
  }));
  assert.equal(queue.pending(), 50);
  assert.deepEqual(await Promise.all(jobs), Array.from({ length: 50 }, (_, index) => index));
  assert.deepEqual(events, Array.from({ length: 50 }, (_, index) => [`start:${index}`, `end:${index}`]).flat());
  assert.equal(queue.pending(), 0);
});

test('a rejected import does not poison later imports', async () => {
  const logged = [];
  const queue = createTaskQueue({ onError: error => logged.push(error.message) });
  const failed = queue(async () => { throw new Error('broken import'); });
  const recovered = queue(async () => 'recovered');
  await assert.rejects(failed, /broken import/);
  assert.equal(await recovered, 'recovered');
  assert.deepEqual(logged, ['broken import']);
  assert.equal(queue.pending(), 0);
});
