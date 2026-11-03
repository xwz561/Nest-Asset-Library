import { useState, useEffect } from "react";
import { formatImportResultMessage } from "../import-summary.js";

export function useImport({ desktop, applyLibrary, showMessage, activeFolder, setDrag }) {
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [importCancelRequested, setImportCancelRequested] = useState(false);
  const [aiFlowImportPanel, setAiFlowImportPanel] = useState(false);
  const showImportResult = (lib) => {
    applyLibrary(lib);
    if (lib?.importCanceled) {
      const r = lib?.lastImport || {};
      showMessage(`已取消导入，已导入 ${Number(r.imported) || 0} 个，跳过重复 ${Number(r.duplicates) || 0} 个`, 5000);
      return;
    }
    if (lib?.lastImport) {
      const r = lib.lastImport;
      showMessage(formatImportResultMessage(r), 5000);
    }
  };
  const nativeImport = async () => {
    if (importing) return;
    setImporting(true);
    setImportProgress({ phase: "choosing-files" });
    try {
      showImportResult(await window.nestDesktop.importAssets(activeFolder));
    } catch (error) {
      showMessage(`导入失败：${error.message}`, 5000);
    } finally {
      setImporting(false);
      setImportProgress(null);
      setImportCancelRequested(false);
    }
  };
  const nativeImportFolder = async () => {
    if (importing) return;
    setImporting(true);
    setImportProgress({ phase: "choosing-folder" });
    try {
      const result = await window.nestDesktop.importFolder(activeFolder);
      showImportResult(result);
      if (!result?.importCanceled)
        await new Promise((resolve) => setTimeout(resolve, 550));
    } catch (error) {
      showMessage(`导入文件夹失败：${error.message}`, 5000);
    } finally {
      setImporting(false);
      setImportProgress(null);
      setImportCancelRequested(false);
    }
  };
  const importAIFlowItems = async (source, scanId, ids) => {
    if (importing || !ids?.length) return;
    setImporting(true);
    setImportProgress({ phase: source === "server" ? "downloading-aiflow" : "scanning", processed: 0, total: ids.length });
    try {
      const result = await (source === "server"
        ? window.nestDesktop.aiFlow.importServerVideos(scanId, ids, activeFolder)
        : window.nestDesktop.aiFlow.importLocalAssets(scanId, ids, activeFolder));
      showImportResult(result);
      if (!result?.error && !result?.importCanceled) setAiFlowImportPanel(false);
      return result;
    } catch (error) {
      const message = `导入 AI Flow ${source === "server" ? "视频" : "素材"}失败：${error.message}`;
      showMessage(message, 5000);
      return { error: message };
    } finally {
      setImporting(false);
      setImportProgress(null);
      setImportCancelRequested(false);
    }
  };
  const droppedImport = async (files, targetFolderId = activeFolder) => {
    if (importing) return;
    setImporting(true);
    setImportProgress({ phase: "scanning", scanned: 0, found: 0 });
    try {
      showImportResult(
        await window.nestDesktop.importDropped([...files], targetFolderId),
      );
    } catch (error) {
      showMessage(`导入失败：${error.message}`, 5000);
    } finally {
      setImporting(false);
      setImportProgress(null);
      setImportCancelRequested(false);
      setDrag(false);
    }
  };
  const droppedWebImage = async (transfer, targetFolderId = activeFolder) => {
    const files = [...transfer.files];
    if (files.length) return droppedImport(files, targetFolderId);
    const html = transfer.getData("text/html");
    let url = html
      ? new DOMParser().parseFromString(html, "text/html").querySelector("img")
          ?.src || ""
      : "";
    if (!url)
      url =
        transfer
          .getData("text/uri-list")
          .split(/\r?\n/)
          .find((x) => x && !x.startsWith("#")) || "";
    if (!url) url = transfer.getData("text/plain").trim();
    if (/^https?:\/\//i.test(url)) {
      setImporting(true);
      setImportProgress({ phase: "downloading-web" });
      try {
        showImportResult(await window.nestDesktop.importUrl(url, targetFolderId));
      } catch (error) {
        showMessage(`导入失败：${error.message}`, 5000);
      } finally {
        setImporting(false);
        setImportProgress(null);
        setImportCancelRequested(false);
        setDrag(false);
      }
      return;
    }
    setDrag(false);
    showMessage("没有识别到图片文件或图片网址，可使用 Nest 网页采集扩展右键保存", 4500);
  };
  const cancelImport = async () => {
    if (!importing || importCancelRequested || !window.nestDesktop?.cancelImport)
      return;
    setImportCancelRequested(true);
    const result = await window.nestDesktop.cancelImport();
    if (result?.ok) {
      setImportProgress((progress) => ({ ...progress, cancelRequested: true }));
      return;
    }
    setImportCancelRequested(false);
  };
useEffect(
    () =>
      desktop
        ? window.nestDesktop.onImportProgress?.(setImportProgress)
        : undefined,
    [desktop],
  );
  return { importing, setImporting, importProgress, setImportProgress, importCancelRequested, setImportCancelRequested, aiFlowImportPanel, setAiFlowImportPanel, showImportResult, nativeImport, nativeImportFolder, importAIFlowItems, droppedImport, droppedWebImage, cancelImport };
}
