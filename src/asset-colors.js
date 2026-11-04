// 素材颜色标记：卡片边缘显示这个颜色，方便一眼区分。
// 素材的 labelColor 字段只存 id（不存色值），以后调整色值不影响已经标好的素材。
export const ASSET_COLORS = [
  { id: "red", label: "红", value: "#ff5f57" },
  { id: "orange", label: "橙", value: "#ff9f43" },
  { id: "yellow", label: "黄", value: "#f5c400" },
  { id: "green", label: "绿", value: "#34c759" },
  { id: "cyan", label: "青", value: "#22c3d6" },
  { id: "blue", label: "蓝", value: "#4f8cff" },
  { id: "purple", label: "紫", value: "#9b6bff" },
  { id: "pink", label: "粉", value: "#ff6fae" },
];

export function assetColor(id) {
  return ASSET_COLORS.find((color) => color.id === id) || null;
}
