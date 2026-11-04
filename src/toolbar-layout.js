export const TOOLBAR_LAYOUT_KEY = "nest-toolbar-layout-v1";

export const BUILTIN_TOOLBAR_BUTTONS = [
  { id: "chat", label: "局域网私聊" },
  { id: "friend-tools", label: "友商工具集" },
  { id: "lan-signals", label: "局域网信号" },
  { id: "calendar", label: "老黄历" },
  { id: "director", label: "演示方法" },
  { id: "tetris", label: "无穷大" },
  { id: "ai", label: "AI助手" },
  { id: "updates", label: "检查更新" },
  { id: "extensions", label: "扩展、插件与 MCP" },
  { id: "settings", label: "偏好设置" },
  { id: "tutorial", label: "新手教程" },
  { id: "library-status", label: "资源库状态检查" },
];

export const DEFAULT_TOOLBAR_LAYOUT = BUILTIN_TOOLBAR_BUTTONS.map(({ id }) => id);

export function normalizeToolbarLayout(value) {
  const valid = new Set(BUILTIN_TOOLBAR_BUTTONS.map(({ id }) => id));
  const list = Array.isArray(value) ? value.filter(id => valid.has(id)) : [];
  return [...new Set(list)];
}

export function loadToolbarLayout() {
  try {
    const value = JSON.parse(localStorage.getItem(TOOLBAR_LAYOUT_KEY) || "null");
    return Array.isArray(value) ? normalizeToolbarLayout(value) : DEFAULT_TOOLBAR_LAYOUT;
  } catch { return DEFAULT_TOOLBAR_LAYOUT; }
}
