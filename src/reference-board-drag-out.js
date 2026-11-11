// 无限参考板：把画布上的素材拖出软件（与素材网格共用 library:start-external-drag 通道）。

// 被拖的卡片在多选里时，带上所有选中卡片的素材；否则只拖这一张。同一素材只出现一次。
export function canvasDragOutAssetIds(items, selectedNodeIds, item) {
  if (!item?.assetId) return [];
  const selected = selectedNodeIds instanceof Set ? selectedNodeIds : new Set(selectedNodeIds || []);
  const source = selected.has(item.id) ? (items || []).filter((node) => selected.has(node.id)) : [item];
  return [...new Set(source.map((node) => node?.assetId).filter(Boolean).map(String))];
}

// Alt + 按下卡片：不进入画布内移动，而是把卡片临时设为可原生拖拽，交给拖出流程。
export function isCanvasDragOutGesture(event, available) {
  return Boolean(available && event?.altKey && event.button === 0);
}

// dragstart 时调用：阻止浏览器默认拖拽，改由主进程 webContents.startDrag 拖出真实文件。
export function beginCanvasDragOut(event, assetIds, startExternalDrag) {
  if (typeof startExternalDrag !== "function" || !assetIds.length) {
    event.preventDefault();
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  startExternalDrag(assetIds);
  return true;
}
