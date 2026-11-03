# 小旺仔素材库 — Bug 测试报告

> **2026-08-28 更新（v2.0.9）**：以下 9 个 bug（4×P1 + 5×P2）已全部修复并打包为便携单文件版
> `release-2.0.9/Small-Wangzai-Asset-Library-2.0.9-Portable.exe`。
> 回归脚本 `test/qa-fix-regression-2.0.9.cjs`（17 项断言）全绿，66/66 原有单元测试通过，冒烟启动正常。

# 一、2.0.8 原始测试报告

- **测试日期**：2026-08-28
- **测试对象**：`release-2.0.8`（win-unpacked 打包版）+ 全量源码静态审查
- **测试方法**：源码逐行审查（electron 17 个模块 + main.jsx 4802 行）→ 疑点模块级脚本验证 → 单元测试套件 → 打包版冒烟测试
- **结论**：66/66 单元测试通过，冒烟启动正常。实锤 **4 个 P1 功能 bug**、**5 个 P2 体验 bug**、若干 P3 观察项。

---

## 一、测试通过项

| 项目 | 结果 |
|---|---|
| 单元测试（17 个文件 / 66 个用例） | 全部通过（8.5s） |
| 打包版冒烟测试 | 启动正常，多进程稳定，主进程内存 ~160MB |
| 原子写入 + .previous 恢复 + 30 份滚动备份（json-storage） | 设计良好 |
| nest:// 协议 Range 请求（视频拖动播放） | 实现正确 |
| 路径穿越防护（`..` 段过滤） | 正常 |
| 更新包 SHA256 强制校验 + 独立 updater 回滚 | 逻辑完整 |
| AI 计划校验（白名单工具 + 资产/文件夹存在性检查 + 撤销快照） | 逻辑完整 |
| 历史 Monkey 测试（5 万次操作） | RSS 仅 +3.5MB，无明显泄漏 |

---

## 二、P1 — 功能性 Bug（建议尽快修复）

### BUG-1：超大文件夹导入时**静默失败，无任何提示**
- **位置**：`electron/main.cjs` L151 `importPaths()` + `electron/import-paths.cjs` L36 + `src/main.jsx` L874-896
- **根因链**（三层都缺保护）：
  1. `expandImportPaths` 超过 `maxFiles`（10000）或 `maxEntries`（50000）时直接 `throw`；
  2. `main.cjs` 的 `importPaths()` 调用处**没有 try/catch**，异常沿 `enqueueLibraryMutation` → IPC `invoke` 一路 reject；
  3. 渲染层 `nativeImport` / `nativeImportFolder` **只有 try/finally，没有 catch**，异常变成 unhandled rejection。
- **复现**：导入一个含超过 10000 个素材的文件夹 → 无进度、无报错、无 toast。
- **修复建议**：渲染层补 `catch` 显示 `setMessage`；同时 main 侧把超限错误转入 `lastImport.errors` 返回。
- **验证状态**：已用脚本实锤（`test/qa-bug-hunt-verify.cjs`，抛出 "单次最多导入 2 个素材" 于 maxFiles=2 时）。

### BUG-2：SVG / MOV 素材的格式筛选**永远无法命中**
- **位置**：`src/main.jsx` L205-209 `assetFormat` + L193-204 `FILTER_FORMATS`
- **根因**：导入素材的 `name` 不含扩展名（main.cjs L154），`assetFormat` 回退到 MIME 子类型：
  - SVG → `image/svg+xml` → `"SVG+XML"` ≠ 芯片 `"SVG"`
  - MOV → `video/quicktime` → `"QUICKTIME"` ≠ 芯片 `"MOV"`
  - （另：M4V → `video/mp4` → 显示为 MP4，属于可接受降级）
- **复现**：导入 .svg 或 .mov 文件 → 工具栏"筛选 → 格式 → SVG/MOV" → 结果永远为空。
- **修复建议**：加 MIME→格式映射表：`{ 'svg+xml':'SVG', quicktime:'MOV', jpeg:'JPG', mpeg:'MP3' }`。
- **验证状态**：已用脚本实锤（SVG→"SVG+XML"，MOV→"QUICKTIME"）。

