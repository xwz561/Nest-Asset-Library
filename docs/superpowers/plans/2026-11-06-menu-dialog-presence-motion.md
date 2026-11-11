# 菜单与对话框状态动效 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Headless UI 风格的状态驱动进出场动效统一应用到素材库的菜单、子菜单、弹出层和模态对话框。

**Architecture:** 新建共享 `PresenceTransition` 组件管理 `entering → entered → leaving → unmounted`，以 `presenceProps` 把 `data-motion-phase`、`inert` 和 `aria-hidden` 明确传到真实浮层根节点。`motion-polish.css` 按 `data-motion-kind` 和 `data-motion-surface` 协调菜单、遮罩和对话框本体的动画。

**Tech Stack:** React、CSS keyframes / 独立 `translate` 与 `scale`、现有 `motion-polish.css` 动效令牌。

**Spec:** `docs/superpowers/specs/2026-11-06-headlessui-style-menu-dialog-motion-design.md`

## Global Constraints

- 不引入 Headless UI 或其他新依赖。
- 菜单/弹出层进入 180–220ms、最多 4px 独立位移；离开约 160ms。
- 对话框遮罩约 160–200ms；对话框本体进入约 220ms、最多 6px 上浮；关闭 160ms、缩至约 0.98。
- 只使用 `--apple-ease`、`--motion-ease`，动画只使用透明度、独立 `translate` / `scale`。
- 遵循减少动态效果设置；滚动期间不启动新动画。
- 不改字体、文案、尺寸、颜色、菜单语义、关闭条件或业务行为。
- 不改变素材卡片、页面切换、宠物、侧栏、顶栏和主内容布局动效。
- 不改版本号，不打安装包，不提交、不推送。
- 不运行或新增自动化测试；用前端构建和手动界面检查验收。

## Review Focus

- 打开中快速关闭再打开：旧离场计时不得卸载重新打开的菜单/对话框；Task 1 逐项手动操作复核。
- Portal 子菜单关闭：仍需从原锚点定位并与父菜单同时消失，不能残留在视口；Task 2 检查资源库菜单和右键悬浮子菜单。
- busy / importing 状态下关闭：原本禁用的 Escape、遮罩和关闭按钮继续禁用；Task 3 检查 AI Flow 导入及友商工具对话框。
- Escape / 遮罩关闭：原有关闭触发和焦点行为保持；Task 3 检查偏好设置、团队对话框、普通确认框。
- `prefers-reduced-motion`：所有菜单/对话框即时显示与卸载；Task 4 在系统减少动态效果设置下逐类检查。

---

### Task 1: 共享状态过渡组件与工具栏浮层

**Files:**
- Create: `src/components/presence-transition.jsx`
- Modify: `src/components/menus.jsx`
- Modify: `src/main.jsx`
- Modify: `src/motion-polish.css`

**Interfaces:**
- Produces: `PresenceTransition({ show, kind, children })`，`children` 接收 `{ phase, presenceProps }` 并返回浮层根组件；`presenceProps` 为 `{ "data-motion-phase": "entering" | "entered" | "leaving", "data-motion-kind": kind, "aria-hidden": boolean | undefined, inert: boolean | undefined, onAnimationEnd: function }`。
- `PresenceTransition` 在 `show` 为真时缓存最近的非空根节点；离场期间把同一根节点以新的 `presenceProps` 保持挂载；再次打开时取消旧离场计时。减少动态效果时直接卸载，不延迟。
- `SortMenu` 与 `FilterPopover` 接受 `presenceProps` 并展开到实际 `.toolbar-popover` 根节点。

- [ ] **Step 1: 建立 `PresenceTransition` 状态机**

创建共享组件，管理 entering、entered、leaving、unmounted；在动画结束和安全计时两种路径完成状态清理；重开时取消离场卸载。`inert` 和 `aria-hidden` 只在 leaving 阶段启用。

- [ ] **Step 2: 修正工具栏试做的属性传递**

移除 `menus.jsx` 中未正确转发根节点属性的 `PopoverPresence`；改用共享组件 render-prop API，并让 `SortMenu` / `FilterPopover` 把 `presenceProps` 展开到实际浮层 `div`。

- [ ] **Step 3: 实现菜单的进出场样式**

在 `motion-polish.css` 为 `data-motion-kind="menu"` 定义 180–220ms 进入与 160ms 离场；只动画 opacity、最多 4px translate 和轻微 scale。离场期间忽略指针事件。

- [ ] **Step 4: 构建并手动检查工具栏浮层**

运行 `npm run build`。打开、关闭、连续快速切换筛选/排序；确认离场完成后才卸载、重开不闪烁、工具栏边缘不裁切、浮层不改变工具栏高度。构建应成功。

### Task 2: 资源库菜单、右键菜单与 Portal 子菜单

