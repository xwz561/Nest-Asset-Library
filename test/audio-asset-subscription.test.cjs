const test = require('node:test');
const assert = require('node:assert/strict');

test('audio progress updates only the active card and resets the previous card', async () => {
  const { subscribeAssetAudio } = await import('../src/audio-asset-subscription.js');
  const listeners = new Set();
  const manager = { subscribe(fn) { listeners.add(fn); fn({ id: null }); return () => listeners.delete(fn); } };
  const updates = [[], [], []];
  const unsubscribe = ['a', 'b', 'c'].map((id, i) => subscribeAssetAudio(manager, id, next => updates[i].push(next.id)));
  const publish = id => { for (const fn of listeners) fn({ id }); };
  publish('a');
  for (let i = 0; i < 100; i++) publish('a');
  assert.equal(updates[0].length, 102);
  assert.deepEqual(updates[1], [null]);
  assert.deepEqual(updates[2], [null]);
  publish('b');
  assert.equal(updates[0].at(-1), 'b');
  assert.deepEqual(updates[1], [null, 'b']);
  publish(null);
  assert.deepEqual(updates[1], [null, 'b', null]);
  assert.deepEqual(updates[2], [null]);
  unsubscribe.forEach(stop => stop());
  assert.equal(listeners.size, 0);
});
