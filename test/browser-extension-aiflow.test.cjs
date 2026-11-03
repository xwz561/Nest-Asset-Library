const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const extensionRoot = path.join(__dirname, '..', 'browser-extension');
const packageConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

test('browser extension declares AI Flow video, two-way folder sync, upload, and manual web-asset links behind the paired bridge', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'));
  const worker = fs.readFileSync(path.join(extensionRoot, 'service-worker.js'), 'utf8');
  const page = fs.readFileSync(path.join(extensionRoot, 'aiflow-page.js'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, '1.14.28');
  for (const entry of manifest.content_scripts) {
    for (const script of entry.js) assert.match(script, /\.js$/, 'Edge content scripts require .js filenames');
  }
  assert.deepEqual(manifest.action, {
    default_title: '小旺仔同步控制台',
    default_popup: 'popup.html',
  });
  assert.ok(manifest.permissions.includes('tabs'));
  assert.ok(manifest.permissions.includes('scripting'));
  assert.ok(packageConfig.build.extraResources.some(item => item.from === 'browser-extension' && item.to === 'browser-extension'));
  assert.ok(manifest.content_scripts.some(item => item.js.includes('aiflow-page.js')));
  const aiFlowContentScript = manifest.content_scripts.find(item => item.js.includes('aiflow-page.js'));
  assert.deepEqual(aiFlowContentScript.matches, ['http://10.128.20.135:8080/*']);
  assert.doesNotMatch(aiFlowContentScript.matches.join('\n'), /https?:\/\/\*\/\*/);
  assert.doesNotMatch(page, /input\[type="range"\]::-webkit-slider-runnable-track/);
  assert.match(worker, /contexts:\s*\['video'\]/);
  assert.match(worker, /\/aiflow-video/);
  assert.match(worker, /x-nest-bridge/);
  assert.match(worker, /srcUrl:\s*sourceUrl/);
  assert.match(worker, /copy-aiflow-video/);
  assert.match(worker, /link-aiflow-asset-to-nest/);
  assert.match(worker, /确认关联当前小旺仔素材/);
  assert.match(worker, /contexts:\s*\['image', 'video', 'link'\]/);
  assert.match(worker, /\/aiflow-asset-link/);
  assert.match(worker, /confirmAIFlowAssetLink/);
  assert.match(worker, /pageUrl,/);
  assert.match(worker, /sync-aiflow-folder/);
  assert.match(worker, /preview-aiflow-folder-diff/);
  assert.match(worker, /\/aiflow-folder-diff-preview/);
  assert.match(worker, /\/auth\/assets/);
  assert.match(worker, /credentials:\s*'include'/);
  assert.match(worker, /\/aiflow-asset-data/);
  assert.match(worker, /\/aiflow-folder-target/);
  assert.match(worker, /x-nest-aiflow-asset-id/);
  assert.match(worker, /sync-aiflow-folder-structure/);
  assert.match(worker, /sync-aiflow-folder-structure-only/);
  assert.match(worker, /\/aiflow-folder-structure/);
  assert.match(worker, /syncAIFlowLibrary/);
  assert.match(worker, /x-nest-aiflow-folder-id/);
  assert.match(worker, /x-nest-aiflow-root-folder-id/);
  assert.match(worker, /aiflow-live-sync-tick/);
  assert.match(worker, /aiflow-control:get-status/);
  assert.match(worker, /aiflow-control:cancel-upload/);
  assert.match(worker, /aiflow-control-context/);
  assert.match(worker, /aiflow-live-sync-now/);
  assert.match(worker, /\/aiflow-live-status/);
  assert.match(worker, /\/aiflow-live-plan/);
  assert.match(worker, /\/aiflow-live-wait/);
  assert.match(worker, /LIVE_WAKE_RETRY_MS/);
  assert.match(worker, /\/aiflow-live-upload-data/);
  assert.match(worker, /LIVE_UPLOAD_CONCURRENCY = 2/);
  assert.match(worker, /trackLiveTransfer: true/);
  assert.match(worker, /\/aiflow-live-upload-cancel/);
  assert.match(worker, /AI Flow 上传未返回可关联素材 ID/);
  assert.match(worker, /liveWakeRetryDelay/);
  assert.match(worker, /\/aiflow-live-upload-failed/);
  assert.match(worker, /notifyLiveUploadFailure/);
  assert.match(worker, /notifyLiveUploadFailure\(result\.uploadErrors\)/);
  assert.match(worker, /undefined\|null\|\\\[object Object\\\]/);
  assert.match(worker, /liveRemotePullRunning/);
  assert.match(worker, /startAIFlowLiveRemotePull/);
  assert.match(worker, /background remote mirror failed/);
  assert.match(worker, /lastLiveFailureAt/);
  assert.doesNotMatch(worker, /refreshAIFlowTabAfterUpload/);
  assert.doesNotMatch(worker, /refreshAIFlowTabAfterSync/);
  assert.doesNotMatch(worker, /runAIFlowLiveSync[\s\S]{0,6000}chrome\.tabs\.reload/);
  assert.match(worker, /retryDelay = liveWakeRetryDelay\(result, syncResult\)/);
  assert.match(worker, /return wakeResult\?\.pending \? 3 \* 1000 : 0/);
  assert.match(page, /recoverFromInvalidExtensionContext/);
  assert.match(page, /aiflow-control-context/);
  assert.match(page, /aiflow-live-sync-now/);
  assert.match(page, /sendRuntimeMessage/);
  assert.match(worker, /upload-nest-assets-to-aiflow-folder/);
  assert.match(worker, /aiflow-reference-upload-tick/);
  assert.match(worker, /aiflow-reference-upload-plan/);
  assert.match(worker, /aiflow-reference-upload-complete/);
  assert.match(worker, /aiflow-reference-attach-complete/);
  assert.match(worker, /attach-aiflow-uploaded-references/);
  assert.match(worker, /chrome\.scripting\.executeScript/);
  assert.match(worker, /world:\s*['"]MAIN['"]/);
  assert.match(worker, /useAssetFromLibrary/);
  assert.match(worker, /\/aiflow-upload-plan/);
  assert.match(worker, /\/aiflow-upload-data/);
  assert.match(worker, /\/auth\/upload-asset/);
  assert.match(worker, /new FormData\(\)/);
  assert.doesNotMatch(worker, /input\[type=["']file["']\]/);
  assert.doesNotMatch(worker, /submit\(\)/);
  assert.match(page, /\.task-card\[data-taskid\]/);
  assert.match(page, /复制到小旺仔素材库/);
  assert.match(page, /\/videos\/\$\{encodeURIComponent\(taskId\)\}\.mp4/);
  assert.match(page, /同步当前文件夹/);
  assert.match(page, /同步前检查/);
  assert.match(page, /仅比较当前文件夹；此预览不会上传、下载或删除素材/);
  assert.match(page, /确认同步当前文件夹/);
  assert.match(page, /folderId: selected\.folderId/);
  assert.match(page, /currentFolderSelection/);
  assert.match(page, /sharedLibrary:\s*false/);
  assert.match(worker, /hasRequestedFolderId/);
  assert.match(worker, /当前文件夹同步完成/);
  assert.match(page, /function folderToolbar\(\)/);
  assert.match(page, /#assetLibrary \.als-folder-bar-in/);
  assert.match(page, /#assetLibrary \.als-folder-bar/);
  assert.match(page, /\[data-project-id\]/);
  assert.match(page, /\[data-projectid\]/);
  assert.match(page, /sync-aiflow-folder/);
  assert.match(page, /同步目录和素材/);
  assert.match(page, /建立目录对应/);
  assert.match(page, /sync-aiflow-folder-structure-only/);
  assert.doesNotMatch(page, /上传小旺仔素材/);
  assert.match(page, /injectDirectVideoCopyButtons/);
  assert.match(page, /PROMPT_REFERENCE_TOKEN_RE/);
  assert.match(page, /PROMPT_REFERENCE_TOKEN_RE = \/@\(图片\|视频\|音频\)/);
  assert.match(page, /PROMPT_VALUE_WATCH_INTERVAL_MS = 180/);
  assert.match(page, /injectPromptReferenceHighlights/);
  assert.match(page, /injectVideoExtendLibraryPanel/);
  assert.match(page, /injectVideoExtendWorkbench/);
  assert.match(page, /小旺仔延长工作台/);
  assert.match(page, /nest-aiflow-video-extend-native-hidden/);
  assert.match(page, /data-nest-workbench-submit/);
  assert.match(page, /data-nest-workbench-count/);
  assert.match(page, /data-nest-workbench-clear/);
  assert.match(page, /resizeWorkbenchPrompt/);
  assert.match(page, /insertVideoExtendReferenceAtCaret/);
  assert.match(page, /nestReferenceMap/);
  assert.match(page, /nestWorkbenchReferenceToken/);
  assert.match(page, /parseNativeVideoExtendReference/);
  assert.match(page, /referenceTokenForVideoExtendAsset/);
  assert.match(page, /nestManualResize/);
  assert.match(page, /mountNativeVideoExtendPicker/);
  assert.match(page, /AI Flow 原生素材/);
  assert.match(page, /injectAIFlowThemeSwitcher/);
  assert.match(page, /页面配色/);
  assert.match(page, /data-nest-workbench-drag/);
  assert.match(page, /nestWorkbenchDrag/);
  assert.match(page, /data-nest-workbench-theme/);
  assert.match(page, /nest-aiflow-workbench-theme/);
  assert.match(page, /nestWorkbenchDisabled/);
  assert.match(page, /KeyboardEvent\('keydown', \{ key: 'Escape'/);
  assert.match(page, /injectAIFlowFocusLayoutToggle/);
  assert.match(page, /专注布局/);
  assert.match(page, /nest-aiflow-focus-layout/);
  assert.match(page, /视频延长素材库/);
  assert.match(page, /aiflow-library-assets/);
  assert.match(page, /aiflow-reference-select/);
  assert.match(page, /data-nest-library-back/);
  assert.match(page, /dataset\.nestLibraryFolder/);
  assert.match(page, /点击素材即刻写入提示词光标处/);
  assert.match(page, /自动匹配人物/);
  assert.match(page, /extractVideoExtendStoryboardNames/);
  assert.match(page, /insertMatchedStoryboardReferenceTags/);
  assert.match(page, /aiflow-match-storyboard-assets/);
  assert.match(page, /attachUploadedVideoExtendReferences/);
  assert.match(page, /data-nest-library-drag/);
  assert.match(page, /resize:both/);
  assert.match(page, /引用未能加入视频延长窗口/);
  assert.match(page, /#sd25RefAdd/);
  assert.match(page, /\[data-refpick=/);
  assert.match(worker, /attachAIFlowVideoExtendReferencesInPageWorld/);
  assert.match(worker, /target: 'video-extend'/);
  assert.match(worker, /window\._loadAssetLibrary/);
  assert.match(worker, /videoExtendTargets/);
  assert.match(worker, /videoExtendTargetForTab/);
  assert.match(page, /isLikelyPromptEditor/);
  assert.match(page, /isVideoExtendPrompt/);
  assert.match(page, /提交延长/);
  assert.match(page, /延长秒数/);
  assert.match(page, /container = container\.parentElement/);
  assert.match(page, /classList\.add\(PROMPT_HIGHLIGHT_CLASS\)/);
  assert.match(page, /renderPromptReferences\(content, currentText, inventory\)/);
  assert.match(page, /lastPromptText/);
  assert.match(page, /refreshValue/);
  assert.match(page, /window\.setInterval\(refreshValue, PROMPT_VALUE_WATCH_INTERVAL_MS\)/);
  assert.match(page, /pointer-events: none/);
  assert.match(page, /server's caret and Enter position can never drift/);
  assert.match(page, /if \(!\(editor instanceof HTMLTextAreaElement\)\) return false/);
  assert.match(page, /font-weight: inherit !important/);
  assert.match(page, /layer\.style\.background = 'transparent'/);
  assert.match(page, /background:rgba\(47,161,220,.48\)/);
  assert.match(page, /editorBox\.top - parentBox\.top - parent\.clientTop \+ parent\.scrollTop \+ editor\.clientTop/);
  assert.match(page, /editorBox\.left - parentBox\.left - parent\.clientLeft \+ parent\.scrollLeft \+ editor\.clientLeft/);
  assert.match(page, /word-wrap/);
  assert.doesNotMatch(page, /nest-aiflow-reference-token\s*\{[\s\S]{0,800}font-weight: 700 !important/);
  assert.match(page, /nest-aiflow-reference-image/);
  assert.match(page, /nest-aiflow-reference-video/);
  assert.match(page, /nest-aiflow-reference-audio/);
  assert.match(page, /LIVE_SYNC_INTERVAL_MS/);
  assert.match(page, /requestReferenceUpload/);
  assert.match(page, /attachUploadedReferences/);
  assert.match(page, /const LIVE_SYNC_INTERVAL_MS = 3 \* 1000/);
  assert.match(page, /setTimeout\(requestLiveSync, 500\)/);
  assert.match(worker, /const LIVE_REMOTE_PULL_INTERVAL_MS = 10 \* 1000/);
  assert.ok(worker.indexOf('const uploaded =') < worker.indexOf('startAIFlowLiveRemotePull(page, projectId, plan.roots)'));
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.jsx'), 'utf8');
  assert.match(renderer, /新增即时上传 · 引用即时唤醒 · 3 秒兜底 · 回拉每 10 秒/);
  assert.match(renderer, /等待上传/);
  assert.match(renderer, /来自 AI Flow/);
  assert.match(renderer, /shouldShowBugFeedback/);
  assert.match(renderer, /!message && !depthVideoJob && !previewAsset && !dialogState/);
  assert.match(renderer, /document\.addEventListener\("pointerdown", close, true\)/);
  assert.match(renderer, /contextMenuRef\.current\?\.contains\(event\.target\)/);
  assert.doesNotMatch(renderer, /setMessage\("资源库已更新"\)/);
  assert.match(main, /app\.asar\.unpacked', 'browser-extension/);
  assert.match(main, /process\.resourcesPath, 'browser-extension/);
  assert.match(main, /defaultAIFlowSettings=\(\)=>\(\{baseUrl:'http:\/\/10\.128\.20\.135:8080\/'/);
  assert.match(main, /app\.getAppPath\(\), 'browser-extension/);
  assert.match(main, /process\.resourcesPath, 'app', 'browser-extension/);
  assert.match(main, /const source = extensionSources\.find\(candidate => fs\.existsSync/);
  assert.match(main, /importCollectorAIFlowAsset/);
  assert.match(main, /req\.url === '\/aiflow-asset-data'/);
  assert.match(main, /resolveCollectorAIFlowFolderTarget/);
  assert.match(main, /req\.url === '\/aiflow-folder-target'/);
  assert.match(main, /previewCollectorAIFlowFolderDiff/);
  assert.match(main, /req\.url === '\/aiflow-folder-diff-preview'/);
  assert.match(main, /previewMappedAIFlowFolderDiff/);
  assert.match(main, /resolveMappedAIFlowFolder/);
  assert.match(main, /x-nest-aiflow-asset-id/);
  assert.match(main, /dedupeByFolder: true/);
  assert.match(main, /const duplicateHash = await hashFile\(file\)/);
  assert.match(main, /existing\.importSource = sourceMetadata/);
  assert.match(main, /mirrorCollectorAIFlowFolders/);
  assert.match(main, /req\.url === '\/aiflow-folder-structure'/);
  assert.match(main, /streamCollectorAIFlowLiveUploadData/);
  const liveUploadStream = main.slice(main.indexOf('async function streamCollectorAIFlowLiveUploadData'), main.indexOf('function startSecureClipServer'));
  assert.match(liveUploadStream, /stat\.size > MAX_AIFLOW_UPLOAD_BYTES/);
  assert.match(main, /cancelCollectorAIFlowLiveUpload/);
  assert.match(main, /req\.url === '\/aiflow-live-upload-cancel'/);
  assert.match(main, /prioritizedLiveUploads/);
  assert.match(main, /recordLiveUploadFailures/);
  assert.match(main, /const acceptedSet = new Set\(accepted\)/);
  assert.match(main, /if \(!acceptedSet\.has\(item\.assetId\)\) continue;/);
  assert.match(main, /reportCollectorAIFlowLiveUploadFailure/);
  assert.match(main, /req\.url === '\/aiflow-live-upload-failed'/);
  assert.match(main, /req\.url === '\/aiflow-live-plan'/);
  assert.match(main, /req\.url === '\/aiflow-live-status'/);
  assert.match(main, /req\.url === '\/aiflow-library-assets'/);
  assert.match(main, /listCollectorLibraryAssets/);
  assert.match(main, /req\.url === '\/aiflow-reference-select'/);
  assert.match(main, /prepareCollectorAIFlowReferenceSelection/);
  assert.match(main, /req\.url === '\/aiflow-match-storyboard-assets'/);
  assert.match(main, /matchCollectorStoryboardAssets/);
  assert.match(main, /waitCollectorAIFlowLiveWake/);
  assert.match(main, /req\.url === '\/aiflow-live-wait'/);
  assert.match(main, /pendingLiveUploadsForPage\(collectorPermission\(\), \{ serverOrigin, projectId \}\)/);
  assert.match(main, /publishAIFlowLiveWake/);
  assert.match(main, /prepareCollectorAIFlowUpload/);
  assert.match(main, /pendingAIFlowReferenceAttachment/);
  assert.match(main, /req\.url === '\/aiflow-reference-attach-complete'/);
  assert.match(main, /extension:open-manager/);
  assert.match(main, /edge:\s*\{ name: 'Microsoft Edge', url: 'edge:\/\/extensions'/);
  assert.match(main, /managerUrl: choice\.url/);
  assert.match(main, /Reveal the unpacked directory first/);
  assert.match(main, /shell\.showItemInFolder\(path\.join\(target, 'manifest\.json'\)\)/);
  assert.match(main, /directoryOpened: true/);
  assert.match(main, /\['--new-window', choice\.url\]/);
  assert.match(renderer, /卸载 Edge 扩展/);
  assert.match(renderer, /openExtensionManager/);
  assert.match(renderer, /准备后自动打开 edge:\/\/extensions/);
  assert.match(main, /req\.url === '\/aiflow-upload-data'/);
  assert.ok(fs.existsSync(path.join(extensionRoot, 'config.js')));
});









test('native AI Flow picker search refreshes the side copy after server results change', () => {
  const page = fs.readFileSync(path.join(extensionRoot, 'aiflow-page.js'), 'utf8');
  assert.match(page, /syncNativePicker/);
  assert.match(page, /nativePickerObserver/);
});

test('video-extend direction buttons bind to individual native choices and reflect the selected choice', () => {
  const page = fs.readFileSync(path.join(extensionRoot, 'aiflow-page.js'), 'utf8');
  assert.match(page, /function nativeVideoExtendDirectionInput/);
  assert.match(page, /nativeVideoExtendDirectionText/);
  assert.match(page, /syncVideoExtendDirectionButtons/);
  assert.match(page, /data-active/);
  const handler = page.slice(page.indexOf("for (const button of workbench.querySelectorAll('[data-nest-workbench-direction]'))"), page.indexOf("workbench.querySelector('[data-nest-workbench-submit]')"));
  assert.match(handler, /nativeVideoExtendDirectionInput/);
  assert.doesNotMatch(handler, /input\.parentElement\?\.textContent/);
});

test('video-extend reference chips expose a native deletion action and clear every matching prompt token', () => {
  const page = fs.readFileSync(path.join(extensionRoot, 'aiflow-page.js'), 'utf8');
  assert.match(page, /data-nest-workbench-reference-remove/);
  assert.match(page, /removeNativeVideoExtendReference/);
  assert.match(page, /forgetVideoExtendReferenceToken/);
  assert.match(page, /\[data-refdel\]/);
  assert.match(page, /controls\.length === 1/);
  assert.match(page, /hasNativeReference && !nativeRemovalRequested/);
  assert.match(page, /new RegExp\(`\\\\s\*\$\{escaped\}`, 'g'\)/);
});

test('a newly added local material receives its confirmed AI Flow token under the local asset ID', () => {
  const worker = fs.readFileSync(path.join(extensionRoot, 'service-worker.js'), 'utf8');
  const section = worker.slice(worker.indexOf('async function addLibraryAssetToVideoExtend'), worker.indexOf('function exactVideoExtendReferenceTokenFromResult'));
  assert.match(section, /const localAssetId = assetIds\.length === 1 \? assetIds\[0\] : ''/);
  assert.match(section, /const referenceToken = exactVideoExtendReferenceTokenFromResult\(result\)/);
  assert.match(section, /\[localAssetId\]: referenceToken/);
});
test('video-extend reference chips fall back to prompt tokens when AI Flow hides its chip container', () => {
  const page = fs.readFileSync(path.join(extensionRoot, 'aiflow-page.js'), 'utf8');
  assert.match(page, /referenceItems/);
});

test('video-extend reference chips merge native chips with prompt-only references', () => {
  const page = fs.readFileSync(path.join(extensionRoot, 'aiflow-page.js'), 'utf8');
  assert.match(page, /knownTokens/);
});

test('video-extend reference reuse ignores rotating video URL query strings', () => {
  const page = fs.readFileSync(path.join(extensionRoot, 'aiflow-page.js'), 'utf8');
  assert.match(page, /new URL\(source, location\.href\)\.pathname/);
});

test('original video-extend window retains reference highlighting after leaving the workbench', () => {
  const page = fs.readFileSync(path.join(extensionRoot, 'aiflow-page.js'), 'utf8');
  const nativeSwitch = page.slice(
    page.indexOf("workbench.querySelector('[data-nest-workbench-native]')"),
    page.indexOf('const nestWorkbenchDrag')
  );
  assert.match(nativeSwitch, /attachPromptHighlighter\(editor\)/);
  assert.match(nativeSwitch, /requestAnimationFrame\(\(\) => promptHighlighters\.get\(editor\)\?\.refreshValue\(\)\)/);
  assert.doesNotMatch(nativeSwitch, /promptHighlighters\.get\(editor\)\?\.dispose\(\)/);
  const injector = page.slice(page.indexOf('function injectPromptReferenceHighlights'), page.indexOf('function requestVideoCopy'));
  assert.doesNotMatch(injector, /nestWorkbenchDisabled/);
  assert.doesNotMatch(injector, /promptHighlighters\.get\(editor\)\?\.dispose/);
});
test('a first side-library reference uses the remembered prompt caret and never the hidden trailing caret', () => {
  const page = fs.readFileSync(path.join(extensionRoot, 'aiflow-page.js'), 'utf8');
  const helpers = page.slice(page.indexOf('function rememberWorkbenchPromptSelection'), page.indexOf('function collapseDuplicateVideoExtendReference'));
  const cardHandler = page.slice(page.indexOf("card.addEventListener('click'"), page.indexOf('list.appendChild(card);'));
  const sync = page.slice(page.indexOf('const sync = () =>'), page.indexOf('const rememberPromptCaret'));
  assert.match(page, /const workbenchPromptSelections = new WeakMap/);
  assert.match(helpers, /return \{ start: 0, end: 0 \}/);
  assert.match(helpers, /function removeNewestVideoExtendPromptToken/);
  assert.match(cardHandler, /const selection = workbenchPromptSelection\(workbenchPrompt\)/);
  assert.match(cardHandler, /wasAddedByThisClick/);
  assert.match(cardHandler, /removeNewestVideoExtendPromptToken\(editor, token\)/);
  assert.match(cardHandler, /rememberWorkbenchPromptSelection\(workbenchPrompt/);
  assert.match(sync, /prompt\.setSelectionRange/);
});
test('inserting a reference token preserves the prompt scroll position', () => {
  const page = fs.readFileSync(path.join(extensionRoot, 'aiflow-page.js'), 'utf8');
  assert.match(page, /previousScrollTop/);
});

test('submitting video extend pauses extension observers before native submit', () => {
  const page = fs.readFileSync(path.join(extensionRoot, 'aiflow-page.js'), 'utf8');
  assert.match(page, /nestWorkbenchSubmitting/);
});

test('known reference reuse requires an exact non-empty filename match', () => {
  const page = fs.readFileSync(path.join(extensionRoot, 'aiflow-page.js'), 'utf8');
  const section = page.slice(page.indexOf('function referenceTokenForVideoExtendAsset'), page.indexOf('function rememberVideoExtendReferenceWhenReady'));
  assert.match(section, /Boolean\(actualName\) && actualName === expectedName/);
  assert.doesNotMatch(section, /endsWith\(expectedName\)|endsWith\(actualName\)/);
});
test('video-extend reference parsing reads only isolated tokens and never folds filename digits into them', () => {
  const page = fs.readFileSync(path.join(extensionRoot, 'aiflow-page.js'), 'utf8');
  const parser = page.slice(page.indexOf('function nativeVideoExtendReferenceNodes'), page.indexOf('function nativeVideoExtendReferences'));
  assert.doesNotMatch(parser, /#sd25RefChips button/);
  assert.doesNotMatch(parser, /raw\.match/);
  assert.match(parser, /function exactVideoExtendReferenceToken/);
  assert.match(parser, /document\.createTreeWalker\(node, 4\)/);
  assert.match(parser, /never become @图片102/);
  assert.match(parser, /videoExtendPromptReferenceTokens/);
});

test('newly selected native references return one exact token for prompt insertion', () => {
  const page = fs.readFileSync(path.join(extensionRoot, 'aiflow-page.js'), 'utf8');
  const worker = fs.readFileSync(path.join(extensionRoot, 'service-worker.js'), 'utf8');
  const helper = page.slice(page.indexOf('function rememberVideoExtendReferenceWhenReady'), page.indexOf('function forgetVideoExtendReference(dialog, asset)'));
  const cardHandler = page.slice(page.indexOf("card.addEventListener('click'"), page.indexOf('list.appendChild(card);'));
  const attachment = worker.slice(worker.indexOf('async function attachAIFlowVideoExtendReferencesInPageWorld'), worker.indexOf('async function attachAIFlowUploadedReferences('));
  assert.match(helper, /beforeNativeTokens/);
  assert.match(helper, /insertedByNative\.length === 1/);
  assert.match(cardHandler, /assignedToken: result\?\.referenceTokens\?\.\[String\(asset\.id\)\]/);
  assert.match(attachment, /referenceTokensInDialog/);
  assert.match(attachment, /createdTokens\.length === 1/);
  assert.match(attachment, /document\.createTreeWalker\(root, 4\)/);
});

test('people matching opens a Word-style find-and-replace panel and only writes exact image tags', () => {
  const page = fs.readFileSync(path.join(extensionRoot, 'aiflow-page.js'), 'utf8');
  const worker = fs.readFileSync(path.join(extensionRoot, 'service-worker.js'), 'utf8');
  const people = page.slice(page.indexOf('function exactImageReferenceToken'), page.indexOf('function injectVideoExtendAutoMatchButton'));
  assert.match(people, /人物查找和替换/);
  assert.match(people, /data-nest-person-replace-all/);
  assert.match(people, /@图片\\d\+\\s\+\\S/);
  assert.match(people, /替换当前/);
  assert.match(people, /全部替换/);
  assert.doesNotMatch(page, /autoMentionVideoExtendPeople/);
  assert.doesNotMatch(page, /existingImageCount/);
  assert.match(worker, /exactVideoExtendReferenceTokenFromResult/);
  assert.match(worker, /Attach one candidate at a time/);
});
test('new reference insertion keeps an AI Flow-written token and only falls back when it is absent', () => {
  const page = fs.readFileSync(path.join(extensionRoot, 'aiflow-page.js'), 'utf8');
  const cardHandler = page.slice(page.indexOf("card.addEventListener('click'"), page.indexOf('list.appendChild(card);'));
  assert.match(cardHandler, /referenceTokensBefore/);
  assert.match(cardHandler, /if \(!videoExtendPromptReferenceTokens\(editor\)\.includes\(token\)\)/);
});
test('a first-click library material is inserted once after AI Flow assigns its real token', () => {
  const page = fs.readFileSync(path.join(extensionRoot, 'aiflow-page.js'), 'utf8');
  const helper = page.slice(page.indexOf('function rememberVideoExtendReferenceWhenReady'), page.indexOf('function forgetVideoExtendReference(dialog, asset)'));
  assert.match(helper, /let resolved = false/);
  assert.match(helper, /if \(resolved\) return/);
  const cardHandler = page.slice(page.indexOf("card.addEventListener('click'"), page.indexOf('list.appendChild(card);'));
  assert.match(cardHandler, /正在写入提示词/);
  assert.match(cardHandler, /insertVideoExtendReferenceToken\(editor, token, selection\)/);
});
test('video-extend references keep AI Flow token numbers and never pre-write a guessed first attachment', () => {
  const page = fs.readFileSync(path.join(extensionRoot, 'aiflow-page.js'), 'utf8');
  assert.match(page, /function parseNativeVideoExtendReference/);
  assert.match(page, /referenceItems\.sort\(\(left, right\) => left\.token\.localeCompare/);
  const cardHandler = page.slice(page.indexOf("card.addEventListener('click'"), page.indexOf('list.appendChild(card);'));
  assert.doesNotMatch(cardHandler, /insertVideoExtendReferenceAtCaret/);
  assert.doesNotMatch(cardHandler, /scheduleDuplicateReferenceCollapse/);
  assert.match(cardHandler, /referenceTokenForVideoExtendAsset/);
  assert.match(cardHandler, /rememberVideoExtendReferenceWhenReady/);
});

test('video-extend native reference attach yields between picker clicks', () => {
  const worker = fs.readFileSync(path.join(extensionRoot, 'service-worker.js'), 'utf8');
  const section = worker.slice(worker.indexOf('async function attachAIFlowVideoExtendReferencesInPageWorld'), worker.indexOf('async function attachAIFlowUploadedReferences('));
  assert.match(section, /card\.click\(\);\s*\/\/ React replaces picker cards after a selection[\s\S]*?await wait\(90\);/);
});
