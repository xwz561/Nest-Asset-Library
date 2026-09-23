const test = require('node:test');
const assert = require('node:assert');
const { normalizeMember, roleFor, hasRole } = require('../electron/team-permissions.cjs');

const team = { ownerId: 'owner', members: [
  { id: 'owner', name: '所有者', role: 'admin' },
  { id: 'admin', name: '管理员', role: 'admin' },
  { id: 'editor', name: '编辑者', role: 'editor' },
  { id: 'viewer', name: '查看者', role: 'viewer' },
] };

test('所有者拥有最高角色且不能被存储角色降级', () => assert.strictEqual(roleFor(team, 'owner'), 'owner'));
test('viewer 只能通过 viewer 校验', () => { assert.ok(hasRole(team, 'viewer', 'viewer')); assert.ok(!hasRole(team, 'viewer', 'editor')); });
test('editor 可以写素材但不能管理成员', () => { assert.ok(hasRole(team, 'editor', 'editor')); assert.ok(!hasRole(team, 'editor', 'admin')); });
test('admin 可以管理成员', () => assert.ok(hasRole(team, 'admin', 'admin')));
test('库外身份没有权限', () => assert.strictEqual(roleFor(team, 'missing'), null));
test('新增成员清洗名称、角色和颜色', () => {
  const member = normalizeMember({ name: '  小王  ', role: 'invalid', color: 'red' });
  assert.strictEqual(member.name, '小王'); assert.strictEqual(member.role, 'viewer'); assert.strictEqual(member.color, '#4f9cf9'); assert.ok(member.id);
});
