# 小猫桌宠接入设计

- 意图：让现有银渐层小猫素材成为设置中可选的桌宠，并能在桌面窗口正常显示、动画。
- 范围：沿用现有 8×11 精灵图渲染器；在设置角色列表、Electron 允许的角色 ID、桌宠渲染器资源映射中注册 `silver-kitten`，预览和运行时均使用 `spritesheet-extended-final.png`。
- 非目标：不改小猫图集、不调整鲸鱼或两个现有小伙伴的行为、不触碰 `electron/file-lock.cjs`、`test/file-lock.test.cjs`、`src/motion-polish.css`、`src/main.jsx`。
- 约束：保留工作树全部既有未提交内容；不调用 `npm run package:win`；先运行锁测试和本次回归测试，再 `npm run build`，最后用 `node scripts/package-windows-setup.cjs`。新包写入独立目录，不覆盖已有 `release`。
- 方案：只扩展既有角色选择/白名单/精灵映射，不另建宠物框架；复用现有的拖动、喂食、活动和精灵动画逻辑。
- 验收：回归测试证明规范化设置接受 `silver-kitten`；生产构建成功；新 app.asar 中含小猫图集、角色配置和桌宠运行文件；Setup.exe 与非零 app.asar 均存在。
