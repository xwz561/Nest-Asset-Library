const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBatchRenamePlan, renderBatchName } = require('../electron/batch-rename.cjs');

test('批量重命名模板支持名称、序号、文件夹和首个标签', () => {
  const asset = { id: 'a', name: '书房', folderId: 'f', tags: ['场景', '室内'] };
  assert.equal(renderBatchName('{folder}_{name}_{tag}_{index}', asset, 0, [{ id: 'f', name: 'EP01' }]), 'EP01_书房_场景_01');
});

test('批量重命名按选择顺序去重并清理 Windows 非法字符', () => {
  const assets = [{ id: 'b', name: 'B:图', tags: [] }, { id: 'a', name: 'A/图', tags: [] }];
  const plan = buildBatchRenamePlan(['a', 'b', 'a', 'missing'], assets, [], '{name}_{index}');
  assert.deepEqual(plan.map(item => item.id), ['a', 'b']);
  assert.deepEqual(plan.map(item => item.newName), ['A 图_01', 'B 图_02']);
});
