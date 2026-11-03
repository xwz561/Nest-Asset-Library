# NAS 团队素材库服务（开发中）

这是小旺仔素材库的局域网团队库后端。服务端把 PostgreSQL 元数据放在常开服务器本地 SSD，把素材文件放在服务器挂载的 NAS 共享目录。每个素材以随机 ID 存储，文件夹名称由数据库管理，因此同名文件、改名和移动不会让 NAS 路径失效。

当前包含登录/会话、管理员成员管理、文件夹增删改、素材流式上传和预览、分页搜索、回收站软删除/恢复、每库递增的变更记录与长轮询。桌面端源码已增加独立的团队素材库入口，并用 Electron 安全存储保护登录令牌；端到端服务与 NAS 验收仍未完成。

## 运行要求

- 常开 Windows 或 Linux 服务机，Node.js 22 或更新版。
- PostgreSQL 服务运行在服务器本地磁盘；数据库不要放在 NAS 的 SMB 共享目录。
- NAS 通过 SMB/NFS 挂载到服务机，并给服务进程读写权限。普通电脑不直接读写 NAS 目录。
- 局域网使用 HTTPS。证书由公司内部 CA 签发，并让每台客户端信任该 CA。
- 数据库账号需能建表和安装 `pg_trgm` 扩展。

## 本机开发启动

在 `team-server` 目录安装依赖：

```powershell
npm install
```

准备本机 PostgreSQL 数据库。首次启动前设置环境变量；密码只在服务进程环境中提供，不写入仓库：

```powershell
$env:TEAM_DATABASE_URL = 'postgres://team_app:CHANGE_ME@127.0.0.1:5432/nest_team'
$env:TEAM_LIBRARY_ROOT = 'D:\TeamLibraryData'
$env:TEAM_BOOTSTRAP_USERNAME = 'admin'
$env:TEAM_BOOTSTRAP_PASSWORD = 'CHANGE_ME_TO_A_LONG_RANDOM_PASSWORD'
$env:TEAM_BOOTSTRAP_LIBRARY_NAME = '公司素材库'
npm start
```

默认只监听 `127.0.0.1:43180`，适合本机接口开发。向局域网开放时，配置 `TEAM_HOST`、`TEAM_TLS_CERT` 和 `TEAM_TLS_KEY`；未配置证书时服务会拒绝监听局域网地址。不要把密码、私钥或真实数据库连接串提交到版本库。

## Windows 服务机部署

windows/Install-TeamLibraryTask.cmd 用管理员权限启动安装向导。安装器会把服务复制到 %ProgramData%/NestTeamLibrary、安装生产依赖，并注册开机启动的计划任务。配置中的数据库密码和首次管理员密码使用安装时 Windows 账号的 DPAPI 加密。服务任务以这个账号运行，因此它必须能访问 NAS UNC 共享和 HTTPS 私钥文件。

如果不清楚服务器装了什么，可先双击 windows/Check-TeamLibraryHost.cmd。它会用中文列出 Windows、Node.js、PostgreSQL、已连接的 NAS 共享盘和证书检查结果；只读检查，不改系统，也不读取密码。安装向导可选择 NAS 共享位置，并将映射盘符转换为 UNC 路径；程序只在共享位置中新建独立的 NestTeamLibraryData 文件夹，不把文件放在共享根目录。

部署前准备：

1. Windows 服务机安装 Node.js 22+、PostgreSQL，并先创建专用数据库和应用账号；PostgreSQL 数据放本地 SSD。
2. NAS 建立团队素材共享位置，并给服务机运行账号读写权限。安装向导可选映射盘或 UNC 路径，服务会在共享位置下使用独立的 NestTeamLibraryData 文件夹。
3. 为服务机名称准备公司内部 CA 签发的 HTTPS PEM 证书和私钥；将 CA 根证书分发到所有客户端并设为信任。
4. 双击 windows/Install-TeamLibraryTask.cmd，在管理员提示后按向导填写数据库连接信息、NAS 共享位置、证书、监听端口和首次管理员账号。脚本会提示输入 Windows 账号密码来注册开机任务，不会把这些密码写入源码。
5. 按公司 LAN 网段设置 Windows 防火墙入站规则，只开放所选 TCP 服务端口；不要把端口转发到互联网。检查计划任务和 `%ProgramData%\NestTeamLibrary\logs\server.log`，再从另一台电脑打开 `https://服务机名称:端口/healthz`。健康检查同时验证 PostgreSQL 查询和 NAS 根目录读写权限；NAS 不可用时返回 503。

