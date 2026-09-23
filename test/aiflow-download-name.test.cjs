const test = require('node:test');
const assert = require('node:assert/strict');
const { filenameFromContentDisposition } = require('../electron/aiflow-download-name.cjs');

test('uses AI Flow download filename including UTF-8 filename*', () => {
  assert.equal(
    filenameFromContentDisposition("attachment; filename*=UTF-8''ax20_E34_S05_v01_HZ.mp4"),
    'ax20_E34_S05_v01_HZ.mp4',
  );
  assert.equal(
    filenameFromContentDisposition('attachment; filename="AX20 第 34 集.mp4"'),
    'AX20 第 34 集.mp4',
  );
});

test('falls back cleanly when a download response provides no usable filename', () => {
  assert.equal(filenameFromContentDisposition('inline'), '');
  assert.equal(filenameFromContentDisposition("attachment; filename*=UTF-8''%E0%A4"), '');
});
