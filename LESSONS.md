# 可复用经验

## 记录模板

### LES-XXX：标题

- 日期：YYYY-MM-DD
- 状态：候选 / 已验证 / 已废弃
- 场景：
- 做法：
- 证据：
- 边界：
- 复审条件：


### LES-001：打 Windows 包前先关掉验收窗口

- 日期：2026-11-04
- 状态：已验证
- 场景：`npm run package:win` 第一步会重新编译 `native/lan-signal-hook/build/hook-helper.exe`。
- 做法：先关掉本工作区启动的 electron 验收实例（它会拉起 hook-helper.exe 占住文件），再打包。打包后 `build/installerSidebar.bmp` 和 hook-helper.exe 会被重新生成、显示为已修改，源码没变时可以 `git checkout --` 还原。
- 证据：开着验收实例时报 `LINK : fatal error LNK1104: 无法打开文件 buildhook-helper.exe`；关掉后打包成功。
- 边界：只影响 Windows 打包；Mac 包在 GitHub Actions 上打。
- 复审条件：打包脚本不再重新编译 hook-helper.exe。

### LES-002：素材网格滑动卡顿先查合成层，不是 JS

- 日期：2026-11-04
- 状态：已验证
- 场景：滑动"全部素材"只有约 11 帧/秒，每帧一个 90ms 长任务。
- 做法：CDP 录 Tracing 看 `Layerize` 占比、用 `LayerTree.compositingReasons` 数合成层原因；逐项关掉 CSS 效果复测帧率。罪魁是卡片小按钮的 `backdrop-filter`、图片 / 视频 / 波形的 `translateZ(0)`、卡片的 `contain: layout`、音频元素的 `will-change`，在 `soft-ui.css` 末尾统一关掉。
- 证据：合成层 392 → 24，滑动 11 → 约 60 帧/秒，长任务 46 → 0；卡片投影不影响。
- 边界：以后给素材卡片加毛玻璃、3D 变换、will-change、contain: layout 前先复测。
- 复审条件：卡片结构大改或换了虚拟滚动方案。

### LES-003：疯狂模式的桌面小窗口两个坑

- 日期：2026-11-04
- 状态：已验证
- 场景：卡片用 `window.open('about:blank', 'nest-card-xxx')` 开同源小窗口，主窗口的 React 用 createPortal 渲染进去。
- 做法：① 小窗口只有几百像素宽，会触发旧样式 `@media (max-width: 760px)` 把侧栏文字藏起来，要在 `.soft-desk-app` 下放回来；② 主窗口刷新前（pagehide）要先关掉小窗口，否则新页面再开同名窗口会拿到旧窗口、内容被它的重新加载冲掉。界面库（Fluent）的样式要用 `RendererProvider` + `createDOMRenderer(小窗口 document)` 写进去。
- 证据：CDP 连到小窗口查 computed style 看到 `display: none`；刷新后小窗口为空，加 pagehide 后正常重开。
- 边界：只影响疯狂模式的桌面小窗口。
- 复审条件：小窗口改成独立页面加载、不再用 portal。

### LES-004：弹窗、卡片里不要用 `<header>` 标签

- 日期：2026-11-04
- 状态：已验证
- 场景：`styles.css` 里有不带作用域的 `header { … }` 和 `html[data-platform="win32"] header { app-region: drag; padding-right: 154px }`，本来是给主窗口顶栏用的，会套到所有 `<header>` 上。
- 做法：对话框、教程卡片的标题行用 `<div>`。新手教程卡片原来用 `<header>`，结果多出深色底条，Windows 上还变成拖动区、关闭按钮被挤到中间（拖动区里按钮可能点不到）；演示方法对话框一开始也中招。
- 证据：CDP 查 computed style 命中 `header` 规则；改成 `div` 后底色透明、`app-region: none`、关闭按钮贴右边。`test/usage-demo.test.cjs` 有防回归检查。
- 边界：只在 `.app` 外层新界面里验证过。
- 复审条件：把全局 `header` 规则收窄到主窗口顶栏之后可以撤销这条。

### LES-005：AI Flow 页面上的浮窗要顶住「页面配色」的通用规则

- 日期：2026-11-04
- 状态：已验证（仿 AI Flow 页面）
- 场景：扩展自己的「页面配色」用 `body[data-nest-aiflow-theme] :is(header, section, aside, button, select, [class*="card"], [class*="tab"], [data-active="true"] …)` 加 `!important` 刷整页颜色，也刷到扩展自己插进去的浮窗上；用户截图里延长工作台标题折行、"关闭"变竖排、配色发乱就是这么来的。
- 做法：浮窗元素只用 div / button / span；样式全部以窗口 ID 开头并加 `!important`（ID 优先级压过这些规则）；class 名统一 `nx-` 前缀，避开 card / tab / panel / item / list / icon / header / select / active / option / box / bar / pill / tag / toggle / menu 这些词。拖动、缩放写在行内的 left / top / width / height 不能在样式表里加 `!important`。反过来，样式表里 `display` 带了 `!important`，代码里隐藏浮窗也得用 `style.setProperty('display', 'none', 'important')`，只写 `style.display = 'none'` 藏不住（1.16.1 的"打开 AI Flow 原窗口"就是这么坏的）。
- 证据：离屏 Electron 打开仿 AI Flow 页面（故意写了霸道的 button / select 样式），樱粉、深海蓝两套配色下标题单行、按钮 32×32、两个窗口并排。
- 边界：只验证了仿页面，真 AI Flow 的样式可能还有别的写法。
- 复审条件：真 AI Flow 上发现还有被刷掉的地方。

### LES-006：真 AI Flow 的延长弹窗和素材选择器长什么样

- 日期：2026-11-04
- 状态：已验证（真 AI Flow，http://10.128.30.22:8080/）
- 场景：在内置浏览器里打开任务卡片的"延长"，读真实结构。
- 结论：弹窗视频是普通地址 `/videos/<任务 id>.mp4`（能直接复制给预览）；方向是 `input[name=sd25ExtDir]`（back / front），秒数 4–30，提示词 `#sd25RepairInput`；`@ 素材` 是 `#sd25RefAdd`，打开后有 120 个 `[data-refpick]`，缩略图就是原文件（图片每张 2–4 MB、`loading="lazy"`），视频 `preload="none"` 所以在 AI Flow 里也一直是黑的，网格自带 `max-height: 150px` 的小滚动框。原生弹窗还有视频标注工具（`sd25-mark-color` 色点、◯ ▭ ↗ ✎）。
- 做法：副本里图片保持懒加载，视频滚到眼前才取第一帧（`#t=0.1`），放开那个 150px 小滚动框。内置浏览器会拦截页面加载本机地址（`ERR_BLOCKED_BY_CLIENT`），所以真页面上只能贴样式和结构检查，完整脚本在离屏 Electron 仿页面里跑。
- 边界：AI Flow 版本 v272.612；改版后要重看。
- 复审条件：AI Flow 升级或延长弹窗结构变化。
