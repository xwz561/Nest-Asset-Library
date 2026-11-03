// 打开共享（NAS）资源库时自动加入：在库写锁内读取最新索引，
//  · 库里还没有成员表 → 当前用户成为所有者/管理员；
//  · 当前用户不在成员表 → 按库的默认角色（team.defaultRole，缺省 editor）加入；
//  · 已是成员 → 只同步显示名称/颜色。
// 只写 team 字段，其余内容保持原样。失败（只读共享、锁超时）不阻止打开，只是仍为只读。
const fs = require('fs');
const path = require('path');
const { withLock } = require('./file-lock.cjs');
const { atomicWriteJson, readJson } = require('./json-storage.cjs');

const ROLES = ['viewer', 'editor', 'admin'];
const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

async function joinTeamLibrary(root, me, { indexFile = dir => path.join(dir, '.nest-library.json'), lockOptions } = {}) {
  const file = indexFile(root);
  if (!fs.existsSync(file)) return { joined: false };
  try {
    return await withLock(root, () => {
      const saved = readJson(file);
      if (!saved || typeof saved !== 'object') return { joined: false };
      const member = { id: me.id, name: me.name, role: 'editor', color: me.color || '#4f9cf9', createdAt: Date.now() };
      if (!saved.team || !Array.isArray(saved.team.members)) {
        saved.team = { ownerId: me.id, members: [{ ...member, role: 'admin' }] };
        atomicWriteJson(file, saved);
        return { joined: true, role: 'admin', created: true };
      }
      const members = saved.team.members;
      const existing = members.find(item => item.id === me.id);
      const clash = members.find(item => item.id !== me.id && sameName(item.name, me.name));
      const removedIds = Array.isArray(saved.team.removedIds) ? saved.team.removedIds : [];
      if (clash) {
        // 管理员按名字预先添加的成员：同名同事第一次加入时认领，沿用管理员设的角色（也解除之前的移除记录）
        if (clash.invited && !existing) {
          clash.id = me.id; clash.name = me.name; clash.color = member.color; delete clash.invited;
          saved.team.removedIds = removedIds.filter(id => id !== me.id);
          atomicWriteJson(file, saved);
          return { joined: true, role: clash.role, claimed: true };
        }
        return { joined: false, error: `团队里已经有叫“${me.name}”的成员，请换一个名字` };
      }
      if (!existing && removedIds.includes(me.id)) {
        return { joined: false, removed: true, error: '你已被管理员移出这个素材库。如需继续使用，请联系管理员重新添加你。' };
      }
      if (!existing) {
        member.role = ROLES.includes(saved.team.defaultRole) ? saved.team.defaultRole : 'editor';
        members.push(member);
        atomicWriteJson(file, saved);
        return { joined: true, role: member.role };
      }
      if (existing.name !== me.name || existing.color !== member.color) {
        existing.name = me.name; existing.color = member.color;
        atomicWriteJson(file, saved);
      }
      return { joined: true, role: existing.role };
    }, lockOptions);
  } catch (error) {
    return { joined: false, error: error.message };
  }
}

module.exports = { joinTeamLibrary };
