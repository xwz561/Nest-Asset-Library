# 任务接力

## 当前目标

- 修复 3.0.56 macOS 版截图里的问题（用户 2026-11-03 反馈）。

## 当前状态

- 2026-11-03 用户在 Mac 上实测运行 54 的包：菜单栏小图标、磁盘卡片"磁盘 (Dramabox_HZ)"、logo 都已正常。新问题：工具集打不开，原因是 4 个工具都是 Windows .exe，按钮只在 Windows 上可用。已改（未提交、未打包）：Mac 上按钮可点；Mineradio 已安装时 `shell.openPath` 打开 `/Applications` 或 `~/Applications` 下的 `Mineradio.app`，未安装时打开官方 Mac 版下载页 `github.com/XxHuberrr/Mineradio-paused/releases`；其余三张卡片置灰，显示"仅 Windows 可用"。测试 522 条：500 通过、22 失败（旧失败）。
- 2026-11-03 Mac 问题修复：已提交 `0eb8bd1` 并推送（fast-forward）。Actions 运行 54（41607774003）全部步骤成功，产物在 Actions artifacts，保留 14 天，版本仍为 3.0.56：x64 DMG 357,529,367 / x64 ZIP 351,476,022 / arm64 DMG 353,189,110 / arm64 ZIP 347,190,000 字节。还没下载到本地（下载需要登录 GitHub），也还没在真 Mac 上复测。
  - 菜单栏被一长条图片占满：托盘图标直接用了 1254px 的 `build/icon.png`，macOS 菜单栏不会自动缩小。`background-tray.cjs` 的 `trayIcon()` 在 Mac 上缩到 18px 并附带 36px Retina 版本，Linux 缩到 22px，Windows 不变。已用真实的 nativeImage 验证。
  - "这个资源库已移动或不可用"（用户点了团队素材库）：加入团队库会先改写 `.nest-library.json`（临时文件 + rename），紧接着检查文件是否存在；NAS/SMB 上 Mac 会短暂看不到这个文件。`openKnownLibrary` 改为异步，通过 `library-index-wait.cjs` 最多等约 2 秒，4 个入口都改成 await，错误信息里带路径。已在开发版模拟 SMB 延迟，团队库能正常连上。
  - 磁盘卡片"本地磁盘 (—)"、总是统计系统盘：新增 `disk-info.cjs`，Mac 上按素材库目录或 `/Volumes/卷名` 统计并显示名字。
  - 红绿灯按钮压住 logo：Mac 的顶部留白移到 `.sidebar-fixed-controls`（40px）。
  - 侧栏导入卡片消失是设计如此（库为空时隐藏）。
  - 测试 518 条：496 通过、22 失败（均为旧失败）。
- Actions 运行 53（41596058466）成功：macOS 测试符合已知 22 条失败基线；四包均通过 ZIP/DMG、app.asar、版本 3.0.56、24 帧小猫、牵引脚本和 r8 CSS token 核验。
- 本地包在 `release-3.0.56-macos/`，含四个安装包和 `SHA256SUMS.txt`。四包大小依次为 357,517,804、351,474,807、353,199,083、347,188,781 字节；SHA 清单已逐项核对。
- GitHub 三分支均为无父根快照，42 个 tag 已删。按 Release ID 复核 32 个 Release、167 个附件，资产 ID/名称/大小/摘要与清理前完全相同。旧 `/releases/download/<tag>/...` 链接会 404；附件 API 在 `Accept: application/octet-stream` 下仍返回下载重定向。
- 不碰 NAS；本地未跟踪文件与旧包目录保留。Mac 包无签名/公证，首次打开需右键“打开”，或运行 `xattr -dr com.apple.quarantine 小旺仔素材库.app`。

## 最近里程碑（最多 3 条）

- 3.0.56 Mac 双架构构建、测试基线和四包内容核验通过。
- 本地交付文件、大小和 SHA-256 完成校验。
- 清理所有分支历史和标签；GitHub Release 附件仍在。

## 下一步

- 提交工具集改动并重新打 Mac 包（推送就会触发运行 55），然后在 Mac 上复测工具集和团队素材库。