**Files:**
- Modify: `src/components/menus.jsx`
- Modify: `src/main.jsx`
- Modify: `src/motion-polish.css`

**Interfaces:**
- Consumes: Task 1 的 `PresenceTransition` 与 `presenceProps`。
- `LibrarySwitcherMenu`、`BlankContextMenu`、`AssetContextMenu`、`FolderContextMenu` 接受 `presenceProps` 并展开到菜单根节点；Portal 内容由一个可接收 `presenceProps` 的 React 根组件承载。

- [ ] **Step 1: 接入资源库切换菜单**

把 `appMenuOpen && createPortal(...)` 改为 `PresenceTransition` 管理的组件 Portal；根菜单继续使用原来的定位、themeVariables、ref 和业务回调。

- [ ] **Step 2: 接入空白区、素材和文件夹右键菜单**

把三个 `contextMenu` 条件分支纳入共享 presence；只在关闭期间保留最后一个菜单对象，关闭后清除；各菜单既有坐标计算和动作不变。

- [ ] **Step 3: 接入悬浮子菜单和文件夹图标菜单**

为“移动到文件夹”“发送给好友”和文件夹图标菜单加入独立 presence。父菜单离场时同步触发子菜单离场；Portal 仍挂在原有容器且保持视口内位置。

- [ ] **Step 4: 手动检查菜单定位与键盘/鼠标行为**

检查资源库切换菜单、空白右键菜单、素材/文件夹菜单和至少一个 Portal 子菜单的开合、快速重开、选项点击、外部关闭、边界定位与溢出显示；构建成功。

### Task 3: 模态对话框与偏好设置

**Files:**
- Modify: `src/main.jsx`
- Modify: `src/components/dialogs.jsx`
- Modify: `src/components/ai-settings.jsx`
- Modify: `src/components/aiflow-import-dialog.jsx`
- Modify: `src/components/friend-tools-dialog.jsx`
- Modify: `src/components/forward-dialog.jsx`
- Modify: `src/components/library-finder-dialog.jsx`
- Modify: `src/components/team-dialogs.jsx`
- Modify: `src/components/team-library-panel.jsx`
- Modify: `src/components/usage-demo-dialog.jsx`
- Modify: `src/onboarding-tour.jsx`
- Modify: `src/motion-polish.css`

**Interfaces:**
- Consumes: Task 1 的 `PresenceTransition` 与 `presenceProps`。
- 每个模态组件的 backdrop 根节点接受 `presenceProps`；实际面板根节点标记 `data-motion-surface`，供 backdrop 与面板分别动画。
- 对象型状态（如 `dialogState`、`forwardPanel`）在离场期间保留最后一次有效 props，由 `PresenceTransition` 缓存的 React 元素承载。

- [ ] **Step 1: 接入通用确认框、扩展、关于、更新、支持和密码对话框**

在 `dialogs.jsx` 各组件根节点接收 presence 属性；`main.jsx` 用共享 presence 管理对应开关。对话框业务回调、Esc 和 backdrop 点击条件保持原样。

- [ ] **Step 2: 接入 AI、导入、友商工具及演示对话框**

接入 AI 设置、AI Flow 导入、友商工具、使用演示与新手教程根节点；busy / importing 时原有不可关闭规则保持不变。

- [ ] **Step 3: 接入团队协作与素材整理对话框**

接入转发、查找素材库、成员与权限、团队素材库、批量重命名对话框。团队素材库的连接流程状态与文件选择回调保持原样。

- [ ] **Step 4: 为 backdrop 与 surface 配置协调动画**

backdrop 以 opacity 160–200ms 淡入淡出；面板 220ms 进入（opacity、最多 6px 上浮、轻微 scale），160ms 离场并缩至约 0.98。动效写入 `motion-polish.css`，不改面板布局属性。

- [ ] **Step 5: 构建并手动检查代表性对话框**

运行 `npm run build`。手动检查偏好设置、普通确认框、导入中的忙碌对话框、团队对话框和遮罩关闭；确认关闭后卸载、按钮与 Escape 条件保持。

### Task 4: 全主题与减少动态效果复核

**Files:**
- Modify as needed: `src/motion-polish.css`
- No automated test files are added or run.

- [ ] **Step 1: 在深色、浅色及柔光橙主题检查菜单与对话框**

抽查筛选/排序、资源库切换菜单、右键菜单、偏好设置和普通对话框；确认动画不改最终色彩、尺寸、字体或层级。

- [ ] **Step 2: 检查减少动态效果和滚动状态**

系统开启减少动态效果时菜单/对话框立即出现和卸载；主内容滚动期间不启动新菜单动效；没有素材卡片动画改动。

- [ ] **Step 3: 最终构建与变更范围核对**

运行 `npm run build`；检查 `git diff --check` 和仅限设计范围内的源码差异。不打安装包、不提交、不推送。
