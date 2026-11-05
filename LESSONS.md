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

### LES-010：新增 soft UI 控件要覆盖旧主题的固定色规则

- 日期：2026-11-05
- 状态：已验证
- 场景：素材多选后底部批量操作条仍显示旧版深蓝背景和蓝色边线，浅色主题尤其明显。
- 做法：检查 `ready-ui.css`、`ui-refresh.css` 等旧样式中是否有高优先级的固定颜色；在 `soft-ui-panels.css` 以新界面限定选择器覆盖，并只使用 `--soft-*` 主题变量。
- 证据：对照截图确认旧 `.batch-bar` 与浅色主题专用规则未被新界面覆盖；加入主题变量与减少动态效果回归测试后，相关 15 项通过，生产构建成功。
- 边界：保留非 soft-ui 界面的旧主题样式；此次未在实机中复验批量操作条画面。
- 复审条件：其他悬浮操作条或新控件出现旧主题色泄漏。

### LES-011：视频卡片控制条必须同时隔离卡片拖动与框选

- 日期：2026-11-05
- 状态：已验证（隔离测试资源库）
- 场景：视频卡片的进度条点击可跳转，但按住拖动会启动 article 的原生拖动或素材网格框选。
- 做法：控制条的 pointerdown / mousedown 阻止冒泡；按下时暂时关闭所属 article 的 draggable，松开、取消或窗口失焦时恢复；控制条 dragstart 取消。网格框选入口忽略 input、button 和视频控制条。
- 证据：CDP 在标准、紧凑、列表三种视图拖动进度，时间实时变化、无卡片 dragstart / 框选；暂停和播放状态都保持，松开后 draggable 恢复。
- 边界：只对卡片里的视频控制条生效；详情和预览播放器保持原行为。
- 复审条件：素材卡片拖放或视频控制条事件结构改变。

### LES-012：内容区尺寸变化时不要给命名快照做几何过渡

- 日期：2026-11-05
- 状态：已验证（隔离测试资源库，含浮动卡片贴边布局）
- 场景：打开文件夹会显示详情面板、改变主区宽度并归零滚动；`nest-content` 的旧、新快照尺寸不同时，浏览器会把快照框从旧几何形状插值到新几何形状，造成内容区跳动。
- 做法：`::view-transition-group(nest-content)` 禁止几何动画；文件夹前进、返回和从文件夹切分类直接更新状态，不启动 View Transition；滚动归零放进 `activeFolder` 的布局更新中。侧栏、顶栏和详情面板不参与快照动画。
- 证据：修复前 CDP 截帧记录了尺寸变化期间的跳动；修复后前进、返回、切分类和右侧贴边布局下均无 View Transition 快照，滚动位置同步归零。
- 边界：放弃文件夹导航的滑入淡入动画，以避免不稳定的几何过渡。
- 复审条件：内容区布局和详情面板改成不改变快照尺寸后，可重新评估只做内容淡入。

### LES-013：改共享 CSS 规则前先核对整组选择器

- 日期：2026-11-05
- 状态：已验证
- 场景：共享规则原本同时命中图片、视频和音频波形；给波形补 `object-fit: fill` 时若把声明加在共享规则，会把普通图片和视频拉伸。
- 做法：先核对整组选择器及各元素的计算样式；共享规则只保留共同属性，单独行为另建精确选择器。普通素材图使用 `cover`，只有 `.audio-waveform` 使用 `fill`。
- 证据：隔离测试库中图片和视频计算样式为 `cover`，音频波形为 `fill`；源码测试保证 `fill !important` 仅存在于单独波形规则。
- 边界：新共享规则仍需检查旧样式级联与主题覆盖。
- 复审条件：缩略图 DOM 或样式入口变化。

### LES-014：旧的导航 span 弹性规则会撑开新开关圆钮

- 日期：2026-11-05
- 状态：已验证
- 场景：旧规则 `nav button span { flex: 1 1 0% }` 会套到新开关的 `span.switch-thumb`，把圆钮从 18px 拉宽。
- 做法：在 soft UI 的作用域选择器中给 `.switch-track` 与 `.switch-thumb` 显式设置 `flex: none`；图标栏“编辑布局”用图标和状态点，不在方形图标按钮里塞文字开关。
- 证据：深色、浅色与柔光橙主题下检查轨道 36×22、圆钮保持圆形；图标按钮的开关状态由右上角状态点表示。
- 边界：旧导航规则仍供非 soft UI 界面使用。
- 复审条件：删除或收窄旧 `nav button span` 规则后可重新评估。

### LES-015：桥接离线不是扩展未配对

- 日期：2026-11-05
- 状态：已通过桥接响应与隔离测试确认；真实 Edge 长时验收待做
- 场景：素材库进程关闭时，`127.0.0.1:32145` 的健康请求以 `fetch failed` / `ECONNREFUSED` 结束；素材库打开但扩展密钥错误时，桥接返回带“浏览器采集扩展未配对”标记的拒绝响应。旧代码把普通连接错误也显示成“未配对”，而页面每 3 秒再次请求引用上传，所以离线时持续报错并弹通知。
- 做法：让 popup、通知与页面状态使用同一分类器；只将明确的配对标记判为未配对，离线完全静默。同步按 15/30/60/120 秒退避，独立的 30 秒只读健康探测用于在桌面端重开后及时恢复；状态通知与真实上传失败通知按类别保存并做 10 分钟去重。
- 证据：连接状态、退避、通知去重及扩展回归测试通过；全量测试失败均在既有 Windows 基线名单中。真实 Edge 10 分钟离线与三态界面截图未完成，不能当作实机通过。
- 边界：本地健康探测不读取素材内容；不在 AI Flow 提交或生成视频。
- 复审条件：桥接响应格式或 Chrome session storage 生命周期变化。
