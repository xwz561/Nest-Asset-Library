# 任务接力

## 当前目标
- 4.0.3（网页采集器 1.16.9）已由用户真机验收完毕；接下来把本轮未提交改动提交到 codex/deepseek-leads-silver-kitten，并清理全量测试里的 20 条已知失败。

## 当前状态
- 安装包：release-4.0.3\小旺仔素材库-4.0.3-Setup.exe，404,731,769 字节，SHA-256 6CB1F9A95A6268C1F114A4146D1C20F99233C6DCD75EDD6C80178328248EB595。包内 app 4.0.3、扩展 1.16.9；asar 和 resources 的 aiflow-page.js 逐字节一致，且与打包前源码一致，七个指定标记和更新说明已核验。
- 指定测试 80/80；单独 AI Flow 测试 19/20，唯一失败为已知 contextMenuFlyoutRef 旧断言。全量 672 条、652 通过、20 失败，与上一轮失败名单一致。日志：.codex-temp\npm-test-4.0.3-1169-20261112.log。
- 用户 2026-11-12 确认「前面已经验收完毕」。仍未提交、推送或发布，未删除 release 目录。先前 Mac 4.0.3 包不含本次新改动。
- 20 条已知失败名单在 test/fixtures/known-failures.txt，其中除旧断言外还有局域网聊天、HTTP 端点拒绝浏览器来源等行为测试，需逐条判断是断言过期还是真 bug。

## 下一步
- 等用户同意后，由 Codex 在 Windows 上提交本轮改动（排除 scripts/perf/、test/perf-scripts.test.cjs、package.json 三条 perf:* 命令和 browser-extension/config.js），不推送、不发 Release；之后逐条处理 20 条已知失败。
