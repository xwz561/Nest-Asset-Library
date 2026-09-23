function sameOrigin(left, right) {
  try {
    return new URL(String(left || '')).origin === new URL(String(right || '')).origin;
  } catch {
    return false;
  }
}

function matchesRootSync(folder, { serverOrigin, projectId }) {
  const link = folder?.aiFlowRootSync;
  return Boolean(
    link
    && String(link.projectId) === String(projectId)
    && sameOrigin(link.serverOrigin, serverOrigin),
  );
}

function resolveMappedAIFlowFolder(data, {
  remoteFolderId = '',
  rootFolderId = '',
  serverOrigin,
  projectId,
} = {}) {
  const folders = Array.isArray(data?.folders) ? data.folders : [];
  const matchingRoots = folders.filter(folder => matchesRootSync(folder, { serverOrigin, projectId }));
  let root;

  if (rootFolderId) {
    root = folders.find(folder => String(folder?.id) === String(rootFolderId));
    if (!root || !matchesRootSync(root, { serverOrigin, projectId })) {
      throw new Error('AI Flow 目录对应已变化，请重新执行“同步目录和素材”');
    }
  } else {
    if (!matchingRoots.length) {
      throw new Error('当前 AI Flow 文件夹尚未与本地目录建立对应，请先执行“同步目录和素材”');
    }
    if (matchingRoots.length > 1) {
      throw new Error('当前 AI Flow 项目存在多个本地同步根目录，请先执行“同步目录和素材”选择对应目录');
    }
    [root] = matchingRoots;
  }

  if (!remoteFolderId) return root;
  const target = folders.find(folder => {
    const link = folder?.aiFlowFolderSync;
    return Boolean(
      link
      && String(link.rootFolderId) === String(root.id)
      && String(link.remoteFolderId) === String(remoteFolderId)
      && String(link.projectId) === String(projectId)
      && sameOrigin(link.serverOrigin, serverOrigin),
    );
  });
  if (!target) throw new Error('AI Flow 子目录对应不存在，请重新执行“同步目录和素材”');
  return target;
}

module.exports = { resolveMappedAIFlowFolder };