### BUG-3：详情面板切换"所在文件夹"后，**物理文件不迁移**
- **位置**：`electron/main.cjs` L178 `library:update-asset`（对比 L179 `batch-update` 有调用 `syncPhysicalFolders`）
- **根因**：详情面板文件夹下拉（main.jsx L3489-3503）走 `patch → update-asset`，该 handler 修改 `asset.folderId` 后**不调用 `syncPhysicalFolders`**。
- **影响**：软件内已显示在新文件夹，但磁盘上文件仍留在旧目录（`assets/旧文件夹/xx.jpg`），与"物理目录结构 = 逻辑文件夹树"的产品设计不一致；直到下一次任意其他写操作触发 sync 才被搬走，期间用户在资源管理器看到的结构与软件不一致。
- **修复建议**：`update-asset` 中检测 `changes.folderId` 变化时补调 `syncPhysicalFolders(libraryPath, data)`。
- **验证状态**：对照实验确认 sync 会移动文件（`moved=true`），故缺调用必致不一致。

### BUG-4：关闭右侧检视器时，**窗口瞬移回旧位置**
- **位置**：`electron/main.cjs` L169 `app:set-inspector-open`
- **根因**：打开检视器时记录 `record.base`（完整 x/y/width/height）；关闭时 `animateWindowBounds(win, record.base)` **整体恢复**这四个值。
- **复现**：选中素材（窗口变宽）→ 拖动/调整窗口 → 关闭详情面板 → 窗口跳回打开检视器之前的位置和大小。
- **修复建议**：关闭时只收缩宽度：`win.setBounds({...win.getBounds(), width: win.getBounds().width - record.added})`，保留用户当前的 x/y/height。

---

## 三、P2 — 边界 / 体验 Bug

### BUG-5：同级大小写不同名文件夹在磁盘上**合并为同一物理目录**
- **位置**：`electron/main.cjs` L124/L125（查重用 `===`，区分大小写）vs `physical-folders.cjs` L58（物理目录用 `toLowerCase` 归一）
- **复现**：先建文件夹 `Photos`，再建 `photos` → 索引中是两个独立文件夹，但 Windows 文件系统不区分大小写，两个文件夹的素材全部落入同一个物理目录。
- **风险**：用户在资源管理器中无法区分两个文件夹的内容；后续 sync 的 `nextAvailable` 重名规避会把文件改名搬移，行为难以预测。
- **修复建议**：`add-folder` / `update-folder` 的同级查重改为 `f.name.toLowerCase() === clean.toLowerCase()`。
- **验证状态**：已用脚本实锤（`Photos` + `photos` 的素材同处 `assets/Photos`）。

### BUG-6：Esc 快捷键不判断输入焦点
- **位置**：`src/main.jsx` L584-603（对比 L1437 的 `onShortcut` 有 `closest('input,textarea,select')` 保护）
- **影响**：在搜索框、重命名输入框、AI 对话框内按 Esc，会同时关闭预览 / AI 面板 / 排序面板 / 筛选面板等全部浮层，输入内容场景被打断。
- **修复建议**：补上与 `onShortcut` 相同的焦点保护。

### BUG-7：AI 设置页版本号硬编码为 2.0.7
- **位置**：`src/main.jsx` L2966（`版本 2.0.7`），当前应用已是 2.0.8。
- **修复建议**：从 package.json 注入版本（Vite `define` / `__APP_VERSION__`）。

### BUG-8：死按钮（无任何响应）
- `src/main.jsx` L3558：详情面板底部"更多操作"按钮无 `onClick`；
- `src/main.jsx` L3230 / L3238：AI 设置页"帮助文档"、"模型与服务状态"无 `onClick`。
- **修复建议**：接上功能或暂时隐藏。

### BUG-9：web 版导入的 ObjectURL 泄漏
- **位置**：`src/main.jsx` L1336-1366 `importFiles`，`URL.createObjectURL(file)` 创建的 `tempUrl` 从未 `revokeObjectURL`（桌面版不走此路径，影响范围小）。

---

## 四、P3 — 低优先级观察项

