// 空格快速预览（类似 macOS 快速查看）的按键判定，纯函数便于回归测试。
// 返回值：
//   "toggle-audio"  预览中是音频：空格保持原有的试听 / 暂停
//   "close"         预览已打开：空格关闭
//   "open"          未打开预览且有选中素材：空格打开
//   null            不处理，交给浏览器默认行为
const TEXT_ENTRY_SELECTOR = 'input,textarea,select,[contenteditable="true"],[contenteditable=""]';
// 焦点在按钮、链接、媒体控件上时，空格本来就会“点它”，不抢这个键。
const NATIVE_SPACE_SELECTOR = 'button,a[href],summary,video,audio,[role="button"],[role="checkbox"],[role="switch"],[role="slider"],[role="menuitem"],[role="option"],[role="tab"]';

function isSpaceKey(event) {
  return Boolean(event) && (event.code === "Space" || event.key === " " || event.key === "Spacebar");
}

function closestOf(target, selector) {
  return typeof target?.closest === "function" ? target.closest(selector) : null;
}

function resolveSpacePreviewAction({ event, previewAsset = null, selectedAsset = null, canQuickLook = () => true } = {}) {
  if (!isSpaceKey(event)) return null;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null;
  if (event.isComposing) return null;
  if (closestOf(event.target, TEXT_ENTRY_SELECTOR)) return null;
  if (previewAsset) {
    if (String(previewAsset.type || "").startsWith("audio")) return "toggle-audio";
    // 按住空格的自动重复只吞掉，不让预览反复开关。
    return event.repeat ? "swallow" : "close";
  }
  if (event.repeat) return null;
  if (!selectedAsset || !canQuickLook(selectedAsset)) return null;
  if (closestOf(event.target, NATIVE_SPACE_SELECTOR)) return null;
  return "open";
}

module.exports = { resolveSpacePreviewAction, isSpaceKey };
