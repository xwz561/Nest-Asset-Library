function registerTeamHandlers({ ipcMain, readLibrary, currentProfile, currentRole, setProfile, enqueueLibraryMutation, normalizeMember, writeJson, indexFile, publicLibrary, runtimeState }) {
  const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const save = data => writeJson(indexFile(runtimeState.libraryPath), data);
  const teamResult = data => ({ ok: true, team: publicLibrary(data).team });

  ipcMain.handle('team:info', () => {
    const data = readLibrary();
    return data ? { profile: currentProfile(), role: currentRole(data), ownerId: data.team.ownerId, members: data.team.members, defaultRole: data.team.defaultRole === 'viewer' ? 'viewer' : 'editor' } : null;
  });

  // 改名/改颜色：先在库写锁内检查是否与其他成员重名，并同步成员表，再保存到本机身份。
  ipcMain.handle('team:update-profile', async (_, patch) => {
    const name = String(patch?.name || '').trim().slice(0, 40) || currentProfile().name;
    const color = String(patch?.color || currentProfile().color);
    const synced = await enqueueLibraryMutation(() => {
      const data = readLibrary();
      const member = data?.team.members.find(item => item.id === currentProfile().id);
      if (!member) return { ok: true };
      if (data.team.members.some(item => item.id !== member.id && sameName(item.name, name))) return { error: `团队里已经有叫“${name}”的成员，请换一个名字` };
      if (member.name !== name || member.color !== color) { member.name = name; member.color = color; save(data); }
      return { ok: true };
    }, null);
    if (synced?.error) return synced;
    return { ok: true, profile: setProfile({ name, color }) };
  });

  // 管理员按名字预先添加：标记为“已邀请”，同名同事第一次加入时认领这条记录并沿用这里设的角色。
  ipcMain.handle('team:add-member', (_, input) => enqueueLibraryMutation(() => {
    const data = readLibrary(); if (!data) return null;
    const member = normalizeMember(input);
    if (data.team.members.some(item => item.id === member.id || sameName(item.name, member.name))) return { error: '成员已存在' };
    member.invited = true;
    data.team.members.push(member);
    save(data);
    return teamResult(data);
  }, 'admin'));

  ipcMain.handle('team:update-member', (_, id, changes) => enqueueLibraryMutation(() => {
    const data = readLibrary(); if (!data) return null;
    const member = data.team.members.find(item => item.id === id);
    if (!member) return { error: '成员不存在' };
    if (id === data.team.ownerId && changes?.role && changes.role !== 'admin') return { error: '不能降低资源库所有者权限' };
    Object.assign(member, normalizeMember({ ...member, ...changes, id: member.id, createdAt: member.createdAt }));
    save(data);
    return teamResult(data);
  }, 'admin'));

  // 移除后记入黑名单，避免对方下次打开时被“自动加入”加回来；管理员重新按名字添加即可恢复。
  ipcMain.handle('team:remove-member', (_, id) => enqueueLibraryMutation(() => {
    const data = readLibrary(); if (!data) return null;
    if (id === data.team.ownerId) return { error: '不能移除资源库所有者' };
    if (id === currentProfile().id) return { error: '不能移除当前登录成员' };
    const before = data.team.members.length;
    data.team.members = data.team.members.filter(item => item.id !== id);
    if (before === data.team.members.length) return { error: '成员不存在' };
    data.team.removedIds = [...new Set([...(Array.isArray(data.team.removedIds) ? data.team.removedIds : []), id])].slice(-500);
    save(data);
    return teamResult(data);
  }, 'admin'));

  ipcMain.handle('team:set-default-role', (_, role) => enqueueLibraryMutation(() => {
    const data = readLibrary(); if (!data) return null;
    if (!['viewer', 'editor'].includes(role)) return { error: '新成员默认角色只能是编辑者或查看者' };
    data.team.defaultRole = role;
    save(data);
    return teamResult(data);
  }, 'admin'));
}
module.exports = { registerTeamHandlers };
