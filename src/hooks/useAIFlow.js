import { collectFolderSubtreeIds } from "../folder-tree.js";
import { useMemo } from "react";

export function useAIFlow({ desktop, canEdit, selectedIds, assetsRef, askConfirm, showMessage, clearMessageAfter, library, applyLibrary, currentFolder }) {
  const beginAIFlowExtensionUpload = async (asset) => {
    if (!desktop || !asset || !canEdit) return;
    const ids = selectedIds.includes(asset.id) ? selectedIds : [asset.id];
    const selectedAssets = assetsRef.current.filter((item) => ids.includes(item.id));
    const totalBytes = selectedAssets.reduce((total, item) => total + (Number(item.size) || 0), 0);
    const units = ["B", "KB", "MB", "GB"];
    const unit = totalBytes ? Math.min(units.length - 1, Math.floor(Math.log(totalBytes) / Math.log(1024))) : 0;
    const sizeLabel = totalBytes ? `${(totalBytes / 1024 ** unit).toFixed(unit ? 1 : 0)} ${units[unit]}` : "大小将在上传前核对";
    if (!await askConfirm(
      `上传 ${selectedAssets.length} 个素材到 AI Flow？`,
      `总大小：${sizeLabel}\n\n确认后，请到已登录的 AI Flow 网页进入目标“我的素材”文件夹，再点击扩展加入的“上传小旺仔素材”。文件在该网页按钮被点击前不会上传；准备将在 10 分钟后失效。`,
    )) return;
    try {
      const result = await window.nestDesktop.aiFlow.beginExtensionUpload(ids);
      if (result?.error) {
        showMessage(result.error);
      } else {
        showMessage(`已准备 ${result.count} 个素材。请在 AI Flow 目标文件夹点击“上传小旺仔素材”（10 分钟内有效）。`);
      }
    } catch (error) {
      showMessage(`准备上传到 AI Flow 失败：${error.message}`);
    }
    clearMessageAfter(8000);
  };
  const beginAIFlowFolderExtensionUpload = async (folder) => {
    if (!desktop || !folder || !canEdit) return;
    const folderIds = collectFolderSubtreeIds(library?.folders || [], folder.id);
    const folderAssets = assetsRef.current.filter(item => folderIds.has(item.folderId));
    const totalBytes = folderAssets.reduce((total, item) => total + (Number(item.size) || 0), 0);
    const units = ["B", "KB", "MB", "GB"];
    const unit = totalBytes ? Math.min(units.length - 1, Math.floor(Math.log(totalBytes) / Math.log(1024))) : 0;
    const sizeLabel = totalBytes ? `${(totalBytes / 1024 ** unit).toFixed(unit ? 1 : 0)} ${units[unit]}` : "大小将在上传前核对";
    if (!await askConfirm(
      `上传“${folder.name}”文件夹到 AI Flow？`,
      `将准备本文件夹及下级文件夹中的 ${folderAssets.length} 个素材（${sizeLabel}）。已对应 AI Flow 的目录会自动上传到对应位置；未对应目录请在 AI Flow 网页选好目标“我的素材”文件夹后点击“上传小旺仔素材”。网页按钮点击前不会上传。`,
    )) return;
    try {
      const result = await window.nestDesktop.aiFlow.beginFolderExtensionUpload(folder.id);
      if (result?.error) showMessage(result.error);
      else showMessage(result.requiresTargetSelection ? `已准备 ${result.count} 个素材；请在 AI Flow 网页选定目标文件夹后点击“上传小旺仔素材”。` : `已准备 ${result.count} 个素材，将自动上传到 AI Flow 对应文件夹；请在网页点击“上传小旺仔素材”。`);
    } catch (error) {
      showMessage(`准备上传文件夹失败：${error.message}`);
    }
    clearMessageAfter(9000);
  };
  const aiFlowLiveRootForFolder = (folder) => {
    const foldersById = new Map((library?.folders || []).map(item => [String(item.id), item]));
    let current = folder;
    const visited = new Set();
    while (current && !visited.has(String(current.id))) {
      visited.add(String(current.id));
      if (current.aiFlowRootSync) return current;
      current = foldersById.get(String(current.parentId || ''));
    }
    return null;
  };
  const aiFlowLiveSyncEnabledForFolder = (folder) => {
    const root = aiFlowLiveRootForFolder(folder);
    return Boolean(root?.aiFlowRootSync && root.aiFlowRootSync.liveSyncDisabledByUser !== true);
  };
  const aiFlowFolderConnected = (folder) => aiFlowLiveSyncEnabledForFolder(folder);
  const toggleAIFlowLiveSync = async (folder) => {
    if (!desktop || !folder || !canEdit) return;
    const root = aiFlowLiveRootForFolder(folder);
    if (!root) {
      showMessage("只有已执行“同步目录和素材”的本地根目录可以开启实时同步", 5000);
      return;
    }
    const enabled = !aiFlowLiveSyncEnabledForFolder(folder);
    if (enabled && !await askConfirm(
      `开启“${root.name}”的 AI Flow 实时同步？`,
      "开启后，AI Flow 网页保持打开且已登录时，本地新增素材约每 3 秒检查上传，网页新增素材每约 10 秒回拉到本地；不会删除或移动任一端已有素材。",
    )) return;
    try {
      const result = await window.nestDesktop.aiFlow.setLiveSync(root.id, enabled);
      if (result?.error) showMessage(result.error);
      else showMessage(enabled ? `已开启实时同步，已排队 ${result.queued || 0} 个本地素材。` : "已关闭实时同步；不会再自动上传或下载。");
      if (result?.library) applyLibrary(result.library);
    } catch (error) {
      showMessage(`设置实时同步失败：${error.message}`);
    }
    clearMessageAfter(8000);
  };
  const pendingAIFlowUploadsByAssetId = useMemo(
    () => new Map((library?.aiFlowLiveSync?.pendingUploads || []).map(item => [String(item.assetId || ""), item]).filter(([assetId]) => Boolean(assetId))),
    [library?.aiFlowLiveSync?.pendingUploads],
  );
  const activeAIFlowSync = currentFolder ? (() => {
    const root = aiFlowLiveRootForFolder(currentFolder);
    if (!root) return null;
    const pending = (library?.aiFlowLiveSync?.pendingUploads || []).filter(item => String(item.rootFolderId || "") === String(root.id)).length;
    return {
      enabled: aiFlowLiveSyncEnabledForFolder(currentFolder),
      pending,
      syncedAt: Number(root.aiFlowRootSync?.syncedAt) || 0,
    };
  })() : null;

  return { beginAIFlowExtensionUpload, beginAIFlowFolderExtensionUpload, aiFlowLiveRootForFolder, aiFlowLiveSyncEnabledForFolder, aiFlowFolderConnected, toggleAIFlowLiveSync, pendingAIFlowUploadsByAssetId, activeAIFlowSync };
}
