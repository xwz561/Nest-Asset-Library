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
