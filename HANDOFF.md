# 任务接力

## 当前目标

- 按浅色柔光仪表盘参考图做的新界面对所有主题生效，主题只换颜色（DEC-002）；侧栏卡片可自由摆放（DEC-003）。完成后提交并打 Windows/Mac 包。不改字体。

## 当前状态

- 分支 `codex/deepseek-leads-silver-kitten`：`d08fc14` 新界面，`7745aa9` 去问候语、修文件夹行按钮，`ddb2c2f` 卡片自由摆放和"编辑布局"开关，`ac97091` 更新交接；已推送。
- 2026-11-04 已打包：Windows `release-3.0.56-soft-ui/小旺仔素材库-3.0.56-Setup.exe`（647 MB，核对过 app.asar 含新代码）；Mac 由 Actions run 41758589388 打出 x64/arm64 的 DMG 和 ZIP，下载页 https://github.com/xwz561/Nest-Asset-Library/actions/runs/41758589388 （保留到 11-18）。版本号仍是 3.0.56，没发 GitHub Release；自动更新只认更高版本号，已装 3.0.56 的人收不到。
- 卡片自由摆放 + "编辑布局"开关已做完、验收、提交。规则见 DEC-003，位置存 localStorage `nest-card-layout-v1`。代码：`src/card-layout.js`、`hooks/useCardLayout.js`、`components/soft-card.jsx`、`soft-ui.css` 末尾。顺手修了标签行文字居中。
- 样式约定：新界面选择器以 `.app.soft-ui.ready-ui.ui-refresh` 或 `body.soft-ui-body` 开头；颜色用 `--soft-*` 变量；`:has()` 括号里不写逗号，不写 `@keyframes`（`test/soft-ui-theme.test.cjs` 会拦）。
- 测试 536 条：514 过，22 失败＝旧基线（`.codex-temp/claude-fail-leash.txt`）；`lan-chat` 整套跑时偶尔失败。
- 验收：先 `npm run build`；`NEST_USER_DATA_DIR` 设为 `.codex-temp/qa-r6-20261102/user-data` 的绝对路径；`electron.exe . --remote-debugging-port=9333` 后用 CDP 截图、模拟拖动、派发 `nest-theme-change` 预览主题。
- `C盘原始副本`（36 GB）超过回收站上限，留给用户自己删。
- 未确认：真 Mac；真人鼠标拖动；把素材拖到浮动的文件夹卡片上；运行 55 的包连团队库；深色主题下的详情面板、右键菜单、小对话框只抽查过。

## 最近里程碑（最多 3 条）

- "编辑布局"开关：取消、保存、一键重置、刷新后保留都验过，深色和柔光橙都截图确认。
- 打出 Windows 安装包和 Mac 四个包（见当前状态）。
- 卡片完全自由摆放：五张卡片拖到任意位置、拉大小、放回；五张都拖走时侧栏白卡收起。

## 当前阻塞

- 无。

## 下一步

- 等用户决定：升到 3.0.57 并发 GitHub Release（自动更新才会推送），还是直接手动分发这次的安装包。Windows 包用 `NEST_PACKAGE_OUTPUT=... npm run package:win`（先关验收窗口，LES-001），推送本分支自动打 Mac 包；提交作者 `-c user.name=liwang -c user.email=liwang@dramabox.com`。
