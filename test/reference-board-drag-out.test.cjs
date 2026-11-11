const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const load = () => import('../src/reference-board-drag-out.js');
const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

function fakeEvent(extra = {}) {
  const calls = [];
  return { calls, button: 0, altKey: false, preventDefault: () => calls.push('preventDefault'), stopPropagation: () => calls.push('stopPropagation'), ...extra };
}

test('canvas drag-out takes only the dragged card when it is not in the selection', async () => {
  const { canvasDragOutAssetIds } = await load();
  const items = [{ id: 'n1', assetId: 'a1' }, { id: 'n2', assetId: 'a2' }];
  assert.deepEqual(canvasDragOutAssetIds(items, new Set(['n2']), items[0]), ['a1']);
});

test('canvas drag-out takes every selected card, without duplicate assets', async () => {
  const { canvasDragOutAssetIds } = await load();
  const items = [{ id: 'n1', assetId: 'a1' }, { id: 'n2', assetId: 'a2' }, { id: 'n3', assetId: 'a1' }, { id: 'n4', assetId: 'a4' }];
  assert.deepEqual(canvasDragOutAssetIds(items, new Set(['n1', 'n2', 'n3']), items[1]), ['a1', 'a2']);
});

test('canvas drag-out hands asset ids to the shared external-drag bridge', async () => {
  const { beginCanvasDragOut } = await load();
  const sent = [];
  const event = fakeEvent();
  assert.equal(beginCanvasDragOut(event, ['a1'], (ids) => sent.push(ids)), true);
  assert.deepEqual(sent, [['a1']]);
  assert.deepEqual(event.calls, ['preventDefault', 'stopPropagation']);
});

test('without the desktop bridge the browser drag is cancelled and nothing is sent', async () => {
  const { beginCanvasDragOut } = await load();
  const event = fakeEvent();
  assert.equal(beginCanvasDragOut(event, ['a1'], undefined), false);
  assert.deepEqual(event.calls, ['preventDefault']);
});

test('only Alt + left button turns a card press into drag-out; a plain press still moves the card', async () => {
  const { isCanvasDragOutGesture } = await load();
  assert.equal(isCanvasDragOutGesture(fakeEvent(), true), false);
  assert.equal(isCanvasDragOutGesture(fakeEvent({ altKey: true }), true), true);
  assert.equal(isCanvasDragOutGesture(fakeEvent({ altKey: true, button: 1 }), true), false);
  assert.equal(isCanvasDragOutGesture(fakeEvent({ altKey: true }), false), false);
});

test('canvas cards are wired to the same drag-out path as the library grid', () => {
  const board = read('src', 'reference-board.jsx');
  const main = read('src', 'main.jsx');
  // Canvas: a dedicated drag-out handle, plus Alt-drag on the card; plain press still goes to startNodeDrag.
  assert.match(board, /className="reference-board-node-drag-out"/);
  assert.match(board, /isCanvasDragOutGesture\(event, canDragOut\)[\s\S]{0,200}startNodeDrag\(event, item\)/);
  assert.match(board, /beginCanvasDragOut\(event, canvasDragOutAssetIds\(currentItems, selectedNodeIds, item\), startExternalDrag\)/);
  // The handle must not start an in-canvas move.
  assert.match(board, /reference-board-node-drag-out"[\s\S]{0,300}onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  // main.jsx: grid and canvas share beginExternalDrag (which guards against re-importing the dropped file).
  assert.match(main, /const startExternalAssetDrag = [\s\S]{0,250}beginExternalDrag\(ids\)/);
  assert.match(main, /startExternalDrag=\{desktop \? beginExternalDrag : undefined\}/);
  assert.match(main, /const beginExternalDrag = [\s\S]{0,300}window\.nestDesktop\?\.startExternalDrag\(ids\)/);
});
