const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'src', 'main.jsx'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');
const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'browser-extension', 'service-worker.js'), 'utf8');
const aiFlowPage = fs.readFileSync(path.join(root, 'browser-extension', 'aiflow-page.js'), 'utf8');
const lanChat = fs.readFileSync(path.join(root, 'src', 'lan-chat.jsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
const aiStyles = fs.readFileSync(path.join(root, 'src', 'ai-assistant.css'), 'utf8');
const aiSettingsStyles = fs.readFileSync(path.join(root, 'src', 'ai-settings-page.css'), 'utf8');
const viteConfig = fs.readFileSync(path.join(root, 'vite.config.js'), 'utf8');

test('AI Flow refresh button does not pass a React event across IPC', () => {
  assert.match(renderer, /onClick=\{\(\) => refresh\(\)\}/);
  assert.match(renderer, /typeof requestedEpisodeId === "string" \|\| typeof requestedEpisodeId === "number"/);
  assert.match(preload, /typeof options\?\.episodeId === 'string' \|\| typeof options\?\.episodeId === 'number'/);
});

test('AI Flow web-asset association bridge remains scoped but is absent from material details', () => {
  assert.match(preload, /beginAssetLink: assetId => ipcRenderer\.invoke\('aiflow:begin-asset-link', assetId\)/);
  assert.match(preload, /cancelAssetLink: assetId => ipcRenderer\.invoke\('aiflow:cancel-asset-link', assetId\)/);
  assert.match(preload, /unlinkAssetLink: \(assetId, mappingId\) => ipcRenderer\.invoke\('aiflow:unlink-asset-link', assetId, mappingId\)/);
  assert.match(main, /AI_FLOW_ASSET_LINK_TTL_MS = 10 \* 60 \* 1000/);
  assert.match(main, /else if \(req\.url === '\/aiflow-asset-link'\) result = await confirmAIFlowAssetLink\(req\)/);
  assert.match(main, /page\.origin !== configured\.origin/);
  assert.match(main, /readCollectorBody\(req, 8 \* 1024\)/);
  assert.doesNotMatch(renderer, /className="aiflow-asset-links"/);
  assert.doesNotMatch(renderer, /准备关联 AI Flow 网页素材/);
});

test('AI Flow reverse upload remains selected, confirmed, and bounded to the paired extension', () => {
  assert.match(preload, /beginExtensionUpload: \(assetIds, options = \{\}\) => ipcRenderer\.invoke\(/);
  assert.match(main, /AIFLOW_UPLOAD_INTENT_TTL_MS = 10 \* 60 \* 1000/);
  assert.match(main, /MAX_AIFLOW_UPLOAD_ITEMS = 100/);
  assert.match(main, /ipcMain\.handle\('aiflow:begin-extension-upload'/);
  assert.match(main, /req\.url === '\/aiflow-upload-plan'/);
  assert.match(main, /req\.url === '\/aiflow-upload-data'/);
  assert.match(renderer, /上传到 AI Flow/);
  assert.match(renderer, /文件在该网页按钮被点击前不会上传/);
});

test('AI Flow folder upload is explicit and unmapped folders require a user-selected web destination', () => {
  assert.match(preload, /beginFolderExtensionUpload: folderId => ipcRenderer\.invoke\('aiflow:begin-folder-extension-upload', folderId\)/);
  assert.match(preload, /setLiveSync: \(folderId, enabled\) => ipcRenderer\.invoke\('aiflow:set-live-sync'/);
  assert.match(main, /ipcMain\.handle\('aiflow:begin-folder-extension-upload'/);
  assert.match(main, /requiresTargetSelection: true/);
  assert.match(main, /folderTarget\(data, folder\.id\)/);
  assert.match(renderer, /未对应目录请在 AI Flow 网页选好目标/);
  assert.match(main, /ipcMain\.handle\('aiflow:set-live-sync'/);
  assert.doesNotMatch(renderer, /请先在 AI Flow 网页点击“同步目录和素材”/);
  assert.match(renderer, /上传文件夹到 AI Flow/);
  assert.match(renderer, /开启 AI Flow 实时同步/);
  assert.match(renderer, /不会删除或移动任一端已有素材/);
});

test('AI Flow live-upload failures return from the paired extension and become a visible local card status', () => {
  assert.match(main, /reportCollectorAIFlowLiveUploadFailure/);
  assert.match(main, /req\.url === '\/aiflow-live-upload-failed'/);
  assert.match(renderer, /pendingAIFlowUploadsByAssetId/);
  assert.match(renderer, /上传失败/);
  assert.match(renderer, /pendingUpload\.lastError/);
  assert.match(styles, /\.meta \.aiflow-source-badge\.failed/);
});

test('deleting local material disconnects AI Flow without queuing a server deletion', () => {
  assert.match(main, /function detachAIFlowAssetConnections/);
  const deletionHandlers = main.match(/ipcMain\.handle\('library:delete-folder'[\s\S]*?ipcMain\.handle\('ai:settings'/)?.[0] || '';
  assert.match(deletionHandlers, /detachAIFlowAssetConnections/);
  assert.doesNotMatch(deletionHandlers, /queueAIFlowDeletesForAsset/);
  assert.match(deletionHandlers, /publishAIFlowLiveWake\(\)/);
});

test('moving a linked material uses the paired AI Flow folder API and retains the queue until it is acknowledged', () => {
  assert.match(main, /function queueAIFlowMovesForAsset/);
  assert.match(main, /queueRemoteMoves/);
  assert.match(main, /pendingRemoteMovesForPage/);
  assert.match(main, /req\.url === '\/aiflow-live-move-complete'/);
  assert.match(main, /req\.url === '\/aiflow-live-move-failed'/);
  assert.match(worker, /async function moveAIFlowPlan/);
  assert.match(worker, /\/auth\/assets\/\$\{encodeURIComponent\(remoteAssetId\)\}\/folder/);
  assert.match(worker, /method: 'PUT'/);
  assert.match(worker, /aiflow-live-move-complete/);
  assert.match(worker, /notifyLiveMoveFailure\(syncResult\.moveErrors\)/);
});

test('library breadcrumbs expose every folder level as a clickable path', () => {
  assert.match(renderer, /const folderBreadcrumbs = useMemo/);
  assert.match(renderer, /const openLibraryRoot = \(\) =>/);
  assert.match(renderer, /className="breadcrumb-link" onClick=\{openLibraryRoot\}>资源库/);
  assert.match(renderer, /folderBreadcrumbs\.map\(folder =>/);
  assert.match(renderer, /onClick=\{\(\) => openFolder\(folder\)\}/);
  assert.match(renderer, /!activeFolder && <>\s*<b>›<\/b><strong>\{filter\}<\/strong>/);
  assert.match(styles, /\.breadcrumbs \.breadcrumb-link\{/);
});

test('AI Flow video cards offer a direct copy action and no longer inject the manual upload toolbar action', () => {
  assert.match(aiFlowPage, /function injectDirectVideoCopyButtons/);
  assert.match(aiFlowPage, /复制到小旺仔/);
  assert.match(aiFlowPage, /requestVideoCopy\(button\.dataset\.taskId, button\)/);
  assert.doesNotMatch(aiFlowPage, /function injectUploadButton/);
  assert.doesNotMatch(aiFlowPage, /上传小旺仔素材/);
});

test('AI Flow mapped folders show a live connection bolt only while realtime sync is enabled', () => {
  assert.match(renderer, /aiFlowFolderConnected/);
  assert.match(renderer, /aiflow-live-bolt/);
  assert.match(renderer, /AI Flow 实时连接中/);
  assert.match(renderer, /<FolderMark[\s\S]*?<i className="aiflow-live-bolt"[\s\S]*?<span>/);
  assert.match(renderer, /aiFlowLiveSyncEnabledForFolder\(folder\)/);
  assert.match(styles, /@keyframes aiflow-live-pulse/);
  assert.doesNotMatch(renderer, /folder-live-frame/);
  assert.doesNotMatch(styles, /aiflow-live-orbit/);
});

test('AI Flow account login keeps a persistent local browser session without storing a password', () => {
  assert.match(main, /AI_FLOW_AUTH_PARTITION='persist:nest-aiflow-import-auth'/);
  assert.match(main, /session\.fromPartition\(AI_FLOW_AUTH_PARTITION\)/);
  assert.doesNotMatch(main, /session\.fromPartition\(AI_FLOW_AUTH_PARTITION,\{cache:false\}\)/);
  assert.match(renderer, /登录状态会保存在本机，素材库不会保存你的密码/);
});

test('AI Director entry embeds the designated prank video and plays it in the app fullscreen', () => {
  const video = path.join(root, 'src', 'assets', 'director-prank.mp4');
  assert.ok(fs.statSync(video).size > 40 * 1024 * 1024);
  assert.match(renderer, /import directorPrankVideo from "\.\/assets\/director-prank\.mp4"/);
  assert.match(renderer, /const playDirectorPrank = \(\) => \{/);
  assert.match(renderer, /setDirectorPrankPlaying\(true\)/);
  assert.match(renderer, /void window\.nestDesktop\?\.setFullscreen\(true\)/);
  assert.match(renderer, /src=\{directorPrankVideo\}/);
  assert.match(renderer, /onEnded=\{closeDirectorPrank\}/);
  assert.match(renderer, /directorPrankEscCount\.current \+= 1/);
  assert.match(renderer, /directorPrankEscCount\.current >= 2/);
  assert.doesNotMatch(renderer, /再按一次 Esc 返回素材库/);
  assert.doesNotMatch(renderer, /director-prank-close/);
  assert.match(renderer, /void window\.nestDesktop\?\.setFullscreen\(false\)/);
  assert.match(preload, /setFullscreen: enabled => ipcRenderer\.invoke\('app:set-fullscreen', Boolean\(enabled\)\)/);
  assert.match(main, /ipcMain\.handle\('app:set-fullscreen'/);
  assert.doesNotMatch(renderer, /openDirectorWorkbench|directorLoading|directorError|directorUrl|director-module/);
  assert.doesNotMatch(main, /director:start|ensureDirectorGateway|director-workbench/);
});

test('Windows uses native caption controls and reserves their titlebar space', () => {
  assert.match(main, /titleBarStyle: process\.platform===['"]win32['"]\?['"]hidden['"]/);
  assert.match(main, /titleBarOverlay:process\.platform===['"]win32['"]\?\{color:['"]#07111f['"],symbolColor:['"]#dce1e7['"],height:44\}/);
  assert.doesNotMatch(renderer, /className="window-controls"/);
  assert.match(main, /win\.setTitleBarOverlay\(\{color:colors\.background,symbolColor:colors\.symbols,height:44\}\)/);
  assert.match(styles, /\.detail-open main>header\{padding-right:154px\}/);
});

test('outward inspector reserves its width and sidebar has one explicit scroll owner', () => {
  assert.match(styles, /\.app\.detail-open>main\{margin-right:350px\}/);
  assert.match(renderer, /<div className="sidebar-scroll-content">/);
  assert.match(styles, /\.app\{grid-template-rows:minmax\(0,1fr\)\}/);
  assert.match(styles, /\.app>aside:first-child\{[^}]*display:flex[^}]*flex-direction:column[^}]*width:var\(--sidebar-width,232px\)[^}]*height:100vh[^}]*max-height:100vh[^}]*overflow:hidden/);
  assert.match(styles, /\.sidebar-scroll-content\{[^}]*width:100%[^}]*min-height:0[^}]*flex:1 1 auto[^}]*overflow-y:auto/);
  assert.match(styles, /\.sidebar-scroll-content::\-webkit-scrollbar\{width:10px/);
  assert.match(styles, /\.sidebar-fixed-footer\{[^}]*position:static[^}]*flex:0 0 auto/);
  assert.match(styles, /\.compact-folder-tree \.folder-main\{[^}]*font-size:12px/);
});

test('virtual grid survives rapid window resize without producing an empty range', () => {
  assert.match(renderer, /const startRow = rows \? Math\.min\(rows - 1, requestedStart\) : 0/);
  assert.match(renderer, /const endRow = rows \? Math\.max\(startRow \+ 1, Math\.min\(rows, requestedEnd\)\) : 0/);
  assert.match(renderer, /const observer = new ResizeObserver\(refresh\)/);
  assert.match(renderer, /window\.addEventListener\("resize", refresh\)/);
  assert.match(renderer, /settleTimer = setTimeout\(\(\) => updateVirtualRange\(main\), 140\)/);
});

test('formal renderer contains no beta or test-release label', () => {
  assert.doesNotMatch(renderer, /测试版|<em>BETA<\/em>|IS_TEST_BUILD/);
  assert.doesNotMatch(styles, /\.version-badge/);
});

test('formal update pages explain the current release and retain online release notes', () => {
  assert.match(renderer, /const CURRENT_RELEASE_NOTES = \[/);
  assert.match(renderer, /title: "深度视频转换"/);
  assert.match(renderer, /title: "AI Flow 文件夹同步"/);
  assert.match(renderer, /title: "聊天与文件传输"/);
  assert.match(renderer, /function ReleaseNotes\(\{ remoteNotes = "" \}\)/);
  assert.match(renderer, /<ReleaseNotes remoteNotes=\{info\.notes\} \/>/);
  assert.match(renderer, /<ReleaseNotes \/>/);
  assert.match(styles, /\.release-note-grid\{display:grid/);
});

test('welcome screen uses the same branded app icon as the sidebar', () => {
  assert.match(renderer, /<div className="mark big">\s*<img src=\{appIcon\} alt="小旺仔素材库图标" \/>\s*<\/div>/);
});

test('global new-folder controls default to the root while the context menu remains explicit for child folders', () => {
  assert.match(renderer, /const addFolder = \(\) => addFolderAt\(null\)/);
  assert.match(renderer, /<Plus size=\{15\} \/> 新建根文件夹/);
  assert.match(renderer, /add: \(\) => addFolderAt\(contextMenu\.folder\.id\)/);
});

test('clicking a material thumbnail adds a non-destructive reference card above the library', () => {
  assert.match(renderer, /\[referenceAssetIds, setReferenceAssetIds\] = useState\(\[\]\)/);
  assert.match(renderer, /function ReferenceShelf\(\{ assets, remove, clear, open, upload, uploading, createBoard \}\)/);
  assert.match(renderer, /点击下方素材缩略图即可添加；不会移动或复制原文件/);
  assert.match(renderer, /onClick=\{\(event\) => \{\s*event\.stopPropagation\(\);\s*toggleReferenceAsset\(a\.id\);/);
  assert.match(renderer, /reference-added/);
  assert.match(renderer, /remove=\{\(id\) => setReferenceAssetIds/);
  assert.match(renderer, /createBoard=\{createBoardFromReferences\}/);
});

test('reference board supports inertial panning, folder-scoped canvas drops, grouping, and normal library navigation', () => {
  const board = fs.readFileSync(path.join(__dirname, '..', 'src', 'reference-board.jsx'), 'utf8');
  assert.match(board, /const startInertia = \(velocityX, velocityY\) =>/);
  assert.match(board, /requestAnimationFrame\(tick\)/);
  assert.match(board, /const ASSET_DRAG_MIME = "application\/x-nest-asset-ids"/);
  assert.match(board, /onDrop=\{\(event\) => \{/);
  assert.match(board, /pickerFolderId/);
  assert.match(board, /reference-board-asset-dock/);
  assert.match(board, /startAssetDockResize/);
  assert.match(board, /setAssetDockHeight/);
  assert.match(board, /fitCanvas/);
  assert.match(board, /PICKER_PAGE_SIZE/);
  assert.match(board, /currentItemsById\.get/);
  assert.match(board, /素材文件夹/);
  assert.match(board, /event\.dataTransfer\.setData\(ASSET_DRAG_MIME/);
  assert.match(styles, /\.reference-board-asset-dock/);
  assert.match(styles, /\.reference-board-dock-resize-handle/);
  assert.match(styles, /\.reference-board-picker-load-more/);
  assert.match(board, /将当前文件夹结果加入画布/);
  assert.match(board, /一键整理/);
  assert.match(board, /按文件夹分组/);
  assert.match(board, /新建分组/);
  assert.match(board, /连接节点/);
  assert.match(board, /reference-board-connection-layer/);
  assert.match(board, /connections: \[\.\.\.current\.connections/);
  assert.match(board, /kind: "marquee"/);
  assert.match(board, /event\.button !== 1/);
  assert.match(board, /reference-board-marquee/);
  assert.match(board, /classList\.remove\("reference-board-interacting", "reference-board-selecting"\)/);
  assert.match(board, /const \[miniVisible, setMiniVisible\] = useState\(true\)/);
  assert.match(board, /Map as MapIcon/);
  assert.doesNotMatch(board, /\n\s*Map,\n/);
  assert.match(board, /reference-board-minimap-links/);
  assert.match(board, /reference-board-minimap-group/);
  assert.match(board, /background: groupColor \|\| "rgba\(222,227,237,0\.88\)"/);
  assert.match(board, /const animateCameraTo = \(targetX, targetY, targetZoom\) =>/);
  assert.match(board, /miniAnim\.current = requestAnimationFrame\(step\)/);
  assert.match(board, /reference-board-minimap-hide/);
  assert.match(board, /reference-board-minimap-show/);
  assert.doesNotMatch(board, /const onMiniPointerDown = \(event\) => \{\s*if \(!canEdit\) return/);
  assert.match(styles, /\.reference-board-minimap-viewport/);
  assert.doesNotMatch(board, /<aside className="reference-board-inspector"/);
  assert.match(renderer, /const openFolder = \(folder\) => \{\s*setActiveModule\("library"\)/);
  assert.doesNotMatch(renderer, /activeCollection|openCollection|createCollection|dropAssetsOnCollection/);
  assert.match(renderer, /folders=\{library\?\.folders \|\| \[\]\}/);
  assert.match(renderer, /preferredFolderId=\{activeFolder\}/);
});

test('selected reference cards can upload only themselves and join the current AI Flow reference bar', () => {
  assert.match(renderer, /beginAIFlowReferenceUpload/);
  assert.match(renderer, /mode: "prompt-reference"/);
  assert.match(renderer, /自动加入当前 AI Flow 页面顶部的“图片 \/ 视频 \/ 音频”引用栏/);
  assert.match(renderer, /upload=\{beginAIFlowReferenceUpload\}/);
  assert.match(renderer, /reference-shelf-upload/);
  assert.match(preload, /mode === 'prompt-reference'/);
  assert.match(main, /prepareCollectorAIFlowReferenceUpload/);
  assert.match(main, /if \(mode === 'prompt-reference'\) publishAIFlowLiveWake\(\);/);
  assert.match(main, /completeCollectorAIFlowReferenceUpload/);
  assert.match(main, /req\.url === '\/aiflow-reference-upload-plan'/);
  assert.match(main, /req\.url === '\/aiflow-reference-upload-complete'/);
  assert.match(main, /req\.url === '\/aiflow-reference-attach-complete'/);
  assert.match(worker, /runAIFlowReferenceUpload/);
  assert.match(worker, /attachAIFlowUploadedReferences/);
  assert.match(worker, /chrome\.scripting\.executeScript/);
  assert.match(worker, /aiflow-reference-attach-complete/);
  assert.match(worker, /runAIFlowReferenceUploadWhenWoken/);
  assert.match(worker, /await runAIFlowReferenceUploadWhenWoken\(liveWakeContext/);
  assert.match(aiFlowPage, /attachUploadedReferences/);
  assert.match(aiFlowPage, /card\.click\(\)/);
});

test('library management exposes a guarded local-library deletion that keeps AI Flow server assets untouched', () => {
  assert.match(preload, /deleteLibrary: confirmationName => ipcRenderer\.invoke\('library:delete-library', confirmationName\)/);
  assert.match(main, /ipcMain\.handle\('library:delete-library'/);
  assert.match(main, /requireRole\(data, 'admin'\)/);
  assert.match(main, /resolved === path\.parse\(resolved\)\.root/);
  assert.match(main, /await moveToRecycleBin\(resolved, \{ trashItem: shell\.trashItem \}\)/);
  assert.match(main, /确认名称不匹配，未删除素材库/);
  assert.match(renderer, /素材库管理/);
  assert.match(renderer, /AI Flow 服务器素材不会被删除/);
  assert.match(renderer, /删除当前素材库/);
  assert.match(renderer, /await window\.nestDesktop\.deleteLibrary\(name\)/);
  assert.match(renderer, /modal-backdrop app-dialog-backdrop/);
  assert.match(styles, /\.app-dialog-backdrop\{z-index:270\}/);
});

test('LAN chat shows the LAN address and stops peers from using loopback', () => {
  assert.match(lanChat, /const savedChatAddress/);
  assert.match(lanChat, /127\.0\.0\.1 只能连接本机/);
  assert.match(lanChat, /const address = result\.addresses\?\.\[0\] \|\| ''/);
  assert.match(lanChat, /同事填写开服电脑显示的局域网地址/);
  assert.match(lanChat, /api\.drop\(files, \{ to: room \}\)/);
  assert.match(preload, /chat:drop/);
});

test('LAN chat sends attachments as 10 GB raw streams and restricts in-place preview only', () => {
  const chatClient = fs.readFileSync(path.join(root, 'electron', 'lan-chat-client.cjs'), 'utf8');
  const chatServer = fs.readFileSync(path.join(root, 'electron', 'lan-chat-server.cjs'), 'utf8');
  assert.match(lanChat, /单个最多 10 GB/);
  assert.match(chatClient, /duplex: 'half'/);
  assert.match(chatClient, /Readable\.fromWeb\(response\.body\)/);
  assert.match(chatServer, /const MAX_FILE = 10 \* 1024 \* 1024 \* 1024/);
  assert.match(chatServer, /await pipeline\(req, meter, fs\.createWriteStream/);
  assert.match(chatServer, /server\.requestTimeout = 0/);
  assert.match(chatClient, /const MAX_CACHED_MESSAGES = 2_000/);
  assert.match(chatClient, /连接已失效，请重新加入/);
  assert.match(lanChat, /if \(next\.connected === false\) setState\(next\)/);
});

test('video context menus can generate a depth video with the bundled local converter', () => {
  assert.match(preload, /depthVideo: \{[\s\S]*?convert: assetId => ipcRenderer\.invoke\('depth-video:convert', assetId\)/);
  assert.match(preload, /cancel: assetId => ipcRenderer\.invoke\('depth-video:cancel', assetId\)/);
  assert.match(preload, /onProgress: callback => \{ const listener = \(_, progress\) => callback\(progress\); ipcRenderer\.on\('depth-video:progress'/);
  assert.match(main, /require\('\.\/depth-video-converter\.cjs'\)/);
  assert.match(main, /ipcMain\.handle\('depth-video:convert'/);
  assert.match(main, /ipcMain\.handle\('depth-video:cancel'/);
  assert.match(main, /job\.controller\.abort\(\)/);
  assert.match(main, /isDepthVideoCancelledError\(error\)/);
  assert.match(main, /style: '灰度深度'/);
  assert.match(main, /sourceAssetId: original\.id/);
  assert.match(main, /importPaths\(\[output\], original\.folderId/);
  assert.match(renderer, /转换深度视频/);
  assert.match(renderer, /window\.nestDesktop\.depthVideo\.convert\(asset\.id\)/);
  assert.match(renderer, /function DepthVideoProgress\(\{ job, cancel \}\)/);
  assert.match(renderer, /const cancelDepthVideo = async \(\)/);
  assert.match(styles, /\.depth-video-progress\{/);
  assert.match(styles, /depth-video-progress-scan/);
  assert.match(main, /outputStyle: '灰度深度'/);
});

test('test packages can inject their exact displayed version without changing the formal version', () => {
  assert.match(viteConfig, /process\.env\.NEST_APP_VERSION \|\| pkg\.version/);
  assert.match(viteConfig, /__APP_VERSION__: JSON\.stringify\(appVersion\)/);
});

test('desktop drag import reports progress and can be cancelled without exposing Node APIs', () => {
  assert.match(preload, /cancelImport: \(\) => ipcRenderer\.invoke\('library:cancel-import'\)/);
  assert.match(main, /async function runCancelableLibraryImport\(event, task\)/);
  assert.match(main, /ipcMain\.handle\('library:cancel-import'/);
  assert.match(renderer, /const importCancelable =/);
  assert.match(renderer, /取消导入/);
  assert.match(styles, /\.drop-import-progress/);
});

test('external folders keep their dropped root while nested folders flatten into it', () => {
  assert.match(renderer, /const isExternalFileDrop = \(transfer\) =>/);
  assert.match(renderer, /transfer\.types\.includes\("Files"\)/);
  assert.match(renderer, /droppedWebImage\(event\.dataTransfer, folderId\)/);
  assert.match(renderer, /window\.nestDesktop\.importDropped\(\[\.\.\.files\], targetFolderId\)/);
  assert.match(renderer, /保留最外层文件夹，子文件夹素材会平铺导入/);
  assert.match(main, /importPaths\(paths,folderId,\{preserveFolders:false,preserveTopLevelFolders:true,dedupeByFolder:true/);
  assert.match(main, /ipcMain\.handle\('library:import-folder',[\s\S]*?preserveFolders:true/);
});

test('external drag hint does not block folder targets and moved assets wake AI Flow live sync', () => {
  assert.match(styles, /\.drop\{top:auto;right:24px;bottom:24px;left:calc\(var\(--sidebar-width,248px\) \+ 24px\)/);
  assert.match(styles, /\.drop[\s\S]*?pointer-events:none/);
  assert.match(styles, /\.drop \.drop-import-cancel\{pointer-events:auto\}/);
  assert.match(main, /library:batch-update[\s\S]*?queueAssetsForLiveSync[\s\S]*?publishAIFlowLiveWake\(\)/);
});

test('folder rename uses an Explorer-style inline editor with F2, Enter, and Escape', () => {
  assert.match(renderer, /event\.key !== "F2"/);
  assert.match(renderer, /className="folder-main folder-main-editing"/);
  assert.match(renderer, /onBlur=\{commitFolderRename\}/);
  assert.match(renderer, /event\.key === "Enter"/);
  assert.match(renderer, /event\.key === "Escape"/);
  assert.match(styles, /\.folder-main-editing input/);
});

test('AI Flow sign-out removes only folder sync links and returns the unchanged library content', () => {
  assert.match(main, /aiflow:sign-out[\s\S]*?detachAIFlowFolderConnections/);
  assert.match(renderer, /已退出 AI Flow 账号，并解除/);
  assert.match(renderer, /if \(result\?\.library\) applyLibrary\(result\.library\)/);
});

test('inspector expands the native frame before mounting and does not squeeze the workspace', () => {
  assert.match(renderer, /useLayoutEffect\(\(\) => \{/);
  assert.match(renderer, /setInspectorOpen\(true, 350, \{ immediate: true \}\)/);
  assert.match(renderer, /inspectorFrame\.ready \? "detail-open" : ""/);
  assert.match(renderer, /overlayWidth: 350/);
  assert.match(styles, /\.app\.detail-open>main\{margin-right:var\(--inspector-overlay-width,0px\)!important\}/);
  assert.match(styles, /backdrop-filter:none!important/);
  assert.match(styles, /animation:inspector-float-in 130ms/);
  assert.match(main, /if\(immediate\)\{win\.setBounds\(closeTarget,false\);if\(record\.restoreMaximized\)win\.maximize\(\);inspectorWindows\.delete\(win\)\}/);
});

test('maximized windows restore before opening the outward inspector and maximize again on close', () => {
  assert.match(main, /const restoreMaximized=win\.isMaximized\(\);if\(restoreMaximized\)win\.unmaximize\(\)/);
  assert.match(main, /record=\{open:true,base,added:target\.added,restoreMaximized,animation:null\}/);
  assert.match(main, /if\(record\.restoreMaximized\)win\.maximize\(\)/);
});

test('header tools use compact icon buttons while retaining hover labels', () => {
  assert.match(styles, /\.top-action-strip \.top-pill>svg\{display:block\}/);
  assert.match(styles, /\.top-action-strip \.top-pill>span\{display:none\}/);
  assert.match(renderer, /title="AI 助手"/);
});

test('AI assistant keeps user and assistant replies in a visible conversation', () => {
  assert.match(renderer, /aria-label="AI 对话记录"/);
  assert.match(renderer, /setMessages\(\(items\) => \[\.\.\.items, \{ role: "user"/);
  assert.match(renderer, /\{ role: "assistant", content: resultText\(completedResult\) \}/);
  assert.match(renderer, /event\.key === "Enter" && !event\.shiftKey/);
  assert.match(aiStyles, /\.ai-assistant \.ai-conversation/);
  assert.match(aiStyles, /\.ai-assistant \.ai-message\.user/);
});

test('floating bug feedback keeps its viewport position after the button skin is applied', () => {
  assert.match(styles, /\.app \.bug-feedback\{position:fixed!important;z-index:160;right:18px;bottom:18px/);
  assert.match(styles, /\.app\.detail-open \.bug-feedback\{right:368px!important\}/);
});

test('the sidebar version opens an accessible community-support dialog without a third-party payment target', () => {
  assert.match(renderer, /const \[supportPanel, setSupportPanel\] = useState\(false\)/);
  assert.match(renderer, /openSupport=\{\(\) => setSupportPanel\(true\)\}/);
  assert.match(renderer, /function SupportPanel\(\{ close \}\)/);
  assert.match(renderer, /communitySupportAvatar/);
  assert.match(renderer, /communitySupportPaymentQr/);
  assert.match(renderer, /aria-labelledby="support-dialog-title"/);
  assert.match(renderer, /愿这个小项目，陪你走得更远/);
  assert.match(renderer, /setSupportPanel\(false\)/);
  assert.match(styles, /\.support-dialog\{/);
  assert.match(styles, /\.support-emblem img\{/);
  assert.match(styles, /\.support-payment-qr\{/);
  assert.match(styles, /\.support-qr-placeholder\{/);
  assert.doesNotMatch(renderer, /afdian\.com|爱发电/);
});

test('background music starts without a player page and can be paused from settings', () => {
  assert.match(renderer, /backgroundMusic\.start\(\)/);
  assert.match(renderer, /backgroundMusic\.pause\(\)/);
  assert.match(renderer, /自动播放背景音乐/);
  assert.match(renderer, /播放结束后自动下一首/);
  assert.match(renderer, /默认音量 30%/);
  assert.match(renderer, /背景音乐音量/);
  assert.match(renderer, /setBackgroundMusicVolume\(Number\(event\.target\.value\) \/ 100\)/);
  assert.match(renderer, /backgroundMusic\.setVolume\(backgroundMusicVolume\)/);
  assert.match(renderer, /settings-background-music-card/);
  assert.match(renderer, /setBackgroundMusicEnabled\(event\.target\.checked\)/);
  assert.match(aiSettingsStyles, /\.settings-background-music-card\{/);
  assert.match(aiSettingsStyles, /\.settings-background-music-toggle\{/);
  assert.match(aiSettingsStyles, /\.settings-background-music-volume\{/);
  assert.doesNotMatch(renderer, /<audio\b/);
  assert.match(main, /autoplay-policy.*no-user-gesture-required/);
});

test('general settings tabs use compact content cards instead of an oversized outer panel', () => {
  assert.match(renderer, /className="settings-generic library-management-settings"/);
  assert.match(renderer, /tab === "存储"/);
  assert.match(aiSettingsStyles, /\.settings-generic\{display:flex;align-items:flex-start;flex-direction:column;gap:18px;width:min\(100%,860px\);padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important\}/);
});
