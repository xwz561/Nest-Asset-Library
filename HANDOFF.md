# 任务接力

## 当前目标

- 按浅色柔光仪表盘参考图做的新界面对所有主题生效（DEC-002）；卡片自由摆放 / 贴边换方向 / 互不遮挡 / 疯狂模式（DEC-003）；窗口按钮是左上角圆点（DEC-001）；顶栏「演示方法」在窗口里放操作演示视频并列出新手教程（DEC-004）。版本 4.0.1，先不发 GitHub Release。不改字体。

## 当前状态

- 分支已推送到 `63ca2e6`（升 4.0.1）。之前打的 4.0.1 包**不含下面未提交的改动**。
- 未提交：滑动卡顿修复（LES-002）、卡片布局全套（DEC-003）、左上角圆点、出错兜底（`components/error-boundary.jsx`，防黑屏）、演示方法（`components/usage-demo-dialog.jsx`、`tutorial-steps.js`、`scripts/usage-demo/`、`src/assets/usage-demo.mp4`）。
- 样式约定：选择器以 `.app.soft-ui.ready-ui.ui-refresh`、`body.soft-ui-body` 或 `html[data-platform] .app.soft-ui` 开头；颜色用 `--soft-*` 变量；`:has()` 里不写逗号，不写 `@keyframes`。
- 测试 551 条：已知失败清单外全过；LAN 聊天上传测试整套跑时偶发 fetch failed，单跑通过。
- 验收：`npm run build`；`NEST_USER_DATA_DIR` 设为 `.codex-temp/qa-r6-20261102/user-data` 的绝对路径；`electron.exe . --remote-debugging-port=9333`；改了 `electron/main.cjs` 要重启；验收窗口开着时重新构建会让按需加载的页面找不到旧文件。
- 未确认：真 Mac；真人鼠标；桌面卡片里的右键菜单会出现在主窗口里。

## 最近里程碑（最多 3 条）

- 演示方法：83 秒 MG 视频 12 章（导入→友商工具→局域网信号→分类→文件夹→搜索→整理→素材→编辑布局→疯狂模式→随时再看），对话框可点章节跳转；新手教程最后一步指向这个按钮。
- 设置打不开（黑屏）：原因是软件开着时重新构建，已加出错兜底。
- 疯狂模式、卡片互不遮挡、访达分栏都已验证。

## 当前阻塞

- 无。

## 下一步

- 用户确认后提交（作者 `-c user.name=liwang -c user.email=liwang@dramabox.com`），关掉验收窗口（LES-001）后 `NEST_PACKAGE_OUTPUT=release-4.0.1 npm run package:win` 重打 Windows 包，推送分支重打 Mac 包。
