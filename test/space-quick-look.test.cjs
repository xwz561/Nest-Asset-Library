const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { resolveSpacePreviewAction } = require('../src/lib/space-preview.cjs');
const renderer = require('./source-tree.cjs').readSource(path.join(__dirname, '..', 'src', 'main.jsx'), 'utf8');

const target = (matches = []) => ({ closest: (selector) => (matches.some((tag) => selector.split(',').some((part) => part.startsWith(tag))) ? {} : null) });
const space = (extra = {}) => ({ code: 'Space', key: ' ', target: target(), ...extra });
const image = { id: 'img', type: 'image/png' };
const audio = { id: 'aud', type: 'audio/mpeg' };

test('space opens quick look for the selected asset and closes it again', () => {
  assert.equal(resolveSpacePreviewAction({ event: space(), selectedAsset: image }), 'open');
  assert.equal(resolveSpacePreviewAction({ event: space(), previewAsset: image, selectedAsset: image }), 'close');
  assert.equal(resolveSpacePreviewAction({ event: space() }), null, 'no selection → nothing');
});

test('space in an audio preview keeps toggling playback instead of closing', () => {
  assert.equal(resolveSpacePreviewAction({ event: space(), previewAsset: audio, selectedAsset: audio }), 'toggle-audio');
});

test('space while typing in inputs, textareas or contenteditable never triggers quick look', () => {
  for (const tag of ['input', 'textarea', 'select', '[contenteditable']) {
    assert.equal(resolveSpacePreviewAction({ event: space({ target: target([tag]) }), selectedAsset: image }), null, tag);
    assert.equal(resolveSpacePreviewAction({ event: space({ target: target([tag]) }), previewAsset: image }), null, tag);
  }
  assert.equal(resolveSpacePreviewAction({ event: space({ isComposing: true }), selectedAsset: image }), null);
});

test('space on a focused button, modifier combos, key repeat and non-previewable assets are left alone', () => {
  assert.equal(resolveSpacePreviewAction({ event: space({ target: target(['button']) }), selectedAsset: image }), null);
  for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
    assert.equal(resolveSpacePreviewAction({ event: space({ [mod]: true }), selectedAsset: image }), null, mod);
  }
  assert.equal(resolveSpacePreviewAction({ event: space({ repeat: true }), selectedAsset: image }), null);
  assert.equal(resolveSpacePreviewAction({ event: space({ repeat: true }), previewAsset: image }), 'swallow');
  assert.equal(resolveSpacePreviewAction({ event: space(), selectedAsset: image, canQuickLook: () => false }), null);
  assert.equal(resolveSpacePreviewAction({ event: { code: 'KeyA', key: 'a', target: target() }, selectedAsset: image }), null);
});

test('renderer wires space quick look into the single window shortcut handler, not per card', () => {
  assert.match(renderer, /resolveSpacePreviewAction\(\{/);
  assert.match(renderer, /action === "open"\) \{\s*setPreviewId\(selectedAsset\.id\)/);
  assert.match(renderer, /action === "close"\) setPreviewId\(null\)/);
  assert.match(renderer, /previewId && event\.key === "Escape"/);
  // LES-007：素材多时不卡——不要给每张卡片挂键盘监听。
  assert.doesNotMatch(renderer, /<article[^>]*onKeyDown/);
});