升级服务时重新运行安装脚本会覆盖部署副本并执行 `npm ci`。重跑前应先备份 PostgreSQL 和 NAS；证书续期后可重新运行脚本更新证书路径。若 Windows 账号或密码变更，重新运行安装脚本重新注册任务。

## 接口概览

- `POST /v1/session` 登录并返回短期 Bearer 会话及可访问素材库。
- `GET/POST /v1/libraries/:libraryId/members` 管理员添加成员并查看团队成员列表；成员可设为编辑或管理员。
- `DELETE /v1/libraries/:libraryId/members/:userId` 管理员移除成员（不能移除库所有者或当前登录账号）。
- `GET /v1/libraries/:libraryId/folders` 读取文件夹树。
- `GET /v1/libraries/:libraryId/assets?folderId=root&limit=100&cursor=...&q=...` 分页浏览/搜索。
- `GET /v1/libraries/:libraryId/changes?after=<revision>` 最长等待 20 秒取得增量变更。
- `POST/PATCH/DELETE /v1/libraries/:libraryId/folders[/<folderId>]` 建立、改名/移动及软删除文件夹。
- `POST /v1/libraries/:libraryId/uploads` 流式上传；文件名和元数据通过 Base64URL 请求头传递，避免非 ASCII 请求头错误。
- `GET /v1/libraries/:libraryId/assets/<assetId>/content` 读取原文件并支持 Range。
- `PATCH/DELETE /v1/libraries/:libraryId/assets/<assetId>` 改名/移动和软删除素材。
- `GET /v1/libraries/:libraryId/trash`、`POST .../trash/restore/<folder|asset>/<id>` 查看和恢复回收站内容。

所有写操作在 PostgreSQL 事务中推进该素材库自己的 revision。素材文件先写入 NAS 同一库的 `.staging`，写完后再改名到 `objects`，避免半文件出现在素材列表中。NAS 断线、服务机掉电等情况下仍需备份 NAS 和 PostgreSQL，并在后续版本补齐断点续传、孤儿文件清理及部署恢复流程。

## 缩略图、永久删除、登录续期（本轮）

- **缩略图**：由桌面端在本机生成（图片/视频/音频波形，最长边 480px），上传到 `PUT /v1/libraries/:id/assets/:assetId/thumbnail`（≤2 MB，只收 JPEG/PNG/WebP，按文件头校验），存放在库目录 `thumbs/xx/<uuid>`；`GET .../thumbnail` 读取。服务端不需要任何图像处理依赖。`schema.sql` 会在服务启动时自动补 `assets.thumbnail_key / thumbnail_at` 两列（`ADD COLUMN IF NOT EXISTS`，可重复执行）。
- **永久删除**：`DELETE /v1/libraries/:id/trash/:kind/:id` 与 `DELETE /v1/libraries/:id/trash`（清空），仅管理员；会同时删除 NAS 上的原文件、缩略图。**这是服务端唯一会删除 NAS 文件的操作**，其余删除都是进回收站的软删除。
- **登录续期**：会话有效期 14 天，使用中每过 1 小时顺延一次；登录时顺带清理已过期会话。过期后桌面端自动回到登录页并预填服务器地址与账号，只需重新输入密码。

## 服务端验收脚本

`test/acceptance.mjs` 是一份端到端验收脚本（75 项：登录/限流、成员与权限、文件夹、上传与重试去重、中文搜索与分页、Range 下载、回收站恢复、实时变更、被移除成员立即失效、缩略图上传/读取/格式校验、管理员永久删除与清空回收站、滑动续期等）。**只能在隔离的测试数据库 + 测试 NAS 目录上运行**——它会创建成员/文件夹/素材，并故意触发登录限流：

```powershell
$env:TEAM_E2E_URL='http://127.0.0.1:43180'; $env:TEAM_E2E_USER='admin'; $env:TEAM_E2E_PASSWORD='...'
node test/acceptance.mjs
```

已在真实 PostgreSQL 16 上跑通 75/75；另做过 600 MB 流式上传（服务内存约 190 MB）、30 路并发上传、200 路并发列表、上传中途断开自动清理 `.staging`。仍未在真实 NAS（SMB）、公司内部 CA 证书与 100 人规模下验证。

## 当前边界

此为第一阶段实现。Windows 计划任务安装脚本已写入，但尚未在真实 PostgreSQL/NAS、TLS 证书和 100 人并发环境运行端到端验证。团队视图提供共享目录、搜索、上传、改名/移动、预览/下载和回收站基础操作；现有本地库仍沿用原有操作链路。上线前先在隔离的测试数据库与 NAS 目录验收，不要直接拿真实素材库作首次验证。