1. **剪藏服务器端口固定 32145**（main.cjs L158）：被其他程序占用时仅 `console.error`，扩展剪藏功能静默失效，建议失败时通知渲染层。
2. **导入对话框未复用防重入锁**：`library:import` / `import-folder` 直接调 `dialog.showOpenDialog`，未走 `selectFolder` 的 `libraryDialogActive` 守卫，理论上可同时弹出两个系统对话框。
3. **`library:open` 打开旧库不设置 `physicalLayoutVersion`**（只有 `library:current` 的 `ensurePhysicalLayout` 会设置），行为不一致但影响极小。
4. **Preview 滚轮缩放**（main.jsx L4491-4497）：React 17+ 对 `onWheel` 使用 passive 监听，`preventDefault()` 可能无效并产生控制台警告，建议改用 ref + `addEventListener('wheel', fn, {passive:false})`。
5. **构建产物命名与脚本不一致**：`package.json` 的 `package:win` 配置产物名为 `Nest-Asset-Library-${version}-Setup.exe`，实际发布物为 `Small-Wangzai-Asset-Library-2.0.8-Setup.exe`，说明发布用了另一份配置；`chooseUpdateAsset` 按后缀正则匹配不受影响，但建议统一避免后续维护混乱。

---

## 五、复现/回归验证脚本

本次新增 `test/qa-bug-hunt-verify.cjs`（9 项断言，4 项实锤），可直接纳入回归：

```bash
node test/qa-bug-hunt-verify.cjs
```

## 六、总体评价

代码质量整体相当扎实：原子写入 + 双层备份 + 单实例队列串行化所有库写入，nest:// 协议和 AI 计划校验的安全设计都很到位。上述问题集中在**错误传播路径断层**（BUG-1）、**格式归一化遗漏**（BUG-2/5）和**两条写入路径行为不对称**（BUG-3）三类，均为小改动可修复，不涉及架构调整。

---

# 七、2.0.9 修复记录

| 编号 | 严重度 | 修改文件 | 修复方式 |
|---|---|---|---|
| BUG-1 | P1 | `electron/main.cjs` L151 + `src/main.jsx` | `importPaths` 用 try/catch 捕获扫描异常并转入 `lastImport.errors`；渲染层 `nativeImport`/`nativeImportFolder`/`droppedImport`/`importUrl` 四处补 catch 显示错误 toast |
| BUG-2 | P1 | `src/main.jsx` L205 | 新增 `MIME_FORMAT` 映射表（`svg+xml→SVG`、`quicktime→MOV`、`jpeg→JPG`、`mpeg→MP3`） |
| BUG-3 | P1 | `electron/main.cjs` L178 | `update-asset` 检测 `changes` 含 `folderId` 时补调 `syncPhysicalFolders` |
| BUG-4 | P1 | `electron/main.cjs` L169 | 关闭检视器改为只收缩宽度（`{...currentBounds, width: max(base.width, current.width - added)}`），保留用户当前 x/y/height |
| BUG-5 | P2 | `electron/main.cjs` L124/L125 | 文件夹查重改为 `f.name.toLowerCase() === clean.toLowerCase()` |
| BUG-6 | P2 | `src/main.jsx` L584 | Esc handler 补 `input/textarea/select/[contenteditable]` 焦点保护 |
| BUG-7 | P2 | `vite.config.js` + `src/main.jsx` | `define.__APP_VERSION__` 从 package.json 注入，设置页显示 `版本 {APP_VERSION}` |
| BUG-8 | P2 | `src/main.jsx` | 详情面板"更多操作"接入右键菜单（`openMore`）；删除 AI 设置页两个无响应按钮 |
| BUG-9 | P2 | `src/main.jsx` | web 模式删除素材时 `URL.revokeObjectURL` |

**未修复（P3，影响很小）**：剪藏端口占用无提示、导入对话框防重入锁、`library:open` 的 physicalLayoutVersion 一致性、Preview 滚轮 passive 监听、构建产物命名与脚本不一致。

**验证**：`node test/qa-fix-regression-2.0.9.cjs` → 17/17 通过；`node --test test/*.test.cjs` → 66/66 通过；打包产物内已确认包含全部修复代码（asar + dist bundle 双重校验）。
