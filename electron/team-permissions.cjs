const crypto = require('crypto');

const ROLES = ['viewer', 'editor', 'admin'];
const ROLE_LEVEL = { viewer: 1, editor: 2, admin: 3, owner: 4 };

function normalizeMember(input = {}) {
  const name = String(input.name || '').trim().slice(0, 40);
  if (!name) throw new Error('成员名称不能为空');
  const role = ROLES.includes(input.role) ? input.role : 'viewer';
  return {
    id: String(input.id || crypto.randomUUID()),
    name,
    role,
    color: /^#[0-9a-f]{6}$/i.test(String(input.color || '')) ? input.color : '#4f9cf9',
    createdAt: Number(input.createdAt) || Date.now(),
  };
}

function roleFor(team, profileId) {
  const member = team?.members?.find(item => item.id === profileId);
  if (!member) return null;
  return member.id === team.ownerId ? 'owner' : (ROLES.includes(member.role) ? member.role : 'viewer');
}

function hasRole(team, profileId, minimum) {
  const role = roleFor(team, profileId);
  return Boolean(role && ROLE_LEVEL[role] >= ROLE_LEVEL[minimum]);
}

module.exports = { ROLES, ROLE_LEVEL, normalizeMember, roleFor, hasRole };
