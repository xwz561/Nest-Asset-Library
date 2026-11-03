function registerTeamFolderHandlers({ ipcMain, fs, path, selectFolder, libraryMutationQueue, initializeLibrary, openKnownLibrary, joinTeamLibrary, currentProfile, setProfile, indexFile, readJson }) {
  // 团队素材库（NAS 文件夹模式）：选一个共享文件夹作为资源库，同事选同一个文件夹即自动加入。
  // 渲染进程只能连接“刚刚通过系统对话框选过”的目录，不能传任意路径。
  let pickedRoot = null;
  const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

  ipcMain.handle('team-folder:profile', () => {
    const profile = currentProfile();
    return { name: profile.name, isDefaultName: !profile.name || profile.name === '我' };
  });

  ipcMain.handle('team-folder:pick', async () => {
    const root = await selectFolder('选择 NAS 上的团队素材库文件夹');
    if (!root) return null;
    pickedRoot = root;
    const file = indexFile(root);
    if (fs.existsSync(file)) {
      const data = readJson(file);
      const members = Array.isArray(data?.team?.members) ? data.team.members.length : 0;
      const assets = Array.isArray(data?.assets) ? data.assets.filter(asset => asset && !asset.trashedAt).length : 0;
      return { path: root, isLibrary: true, name: String(data?.name || path.basename(root)), members, assets };
    }
    let entries = 0;
    try { entries = fs.readdirSync(root).filter(name => !name.startsWith('.')).length; } catch {}
    return { path: root, isLibrary: false, name: path.basename(root), existingEntries: entries };
  });

  ipcMain.handle('team-folder:connect', (_event, input = {}) => libraryMutationQueue(async () => {
    const root = String(input.path || '');
    if (!root || !pickedRoot || !same(root, pickedRoot)) return { error: '请先选择文件夹' };
    const name = String(input.name || '').trim().slice(0, 40);
    if (!name || name === '我') return { error: '请先填写你的名字，同事会在成员列表里看到它' };
    const profile = currentProfile();
    if (profile.name !== name) setProfile({ name });
    if (!fs.existsSync(indexFile(root))) {
      if (!input.create) return { error: '这个文件夹还不是素材库' };
      initializeLibrary(root);
    }
    const joined = await joinTeamLibrary(root);
    if (joined.error && !joined.joined) return { error: joined.error };
    const library = openKnownLibrary(root);
    return library && !library.error ? { ...library, joinedRole: joined.role, createdLibrary: Boolean(joined.created) } : library;
  }));
}

module.exports = { registerTeamFolderHandlers };
