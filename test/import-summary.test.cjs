const test = require('node:test');
const assert = require('node:assert/strict');

test('import result explains when every folder item had an unsupported extension', async () => {
  const { formatImportResultMessage } = await import('../src/import-summary.js');
  assert.equal(formatImportResultMessage({ imported: 0, duplicates: 0, skippedUnsupported: 1, errors: [] }), '未导入素材，跳过不支持格式 1 个');
});

test('import result includes skipped unsupported files alongside successful imports', async () => {
  const { formatImportResultMessage } = await import('../src/import-summary.js');
  assert.equal(formatImportResultMessage({ imported: 2, duplicates: 1, skippedUnsupported: 3, errors: [] }), '已导入 2 个，跳过重复 1 个，跳过不支持格式 3 个');
});
