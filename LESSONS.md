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

### LES-007：素材一多滚动就卡——查"音频波形 canvas、透明的悬停按钮、滚动中的悬停效果"

- 日期：2026-11-05
- 状态：已验证（用户资源库的只读镜像，263 个素材含 42 个音频）
- 场景：用户反馈"一旦素材堆积太多就很卡"，滚动时最明显。
- 做法：用 CSS 开关做 A/B（同一次运行里交替测，避开机器忙闲的波动），再按结果改：① 音频卡片的波形从 `<canvas>` 改成画好后的静态图片（canvas 会被提成 GPU 图层，上面的按钮跟着成层，每帧重排）；② 卡片上悬停才出现的小按钮平时 `display: none`（只是透明或 `visibility: hidden` 都还要参与布局和图层计算），悬停用 `@starting-style` 淡入；③ 入场动画用 `backwards` 不用 `both`，结束后不再占动画图层；④ 滚动时给 `main` 临时加 `is-scrolling`，卡片 `pointer-events: none`，卡片从鼠标底下划过不再触发悬停效果；⑤ 波形峰值存到 localStorage，每次打开不再重新解码。
- 证据：1440×900、鼠标停在卡片上：46～49 → 72～73 帧/秒，超过 33ms 的帧 15～23% → 0%；最大化 2560×1392（187 张卡）：48 → 67 帧/秒。
- 边界：测试时测试窗口要在前台——最小化后页面不画，帧计时和"进入视野"都会停；测速前把鼠标位置固定好。工具在 `scripts/perf`（`npm run perf:lib` / `perf:mirror` / `perf:scroll`，用法见 scripts/perf/README.md）。
- 复审条件：卡片结构大改、换虚拟滚动方案，或又加了悬停 / 动画效果。

### LES-008：验收窗口用的就是用户的真实资源库

- 日期：2026-11-05
- 状态：已验证
- 场景：`.codex-temp/qa-r6-20261102/user-data` 的 `settings.json` 里 `libraryPath` 是 `D:\鏉庢椇`（文件夹名就是这串乱码），和用户安装版用的是同一个资源库。在验收窗口里试"颜色标记 / 备注"时改到了用户的真素材（RYAN_L08-BALL-INJURED_v03.2），已按 `.nest-backups` 里的备份还原（备注 "1"、去掉颜色、修改时间 10-29 13:43），改前的索引存在 `.codex-temp/library-before-revert-*.json`。
- 做法：要测会改数据的功能，用单独的测试资源库：`make-perf-lib`（生成上千个素材）或 `make-mirror-lib`（复制用户索引 + 硬链接素材文件，素材在 `assets/` 子目录下），各自配一个单独的 `NEST_USER_DATA_DIR`。只读查看才可以用验收窗口。
- 边界：硬链接只在同一个盘有效；镜像里删掉了 `aiFlowLiveSync`，不会去连 AI Flow。
- 复审条件：验收用的 user-data 改指向测试资源库之后可以撤销这条。

### LES-009：静态源码测试不要锁死被包装的事件处理器签名

- 日期：2026-11-05
- 状态：已验证
- 场景：为文件夹打开事件加 View Transition 包装后，4 个源码正则测试仍要求旧的 `openFolder(folder) { ... }` 形态，误报为功能回归。
- 做法：静态测试断言用户可观察的行为和包装后的关键调用，不依赖无关的空格/参数名；涉及运行时行为时优先用单元或 UI 测试验证。
- 证据：更新 3 个断言后相关 45 项测试通过；全量测试的 19 项失败均属于已记录旧失败集合。
- 边界：静态测试仍适合验证 CSS 约束、IPC 白名单等源码结构契约。
- 复审条件：改用可运行的组件测试覆盖这些事件流程。
