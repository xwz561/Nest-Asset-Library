# 任务接力

## 当前目标

- 按用户给的浅色柔光仪表盘参考图做一套**新界面**（布局、SVG 和按钮），对所有主题生效；切换主题只换颜色，不换界面（DEC-002）。"柔光橙"是新用户的默认配色。然后提交并打 Windows/Mac 包。不改字体。

## 当前状态

- 新界面五轮改动已提交（分支 `codex/deepseek-leads-silver-kitten` 上 `052f689` 之后的那一条提交），未推送、未打包。
- 主题：`src/theme-utils.js` 新增 `soft-orange` 预设，设为新用户默认；`themeStyle` 补上团队库面板用的 `--bg-primary/--bg-secondary/--border-subtle`，并通过 `softUiColors` 输出新界面专用的 `--soft-select`（选中色）、`--soft-select-text`、`--soft-select-strong`、`--soft-accent-text`。柔光橙的选中色是浅蓝 `#6FA8F5`、按钮固定白字；其他主题选中色就是强调色，字色用 `onAccentText`（白字对比度 ≥3 才用白字）。
- 布局：`src/main.jsx` 根节点始终带 `soft-ui` 类，body 始终带 `soft-ui-body`（深色主题再加 `soft-ui-dark`），始终渲染图标栏 `.soft-rail` 和问候顶栏 `.soft-greeting`，旧的空状态插画已删除。拖动侧栏时要减掉 `softRailWidth`（76）。插画：`components/soft-empty-illustration.jsx`，颜色全部用 `--soft-*` 变量。
- 样式：`src/soft-ui.css` 管布局、按钮和顶栏，`src/soft-ui-panels.css` 管面板和对话框。选择器以 `.app.soft-ui.ready-ui.ui-refresh` 开头（和原来的 `.theme-light` 写法特异性相同，用来压过旧主题的 `!important`）。`soft-ui.css` 开头的变量块把所有 `--soft-*` 颜色从主题变量推出来；`.theme-dark` / `body.soft-ui-dark` 另有一套更深的投影和遮罩。写死的颜色只剩关闭按钮红、AI 导演按钮粉紫等几处（测试里有白名单）。按钮无描边，圆角用 10/12/14/99，投影用 `--soft-btn-shadow`（普通）、`--soft-btn-shadow-primary`（主按钮）、`--soft-btn-shadow-blue`（选中项）。
- Windows 窗口按钮改为页面自画：`components/window-controls.jsx`、`window-controls.css`，`titleBarOverlay:undefined`，原因见 DEC-001。
- 测试 528 条：506 通过、22 失败（旧基线，`.codex-temp/claude-fail-leash.txt`）。`test/lan-chat.test.cjs` 在整套一起跑时偶尔失败，单独跑能过。`test/soft-ui-theme.test.cjs` 会按逗号切分选择器检查是否限定在 `.soft-ui` 下，所以 `:has()` / `:is()` 括号里不要写逗号，拆成多条选择器；新加颜色要用变量，否则会被"写死的颜色"测试拦下。
- 验收：先 `npm run build`（应用读 `dist/`），设 `NEST_USER_DATA_DIR` 为 `.codex-temp/qa-r6-20261102/user-data` 的**绝对路径**（相对路径会被 `electron/main.cjs` 忽略，进而撞上正式实例的单实例锁直接退出），运行 `node_modules/electron/dist/electron.exe . --remote-debugging-port=9333`，用 CDP 截图；结束时按 PID 关闭进程。9333 被占用说明已有验收实例在跑，可直接连上去 `location.reload()` 后截图。切主题预览不用改设置：在页面里派发 `nest-theme-change` 事件，`detail` 传 `{mode, preset, colors}`。
- 未确认：真 Mac 上的新界面；运行 55 的包上团队库能否正常连接；侧栏实际拖动；约 900 宽的窄窗口里问候语被搜索框挤成"你…"（上一轮有意用省略号，是否改待用户定）；深色主题下的详情面板、右键菜单、各类小对话框只抽查了设置页、资源库菜单和空状态。

## 最近里程碑（最多 3 条）

- 新界面对所有主题生效（DEC-002）：六个预设都截图确认过是同一套布局，只换颜色；柔光橙和改之前一致。
- 设置页 9 个分页的模块边缘统一：一级模块无描边、18px 圆角、柔和投影，子块浅灰无描边；修了"通用"卡片套卡片、主题预设选中双圈、灰框色块、"测试连接"深灰按钮、版本号黑框、助手提示语输入框只有 34px 高。
- 弹窗打开时，窗口按钮退到窗口顶边、变成无底色线条图标，不再悬在遮罩上、压住设置弹窗上沿；矮窗口下图标栏自动收紧。

## 当前阻塞

- 无。

## 下一步

- 用户在问界面卡片模块能否拖动。已建议做"在各自区域里拖动排序"（侧栏面板各块、图标栏图标、顶栏工具按钮，每人记住自己的排列，带"恢复默认布局"），而不是完全自由摆放；等用户定。
- 打包：`NEST_PACKAGE_OUTPUT=release-3.0.56-rX node scripts/package-windows-setup.cjs` 打 Windows 包；推送分支后 Actions 会打 Mac 包。
