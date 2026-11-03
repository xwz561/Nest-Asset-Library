const test = require('node:test');
const assert = require('node:assert');

test('多级标签只在父标签展开后显示直接子级', async () => {
  const { buildTagTree } = await import('../src/tag-tree.js');
  assert.deepStrictEqual(buildTagTree(['风格/扁平','风格/拟物','场景/书房'],new Set()).map(x=>x.path),['场景','风格']);
  assert.deepStrictEqual(buildTagTree(['风格/扁平/插画','风格/拟物'],new Set(['风格'])).map(x=>x.path),['风格','风格/扁平','风格/拟物']);
});
test('选中父标签命中全部后代但不误命中同前缀标签', async () => {
  const { assetMatchesTag } = await import('../src/tag-tree.js');
  assert.ok(assetMatchesTag(['风格/扁平'],'风格')); assert.ok(!assetMatchesTag(['风格化'],'风格'));
});
