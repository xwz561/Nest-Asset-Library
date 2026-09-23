const { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, net, protocol, screen, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
// Optional isolated profile for test builds; normal launches keep the existing profile.
if (process.env.NEST_USER_DATA_DIR && path.isAbsolute(process.env.NEST_USER_DATA_DIR)) app.setPath('userData', process.env.NEST_USER_DATA_DIR);
const crypto = require('crypto');
const http = require('http');
const { spawn } = require('child_process');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { moveToRecycleBin } = require('./recycle-bin.cjs');
const { isVideoAsset, resolveConverterPaths, validateConverterPaths, isDepthVideoCancelledError, runDepthVideoConverter } = require('./depth-video-converter.cjs');
const { atomicWriteJson, readJson } = require('./json-storage.cjs');
const { expandImportPaths, folderPartsForImport } = require('./import-paths.cjs');
const { chooseReadableFilename } = require('./asset-filenames.cjs');
const { collectFolderSubtreeIds } = require('./folder-tree.cjs');
const { folderParts, physicalAssetPath, syncPhysicalFolders, needsPhysicalLayoutSync, archiveLegacyRootAliases } = require('./physical-folders.cjs');
const { createDuplicateIndex, isDuplicate, recordHash } = require('./import-duplicates.cjs');
const { chooseUpdateAsset, isCompatibleUpdateFile } = require('./update-assets.cjs');
const { createTaskQueue } = require('./task-queue.cjs');
const { withLock } = require('./file-lock.cjs');
const { normalizeMember, roleFor, hasRole } = require('./team-permissions.cjs');
const { assetPathFromRequest } = require('./asset-protocol.cjs');
const { inspectorBounds } = require('./outward-inspector.cjs');
const { AIProviderRouter, normalizeProvider, parseJson, redact } = require('./ai-provider.cjs');
const { buildAIContext, createAITaskManager, validatePlan } = require('./ai-core.cjs');
const { duplicateGroups, similarAssets } = require('./ai-search.cjs');
const { buildBatchRenamePlan } = require('./batch-rename.cjs');
const { DOCUMENT_TYPES, extractDocumentText, parseFountainStructure } = require('./document-text.cjs');
const { scanPlugins } = require('./plugin-registry.cjs');
const { DEFAULT_LOCAL_ROOT, listLocalAssets, validateLocalAssetSelections } = require('./aiflow-import.cjs');
const { createAIFlowClient, normalizeBaseUrl, attachProjectAndEpisodeLabels } = require('./aiflow-client.cjs');
const { parseAIFlowVideoSource, resolveSelectedFolder } = require('./aiflow-web-collector.cjs');
const { filenameFromContentDisposition } = require('./aiflow-download-name.cjs');
const { createAIFlowMappings, normalizeAIFlowMappings, normalizeRemoteUrl, createRemoteLocatorKey, findAIFlowMappingConflict, upsertAIFlowMapping } = require('./aiflow-mappings.cjs');
const { mirrorAIFlowFolderStructure, detachAIFlowFolderConnections } = require('./aiflow-folder-structure.cjs');
const { resolveMappedAIFlowFolder } = require('./aiflow-current-folder-target.cjs');
const { previewMappedAIFlowFolderDiff } = require('./aiflow-current-folder-diff.cjs');
const { ensureLiveQueue, queueAssetsForLiveSync, queueRemoteDeletes, queueRemoteMoves, removePendingLiveUploads, recordLiveUploadFailures, pendingLiveUploadsForPage, prioritizedLiveUploads, nextLiveUploadRetryAt, liveSyncStatusForPage, pendingRemoteDeletesForPage, pendingRemoteMovesForPage, removePendingRemoteDeletes, removePendingRemoteMoves, recordRemoteDeleteFailures, recordRemoteMoveFailures, setRootLiveSync, liveSyncRootsForPage, folderAssetsForUpload, folderTarget } = require('./aiflow-live-sync.cjs');

const inspectorWindows=new WeakMap();
function animateWindowBounds(win,target,duration=240){
  const current=win.getBounds(),startedAt=Date.now();
  const record=inspectorWindows.get(win)||{};
  if(record.animation)clearTimeout(record.animation);
  const tick=()=>{
    if(win.isDestroyed())return;
    const progress=Math.min(1,(Date.now()-startedAt)/duration);
    const ease=1-Math.pow(1-progress,4),next={};
    for(const key of ['x','y','width','height'])next[key]=Math.round(current[key]+(target[key]-current[key])*ease);
    win.setBounds(next,false);
    if(progress<1){record.animation=setTimeout(tick,16);return}
    win.setBounds(target,false);
    record.animation=null;
  };
  inspectorWindows.set(win,record);
  tick();
}

protocol.registerSchemesAsPrivileged([{ scheme: 'nest', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();
// Background music is a local renderer feature. Allow it to start with the
// app instead of requiring a hidden player page or a first click gesture.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.on('second-instance', () => { const win = BrowserWindow.getAllWindows()[0]; if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
let libraryPath = null;
let deletingLibrary = false;
const libraryReadStreams = new Set();
function openLibraryReadStream(file, options) {
  if (deletingLibrary) throw new Error('素材库正在删除，文件读取已停止');
  const stream = fs.createReadStream(file, options);
  libraryReadStreams.add(stream);
  stream.once('close', () => libraryReadStreams.delete(stream));
  return stream;
}
async function closeLibraryReadStreams() {
  await Promise.all([...libraryReadStreams].map(stream => new Promise(resolve => {
    if (stream.closed) return resolve();
    stream.once('close', resolve);
    stream.destroy();
  })));
}
let extensionImportTarget = null;
// A browser extension never learns a local asset ID or path. It can only
// consume this short-lived, single-use intent after the user explicitly starts
// a link from the desktop detail panel.
let pendingAIFlowAssetLink = null;
// Uploading back to AI Flow is deliberately opt-in and short-lived. The
// paired extension receives only the files the user selected in this intent.
let pendingAIFlowUpload = null;
// Reference-bar attachment is persisted in the current library index so a
// page refresh, extension restart, or a short server-side delay never causes
// an already-uploaded asset to be uploaded a second time.
let pendingAIFlowReferenceAttachment = null;
// The paired browser extension keeps one authenticated long-poll request open.
// A local import can wake it immediately instead of waiting for the fallback poll.
let aiFlowLiveWakeSequence = 0;
const aiFlowLiveWakeWaiters = new Set();
function publishAIFlowLiveWake() {
  aiFlowLiveWakeSequence += 1;
  for (const wake of [...aiFlowLiveWakeWaiters]) wake();
}
// Closing the desktop app is an explicit cancellation boundary for browser
// transfers that have not reached AI Flow yet. Reference attachments that
// already reached AI Flow stay in the index: they are completed work and must
// not be deleted merely because the desktop window closed.
function cancelAIFlowTransfersForShutdown() {
  pendingAIFlowAssetLink = null;
  pendingAIFlowUpload = null;
  pendingAIFlowReferenceAttachment = null;
}
// Every library write shares one queue. A long import must never commit an old
// snapshot over a rename, delete, tag edit, or another import that happened later.
// 团队版升级：队列仍是单实例内串行；在此之上为每次写入加跨进程文件锁（.nest-lock），
// 锁内重读最新索引，保证多个客户端（NAS 共享库）同时写也互斥不覆盖。
// 注意：create/open 两个 handler 会切换 libraryPath，锁目标用的是切换前的路径——新建库
// 是独占新目录、切换库不读旧库，均无覆盖风险，故可接受。
const libraryMutationQueue = createTaskQueue({ onError: error => console.error('Library mutation queue:', error) });
const activeImportControllers = new Map();
let activeDepthVideoConversion = null;
async function runCancelableLibraryImport(event, task) {
  const key = event.sender.id;
  const controller = new AbortController();
  activeImportControllers.set(key, controller);
  try {
    const result = await task(controller.signal);
    return controller.signal.aborted && result && !result.importCanceled ? { ...result, importCanceled: true } : result;
  } finally {
    if (activeImportControllers.get(key) === controller) activeImportControllers.delete(key);
  }
}
// 团队版：写操作统一在锁内校验角色。minRole 默认 'editor'；create/open 传 null 跳过（切换库场景），
// reveal/copy-path 等只读类传 'viewer'，成员管理传 'admin'。
const enqueueLibraryMutation = (task, minRole = 'editor') => libraryMutationQueue(() => {
  if (deletingLibrary) return { error: '素材库正在删除，请稍后重试' };
  if (!libraryPath) return task();
  return withLock(libraryPath, () => {
    if (minRole) {
      const data = readLibrary();
      if (data && !requireRole(data, minRole)) return { error: '权限不足' };
    }
    return task();
  });
});
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const aiSettingsFile = () => path.join(app.getPath('userData'), 'ai-settings.json');
const aiSecretsFile = () => path.join(app.getPath('userData'), 'ai-secrets.bin');
const aiUsageFile = () => path.join(app.getPath('userData'), 'ai-usage.json');
const indexFile = root => path.join(root, '.nest-library.json');
const assetsDir = root => path.join(root, 'assets');
const storedAssetPath = file => physicalAssetPath(libraryPath, file);
const writeJson = (file, value) => {
  if (libraryPath && file === indexFile(libraryPath) && value && Array.isArray(value.assets)) {
    value.aiFlowMappings = normalizeLibraryAIFlowMappings(value);
  }
  atomicWriteJson(file, value);
  if (libraryPath && file === indexFile(libraryPath)) markSelfWrite();
};
const readSettings = () => readJson(settingsFile()) || {};
const saveSettings = () => writeJson(settingsFile(), { ...readSettings(), libraryPath });
// —— 团队：当前用户身份 + 角色 ——
let cachedProfile = null;
const currentProfile = () => {
  if (cachedProfile) return cachedProfile;
  const s = readSettings();
  if (s.profile?.id) { cachedProfile = s.profile; return cachedProfile; }
  const profile = { id: crypto.randomUUID(), name: '我', color: '#4f9cf9', createdAt: Date.now() };
  writeJson(settingsFile(), { ...s, profile, libraryPath });
  cachedProfile = profile;
  return profile;
};
const setProfile = (patch = {}) => {
  const s = readSettings();
  const base = s.profile?.id ? s.profile : { id: crypto.randomUUID(), color: '#4f9cf9', createdAt: Date.now() };
  const profile = { ...base, ...patch, id: base.id };
  writeJson(settingsFile(), { ...s, profile, libraryPath });
  cachedProfile = profile;
  return profile;
};
const ensureTeam = (data) => {
  if (!data.team || !Array.isArray(data.team.members)) {
    const me = currentProfile();
    data.team = { ownerId: me.id, members: [{ id: me.id, name: me.name, role: 'admin', color: me.color || '#4f9cf9', createdAt: Date.now() }] };
  }
  return data;
};
const currentRole = (data) => {
  return roleFor(data.team, currentProfile().id);
};
const requireRole = (data, minRole) => {
  return hasRole(data.team, currentProfile().id, minRole);
};
function normalizeLibraryAIFlowMappings(data) {
  const knownAssetIds = new Set((data.assets || []).map(asset => String(asset?.id || '')).filter(Boolean));
  const mappings = normalizeAIFlowMappings(data.aiFlowMappings);
  mappings.mappings = mappings.mappings.filter(mapping => knownAssetIds.has(mapping.assetId));
  return mappings;
}

// Local deletion must never become an AI Flow server deletion. Drop the local
// mapping and any queued live operation for the removed material instead.
function detachAIFlowAssetConnections(data, assets) {
  const selected = (Array.isArray(assets) ? assets : [assets]).filter(Boolean);
  const assetIds = new Set(selected.map(asset => String(asset?.id || '')).filter(Boolean));
  if (!assetIds.size) return { mappings: 0, uploads: 0, moves: 0, deletes: 0 };
  const mappings = normalizeAIFlowMappings(data.aiFlowMappings);
  const removedMappings = mappings.mappings.filter(mapping => assetIds.has(mapping.assetId));
  mappings.mappings = mappings.mappings.filter(mapping => !assetIds.has(mapping.assetId));
  data.aiFlowMappings = mappings;
  const remoteAssetIds = new Set(removedMappings.map(mapping => String(mapping.remoteAssetId || '')).filter(Boolean));
  for (const asset of selected) {
    const source = asset?.importSource;
    if (source?.provider === 'AI Flow' && source.assetId) remoteAssetIds.add(String(source.assetId));
  }
  const queue = ensureLiveQueue(data);
  const before = {
    uploads: queue.pendingUploads.length,
    moves: queue.pendingMoves.length,
    deletes: queue.pendingDeletes.length,
  };
  queue.pendingUploads = queue.pendingUploads.filter(item => !assetIds.has(item.assetId));
  queue.pendingMoves = queue.pendingMoves.filter(item => !assetIds.has(item.assetId));
  queue.pendingDeletes = queue.pendingDeletes.filter(item => !remoteAssetIds.has(String(item.remoteAssetId || '')));
  return {
    mappings: removedMappings.length,
    uploads: before.uploads - queue.pendingUploads.length,
    moves: before.moves - queue.pendingMoves.length,
    deletes: before.deletes - queue.pendingDeletes.length,
  };
}

function queueAIFlowDeletesForAsset(data, asset) {
  const target = folderTarget(data, asset?.folderId);
  if (!asset?.id || !target?.liveSync) return 0;
  const entries = [];
  for (const mapping of data.aiFlowMappings?.mappings || []) {
    if (mapping.assetId !== asset.id || mapping.provider !== 'ai-flow' || mapping.status === 'unlinked' || !mapping.remoteAssetId) continue;
    if (mapping.projectId && String(mapping.projectId) !== String(target.projectId)) continue;
    entries.push({ remoteAssetId: mapping.remoteAssetId, serverOrigin: target.serverOrigin, projectId: target.projectId });
  }
  const source = asset.importSource;
  if (source?.provider === 'AI Flow' && source.assetId && (!source.projectId || String(source.projectId) === String(target.projectId))) {
    entries.push({ remoteAssetId: source.assetId, serverOrigin: target.serverOrigin, projectId: target.projectId });
  }
  return queueRemoteDeletes(data, entries);
}

function sameAIFlowOrigin(left, right) {
  try { return new URL(String(left || '')).origin === new URL(String(right || '')).origin; } catch { return false; }
}

function liveMoveKey(item) {
  return [item?.assetId, item?.remoteAssetId, item?.localFolderId, item?.remoteFolderId || ''].map(value => String(value || '').trim()).join('\u001f');
}

function liveMoveRecords(values, { includeError = false } = {}) {
  return (Array.isArray(values) ? values : []).slice(0, MAX_AIFLOW_UPLOAD_ITEMS).map(item => ({
    assetId: String(item?.assetId || '').trim(),
    remoteAssetId: String(item?.remoteAssetId || '').trim(),
    localFolderId: String(item?.localFolderId || '').trim(),
    remoteFolderId: String(item?.remoteFolderId || '').trim(),
    ...(includeError ? { error: String(item?.error || '').trim().slice(0, 500) } : {}),
  })).filter(item => (
    /^[A-Za-z0-9_-]{1,128}$/.test(item.assetId)
    && /^\d{1,18}$/.test(item.remoteAssetId)
    && /^[A-Za-z0-9_-]{1,128}$/.test(item.localFolderId)
    && (!item.remoteFolderId || /^\d{1,18}$/.test(item.remoteFolderId))
    && (!includeError || item.error)
  ));
}

function linkedAIFlowRemoteAssetIds(data, asset, target) {
  const remoteAssetIds = new Set();
  for (const mapping of data.aiFlowMappings?.mappings || []) {
    if (mapping.assetId !== asset?.id || mapping.provider !== 'ai-flow' || mapping.status === 'unlinked' || !mapping.remoteAssetId) continue;
    if (mapping.projectId && String(mapping.projectId) !== String(target?.projectId)) continue;
    remoteAssetIds.add(String(mapping.remoteAssetId));
  }
  const source = asset?.importSource;
  if (
    source?.provider === 'AI Flow'
    && source.assetId
    && (!source.projectId || String(source.projectId) === String(target?.projectId))
    && (!source.serverOrigin || sameAIFlowOrigin(source.serverOrigin, target?.serverOrigin))
  ) remoteAssetIds.add(String(source.assetId));
  return [...remoteAssetIds];
}

function queueAIFlowMovesForAsset(data, asset, previousFolderId) {
  const target = folderTarget(data, asset?.folderId);
  if (!asset?.id || !target?.liveSync) return { queued: 0, linked: false };
  const remoteAssetIds = linkedAIFlowRemoteAssetIds(data, asset, target);
  if (!remoteAssetIds.length) return { queued: 0, linked: false };
  const previous = folderTarget(data, previousFolderId);
  if (
    previous
    && previous.rootFolderId === target.rootFolderId
    && previous.projectId === target.projectId
    && sameAIFlowOrigin(previous.serverOrigin, target.serverOrigin)
    && previous.remoteFolderId === target.remoteFolderId
  ) return { queued: 0, linked: true };
  const queued = queueRemoteMoves(data, remoteAssetIds.map(remoteAssetId => ({
    assetId: asset.id,
    remoteAssetId,
    localFolderId: target.localFolderId,
    rootFolderId: target.rootFolderId,
    remoteFolderId: target.remoteFolderId,
    serverOrigin: target.serverOrigin,
    projectId: target.projectId,
  })));
  return { queued, linked: true };
}
const readLibrary = ({ ensureTeam: shouldEnsureTeam = true } = {}) => {
  if (!libraryPath) return null;
  const saved = readJson(indexFile(libraryPath));
  if (!saved) return null;
  if (removeRetiredVirtualGroups(saved)) writeJson(indexFile(libraryPath), saved);
  const data = {
    ...saved,
    folders: Array.isArray(saved.folders) ? saved.folders : [],
    tags: Array.isArray(saved.tags) ? saved.tags : [],
    assets: (Array.isArray(saved.assets) ? saved.assets : []).filter(Boolean).map(asset => ({
      ...asset,
      name: String(asset.name || asset.originalName || '未命名素材'),
      tags: Array.isArray(asset.tags) ? asset.tags : [],
      tagSources: asset.tagSources && typeof asset.tagSources === 'object' && !Array.isArray(asset.tagSources) ? asset.tagSources : {},
      favorite: Boolean(asset.favorite),
      rating: Number(asset.rating) || 0,
    })),
  };
  data.referenceBoards = normalizeReferenceBoards(saved.referenceBoards, data.assets);
  data.aiFlowMappings = normalizeLibraryAIFlowMappings(data);
  return shouldEnsureTeam ? ensureTeam(data) : data;
};
function buildDirectorBridge(input={}){const data=readLibrary();if(!data||!libraryPath)return{version:1,connected:false,updatedAt:Date.now()};const folders=data.folders||[],byId=new Map(folders.map(folder=>[folder.id,folder])),folderPath=id=>{const parts=[],seen=new Set();for(let current=byId.get(id);current&&!seen.has(current.id);current=byId.get(current.parentId)){seen.add(current.id);parts.unshift(current.name)}return parts.join(' / ')},activeFolderId=input.activeFolderId||null,selected=new Set(Array.isArray(input.selectedAssetIds)?input.selectedAssetIds:[]),descendants=activeFolderId?collectFolderSubtreeIds(folders,activeFolderId):null,scope=data.assets.filter(asset=>selected.size?selected.has(asset.id):descendants?descendants.has(asset.folderId):true),toBridgeAsset=asset=>({id:asset.id,name:asset.name,originalName:asset.originalName||asset.file,type:asset.type,tags:asset.tags||[],note:asset.note||'',folderId:asset.folderId||null,folderPath:folderPath(asset.folderId),size:asset.size||0,documentText:asset.documentText||'',documentFormat:asset.documentFormat||'',absolutePath:storedAssetPath(asset.file)});return{version:1,connected:true,updatedAt:Date.now(),library:{id:String(data.id||crypto.createHash('sha1').update(path.resolve(libraryPath)).digest('hex').slice(0,16)),name:String(data.name||path.basename(libraryPath)),rootName:path.basename(libraryPath)},selection:{activeFolderId,activeFolderName:byId.get(activeFolderId)?.name||'',activeFolderPath:folderPath(activeFolderId),selectedAssetIds:[...selected]},folders:folders.map(folder=>({id:folder.id,name:folder.name,parentId:folder.parentId||null,path:folderPath(folder.id)})),assets:scope.slice(0,5000).map(toBridgeAsset),mediaAssets:data.assets.map(asset=>({id:asset.id,absolutePath:storedAssetPath(asset.file)}))}};
const defaultAISettings=()=>({enabled:true,assistantName:'小旺仔助手',systemPrompt:'你是小旺仔助手，一个专业的素材管理助手。你会帮我查找、整理、分析和管理素材。',defaultProviderId:'openai',readFolderContext:true,readSelectedAssets:true,allowLowRisk:false,confidenceThreshold:.9,lowConfidenceAction:'review',providers:[normalizeProvider({id:'openai',type:'openai'}),normalizeProvider({id:'deepseek',type:'deepseek'})]});
const readAISettings=()=>{const saved=readJson(aiSettingsFile())||{};return{...defaultAISettings(),...saved,providers:Array.isArray(saved.providers)?saved.providers.map(normalizeProvider):defaultAISettings().providers}};
const readAISecrets=()=>{try{if(!safeStorage.isEncryptionAvailable()||!fs.existsSync(aiSecretsFile()))return{};return JSON.parse(safeStorage.decryptString(fs.readFileSync(aiSecretsFile())))}catch{return{}}};
const publicAISettings=()=>{const settings=readAISettings(),secrets=readAISecrets();return{...settings,providers:settings.providers.map(provider=>({...provider,hasApiKey:Boolean(secrets[provider.id])}))}};
const saveAISettings=(input={})=>{const current=readAISettings(),providers=(input.providers||current.providers).map(normalizeProvider),settings={...current,...input,providers};const secrets=readAISecrets();for(const provider of input.providers||[]){if(typeof provider.apiKey==='string'&&provider.apiKey.trim())secrets[provider.id]=provider.apiKey.trim();if(provider.clearApiKey)delete secrets[provider.id]}const clean={...settings,providers:providers.map(({apiKey,clearApiKey,...provider})=>provider)};writeJson(aiSettingsFile(),clean);if(Object.keys(secrets).length){if(!safeStorage.isEncryptionAvailable())throw new Error('系统安全存储不可用，API Key 未保存');fs.writeFileSync(aiSecretsFile(),safeStorage.encryptString(JSON.stringify(secrets)))}else if(fs.existsSync(aiSecretsFile()))fs.rmSync(aiSecretsFile());return publicAISettings()};
const aiRouter=()=>{const settings=readAISettings(),secrets=readAISecrets(),configs=Object.fromEntries(settings.providers.map(provider=>[provider.id,{...provider,apiKey:secrets[provider.id]||''}]));return new AIProviderRouter(configs,{fetchImpl:net.fetch})};
const readAIUsage=()=>{const value=readJson(aiUsageFile())||{};return{requests:Number(value.requests)||0,inputTokens:Number(value.inputTokens)||0,outputTokens:Number(value.outputTokens)||0,totalTokens:Number(value.totalTokens)||0,byDay:value.byDay||{}}};
const recordAIUsage=usage=>{const data=readAIUsage(),day=new Date().toISOString().slice(0,10),input=Number(usage?.prompt_tokens||usage?.input_tokens)||0,output=Number(usage?.completion_tokens||usage?.output_tokens)||0,total=Number(usage?.total_tokens)||input+output;data.requests++;data.inputTokens+=input;data.outputTokens+=output;data.totalTokens+=total;data.byDay[day]={requests:(data.byDay[day]?.requests||0)+1,totalTokens:(data.byDay[day]?.totalTokens||0)+total};writeJson(aiUsageFile(),data);return data};
const aiTasks=createAITaskManager({concurrency:2});
const aiFlowSettingsFile=()=>path.join(app.getPath('userData'),'aiflow-settings.json');
const aiFlowSecretsFile=()=>path.join(app.getPath('userData'),'aiflow-secrets.bin');
// A persistent partition keeps the authenticated AI Flow cookie on this PC.
// It stores browser session data only; the app never reads or saves a password.
const AI_FLOW_AUTH_PARTITION='persist:nest-aiflow-import-auth';
let aiFlowAuthWindow=null;
let aiFlowAuthPromise=null;
let aiFlowAuthState=null;
const defaultAIFlowSettings=()=>({baseUrl:'http://10.128.20.135:8080/',localRoot:DEFAULT_LOCAL_ROOT,authMode:'session'});
const normalizeAIFlowAuthMode=value=>value==='token'?'token':'session';
const readAIFlowSettings=()=>{const saved=readJson(aiFlowSettingsFile())||{};return{...defaultAIFlowSettings(),...saved,authMode:normalizeAIFlowAuthMode(saved.authMode),baseUrl:normalizeBaseUrl(saved.baseUrl||defaultAIFlowSettings().baseUrl),localRoot:String(saved.localRoot||defaultAIFlowSettings().localRoot)}};
const readAIFlowSecrets=()=>{try{if(!safeStorage.isEncryptionAvailable()||!fs.existsSync(aiFlowSecretsFile()))return{};return JSON.parse(safeStorage.decryptString(fs.readFileSync(aiFlowSecretsFile())))}catch{return{}}};
const currentAIFlowAccount=baseUrl=>{const normalized=normalizeBaseUrl(baseUrl);if(aiFlowAuthState?.baseUrl!==normalized||!aiFlowAuthState.user)return null;const user=aiFlowAuthState.user;return{id:String(user.id||''),username:String(user.username||''),displayName:String(user.displayName||'')}};
const publicAIFlowSettings=()=>{const settings=readAIFlowSettings(),secrets=readAIFlowSecrets(),account=settings.authMode==='session'?currentAIFlowAccount(settings.baseUrl):null;return{...settings,hasToken:Boolean(secrets.token),sessionAuthenticated:Boolean(account),account}};
const saveAIFlowSettings=(input={})=>{const current=readAIFlowSettings(),settings={...current};if(Object.prototype.hasOwnProperty.call(input,'baseUrl'))settings.baseUrl=normalizeBaseUrl(input.baseUrl);if(Object.prototype.hasOwnProperty.call(input,'localRoot'))settings.localRoot=String(input.localRoot||DEFAULT_LOCAL_ROOT).trim()||DEFAULT_LOCAL_ROOT;if(Object.prototype.hasOwnProperty.call(input,'authMode'))settings.authMode=normalizeAIFlowAuthMode(input.authMode);const secrets=readAIFlowSecrets();if(typeof input.token==='string'&&input.token.trim())secrets.token=input.token.trim().replace(/^Bearer\s+/i,'');if(input.clearToken)delete secrets.token;writeJson(aiFlowSettingsFile(),settings);if(current.baseUrl!==settings.baseUrl)aiFlowAuthState=null;if(Object.keys(secrets).length){if(!safeStorage.isEncryptionAvailable())throw new Error('系统安全存储不可用，AI Flow 访问令牌未保存');fs.writeFileSync(aiFlowSecretsFile(),safeStorage.encryptString(JSON.stringify(secrets)))}else if(fs.existsSync(aiFlowSecretsFile()))fs.rmSync(aiFlowSecretsFile());return publicAIFlowSettings()};
const aiFlowSession=()=>session.fromPartition(AI_FLOW_AUTH_PARTITION);
const aiFlowSessionClient=baseUrl=>{const authSession=aiFlowSession();return createAIFlowClient({baseUrl,fetchImpl:authSession.fetch.bind(authSession),authMode:'session'})};
const aiFlowClient=()=>{const settings=readAIFlowSettings();if(settings.authMode==='token'){const secrets=readAIFlowSecrets();return createAIFlowClient({baseUrl:settings.baseUrl,token:secrets.token,fetchImpl:net.fetch,authMode:'token'})}return aiFlowSessionClient(settings.baseUrl)};
async function readAIFlowSessionStatus(baseUrl){const normalized=normalizeBaseUrl(baseUrl),authSession=aiFlowSession(),cookies=await authSession.cookies.get({url:`${normalized}/`});if(!cookies.some(cookie=>cookie.name==='sd2_session')){if(aiFlowAuthState?.baseUrl===normalized)aiFlowAuthState=null;return{authenticated:false,account:null}}try{const result=await aiFlowSessionClient(normalized).testConnection(),account=result.account;if(!account)throw new Error('AI Flow 未返回当前账号');aiFlowAuthState={baseUrl:normalized,user:account,authenticatedAt:Date.now()};return{authenticated:true,account:currentAIFlowAccount(normalized)}}catch(error){if(aiFlowAuthState?.baseUrl===normalized)aiFlowAuthState=null;return{authenticated:false,account:null,error:redact(error.message)}}}
const isAIFlowTrustedUrl=(candidate,baseUrl)=>{try{return new URL(candidate).origin===new URL(baseUrl).origin}catch{return false}};
function openAIFlowLogin(parent,baseUrl){const normalized=normalizeBaseUrl(baseUrl);if(aiFlowAuthWindow&&!aiFlowAuthWindow.isDestroyed()){aiFlowAuthWindow.show();aiFlowAuthWindow.focus();return aiFlowAuthPromise||Promise.resolve({pending:true})}let win;const promise=new Promise(resolve=>{let finished=false,checking=false,poll=null;const finish=result=>{if(finished)return;finished=true;if(poll)clearInterval(poll);if(aiFlowAuthWindow===win)aiFlowAuthWindow=null;aiFlowAuthPromise=null;resolve(result)};const checkLogin=async()=>{if(finished||checking)return;checking=true;try{const status=await readAIFlowSessionStatus(normalized);if(status.authenticated){finish({ok:true,account:status.account});if(win&&!win.isDestroyed())win.close()}}catch{}finally{checking=false}};const authSession=aiFlowSession();win=new BrowserWindow({width:1040,height:760,minWidth:760,minHeight:560,title:'登录 AI Flow',parent:parent||undefined,modal:Boolean(parent),show:false,icon:path.join(app.getAppPath(),'build','icon.png'),backgroundColor:'#07111f',autoHideMenuBar:process.platform!=='darwin',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,session:authSession}});aiFlowAuthWindow=win;win.once('ready-to-show',()=>win.show());win.webContents.setWindowOpenHandler(({url})=>{if(isAIFlowTrustedUrl(url,normalized)){win.loadURL(url);return{action:'deny'}}if(/^https?:/i.test(url))shell.openExternal(url);return{action:'deny'}});const blockUntrusted=(event,url)=>{if(isAIFlowTrustedUrl(url,normalized))return;event.preventDefault();if(/^https?:/i.test(url))shell.openExternal(url)};win.webContents.on('will-navigate',blockUntrusted);win.webContents.on('will-redirect',blockUntrusted);win.webContents.on('did-finish-load',()=>{void checkLogin()});win.on('closed',()=>finish({cancelled:true}));poll=setInterval(()=>{void checkLogin()},700);win.loadURL(normalized).catch(error=>{finish({error:`无法打开 AI Flow 登录页：${redact(error.message)}`});if(!win.isDestroyed())win.close()});void checkLogin()});aiFlowAuthPromise=promise;return promise}
async function logoutAIFlowSession(baseUrl){const normalized=normalizeBaseUrl(baseUrl),authSession=aiFlowSession(),cookies=await authSession.cookies.get({url:`${normalized}/`});await Promise.all(cookies.filter(cookie=>cookie.name==='sd2_session').map(cookie=>authSession.cookies.remove(`${normalized}/`,cookie.name).catch(()=>{})));if(aiFlowAuthState?.baseUrl===normalized)aiFlowAuthState=null;return publicAIFlowSettings()}
async function publicAIFlowSettingsWithSessionStatus(){const settings=publicAIFlowSettings();if(settings.authMode!=='session')return settings;const status=await readAIFlowSessionStatus(settings.baseUrl);return{...publicAIFlowSettings(),sessionAuthenticated:status.authenticated,account:status.account}}
const aiFlowScans=new Map();
function rememberAIFlowScan(source,records,context={}){const now=Date.now();for(const [id,scan] of aiFlowScans){if(scan.expiresAt<=now)aiFlowScans.delete(id)}const scanId=crypto.randomUUID(),items=new Map(),videos=[];for(const record of records){const id=crypto.randomUUID();items.set(id,record);const {path:ignoredPath,...publicRecord}=record;videos.push({id,...publicRecord})}aiFlowScans.set(scanId,{source,items,context,expiresAt:now+15*60*1000});const{root:ignoredRoot,...publicContext}=context;return{scanId,...publicContext,videos}}
function selectedAIFlowRecords(scanId,ids,source){const scan=aiFlowScans.get(String(scanId||''));if(!scan||scan.expiresAt<=Date.now()){if(scan)aiFlowScans.delete(String(scanId||''));throw new Error('AI Flow 列表已过期，请刷新后重试')}if(scan.source!==source)throw new Error('AI Flow 导入来源不匹配，请刷新后重试');const selected=[...new Set(Array.isArray(ids)?ids:[])].map(id=>scan.items.get(String(id))).filter(Boolean);if(!selected.length)throw new Error('请至少选择一个 AI Flow 视频');return{scan,selected}}
function cleanAIFlowFilename(value,fallback='AI Flow 视频'){const name=String(value||fallback).replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/\s+/g,' ').trim().slice(0,120)||fallback;return name.replace(/\.(mp4|webm|mov|m4v)$/i,'')}
async function downloadAIFlowVideo(client,video,report,index,total){const response=await client.downloadVideo(video.taskId),length=Number(response.headers.get('content-length')||0),downloadName=filenameFromContentDisposition(response.headers.get('content-disposition')),safeName=cleanAIFlowFilename(downloadName||video.name,video.taskId),directory=path.join(app.getPath('temp'),`nest-aiflow-${crypto.randomUUID()}`),target=path.join(directory,`${safeName}.mp4`);await fs.promises.mkdir(directory,{recursive:true});let received=0;const source=Readable.fromWeb(response.body);source.on('data',chunk=>{received+=chunk.length;report?.({phase:'downloading-aiflow',processed:index,total,name:downloadName||video.name,received,totalBytes:length})});try{await pipeline(source,fs.createWriteStream(target,{flags:'wx'}));report?.({phase:'downloaded-aiflow',processed:index+1,total,name:downloadName||video.name,received,totalBytes:length});return{file:target,directory}}catch(error){await fs.promises.rm(directory,{recursive:true,force:true}).catch(()=>{});throw error}}
const versionParts=value=>String(value||'0').replace(/^v/i,'').split(/[.-]/).slice(0,3).map(part=>Number(part)||0);
const newerVersion=(latest,current)=>{const a=versionParts(latest),b=versionParts(current);for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i]}return false};
const portableUpdaterScript = `param([int]$ParentPid,[string]$CurrentExe,[string]$NewExe,[string]$BackupExe,[string]$LogFile)
$ErrorActionPreference='Stop'
function Write-UpdateLog([string]$Message){$dir=Split-Path -Parent $LogFile;New-Item -ItemType Directory -Force -Path $dir|Out-Null;Add-Content -LiteralPath $LogFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message" -Encoding UTF8}
function Move-WithRetry([string]$Source,[string]$Destination,[string]$Description){
  $lastError=$null
  for($attempt=1;$attempt -le 120;$attempt++){
    try{Move-Item -LiteralPath $Source -Destination $Destination -Force;Write-UpdateLog "$Description succeeded on attempt $attempt";return}
    catch{$lastError=$_.Exception.Message;if($attempt -eq 1 -or $attempt%10 -eq 0){Write-UpdateLog "$Description is waiting for file unlock (attempt $attempt): $lastError"};Start-Sleep -Milliseconds 500}
  }
  throw "$Description timed out: $lastError"
}
try{
  Write-UpdateLog "Updater started; waiting for PID $ParentPid"
  for($i=0;$i -lt 240;$i++){if(-not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)){break};Start-Sleep -Milliseconds 250}
  if(Get-Process -Id $ParentPid -ErrorAction SilentlyContinue){throw 'Timed out waiting for the main process to exit'}
  if(Test-Path -LiteralPath $BackupExe){Remove-Item -LiteralPath $BackupExe -Force}
  Move-WithRetry $CurrentExe $BackupExe 'Backing up the current portable executable'
  try{
    Move-WithRetry $NewExe $CurrentExe 'Installing the new portable executable'
    $started=Start-Process -FilePath $CurrentExe -PassThru
    Start-Sleep -Seconds 3
    if($started.HasExited -and $started.ExitCode -ne 0){throw "New version exited with code $($started.ExitCode)"}
    Write-UpdateLog 'Update completed and the new version was started'
    Remove-Item -LiteralPath $BackupExe -Force -ErrorAction SilentlyContinue
  }catch{
    Write-UpdateLog "New version failed; rolling back: $($_.Exception.Message)"
    Remove-Item -LiteralPath $CurrentExe -Force -ErrorAction SilentlyContinue
    Move-Item -LiteralPath $BackupExe -Destination $CurrentExe -Force
    Start-Process -FilePath $CurrentExe
    throw
  }
}catch{Write-UpdateLog "Updater failed: $($_.Exception.Message)"}
`;
const { createReferenceBoard, normalizeReferenceBoards, updateReferenceBoard } = require('./reference-boards.cjs');
const { removeRetiredVirtualGroups } = require('./retired-features.cjs');
const publicLibrary = data => {
  if (!data) return null;
  const library = data;
  library.aiFlowMappings = normalizeLibraryAIFlowMappings(library);
  return {
    ...library,
    currentMember: { ...currentProfile(), role: currentRole(library) },
    path: libraryPath,
    assets: library.assets.map(asset => ({ ...asset, url: asset.file ? `nest://asset/${encodeURIComponent(asset.file)}` : '' })),
  };
};
const PHYSICAL_LAYOUT_VERSION = 2;
function ensurePhysicalLayout(data) {
  if (!needsPhysicalLayoutSync(data, PHYSICAL_LAYOUT_VERSION)) return false;
  if (PHYSICAL_LAYOUT_VERSION >= 2) data.legacyRootAliasesArchived = (data.legacyRootAliasesArchived || 0) + archiveLegacyRootAliases(libraryPath, data);
  syncPhysicalFolders(libraryPath, data);
  data.physicalLayoutVersion = PHYSICAL_LAYOUT_VERSION;
  writeJson(indexFile(libraryPath), data);
  return true;
}
function backupLibrary(){if(!libraryPath||!fs.existsSync(indexFile(libraryPath)))return;const dir=path.join(libraryPath,'.nest-backups');fs.mkdirSync(dir,{recursive:true});const day=new Date().toISOString().slice(0,10);const target=path.join(dir,`library-${day}.json`);if(!fs.existsSync(target))fs.copyFileSync(indexFile(libraryPath),target)}

function initializeLibrary(root) {
  fs.mkdirSync(root, { recursive: true }); fs.mkdirSync(assetsDir(root), { recursive: true });
  if (!fs.existsSync(indexFile(root))) writeJson(indexFile(root), { version: 1, name: path.basename(root), folders: [], tags: [], assets: [], aiFlowMappings: createAIFlowMappings(), createdAt: Date.now() });
  libraryPath = root; extensionImportTarget = null; pendingAIFlowAssetLink = null; pendingAIFlowUpload = null; pendingAIFlowReferenceAttachment = null; saveSettings(); backupLibrary(); return publicLibrary(readLibrary());
}
let libraryDialogActive = false;
async function selectFolder(title) {
  if (libraryDialogActive) return null;
  libraryDialogActive = true;
  try {
    const r = await dialog.showOpenDialog({ title, properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  } finally {
    libraryDialogActive = false;
  }
}

ipcMain.handle('library:current', () => { if(deletingLibrary)return null; const saved = readJson(settingsFile()); if (!libraryPath && saved?.libraryPath && fs.existsSync(indexFile(saved.libraryPath))) libraryPath = saved.libraryPath; backupLibrary(); const data=readLibrary();if(data){ensurePhysicalLayout(data);writeJson(indexFile(libraryPath),data)}return publicLibrary(data); });
ipcMain.handle('library:create', async () => { const root = await selectFolder('选择或新建 Nest 资源库文件夹'); return root ? enqueueLibraryMutation(()=>initializeLibrary(root), null) : null; });
ipcMain.handle('library:open', async () => { const root = await selectFolder('打开小旺仔资源库'); if (!root) return null; return enqueueLibraryMutation(()=>{if (!fs.existsSync(indexFile(root))) return { error: '所选文件夹不是小旺仔资源库' }; libraryPath = root; extensionImportTarget = null; pendingAIFlowAssetLink = null; pendingAIFlowUpload = null; pendingAIFlowReferenceAttachment = null; saveSettings(); backupLibrary(); const data=readLibrary();syncPhysicalFolders(libraryPath,data);writeJson(indexFile(libraryPath),data);return publicLibrary(data)}) });
ipcMain.handle('library:delete-library', async (_, confirmationName) => libraryMutationQueue(async () => {
  const root = libraryPath;
  const data = readLibrary();
  if (!root || !data) return { error: '当前没有可删除的素材库' };
  if (!requireRole(data, 'admin')) return { error: '只有素材库管理员可以删除整个素材库' };
  const resolved = path.resolve(root);
  if (resolved === path.parse(resolved).root || !fs.existsSync(indexFile(resolved))) return { error: '为保护磁盘根目录，无法删除该位置' };
  const expectedName = String(data.name || path.basename(resolved));
  if (String(confirmationName || '').trim() !== expectedName) return { error: '确认名称不匹配，未删除素材库' };
  deletingLibrary = true;
  // Persist the disconnected state before recycling, including the copy that
  // may later be restored from the recycle bin.
  try {
    detachAIFlowFolderConnections(data);
    data.aiFlowLiveSync = { version: 2, pendingUploads: [], pendingMoves: [], pendingDeletes: [] };
    data.aiFlowMappings = createAIFlowMappings();
    writeJson(indexFile(resolved), data);
    cancelAIFlowTransfersForShutdown();
    extensionImportTarget = null;
    libraryPath = null;
    saveSettings();
    publishAIFlowLiveWake();
    await closeLibraryReadStreams();
    await moveToRecycleBin(resolved, { trashItem: shell.trashItem });
  } catch (error) {
    libraryPath = fs.existsSync(indexFile(resolved)) ? resolved : null;
    saveSettings();
    if (libraryPath) notifyLibraryChanged(readLibrary());
    return { error: `无法移入系统回收站：${error.message}（Flow 同步已停止）` };
  } finally {
    deletingLibrary = false;
  }
  libraryPath = null;
  extensionImportTarget = null;
  pendingAIFlowAssetLink = null;
  pendingAIFlowUpload = null;
  pendingAIFlowReferenceAttachment = null;
  saveSettings();
  publishAIFlowLiveWake();
  return { ok: true, name: expectedName };
}));
ipcMain.handle('library:health', () => {const data=readLibrary();if(!data)return null;const missing=data.assets.filter(a=>!a.file||!fs.existsSync(storedAssetPath(a.file))).map(a=>({id:a.id,name:a.name,file:a.file||''}));return{missing,total:data.assets.length,backupDir:path.join(libraryPath,'.nest-backups')}});
ipcMain.handle('library:storage-info',()=>{if(!libraryPath)return null;try{const root=path.parse(libraryPath).root||libraryPath,stat=fs.statfsSync(root),total=Number(stat.blocks)*Number(stat.bsize),free=Number(stat.bavail)*Number(stat.bsize);return{root,total,free,used:Math.max(0,total-free)}}catch(error){return{error:error.message}}});
ipcMain.handle('plugins:list',()=>{const settings=readSettings();return scanPlugins(path.join(app.getPath('userData'),'plugins'),settings.enabledPluginIds||[])});
ipcMain.handle('plugins:set-enabled',(_,id,enabled)=>{const settings=readSettings(),plugins=scanPlugins(path.join(app.getPath('userData'),'plugins'),settings.enabledPluginIds||[]),plugin=plugins.find(item=>item.id===id&&item.valid);if(!plugin)return{error:'插件不存在或清单无效'};const ids=new Set(settings.enabledPluginIds||[]);enabled?ids.add(id):ids.delete(id);writeJson(settingsFile(),{...settings,enabledPluginIds:[...ids],libraryPath});return{ok:true,plugins:scanPlugins(path.join(app.getPath('userData'),'plugins'),[...ids])}});
ipcMain.handle('plugins:open-folder',async()=>{const target=path.join(app.getPath('userData'),'plugins');fs.mkdirSync(target,{recursive:true});const error=await shell.openPath(target);return error?{error}:{ok:true}});
ipcMain.handle('mcp:config',()=>libraryPath?{command:process.execPath,args:[path.join(app.getAppPath(),'electron','mcp-server.cjs'),`--library=${libraryPath}`,'--permissions=library.read'],env:{ELECTRON_RUN_AS_NODE:'1'}}:{error:'请先打开资源库'});
ipcMain.handle('team:info',()=>{const data=readLibrary();return data?{profile:currentProfile(),role:currentRole(data),ownerId:data.team.ownerId,members:data.team.members}:null});
ipcMain.handle('team:update-profile',(_,patch)=>{const profile=setProfile({name:String(patch?.name||'').trim().slice(0,40)||currentProfile().name,color:String(patch?.color||currentProfile().color)});return{ok:true,profile}});
ipcMain.handle('team:add-member',(_,input)=>enqueueLibraryMutation(()=>{const data=readLibrary();if(!data)return null;const member=normalizeMember(input);if(data.team.members.some(item=>item.id===member.id||item.name.toLowerCase()===member.name.toLowerCase()))return{error:'成员已存在'};data.team.members.push(member);writeJson(indexFile(libraryPath),data);return{ok:true,team:publicLibrary(data).team}},'admin'));
ipcMain.handle('team:update-member',(_,id,changes)=>enqueueLibraryMutation(()=>{const data=readLibrary();if(!data)return null;const member=data.team.members.find(item=>item.id===id);if(!member)return{error:'成员不存在'};if(id===data.team.ownerId&&changes?.role&&changes.role!=='admin')return{error:'不能降低资源库所有者权限'};const next=normalizeMember({...member,...changes,id:member.id,createdAt:member.createdAt});Object.assign(member,next);writeJson(indexFile(libraryPath),data);return{ok:true,team:publicLibrary(data).team}},'admin'));
ipcMain.handle('team:remove-member',(_,id)=>enqueueLibraryMutation(()=>{const data=readLibrary();if(!data)return null;if(id===data.team.ownerId)return{error:'不能移除资源库所有者'};if(id===currentProfile().id)return{error:'不能移除当前登录成员'};const before=data.team.members.length;data.team.members=data.team.members.filter(item=>item.id!==id);if(before===data.team.members.length)return{error:'成员不存在'};writeJson(indexFile(libraryPath),data);return{ok:true,team:publicLibrary(data).team}},'admin'));
ipcMain.handle('app:open-recycle-bin',async()=>{try{if(process.platform==='win32'){const child=spawn('explorer.exe',['shell:RecycleBinFolder'],{detached:true,stdio:'ignore',windowsHide:false});child.unref();return{ok:true}}const target=path.join(app.getPath('home'),'.Trash'),error=await shell.openPath(target);return error?{error}:{ok:true}}catch(error){return{error:error.message}}});
ipcMain.handle('library:repair', () => enqueueLibraryMutation(()=>{const data=readLibrary();if(!data)return null;backupLibrary();data.folders=Array.isArray(data.folders)?data.folders:[];data.assets=(Array.isArray(data.assets)?data.assets:[]).filter(a=>a?.id&&a?.file&&fs.existsSync(storedAssetPath(a.file))).map(a=>({...a,tags:Array.isArray(a.tags)?a.tags:[]}));syncPhysicalFolders(libraryPath,data);writeJson(indexFile(libraryPath),data);return publicLibrary(data)}));
ipcMain.handle('library:add-folder', (_, options) => enqueueLibraryMutation(()=>{const data=readLibrary();if(!data)return null;const clean=String(options?.name||'').trim().slice(0,50),parentId=options?.parentId||null;if(!clean)return{error:'文件夹名称不能为空'};if(parentId&&!data.folders.some(f=>f.id===parentId))return{error:'所选父级文件夹不存在'};if(data.folders.some(f=>f.name.toLowerCase()===clean.toLowerCase()&&(f.parentId||null)===parentId))return{error:'同一级中已存在同名文件夹'};data.folders.push({id:crypto.randomUUID(),name:clean,parentId,icon:String(options?.icon||'folder'),color:String(options?.color||'#8f98a3'),createdAt:Date.now()});syncPhysicalFolders(libraryPath,data);writeJson(indexFile(libraryPath),data);return publicLibrary(data)}));
ipcMain.handle('library:create-reference-board', (_, input = {}) => enqueueLibraryMutation(()=>{const data=readLibrary();if(!data)return null;try{const board=createReferenceBoard(input,data.assets,{id:crypto.randomUUID()});data.referenceBoards=normalizeReferenceBoards([...(data.referenceBoards||[]),board],data.assets);writeJson(indexFile(libraryPath),data);return{board,library:publicLibrary(data)}}catch(error){return{error:`无法新建参考板：${error.message}`}}}));
ipcMain.handle('library:update-reference-board', (_, id, changes = {}) => enqueueLibraryMutation(()=>{const data=readLibrary();if(!data)return null;const current=(data.referenceBoards||[]).find(board=>board.id===String(id||''));if(!current)return{error:'参考板不存在或已被删除'};const board=updateReferenceBoard(current,changes,data.assets);data.referenceBoards=(data.referenceBoards||[]).map(item=>item.id===board.id?board:item);writeJson(indexFile(libraryPath),data);return{board,library:publicLibrary(data)}}));
ipcMain.handle('library:delete-reference-board', (_, id) => enqueueLibraryMutation(()=>{const data=readLibrary();if(!data)return null;const before=(data.referenceBoards||[]).length;data.referenceBoards=(data.referenceBoards||[]).filter(board=>board.id!==String(id||''));if(before===data.referenceBoards.length)return{error:'参考板不存在或已被删除'};writeJson(indexFile(libraryPath),data);return{ok:true,library:publicLibrary(data)}}));
ipcMain.handle('library:update-folder', (_, id, changes) => enqueueLibraryMutation(()=>{const data=readLibrary();if(!data)return null;const current=data.folders.find(f=>f.id===id);if(!current)return{error:'文件夹不存在或已被删除'};const clean=String(changes?.name??current.name).trim(),parentId=changes?.parentId===undefined?(current.parentId||null):(changes.parentId||null);if(!clean)return{error:'文件夹名称不能为空'};if(parentId===id)return{error:'文件夹不能移动到自身'};const descendants=new Set([id]);for(let changed=true;changed;){changed=false;for(const folder of data.folders)if(folder.parentId&&descendants.has(folder.parentId)&&!descendants.has(folder.id)){descendants.add(folder.id);changed=true}}if(parentId&&(!data.folders.some(f=>f.id===parentId)||descendants.has(parentId)))return{error:'不能移动到自身或子文件夹'};if(data.folders.some(f=>f.id!==id&&f.name.toLowerCase()===clean.toLowerCase()&&(f.parentId||null)===parentId))return{error:'同一级中已存在同名文件夹'};data.folders=data.folders.map(f=>f.id===id?{...f,...changes,name:clean,parentId,id:f.id}:f);syncPhysicalFolders(libraryPath,data);writeJson(indexFile(libraryPath),data);return publicLibrary(data)}));
ipcMain.handle('library:delete-folder', (_, id) => enqueueLibraryMutation(async()=>{const data=readLibrary();if(!data)return null;if(!data.folders.some(folder=>folder.id===id))return{error:'文件夹不存在或已被删除'};const folderIds=collectFolderSubtreeIds(data.folders,id),targets=data.assets.filter(asset=>folderIds.has(asset.folderId)),removedAssetIds=new Set(),errors=[];let detachedAIFlowLinks=0;for(const asset of targets){try{const target=storedAssetPath(asset.file);if(asset.file&&fs.existsSync(target))await moveToRecycleBin(target,{trashItem:shell.trashItem});detachedAIFlowLinks+=detachAIFlowAssetConnections(data,asset).mappings;removedAssetIds.add(asset.id)}catch(error){errors.push(`${asset.name}: ${error.message}`)}}data.assets=data.assets.filter(asset=>!removedAssetIds.has(asset.id));if(!errors.length)data.folders=data.folders.filter(folder=>!folderIds.has(folder.id));syncPhysicalFolders(libraryPath,data);data.lastDelete={kind:'folder',folderId:id,removedAssets:removedAssetIds.size,removedFolders:errors.length?0:folderIds.size,detachedAIFlowLinks,errors,completed:errors.length===0,finishedAt:Date.now()};writeJson(indexFile(libraryPath),data);if(removedAssetIds.size)publishAIFlowLiveWake();return publicLibrary(data)}));
ipcMain.handle('library:add-tag', (_, name) => enqueueLibraryMutation(()=>{const data=readLibrary();if(!data)return null;const clean=String(name||'').trim();data.tags=Array.isArray(data.tags)?data.tags:[];if(clean&&!data.tags.includes(clean))data.tags.push(clean);writeJson(indexFile(libraryPath),data);return publicLibrary(data)}));
ipcMain.handle('library:delete-tag', (_, name) => enqueueLibraryMutation(()=>{const data=readLibrary();if(!data)return null;data.tags=data.tags.filter(t=>t!==name);data.assets=data.assets.map(a=>({...a,tags:a.tags.filter(t=>t!==name)}));writeJson(indexFile(libraryPath),data);return publicLibrary(data)}));
const hashFile = file => new Promise((resolve, reject) => { const hash=crypto.createHash('sha256'); const stream=fs.createReadStream(file); stream.on('data',chunk=>hash.update(chunk)); stream.on('error',reject); stream.on('end',()=>resolve(hash.digest('hex'))); });
function readableAssetFilename(data, displayName, extension, excludeId = null) {
  let candidate = chooseReadableFilename(data.assets, displayName, extension, excludeId);
  const base = path.basename(candidate, extension);
  for (let number = 2; fs.existsSync(path.join(assetsDir(libraryPath), candidate)) && !data.assets.some(asset => asset.id === excludeId && path.basename(asset.file).toLowerCase() === candidate.toLowerCase()); number += 1) candidate = `${base} (${number})${extension}`;
  return candidate;
}
function migrateAssetFilename(data, asset, displayName = asset.name) {
  const oldRelative = asset.file || '', oldFile = path.basename(oldRelative);
  if (!oldFile) throw new Error('素材文件名为空');
  const extension = path.extname(oldFile).toLowerCase();
  const newFile = readableAssetFilename(data, displayName, extension, asset.id);
  if (oldFile.toLowerCase() === newFile.toLowerCase()) return false;
  const source = storedAssetPath(oldRelative), relativeDir=path.dirname(oldRelative)==='.'?'':path.dirname(oldRelative);
  if (!fs.existsSync(source)) throw new Error('素材原文件不存在');
  const nextRelative=path.join(relativeDir,newFile).replace(/\\/g,'/');fs.renameSync(source, storedAssetPath(nextRelative));
  asset.file = nextRelative;
  asset.originalName = newFile;
  return true;
}
async function responseToBuffer(response, maxBytes = 50 * 1024 * 1024) { const length=Number(response.headers.get('content-length')||0);if(length>maxBytes)throw new Error('图片超过 50 MB');if(!response.body)return Buffer.alloc(0);const reader=response.body.getReader(),chunks=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new Error('图片超过 50 MB')}chunks.push(Buffer.from(value))}}finally{reader.releaseLock()}return Buffer.concat(chunks,size) }
async function importPaths(paths, folderId = null, { preserveFolders = false, preserveTopLevelFolders = false, dedupeByFolder = preserveFolders || preserveTopLevelFolders, onProgress, metadataForPath, initialErrors = [], signal } = {}) {
  const data=readLibrary();if(!data)return null;if(folderId&&!data.folders.some(folder=>folder.id===folderId))return{error:'目标文件夹不存在或已被删除'};let imported=0,duplicates=0,processed=0,cancelled=Boolean(signal?.aborted);const importedAssets=[];let expanded;try{expanded=await expandImportPaths(paths,{onProgress,signal})}catch(error){expanded={entries:[],directories:[],errors:[String(error?.message||error)],cancelled:Boolean(signal?.aborted)}}cancelled=cancelled||Boolean(expanded.cancelled);const errors=[...initialErrors,...expanded.errors],duplicateIndex=createDuplicateIndex(data.assets);onProgress?.({phase:'importing',processed:0,total:expanded.entries.length,imported,duplicates});
  const ensureFolderPath=parts=>{let parentId=folderId;for(const part of parts){const name=String(part||'').trim().slice(0,50)||'未命名文件夹';let folder=data.folders.find(item=>item.name===name&&(item.parentId||null)===(parentId||null));if(!folder){folder={id:crypto.randomUUID(),name,parentId:parentId||null,icon:'folder',color:'#8f98a3',createdAt:Date.now()};data.folders.push(folder)}parentId=folder.id}return parentId};
  if(!cancelled&&(preserveFolders||preserveTopLevelFolders))for(const parts of expanded.directories){const destinationParts=folderPartsForImport(parts,{preserveFolders,preserveTopLevelFolders});if(destinationParts.length)ensureFolderPath(destinationParts)}
  for(const entry of expanded.entries){if(signal?.aborted){cancelled=true;break}const source=entry.file,destinationParts=folderPartsForImport(entry.folders,{preserveFolders,preserveTopLevelFolders}),destinationFolderId=destinationParts.length?ensureFolderPath(destinationParts):folderId;try{const stat=await fs.promises.stat(source);const ext=path.extname(source).toLowerCase();const imageExts=['.jpg','.jpeg','.png','.gif','.webp','.svg','.bmp','.avif'];const videoExts=['.mp4','.webm','.mov','.m4v'];const audioTypes={'.mp3':'audio/mpeg','.wav':'audio/wav','.flac':'audio/flac','.aac':'audio/aac','.m4a':'audio/mp4','.ogg':'audio/ogg','.opus':'audio/ogg','.wma':'audio/x-ms-wma'};if(![...imageExts,...videoExts,...Object.keys(audioTypes),...Object.keys(DOCUMENT_TYPES)].includes(ext))throw new Error('不支持的格式');const hash=await hashFile(source);if(signal?.aborted){cancelled=true;break}if(isDuplicate(duplicateIndex,hash,destinationFolderId,dedupeByFolder)){duplicates++;continue}const file=readableAssetFilename(data,path.basename(source,ext),ext);await fs.promises.copyFile(source,path.join(assetsDir(libraryPath),file));const type=imageExts.includes(ext)?`image/${ext.slice(1).replace('jpg','jpeg')}`:videoExts.includes(ext)?`video/${ext.slice(1).replace('mov','quicktime')}`:audioTypes[ext]||DOCUMENT_TYPES[ext];let documentText='';if(DOCUMENT_TYPES[ext])try{documentText=await extractDocumentText(source)}catch(error){errors.push(`${path.basename(source)}: 文本提取失败（文件仍已导入）：${error.message}`)}const documentStructure=ext==='.fountain'?parseFountainStructure(documentText):null,importSource=typeof metadataForPath==='function'?metadataForPath(source):metadataForPath?.[source],asset={id:crypto.randomUUID(),file,name:path.basename(source,ext),originalName:path.basename(source),type,size:stat.size,width:0,height:0,tags:[],favorite:false,note:'',rating:0,folderId:destinationFolderId,hash,documentText,documentFormat:DOCUMENT_TYPES[ext]?ext.slice(1).toUpperCase():'',documentStructure,createdAt:Date.now(),modifiedAt:Date.now()};if(importSource&&typeof importSource==='object')asset.importSource=importSource;data.assets.unshift(asset);importedAssets.push(asset);recordHash(duplicateIndex,hash,destinationFolderId);imported++}catch(error){errors.push(`${path.basename(source)}: ${error.message}`)}finally{processed++;onProgress?.({phase:'importing',processed,total:expanded.entries.length,imported,duplicates})}}
  if(!cancelled&&(preserveFolders||preserveTopLevelFolders))for(const parts of expanded.directories){const destinationParts=folderPartsForImport(parts,{preserveFolders,preserveTopLevelFolders});if(destinationParts.length)ensureFolderPath(destinationParts)}
  for(const entry of expanded.entries){if(signal?.aborted){cancelled=true;break}const source=entry.file,destinationParts=folderPartsForImport(entry.folders,{preserveFolders,preserveTopLevelFolders}),destinationFolderId=destinationParts.length?ensureFolderPath(destinationParts):folderId;try{const stat=await fs.promises.stat(source);const ext=path.extname(source).toLowerCase();const imageExts=['.jpg','.jpeg','.png','.gif','.webp','.svg','.bmp','.avif'];const videoExts=['.mp4','.webm','.mov','.m4v'];const audioTypes={'.mp3':'audio/mpeg','.wav':'audio/wav','.flac':'audio/flac','.aac':'audio/aac','.m4a':'audio/mp4','.ogg':'audio/ogg','.opus':'audio/ogg','.wma':'audio/x-ms-wma'};if(![...imageExts,...videoExts,...Object.keys(audioTypes),...Object.keys(DOCUMENT_TYPES)].includes(ext))throw new Error('不支持的格式');const hash=await hashFile(source);if(signal?.aborted){cancelled=true;break}if(isDuplicate(duplicateIndex,hash,destinationFolderId,dedupeByFolder)){duplicates++;continue}const file=readableAssetFilename(data,path.basename(source,ext),ext);await fs.promises.copyFile(source,path.join(assetsDir(libraryPath),file));const type=imageExts.includes(ext)?`image/${ext.slice(1).replace('jpg','jpeg')}`:videoExts.includes(ext)?`video/${ext.slice(1).replace('mov','quicktime')}`:audioTypes[ext]||DOCUMENT_TYPES[ext];let documentText='';if(DOCUMENT_TYPES[ext])try{documentText=await extractDocumentText(source)}catch(error){errors.push(`${path.basename(source)}: 文本提取失败（文件仍已导入）：${error.message}`)}const documentStructure=ext==='.fountain'?parseFountainStructure(documentText):null,importSource=typeof metadataForPath==='function'?metadataForPath(source):metadataForPath?.[source],asset={id:crypto.randomUUID(),file,name:path.basename(source,ext),originalName:path.basename(source),type,size:stat.size,width:0,height:0,tags:[],favorite:false,note:'',rating:0,folderId:destinationFolderId,hash,documentText,documentFormat:DOCUMENT_TYPES[ext]?ext.slice(1).toUpperCase():'',documentStructure,createdAt:Date.now(),modifiedAt:Date.now()};if(importSource&&typeof importSource==='object')asset.importSource=importSource;data.assets.unshift(asset);importedAssets.push(asset);recordHash(duplicateIndex,hash,destinationFolderId);imported++}catch(error){errors.push(`${path.basename(source)}: ${error.message}`)}finally{processed++;onProgress?.({phase:'importing',processed,total:expanded.entries.length,imported,duplicates})}}
  cancelled=cancelled||Boolean(signal?.aborted);const queuedForAIFlow=queueAssetsForLiveSync(data,importedAssets);syncPhysicalFolders(libraryPath,data);data.lastImport={imported,duplicates,errors,queuedForAIFlow,cancelled,finishedAt:Date.now()};writeJson(indexFile(libraryPath),data);if(queuedForAIFlow)publishAIFlowLiveWake();onProgress?.({phase:cancelled?'cancelled':'complete',processed,total:expanded.entries.length,imported,duplicates,percent:cancelled?undefined:100});const result=publicLibrary(data);return cancelled?{...result,importCanceled:true}:result;
}
function notifyLibraryChanged(data){for(const win of BrowserWindow.getAllWindows())win.webContents.send('library:changed',publicLibrary(data))}
// —— 索引变更监听（团队版）：检测其他客户端的改动并广播 ——
// SMB 上 fs.watch 不可靠，采用 1.2s 轮询 mtime；用 selfWriteMtime 区分「本进程刚写入」以跳过自广播。
let indexWatchMtime = 0;
let selfWriteMtime = 0;
let indexWatchTimer = null;
function markSelfWrite() { if (!libraryPath) return; try { selfWriteMtime = fs.statSync(indexFile(libraryPath)).mtimeMs; } catch {} }
function startIndexWatcher() {
  if (indexWatchTimer) return;
  if (libraryPath) { try { indexWatchMtime = fs.statSync(indexFile(libraryPath)).mtimeMs; } catch {} }
  indexWatchTimer = setInterval(() => {
    if (!libraryPath) return;
    const file = indexFile(libraryPath);
    let mtime;
    try { mtime = fs.statSync(file).mtimeMs; } catch { return; }
    if (mtime === indexWatchMtime) return;
    if (mtime === selfWriteMtime) { indexWatchMtime = mtime; selfWriteMtime = 0; return; }
    indexWatchMtime = mtime;
    const data = readLibrary();
    if (data) notifyLibraryChanged(data);
  }, 1200);
}
function startClipServer(){const server=http.createServer(async(req,res)=>{const origin=req.headers.origin||'';const allowed=origin.startsWith('chrome-extension://');res.setHeader('Access-Control-Allow-Origin',allowed?origin:'null');res.setHeader('Access-Control-Allow-Headers','content-type,x-nest-name');if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}if(req.method!=='POST'||!allowed){res.writeHead(403);return res.end('Forbidden')}if(!libraryPath){res.writeHead(409);return res.end('请先启动 Nest 并打开资源库')}if(req.url==='/clip-data'){const mime=String(req.headers['content-type']||'').split(';')[0].toLowerCase(),map={'image/jpeg':'.jpg','image/png':'.png','image/gif':'.gif','image/webp':'.webp','image/svg+xml':'.svg','image/avif':'.avif','image/bmp':'.bmp'};if(!map[mime]){res.writeHead(415);return res.end(`不支持的图片格式：${mime||'未知'}`)}let size=0,temp;const chunks=[];req.on('data',chunk=>{size+=chunk.length;if(size>50*1024*1024)req.destroy(new Error('图片超过 50 MB'));else chunks.push(chunk)});req.on('error',error=>{if(!res.headersSent){res.writeHead(413);res.end(error.message)}});req.on('end',async()=>{try{const raw=decodeURIComponent(String(req.headers['x-nest-name']||'网页图片')).replace(/[\\/:*?"<>|]/g,'_').slice(0,120)||'网页图片';temp=path.join(app.getPath('temp'),`${raw.replace(/\.[^.]+$/,'')}-${crypto.randomUUID()}${map[mime]}`);await fs.promises.writeFile(temp,Buffer.concat(chunks));const result=await enqueueLibraryMutation(()=>importPaths([temp],null));notifyLibraryChanged(result);res.setHeader('content-type','application/json');res.end(JSON.stringify(result?.lastImport||{}))}catch(error){res.writeHead(400);res.end(error.message)}finally{if(temp)await fs.promises.rm(temp,{force:true}).catch(()=>{})}});return}if(req.url!=='/clip'){res.writeHead(404);return res.end('Not found')}let body='';req.on('data',chunk=>{body+=chunk;if(body.length>10000)req.destroy()});req.on('end',async()=>{let temp;try{const {url}=JSON.parse(body);const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol))throw new Error('仅支持网页图片');const response=await fetch(url);if(!response.ok)throw new Error(`下载失败 ${response.status}`);const mime=(response.headers.get('content-type')||'').split(';')[0];const map={'image/jpeg':'.jpg','image/png':'.png','image/gif':'.gif','image/webp':'.webp','image/svg+xml':'.svg','image/avif':'.avif'};if(!map[mime])throw new Error('网页内容不是支持的图片');temp=path.join(app.getPath('temp'),`nest-clip-${crypto.randomUUID()}${map[mime]}`);await fs.promises.writeFile(temp,await responseToBuffer(response));const result=await enqueueLibraryMutation(()=>importPaths([temp],null));notifyLibraryChanged(result);res.setHeader('content-type','application/json');res.end(JSON.stringify(result?.lastImport||{}))}catch(error){res.writeHead(400);res.end(error.message)}finally{if(temp)await fs.promises.rm(temp,{force:true}).catch(()=>{})}})});server.on('error',error=>{if(error.code!=='EADDRINUSE')console.error('Clip server:',error)});server.listen(32145,'127.0.0.1');return server}

function canImportAIFlow(){const data=readLibrary();if(!data)return{error:'请先打开资源库'};if(!requireRole(data,'editor'))return{error:'权限不足'};return{data}}
function aiFlowSourceMetadata(kind,record){const base={provider:'AI Flow',kind,importedAt:Date.now()};if(kind==='server')return{...base,taskId:record.taskId,model:record.model||'',prompt:String(record.prompt||'').slice(0,2000),duration:Number(record.duration)||0,completedAt:Number(record.completedAt)||0,projectId:record.projectId||'',episodeId:record.episodeId||'',versionNumber:record.versionNumber??null};return{...base,relativePath:record.relativePath||'',assetKind:record.kind||''}}
async function importAIFlowLocal(scanId,ids,folderId,report){const permission=canImportAIFlow();if(permission.error)return permission;const {scan,selected}=selectedAIFlowRecords(scanId,ids,'local');const allowed=new Set(await validateLocalAssetSelections(scan.context.root,selected.map(item=>item.path))),records=selected.filter(item=>allowed.has(item.path)),missing=selected.filter(item=>!allowed.has(item.path)).map(item=>`${item.name}: 本机 AI Flow 素材已不存在或不再允许访问`);if(!records.length)return{error:missing[0]||'未找到可导入的 AI Flow 素材'};const metadata=new Map(records.map(record=>[record.path,aiFlowSourceMetadata('local',record)]));const result=await enqueueLibraryMutation(()=>importPaths(records.map(record=>record.path),folderId,{onProgress:report,initialErrors:missing,metadataForPath:file=>metadata.get(file)}));if(result&&!result.error)notifyLibraryChanged(readLibrary());return result}
async function importAIFlowServer(scanId,ids,folderId,report){const permission=canImportAIFlow();if(permission.error)return permission;const {scan,selected}=selectedAIFlowRecords(scanId,ids,'server'),client=aiFlowClient(),downloads=[],errors=[];if(scan.context.baseUrl!==client.baseUrl||scan.context.authMode!==client.authMode)throw new Error('AI Flow 登录方式或服务地址已变化，请刷新列表后再导入');if(client.authMode==='session'&&scan.context.accountId!==currentAIFlowAccount(client.baseUrl)?.id)throw new Error('AI Flow 登录状态已变化，请重新登录并刷新列表');try{for(let index=0;index<selected.length;index++){const video=selected[index];try{const download=await downloadAIFlowVideo(client,video,report,index,selected.length);downloads.push({...download,video})}catch(error){errors.push(`${video.name}: ${redact(error.message)}`)}}if(!downloads.length)return{error:errors[0]||'没有成功下载 AI Flow 视频'};const metadata=new Map(downloads.map(item=>[item.file,aiFlowSourceMetadata('server',item.video)]));const result=await enqueueLibraryMutation(()=>importPaths(downloads.map(item=>item.file),folderId,{onProgress:report,initialErrors:errors,metadataForPath:file=>metadata.get(file)}));if(result&&!result.error)notifyLibraryChanged(readLibrary());return result}finally{await Promise.all(downloads.map(item=>fs.promises.rm(item.directory,{recursive:true,force:true}).catch(()=>{})))}}

ipcMain.handle('library:import', async (event, folderId = null) => { const data=readLibrary();if(!data)return null;const report=progress=>{if(!event.sender.isDestroyed())event.sender.send('library:import-progress',progress)};const r=await dialog.showOpenDialog({title:'导入素材',properties:['openFile','multiSelections'],filters:[{name:'素材与剧本文档',extensions:['jpg','jpeg','png','gif','webp','svg','bmp','avif','mp4','webm','mov','m4v','mp3','wav','flac','aac','m4a','ogg','opus','wma','pdf','docx','txt','md','markdown','fountain']}]});return r.canceled?{...publicLibrary(data),importCanceled:true}:runCancelableLibraryImport(event,signal=>enqueueLibraryMutation(()=>importPaths(r.filePaths,folderId,{onProgress:report,signal}))); });
ipcMain.handle('library:import-folder', async (event, folderId = null) => {const data=readLibrary();if(!data)return null;const report=progress=>{if(!event.sender.isDestroyed())event.sender.send('library:import-progress',progress)};const result=await dialog.showOpenDialog({title:'导入文件夹（保留目录结构）',properties:['openDirectory','multiSelections']});return result.canceled?{...publicLibrary(data),importCanceled:true}:runCancelableLibraryImport(event,signal=>enqueueLibraryMutation(()=>importPaths(result.filePaths,folderId,{preserveFolders:true,onProgress:report,signal})))});
function depthConverterResourcePaths() {
  return resolveConverterPaths({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
  });
}
function sendDepthVideoProgress(webContents, assetId, progress, message = '', details = {}) {
  if (webContents?.isDestroyed()) return;
  const payload = { assetId, message, ...details };
  if (Number.isFinite(progress)) payload.progress = Math.max(0, Math.min(100, progress));
  webContents.send('depth-video:progress', payload);
}
ipcMain.handle('depth-video:status', () => {
  const paths = depthConverterResourcePaths();
  return {
    available: !validateConverterPaths(paths),
    error: validateConverterPaths(paths) || '',
    busy: Boolean(activeDepthVideoConversion),
  };
});
ipcMain.handle('depth-video:convert', async (event, assetId) => {
  if (activeDepthVideoConversion) return { error: '已有深度视频正在转换，请等待当前任务完成' };
  const data = readLibrary();
  if (!data) return { error: '请先打开资源库' };
  if (!requireRole(data, 'editor')) return { error: '权限不足' };
  const asset = data.assets.find(item => item.id === String(assetId || ''));
  if (!asset) return { error: '素材不存在或已被删除' };
  if (!isVideoAsset(asset)) return { error: '只能转换视频素材' };
  const input = storedAssetPath(asset.file);
  if (!fs.existsSync(input)) return { error: '素材原文件不存在' };
  const resources = depthConverterResourcePaths();
  const resourceError = validateConverterPaths(resources);
  if (resourceError) return { error: resourceError };
  const safeStem = path.basename(asset.name || '视频').replace(/[\\/:*?"<>|]/g, '_').slice(0, 100) || '视频';
  const conversionId = crypto.randomUUID();
  const directory = path.join(app.getPath('temp'), `nest-depth-video-${crypto.randomUUID()}`);
  const output = path.join(directory, `${safeStem} 深度视频.mp4`);
  const job = {
    assetId: asset.id,
    senderId: event.sender.id,
    webContents: event.sender,
    startedAt: Date.now(),
    progress: 0,
    phase: 'starting',
    cancelRequested: false,
    controller: new AbortController(),
  };
  activeDepthVideoConversion = job;
  sendDepthVideoProgress(event.sender, asset.id, 0, '正在启动深度视频转换器…', { phase: job.phase, cancelRequested: false });
  try {
    await fs.promises.mkdir(directory, { recursive: true });
    job.phase = 'converting';
    await runDepthVideoConverter({
      executable: resources.executable,
      input,
      output,
      model: resources.model,
      style: '灰度深度',
      signal: job.controller.signal,
      onProgress: progress => {
        job.progress = progress;
        sendDepthVideoProgress(event.sender, asset.id, progress, `正在转换深度视频… ${Math.round(progress)}%`, { phase: job.phase, cancelRequested: job.cancelRequested });
      },
      onLog: message => sendDepthVideoProgress(event.sender, asset.id, undefined, message, { phase: job.phase, cancelRequested: job.cancelRequested }),
    });
    job.phase = 'importing';
    sendDepthVideoProgress(event.sender, asset.id, 100, '深度视频已生成，正在导入素材库…', { phase: job.phase, cancelRequested: false });
    const result = await enqueueLibraryMutation(async () => {
      const latest = readLibrary();
      const original = latest?.assets.find(item => item.id === asset.id);
      if (!original) return { error: '原视频在转换期间已被删除，结果未导入' };
      return importPaths([output], original.folderId, {
        metadataForPath: () => ({
          provider: '深度视频转换器',
          sourceAssetId: original.id,
          sourceName: original.name,
          outputStyle: '灰度深度',
          conversionId,
          convertedAt: Date.now(),
        }),
      });
    });
    if (result?.error) return result;
    const library = readLibrary();
    const generated = library?.assets.find(item => item.importSource?.conversionId === conversionId);
    if (library) notifyLibraryChanged(library);
    sendDepthVideoProgress(event.sender, asset.id, 100, '深度视频已导入到原素材文件夹', { phase: 'complete', cancelRequested: false });
    return { ok: true, library: publicLibrary(library), assetId: generated?.id || null };
  } catch (error) {
    if (isDepthVideoCancelledError(error) || job.controller.signal.aborted) {
      sendDepthVideoProgress(event.sender, asset.id, job.progress, '已取消深度视频转换，未生成素材', { phase: 'cancelled', cancelRequested: true });
      return { cancelled: true };
    }
    return { error: `深度视频转换失败：${redact(error.message)}` };
  } finally {
    if (activeDepthVideoConversion === job) activeDepthVideoConversion = null;
    await fs.promises.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
});
ipcMain.handle('depth-video:cancel', (event, assetId) => {
  const job = activeDepthVideoConversion;
  if (!job) return { ok: false, error: '当前没有正在转换的深度视频' };
  if (job.senderId !== event.sender.id || job.assetId !== String(assetId || '')) return { ok: false, error: '当前窗口没有可取消的深度视频任务' };
  if (job.phase === 'importing') return { ok: false, error: '深度视频已生成，正在导入素材库，无法取消' };
  if (job.cancelRequested) return { ok: true, pending: true };
  job.cancelRequested = true;
  job.phase = 'cancelling';
  job.controller.abort();
  sendDepthVideoProgress(job.webContents, job.assetId, job.progress, '正在取消深度视频转换…', { phase: job.phase, cancelRequested: true });
  return { ok: true };
});
ipcMain.handle('aiflow:settings',async()=>{try{return await publicAIFlowSettingsWithSessionStatus()}catch(error){return{error:redact(error.message)}}});
ipcMain.handle('aiflow:save-settings',async(_,input={})=>{try{saveAIFlowSettings(input);return{ok:true,settings:await publicAIFlowSettingsWithSessionStatus()}}catch(error){return{error:redact(error.message)}}});
ipcMain.handle('aiflow:auth-status',async()=>{try{return await readAIFlowSessionStatus(readAIFlowSettings().baseUrl)}catch(error){return{authenticated:false,account:null,error:redact(error.message)}}});
ipcMain.handle('aiflow:sign-in',async event=>{try{const settings=readAIFlowSettings();if(settings.authMode!=='session')return{error:'请先选择“账号登录”'};const status=await readAIFlowSessionStatus(settings.baseUrl);if(status.authenticated)return{ok:true,account:status.account,settings:await publicAIFlowSettingsWithSessionStatus()};const result=await openAIFlowLogin(BrowserWindow.fromWebContents(event.sender),settings.baseUrl);return result?.ok?{...result,settings:await publicAIFlowSettingsWithSessionStatus()}:result}catch(error){return{error:redact(error.message)}}});
ipcMain.handle('aiflow:sign-out',async()=>{try{await logoutAIFlowSession(readAIFlowSettings().baseUrl);pendingAIFlowAssetLink=null;pendingAIFlowUpload=null;pendingAIFlowReferenceAttachment=null;let library=null,detached={roots:0,folders:0};if(libraryPath){library=await enqueueLibraryMutation(()=>{const data=readLibrary();if(!data)return null;detached=detachAIFlowFolderConnections(data);writeJson(indexFile(libraryPath),data);notifyLibraryChanged(data);return publicLibrary(data)})}return{ok:true,settings:await publicAIFlowSettingsWithSessionStatus(),library,detached}}catch(error){return{error:redact(error.message)}}});
ipcMain.handle('aiflow:test-connection',async()=>{try{const client=aiFlowClient(),result=await client.testConnection();if(client.authMode==='session'&&result.account)aiFlowAuthState={baseUrl:client.baseUrl,user:result.account,authenticatedAt:Date.now()};return result}catch(error){return{error:redact(error.message)}}});
ipcMain.handle('aiflow:list-server-videos',async()=>{try{const client=aiFlowClient();let account=null;if(client.authMode==='session'){const status=await readAIFlowSessionStatus(client.baseUrl);if(!status.authenticated)return{error:'请先登录 AI Flow 账号'};account=status.account}const videos=await client.listCompletedVideos();return rememberAIFlowScan('server',videos,{baseUrl:client.baseUrl,authMode:client.authMode,accountId:account?.id||'',sourceLabel:client.authMode==='session'?'AI Flow 已登录账号':'AI Flow 服务'})}catch(error){return{error:redact(error.message)}}});
ipcMain.handle('aiflow:list-local-videos',async()=>{try{const settings=readAIFlowSettings(),result=await listLocalAssets(settings.localRoot);return rememberAIFlowScan('local',result.assets,{root:result.root,scanned:result.scanned,truncated:result.truncated,sourceLabel:'本机 AI Flow 素材'})}catch(error){return{error:redact(error.message)}}});
ipcMain.handle('aiflow:import-server-videos',async(event,scanId,ids,folderId)=>{const report=progress=>{if(!event.sender.isDestroyed())event.sender.send('library:import-progress',progress)};try{return await importAIFlowServer(scanId,ids,folderId,report)}catch(error){return{error:redact(error.message)}}});
ipcMain.handle('aiflow:import-local-videos',async(event,scanId,ids,folderId)=>{const report=progress=>{if(!event.sender.isDestroyed())event.sender.send('library:import-progress',progress)};try{return await importAIFlowLocal(scanId,ids,folderId,report)}catch(error){return{error:redact(error.message)}}});
ipcMain.handle('aiflow:begin-asset-link',async(_,assetId)=>{try{return await beginAIFlowAssetLink(assetId)}catch(error){return{error:redact(error.message)}}});
ipcMain.handle('aiflow:cancel-asset-link',async(_,assetId)=>{try{return await cancelAIFlowAssetLink(assetId)}catch(error){return{error:redact(error.message)}}});
ipcMain.handle('aiflow:unlink-asset-link',async(_,assetId,mappingId)=>{try{return await unlinkAIFlowAssetLink(assetId,mappingId)}catch(error){return{error:redact(error.message)}}});
ipcMain.handle('aiflow:begin-extension-upload',async(_,assetIds,options)=>{try{return beginAIFlowExtensionUpload(assetIds,null,options)}catch(error){return{error:redact(error.message)}}});
ipcMain.handle('aiflow:begin-folder-extension-upload',async(_,folderId)=>{try{return beginAIFlowFolderExtensionUpload(folderId)}catch(error){return{error:redact(error.message)}}});
ipcMain.handle('aiflow:set-live-sync',async(_,folderId,enabled)=>{try{return await enqueueLibraryMutation(()=>{const data=collectorPermission();const result=setRootLiveSync(data,folderId,enabled);let queued=0;if(result.enabled){const ids=collectFolderSubtreeIds(data.folders,result.folder.id);queued=queueAssetsForLiveSync(data,data.assets.filter(asset=>ids.has(asset.folderId)))}writeJson(indexFile(libraryPath),data);notifyLibraryChanged(data);return{ok:true,enabled:result.enabled,folderName:result.folder.name,queued,library:publicLibrary(data)}})}catch(error){return{error:redact(error.message)}}});
ipcMain.handle('library:cancel-import', event => {const controller=activeImportControllers.get(event.sender.id);if(!controller)return{ok:false};controller.abort();return{ok:true}});
ipcMain.handle('library:import-dropped', (event, paths, folderId = null) => {const report=progress=>{if(!event.sender.isDestroyed())event.sender.send('library:import-progress',progress)};if(paths.length)return runCancelableLibraryImport(event,signal=>enqueueLibraryMutation(()=>importPaths(paths,folderId,{preserveFolders:false,preserveTopLevelFolders:true,dedupeByFolder:true,onProgress:report,signal})));const data=readLibrary();if(!data)return null;data.lastImport={imported:0,duplicates:0,errors:['浏览器没有提供图片网址，请从图片本身拖入，或使用 Nest 网页采集扩展右键保存'],finishedAt:Date.now()};return publicLibrary(data)});
ipcMain.handle('library:import-url', async (_, url, folderId = null) => {let temp;try{if(!libraryPath)return null;const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol))throw new Error('仅支持网页图片网址');const response=await fetch(url);if(!response.ok)throw new Error(`下载失败 ${response.status}`);const mime=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();const map={'image/jpeg':'.jpg','image/png':'.png','image/gif':'.gif','image/webp':'.webp','image/svg+xml':'.svg','image/avif':'.avif','image/bmp':'.bmp'};if(!map[mime])throw new Error('拖入的网页内容不是支持的图片');temp=path.join(app.getPath('temp'),`nest-drop-${crypto.randomUUID()}${map[mime]}`);await fs.promises.writeFile(temp,await responseToBuffer(response));return await enqueueLibraryMutation(()=>importPaths([temp],folderId))}catch(error){const data=readLibrary();if(!data)return{error:error.message};data.lastImport={imported:0,duplicates:0,errors:[error.message],finishedAt:Date.now()};return publicLibrary(data)}finally{if(temp)await fs.promises.rm(temp,{force:true}).catch(()=>{})}});
ipcMain.handle('library:open-asset', async (_, id) => {const asset=readLibrary()?.assets.find(a=>a.id===id);if(!asset)return{error:'素材不存在或已被删除'};try{const error=await shell.openPath(storedAssetPath(asset.file));return error?{error:`无法打开素材：${error}`}:{ok:true}}catch(error){return{error:`无法打开素材：${error.message}`}}});
ipcMain.handle('library:reveal-asset', (_, id, migrate = false) => enqueueLibraryMutation(()=>{const data=readLibrary(),asset=data?.assets.find(a=>a.id===id);if(!asset)return{error:'素材不存在或已被删除'};try{if(migrate&&migrateAssetFilename(data,asset))writeJson(indexFile(libraryPath),data);shell.showItemInFolder(storedAssetPath(asset.file));return{ok:true,library:publicLibrary(data)}}catch(error){return{error:`无法在资源管理器中显示：${error.message}`}}}));
ipcMain.handle('library:copy-path', (_, id) => enqueueLibraryMutation(()=>{const data=readLibrary(),asset=data?.assets.find(a=>a.id===id);if(!asset)return{error:'素材不存在或已被删除'};try{if(migrateAssetFilename(data,asset))writeJson(indexFile(libraryPath),data);clipboard.writeText(storedAssetPath(asset.file));return{ok:true,library:publicLibrary(data)}}catch(error){return{error:`无法复制路径：${error.message}`}}}));
ipcMain.handle('library:copy-folder-path', (_, id) => {const asset=readLibrary()?.assets.find(a=>a.id===id);if(!asset)return{error:'素材不存在或已被删除'};try{clipboard.writeText(path.dirname(storedAssetPath(asset.file)));return{ok:true}}catch(error){return{error:`无法复制所在目录：${error.message}`}}});
ipcMain.handle('library:copy-asset', async (_, id) => {const asset=readLibrary()?.assets.find(a=>a.id===id);if(!asset)return{error:'素材不存在或已被删除'};try{const file=storedAssetPath(asset.file);if(!fs.existsSync(file))return{error:'素材原文件不存在'};if(process.platform==='win32'){const encoded=Buffer.from(file,'utf8').toString('base64');const script=`Add-Type -AssemblyName System.Windows.Forms;$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'));$files=New-Object System.Collections.Specialized.StringCollection;$files.Add($p)>$null;[Windows.Forms.Clipboard]::SetFileDropList($files)`;await new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-STA','-NoProfile','-NonInteractive','-Command',script],{windowsHide:true});let error='';child.stderr.on('data',chunk=>error+=chunk);child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(error.trim()||`PowerShell exited with code ${code}`)))})}else clipboard.writeText(file);return{ok:true,kind:'file'}}catch(error){return{error:`复制文件失败：${error.message}`}}});
ipcMain.handle('app:open-bug-feedback', event => {try{const parent=BrowserWindow.fromWebContents(event.sender);const existing=BrowserWindow.getAllWindows().find(win=>win.__nestBugFeedback);if(existing){existing.show();existing.focus();return{ok:true}}const win=new BrowserWindow({width:1080,height:760,minWidth:720,minHeight:520,title:'小旺仔素材库 · Bug 反馈',parent:parent||undefined,icon:path.join(app.getAppPath(),'build','icon.png'),backgroundColor:'#15191e',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});win.__nestBugFeedback=true;win.loadURL('https://docs.qq.com/form/page/DV2JNUUd3cEVqSHZt');win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:/.test(url)){win.loadURL(url);return{action:'deny'}}return{action:'deny'}});return{ok:true}}catch(error){return{error:`无法打开 Bug 反馈：${error.message}`}}});
ipcMain.handle('app:set-fullscreen',(event,enabled)=>{const win=BrowserWindow.fromWebContents(event.sender);if(!win||win.isDestroyed())return{error:'窗口不可用'};win.setFullScreen(Boolean(enabled));return{ok:true,fullscreen:win.isFullScreen()}});
ipcMain.handle('app:set-inspector-open',(event,open,width=350,options={})=>{const win=BrowserWindow.fromWebContents(event.sender);if(!win||win.isDestroyed())return{error:'窗口不可用'};const immediate=Boolean(options?.immediate);let record=inspectorWindows.get(win);if(open){if(record?.open)return{ok:true,added:record.added};const restoreMaximized=win.isMaximized();if(restoreMaximized)win.unmaximize();const base=win.getBounds(),workArea=screen.getDisplayMatching(base).workArea,target=inspectorBounds(base,workArea,Math.max(280,Math.min(460,Number(width)||350)));record={open:true,base,added:target.added,restoreMaximized,animation:null};inspectorWindows.set(win,record);if(immediate)win.setBounds(target,false);else animateWindowBounds(win,target);return{ok:true,added:target.added,restoreMaximized}}if(!record?.open)return{ok:true,added:0};if(record.animation)clearTimeout(record.animation);record.open=false;const closeTarget=record.base;if(immediate){win.setBounds(closeTarget,false);if(record.restoreMaximized)win.maximize();inspectorWindows.delete(win)}else{animateWindowBounds(win,closeTarget);setTimeout(()=>{if(!win.isDestroyed()&&record.restoreMaximized)win.maximize();inspectorWindows.delete(win)},260)}return{ok:true,added:0}});
ipcMain.handle('app:window-control',(event,action)=>{const win=BrowserWindow.fromWebContents(event.sender);if(!win||win.isDestroyed())return{error:'窗口不可用'};if(action==='minimize')win.minimize();else if(action==='maximize')win.isMaximized()?win.unmaximize():win.maximize();else if(action==='close')win.close();else return{error:'未知窗口操作'};return{ok:true,maximized:!win.isDestroyed()&&win.isMaximized()}});
ipcMain.handle('app:set-title-bar-colors',(event,colors={})=>{const win=BrowserWindow.fromWebContents(event.sender);if(process.platform!=='win32'||!win||win.isDestroyed())return{ok:true};const valid=value=>/^#[0-9a-f]{6}$/i.test(String(value||''));if(!valid(colors.background)||!valid(colors.symbols))return{error:'标题栏颜色无效'};win.setTitleBarOverlay({color:colors.background,symbolColor:colors.symbols,height:44});return{ok:true,native:true}});
ipcMain.handle('app:check-update', async () => {try{const response=await net.fetch('https://api.github.com/repos/xwz561/Nest-Asset-Library/releases/latest',{headers:{Accept:'application/vnd.github+json','User-Agent':'Small-Wangzai-Asset-Library'}});if(!response.ok)throw new Error(`GitHub 返回 ${response.status}`);const release=await response.json(),latest=String(release.tag_name||'').replace(/^v/i,''),current=app.getVersion(),available=newerVersion(latest,current),assets=Array.isArray(release.assets)?release.assets:[],portable=Boolean(process.env.PORTABLE_EXECUTABLE_FILE),selection=chooseUpdateAsset({platform:process.platform,arch:process.arch,portable,assets});return{ok:true,current,latest,available,installKind:selection.installKind,releaseUrl:release.html_url,downloadUrl:selection.asset?.browser_download_url||'',downloadName:selection.asset?.name||'',downloadDigest:selection.asset?.digest||'',notes:String(release.body||'').slice(0,3000),publishedAt:release.published_at||'',missingPackage:available&&!selection.asset}}catch(error){return{error:`检查更新失败：${error.message}`}}});
ipcMain.handle('app:open-update', async (_, url) => {try{if(!/^https:\/\/github\.com\//i.test(String(url)))return{error:'更新地址无效'};await shell.openExternal(url);return{ok:true}}catch(error){return{error:`无法打开更新地址：${error.message}`}}});
ipcMain.handle('app:download-update', async (event, options) => {let tempFile;try{const url=String(options?.url||''),name=path.basename(String(options?.name||'')),digest=String(options?.digest||'');if(!/^https:\/\/github\.com\//i.test(url)||!name)return{error:'没有适合当前设备的更新安装包'};const expected=/^sha256:([a-f0-9]{64})$/i.exec(digest)?.[1]?.toLowerCase();if(!expected)return{error:'更新包缺少 SHA256 校验信息，已拒绝下载'};const target=path.join(app.getPath('downloads'),name),temp=`${target}.download`;tempFile=temp;await fs.promises.rm(temp,{force:true});const response=await net.fetch(url);if(!response.ok||!response.body)throw new Error(`下载服务器返回 ${response.status}`);const total=Number(response.headers.get('content-length')||0),reader=response.body.getReader(),output=await fs.promises.open(temp,'w'),hash=crypto.createHash('sha256');let received=0;try{for(;;){const {done,value}=await reader.read();if(done)break;const chunk=Buffer.from(value);await output.write(chunk);hash.update(chunk);received+=value.byteLength;if(!event.sender.isDestroyed())event.sender.send('app:update-progress',{received,total,percent:total?Math.min(100,received/total*100):0})}}finally{await output.close();reader.releaseLock()}const actual=hash.digest('hex');if(actual!==expected)throw new Error(`SHA256 校验失败（期望 ${expected.slice(0,12)}…，实际 ${actual.slice(0,12)}…）`);await fs.promises.rm(target,{force:true});await fs.promises.rename(temp,target);return{ok:true,filePath:target,verified:true}}catch(error){if(tempFile)await fs.promises.rm(tempFile,{force:true}).catch(()=>{});return{error:`下载更新失败：${error.message}`}}});
ipcMain.handle('app:install-update', async (_, filePath) => {let releasedLock=false;try{const resolved=path.resolve(String(filePath||'')),downloads=path.resolve(app.getPath('downloads'));if(path.dirname(resolved)!==downloads||!fs.existsSync(resolved))return{error:'更新文件不存在或地址无效'};if(process.platform==='win32'&&/\.exe$/i.test(resolved)){const portableExe=process.env.PORTABLE_EXECUTABLE_FILE&&path.resolve(process.env.PORTABLE_EXECUTABLE_FILE);let child;if(portableExe&&fs.existsSync(portableExe)){const userData=app.getPath('userData'),script=path.join(userData,'portable-updater.ps1'),launcher=path.join(userData,'portable-updater.cmd'),logDir=path.join(userData,'logs'),log=path.join(logDir,'updater.log'),backup=`${portableExe}.old`,cmdQuote=value=>`"${String(value).replace(/"/g,'""')}"`;await fs.promises.mkdir(logDir,{recursive:true});await fs.promises.writeFile(script,portableUpdaterScript,'utf8');const powershellArgs=['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-ParentPid',String(process.pid),'-CurrentExe',portableExe,'-NewExe',resolved,'-BackupExe',backup,'-LogFile',log].map(cmdQuote).join(' ');const launcherBody=`@echo off\r\necho %date% %time% Launcher started>>${cmdQuote(log)}\r\nstart "" /min powershell.exe ${powershellArgs}\r\n`;await fs.promises.writeFile(launcher,launcherBody,'utf8');child=spawn('cmd.exe',['/d','/s','/c',launcher],{detached:true,stdio:'ignore',windowsHide:true})}else child=spawn(resolved,[],{detached:true,stdio:'ignore',windowsHide:false});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});child.unref();app.releaseSingleInstanceLock();releasedLock=true;setTimeout(()=>{for(const win of BrowserWindow.getAllWindows())win.destroy();app.exit(0)},750);return{ok:true,quitting:true,updater:portableExe?'portable':'installer'}}const error=await shell.openPath(resolved);return error?{error:`无法打开更新文件：${error}`}:{ok:true}}catch(error){if(releasedLock)app.requestSingleInstanceLock();return{error:`无法安装更新：${error.message}`}}});
ipcMain.on('library:start-external-drag', (event, requestedIds) => {try{const data=readLibrary(),ids=new Set(Array.isArray(requestedIds)?requestedIds:[requestedIds]),assets=data?.assets.filter(item=>ids.has(item.id)&&item.file)||[];if(!data||!assets.length)return;const files=assets.map(asset=>storedAssetPath(asset.file)).filter(file=>fs.existsSync(file));if(!files.length)return;const iconPath=path.join(app.getAppPath(),'build','icon.png'),dragIcon=nativeImage.createFromPath(iconPath);if(dragIcon.isEmpty())throw new Error(`拖拽图标无法读取：${iconPath}`);const dragOptions={file:files[0],icon:dragIcon.resize({width:32,height:32,quality:'best'})};if(files.length>1)dragOptions.files=files;event.sender.startDrag(dragOptions)}catch(error){console.error('External drag:',error);if(!event.sender.isDestroyed())event.sender.send('library:external-drag-error',error.message)}});
ipcMain.handle('library:export-asset', async (_, id) => {const asset=readLibrary()?.assets.find(a=>a.id===id);if(!asset)return{error:'素材不存在或已被删除'};try{const result=await dialog.showSaveDialog({title:'导出原始文件',defaultPath:asset.originalName||`${asset.name}${path.extname(asset.file)}`});if(result.canceled||!result.filePath)return{canceled:true};await fs.promises.copyFile(storedAssetPath(asset.file),result.filePath);return{ok:true,filePath:result.filePath}}catch(error){return{error:`导出失败：${error.message}`}}});
ipcMain.handle('library:duplicate-asset', (_, id) => enqueueLibraryMutation(async()=>{const data=readLibrary();if(!data)return null;const asset=data.assets.find(a=>a.id===id);if(!asset)return{error:'素材不存在或已被删除'};try{const ext=path.extname(asset.file),name=`${asset.name} 副本`,file=readableAssetFilename(data,name,ext);await fs.promises.copyFile(storedAssetPath(asset.file),storedAssetPath(file));data.assets.unshift({...asset,id:crypto.randomUUID(),file,name,originalName:file,favorite:false,createdAt:Date.now(),modifiedAt:Date.now()});writeJson(indexFile(libraryPath),data);return publicLibrary(data)}catch(error){return{error:`复制素材失败：${error.message}`}}}));
ipcMain.handle('extension:prepare', async (_, browser) => {const macApplications='/Applications',choices={chrome:{name:'Google Chrome',url:'chrome://extensions',paths:process.platform==='darwin'?[path.join(macApplications,'Google Chrome.app','Contents','MacOS','Google Chrome')]:[path.join(process.env.PROGRAMFILES||'', 'Google','Chrome','Application','chrome.exe'),path.join(process.env['PROGRAMFILES(X86)']||'', 'Google','Chrome','Application','chrome.exe'),path.join(process.env.LOCALAPPDATA||'', 'Google','Chrome','Application','chrome.exe')]},edge:{name:'Microsoft Edge',url:'edge://extensions',paths:process.platform==='darwin'?[path.join(macApplications,'Microsoft Edge.app','Contents','MacOS','Microsoft Edge')]:[path.join(process.env['PROGRAMFILES(X86)']||'', 'Microsoft','Edge','Application','msedge.exe'),path.join(process.env.PROGRAMFILES||'', 'Microsoft','Edge','Application','msedge.exe')]}};const choice=choices[browser];if(!choice)return{ok:false,error:'不支持的浏览器'};const source=app.isPackaged?path.join(process.resourcesPath,'app.asar.unpacked','browser-extension'):path.join(app.getAppPath(),'browser-extension'),target=path.join(app.getPath('userData'),'Nest 网页采集器');try{if(!fs.existsSync(path.join(source,'manifest.json')))throw new Error('安装包中缺少网页采集扩展，请安装最新版本');await fs.promises.rm(target,{recursive:true,force:true});await fs.promises.cp(source,target,{recursive:true});const exe=choice.paths.find(p=>p&&fs.existsSync(p));if(!exe)return{ok:false,error:`没有检测到 ${choice.name}`,path:target};spawn(exe,[choice.url],{detached:true,stdio:'ignore'}).unref();clipboard.writeText(target);shell.showItemInFolder(path.join(target,'manifest.json'));return{ok:true,browser:choice.name,path:target}}catch(error){return{ok:false,error:error.message}}});
ipcMain.handle('library:update-asset', (_, id, changes) => enqueueLibraryMutation(() => {
  const data = readLibrary();
  if (!data) return null;
  const asset = data.assets.find(item => item.id === id);
  if (!asset) return publicLibrary(data);
  try {
    const previousFolderId = asset.folderId;
    const nextName = String(changes?.name ?? asset.name).trim() || asset.name;
    if (nextName !== asset.name) migrateAssetFilename(data, asset, nextName);
    Object.assign(asset, changes, { id: asset.id, file: asset.file, name: nextName, modifiedAt: Date.now() });
    if (Array.isArray(changes?.tags)) asset.tagSources = Object.fromEntries(changes.tags.map(tag => [tag, 'user']));
    if (changes && 'folderId' in changes) {
      syncPhysicalFolders(libraryPath, data);
      const move = queueAIFlowMovesForAsset(data, asset, previousFolderId);
      if (move.linked) removePendingLiveUploads(data, [asset.id]);
      else queueAssetsForLiveSync(data, [asset]);
      publishAIFlowLiveWake();
    }
    writeJson(indexFile(libraryPath), data);
    return publicLibrary(data);
  } catch (error) {
    return { error: `重命名文件失败：${error.message}` };
  }
}));
ipcMain.handle('library:batch-update', (_, ids, changes) => enqueueLibraryMutation(() => {
  const data = readLibrary();
  if (!data) return null;
  if (changes?.folderId && !data.folders.some(folder => folder.id === changes.folderId)) return { error: '目标文件夹不存在或已被删除' };
  const selected = new Set(Array.isArray(ids) ? ids : []);
  const previousFolders = new Map(data.assets.filter(asset => selected.has(asset.id)).map(asset => [asset.id, asset.folderId]));
  data.assets = data.assets.map(asset => {
    if (!selected.has(asset.id)) return asset;
    const tags = changes.addTag ? [...new Set([...(asset.tags || []), changes.addTag])] : (changes.tags || asset.tags);
    const tagSources = Array.isArray(changes.tags)
      ? Object.fromEntries(tags.map(tag => [tag, 'user']))
      : { ...(asset.tagSources || {}), ...(changes.addTag ? { [changes.addTag]: 'user' } : {}) };
    return { ...asset, ...changes, id: asset.id, file: asset.file, tags, tagSources, modifiedAt: Date.now() };
  });
  if (changes.addTag) data.assets = data.assets.map(asset => { const { addTag, ...rest } = asset; return rest; });
  if (Object.prototype.hasOwnProperty.call(changes || {}, 'folderId')) {
    syncPhysicalFolders(libraryPath, data);
    for (const asset of data.assets.filter(item => selected.has(item.id))) {
      const move = queueAIFlowMovesForAsset(data, asset, previousFolders.get(asset.id));
      if (move.linked) removePendingLiveUploads(data, [asset.id]);
      else queueAssetsForLiveSync(data, [asset]);
    }
    publishAIFlowLiveWake();
  }
  writeJson(indexFile(libraryPath), data);
  return publicLibrary(data);
}));
ipcMain.handle('library:batch-rename', (_, ids, template) => enqueueLibraryMutation(()=>{const data=readLibrary();if(!data)return null;const plan=buildBatchRenamePlan(ids,data.assets,data.folders,template);if(!plan.length)return{error:'没有可重命名的素材'};const changed=[];try{for(const item of plan){const asset=data.assets.find(candidate=>candidate.id===item.id);if(!asset)continue;const before={asset,file:asset.file,originalName:asset.originalName,name:asset.name};migrateAssetFilename(data,asset,item.newName);asset.name=item.newName;asset.modifiedAt=Date.now();changed.push(before)}syncPhysicalFolders(libraryPath,data);writeJson(indexFile(libraryPath),data);return publicLibrary(data)}catch(error){for(const before of changed.reverse()){try{const current=storedAssetPath(before.asset.file),original=storedAssetPath(before.file);if(current!==original&&fs.existsSync(current)&&!fs.existsSync(original)){fs.mkdirSync(path.dirname(original),{recursive:true});fs.renameSync(current,original)}}catch{}Object.assign(before.asset,{file:before.file,originalName:before.originalName,name:before.name})}return{error:`批量重命名失败：${error.message}`}}}));
ipcMain.handle('library:batch-delete', (_, ids) => enqueueLibraryMutation(async()=>{const data=readLibrary();if(!data)return null;const selected=new Set(ids),removed=new Set(),errors=[];let detachedAIFlowLinks=0;for(const asset of data.assets.filter(a=>selected.has(a.id))){try{const target=storedAssetPath(asset.file);if(fs.existsSync(target))await moveToRecycleBin(target,{trashItem:shell.trashItem});detachedAIFlowLinks+=detachAIFlowAssetConnections(data,asset).mappings;removed.add(asset.id)}catch(error){errors.push(`${asset.name}: ${error.message}`)}}data.assets=data.assets.filter(a=>!removed.has(a.id));syncPhysicalFolders(libraryPath,data);data.lastDelete={removed:removed.size,detachedAIFlowLinks,errors,finishedAt:Date.now()};writeJson(indexFile(libraryPath),data);if(removed.size)publishAIFlowLiveWake();return publicLibrary(data)}));
ipcMain.handle('library:delete-asset', (_, id) => enqueueLibraryMutation(async()=>{const data=readLibrary();if(!data)return null;const asset=data.assets.find(a=>a.id===id);if(!asset)return publicLibrary(data);try{const target=storedAssetPath(asset.file);if(fs.existsSync(target))await moveToRecycleBin(target,{trashItem:shell.trashItem});const detachedAIFlowLinks=detachAIFlowAssetConnections(data,asset).mappings;data.assets=data.assets.filter(a=>a.id!==id);syncPhysicalFolders(libraryPath,data);writeJson(indexFile(libraryPath),data);publishAIFlowLiveWake();return{...publicLibrary(data),detachedAIFlowLinks}}catch(error){return{error:`无法将“${asset.name}”移入回收站：${error.message}`}}}));

ipcMain.handle('ai:settings',()=>publicAISettings());
ipcMain.handle('ai:save-settings',(_,settings)=>{try{return{ok:true,settings:saveAISettings(settings)}}catch(error){return{error:redact(error.message)}}});
ipcMain.handle('ai:test-provider',async(_,providerId)=>{try{return await aiRouter().get(providerId).testConnection()}catch(error){return{error:redact(error.message)}}});
ipcMain.handle('ai:task',(_,id)=>aiTasks.get(id)||null);
ipcMain.handle('ai:tasks',()=>aiTasks.list());
ipcMain.handle('ai:cancel-task',(_,id)=>({ok:aiTasks.cancel(id)}));
ipcMain.handle('ai:pause-task',(_,id)=>({ok:aiTasks.pause(id)}));
ipcMain.handle('ai:resume-task',(_,id)=>({ok:aiTasks.resume(id)}));
ipcMain.handle('ai:retry-task',(_,id)=>({id:aiTasks.retry(id)}));
ipcMain.handle('ai:audit',()=>{const data=readLibrary();return(data?.aiAudit||[]).slice(-100).reverse()});
ipcMain.handle('ai:usage',()=>readAIUsage());

const aiJsonSchema={analysis:{assetType:'string',scene:'string',objects:['string'],lighting:'string',colors:['string'],composition:'string',tags:['string'],description:'string'},tags:{items:[{assetId:'string',tags:['string'],reason:'string'}]},classify:{items:[{assetId:'string',targetFolderId:'string|null',targetFolderName:'string',confidence:'0..1',tags:['string'],reason:'string'}]},rename:{items:[{assetId:'string',oldName:'string',newName:'string',reason:'string'}]},search:{assetIds:['string'],summary:'string'},chat:{answer:'string',suggestedActions:[]}};
function aiPrompt(operation,context,prompt=''){
  const base=`你是“小旺仔素材库”的影视素材 AI 管理助手。必须遵守当前文件夹体系，不能臆造素材 ID 或文件夹 ID。当前上下文：${JSON.stringify(context)}`;
  const instructions={analysis:'分析图片类型、场景、主体、光线、色调、构图、标签和描述。',tags:'为选中素材建议简洁中文标签。',classify:'把选中素材分类到已有文件夹，必须返回 confidence；低置信度可以 targetFolderId=null。',rename:'为选中素材建议统一、可读且不含扩展名的新名称，不执行操作。',search:`把自然语言查询转换为当前素材 ID 结果。查询：${prompt}`,chat:`结合上下文回答，并且只提出建议，不直接操作文件。用户：${prompt}`};return`${base}\n任务：${instructions[operation]||prompt}\n严格输出 JSON。`}
function imageDataForAsset(asset){if(!asset?.file||!String(asset.type).startsWith('image/'))return null;const file=storedAssetPath(asset.file),stat=fs.statSync(file);if(stat.size>15*1024*1024)throw new Error('图片超过 AI 分析上限 15 MB');return`data:${asset.type};base64,${fs.readFileSync(file).toString('base64')}`}
async function runAIRequest(operation,payload,progress=()=>{},signal){
  const data=readLibrary();
  if(!data)throw new Error('请先打开资源库');
  const settings=readAISettings();
  if(!settings.enabled)throw new Error('AI 助手已关闭');
  const context=buildAIContext(publicLibrary(data),payload.context||{}),providerId=payload.providerId||settings.defaultProviderId;
  progress(0,1);
  if(operation==='duplicates'){
    const groups=duplicateGroups(data.assets),assetIds=[...new Set(groups.flatMap(group=>group.assetIds))];
    progress(1,1);return{operation,providerId:'local',result:{groups,assetIds,summary:`发现 ${groups.length} 组完全重复素材`},usage:null,context:{selectedCount:context.selectedAssets.length}};
  }
  if(operation==='similar'){
    const sourceId=payload.assetId||context.selectedAssets[0]?.id;if(!sourceId)throw new Error('请先选择一个素材');
    const items=similarAssets(data.assets,sourceId,24),assetIds=items.map(item=>item.assetId);
    progress(1,1);return{operation,providerId:'local',result:{sourceId,items,assetIds,summary:`找到 ${items.length} 个相似素材`},usage:null,context:{selectedCount:context.selectedAssets.length}};
  }
  const provider=aiRouter().get(providerId);let result;
  if(operation==='analyze'){
    const asset=data.assets.find(item=>item.id===(payload.assetId||context.selectedAssets[0]?.id));if(!asset)throw new Error('请先选择一个素材');const image=imageDataForAsset(asset);if(!image)throw new Error('V1 图片分析仅支持图片素材');result=await provider.analyzeImage({prompt:aiPrompt('analysis',{...context,assets:undefined},payload.prompt),imageDataUrl:image,schema:aiJsonSchema.analysis,signal});
  }else{
    const response=await provider.chat({messages:[{role:'system',content:'你是安全、克制的素材库 AI Copilot。严格输出 JSON。'},{role:'user',content:aiPrompt(operation,{...context,assets:context.assets.slice(0,500)},payload.prompt)}],signal});result={...response,json:parseJson(response.text)};
  }
  if(result.usage)recordAIUsage(result.usage);progress(1,1);return{operation,providerId,result:result.json,usage:result.usage||null,context:{folderPath:context.folderPath,selectedCount:context.selectedAssets.length,query:context.query,filter:context.filter}};
}
ipcMain.handle('ai:start-task',(_,operation,payload={})=>{try{const id=aiTasks.create(({signal,progress})=>runAIRequest(operation,payload,progress,signal),{operation,total:1});return{id}}catch(error){return{error:redact(error.message)}}});

ipcMain.handle('ai:execute-plan',(_,rawPlan,confirmed=false)=>enqueueLibraryMutation(()=>{const data=readLibrary();if(!data)return{error:'请先打开资源库'};try{const settings=readAISettings(),context={assets:data.assets,folders:data.folders},plan=validatePlan(rawPlan,context,settings);if(plan.actions.some(action=>action.requiresConfirmation)&&!confirmed)return{requiresConfirmation:true,plan};const before=[];for(const action of plan.actions){const ids=action.assetIds||[action.assetId].filter(Boolean);for(const id of ids){const asset=data.assets.find(item=>item.id===id);if(!asset)continue;before.push({id,name:asset.name,file:asset.file,folderId:asset.folderId||null,tags:[...(asset.tags||[])],tagSources:{...(asset.tagSources||{})},note:asset.note||'',favorite:!!asset.favorite});if(action.tool==='add_tags'){asset.tags=[...new Set([...(asset.tags||[]),...(action.tags||[])])];asset.tagSources={...(asset.tagSources||{}),...Object.fromEntries((action.tags||[]).map(tag=>[tag,'ai']))}}else if(action.tool==='remove_tags'){asset.tags=(asset.tags||[]).filter(tag=>!(action.tags||[]).includes(tag));for(const tag of action.tags||[])delete asset.tagSources?.[tag]}else if(action.tool==='update_note')asset.note=String(action.note||'');else if(action.tool==='favorite_asset')asset.favorite=Boolean(action.favorite);else if(action.tool==='move_asset'||action.tool==='bulk_move')asset.folderId=action.targetFolderId||null;else if(action.tool==='rename_asset'||action.tool==='bulk_rename'){const name=String(action.newName||action.names?.[id]||'').trim();if(name){migrateAssetFilename(data,asset,name);asset.name=name}}asset.modifiedAt=Date.now()}}
    if(plan.actions.some(action=>['move_asset','bulk_move','rename_asset','bulk_rename'].includes(action.tool)))syncPhysicalFolders(libraryPath,data);const audit={id:crypto.randomUUID(),kind:plan.kind||'AI 操作',providerId:plan.providerId||settings.defaultProviderId,createdAt:Date.now(),actions:plan.actions,before,status:'completed'};data.aiAudit=[...(data.aiAudit||[]),audit].slice(-300);writeJson(indexFile(libraryPath),data);return{ok:true,library:publicLibrary(data),audit}
  }catch(error){return{error:redact(error.message)}}}));
ipcMain.handle('ai:undo',(_,auditId)=>enqueueLibraryMutation(()=>{const data=readLibrary();if(!data)return{error:'请先打开资源库'};const audit=(data.aiAudit||[]).find(item=>item.id===auditId);if(!audit||audit.status==='undone')return{error:'该操作不可撤销或已经撤销'};try{for(const snapshot of audit.before||[]){const asset=data.assets.find(item=>item.id===snapshot.id);if(!asset)continue;if(asset.name!==snapshot.name)migrateAssetFilename(data,asset,snapshot.name);Object.assign(asset,snapshot,{id:asset.id,modifiedAt:Date.now()})}syncPhysicalFolders(libraryPath,data);audit.status='undone';audit.undoneAt=Date.now();writeJson(indexFile(libraryPath),data);return{ok:true,library:publicLibrary(data),audit}}catch(error){return{error:`撤销失败：${redact(error.message)}`}}}));

const createWindow = () => { const win = new BrowserWindow({ width: 1440, height: 900, minWidth: 860, minHeight: 620, title: '小旺仔素材库', icon:path.join(app.getAppPath(),'build','icon.png'), backgroundColor: '#07111f', autoHideMenuBar: process.platform!=='darwin', titleBarStyle: process.platform==='win32'?'hidden':process.platform==='darwin'?'hiddenInset':undefined, titleBarOverlay:process.platform==='win32'?{color:'#07111f',symbolColor:'#dce1e7',height:44}:undefined, trafficLightPosition: process.platform==='darwin'?{x:14,y:15}:undefined, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } }); win.loadFile(path.join(__dirname, '..', 'dist', 'index.html')); win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; }); };
app.whenReady().then(() => { if (!gotSingleInstanceLock) return; startClipServer(); startIndexWatcher(); protocol.handle('nest', request => {if(!libraryPath)return new Response('No library',{status:404});const target=assetPathFromRequest(libraryPath,request.url);if(!target||!fs.existsSync(target))return new Response('Not found',{status:404});const stat=fs.statSync(target),ext=path.extname(target).toLowerCase(),types={'.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.m4v':'video/mp4','.mp3':'audio/mpeg','.wav':'audio/wav','.flac':'audio/flac','.aac':'audio/aac','.m4a':'audio/mp4','.ogg':'audio/ogg','.opus':'audio/ogg','.wma':'audio/x-ms-wma','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.bmp':'image/bmp','.avif':'image/avif'},type=types[ext]||'application/octet-stream',range=request.headers.get('range');if(range){const match=/bytes=(\d*)-(\d*)/.exec(range);if(!match)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${stat.size}`}});const start=match[1]?Number(match[1]):0,end=match[2]?Math.min(Number(match[2]),stat.size-1):stat.size-1;if(start>end||start>=stat.size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${stat.size}`}});return new Response(Readable.toWeb(openLibraryReadStream(target,{start,end})),{status:206,headers:{'Content-Type':type,'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${stat.size}`,'Content-Length':String(end-start+1)}})}return new Response(Readable.toWeb(openLibraryReadStream(target)),{status:200,headers:{'Content-Type':type,'Accept-Ranges':'bytes','Content-Length':String(stat.size)}})}); createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', cancelAIFlowTransfersForShutdown);

let webCollectorBridgeKey = null;

function getWebCollectorBridgeKey() {
  if (webCollectorBridgeKey) return webCollectorBridgeKey;
  const settings = readSettings();
  const existing = String(settings.webCollectorBridgeKey || '');
  if (/^[a-f0-9]{64}$/i.test(existing)) {
    webCollectorBridgeKey = existing;
    return webCollectorBridgeKey;
  }
  webCollectorBridgeKey = crypto.randomBytes(32).toString('hex');
  writeJson(settingsFile(), { ...settings, webCollectorBridgeKey, libraryPath });
  return webCollectorBridgeKey;
}

function collectorBridgeMatches(value) {
  const expected = Buffer.from(getWebCollectorBridgeKey(), 'utf8');
  const actual = Buffer.from(String(value || ''), 'utf8');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function setExtensionImportTarget(folderId) {
  if (!folderId) {
    extensionImportTarget = null;
    return { ok: true, target: null };
  }
  const data = readLibrary();
  if (!data || !libraryPath) return { error: '请先打开资源库' };
  try {
    const folder = resolveSelectedFolder(data, folderId);
    extensionImportTarget = {
      libraryRoot: path.resolve(libraryPath),
      folderId: folder.id,
      folderName: folder.name,
    };
    return { ok: true, target: { id: folder.id, name: folder.name } };
  } catch (error) {
    extensionImportTarget = null;
    return { error: error.message };
  }
}

function selectedExtensionImportFolder(data, target = extensionImportTarget) {
  if (!target || !libraryPath || target.libraryRoot !== path.resolve(libraryPath)) {
    throw new Error('请先在小旺仔素材库中选定接收素材的文件夹');
  }
  return resolveSelectedFolder(data, target.folderId);
}

function collectorPermission() {
  const data = readLibrary();
  if (!data) throw new Error('请先启动小旺仔素材库并打开资源库');
  if (!requireRole(data, 'editor')) throw new Error('当前成员没有导入权限');
  return data;
}

function collectorReadPermission() {
  // The sync-before preview must remain strictly read-only, including for
  // legacy libraries that have not created the optional team/profile fields.
  // In that case the user first opens the desktop library normally; the
  // preview itself never creates settings, a profile, a team, or a queue.
  const data = readLibrary({ ensureTeam: false });
  if (!data) throw new Error('请先启动小旺仔素材库并打开资源库');
  const profile = cachedProfile || readSettings().profile;
  if (!data.team || !Array.isArray(data.team.members) || !profile?.id || !hasRole(data.team, profile.id, 'editor')) {
    throw new Error('当前成员没有读取同步差异的权限，请先在小旺仔素材库中打开资源库');
  }
  return data;
}

const AI_FLOW_ASSET_LINK_TTL_MS = 10 * 60 * 1000;

function activeAIFlowAssetLinkIntent() {
  const intent = pendingAIFlowAssetLink;
  if (!intent) return null;
  if (!libraryPath || intent.expiresAt <= Date.now() || intent.libraryRoot !== path.resolve(libraryPath)) {
    pendingAIFlowAssetLink = null;
    return null;
  }
  return intent;
}

function publicAIFlowAssetLinkIntent(intent = activeAIFlowAssetLinkIntent()) {
  if (!intent) return null;
  return { assetId: intent.assetId, assetName: intent.assetName, startedAt: intent.startedAt, expiresAt: intent.expiresAt };
}

async function beginAIFlowAssetLink(assetId) {
  return enqueueLibraryMutation(async () => {
    const data = readLibrary();
    if (!data) return { error: '请先打开资源库' };
    const asset = data.assets.find(item => item.id === String(assetId || ''));
    if (!asset) return { error: '素材不存在或已被删除' };
    const file = storedAssetPath(asset.file);
    if (!asset.file || !fs.existsSync(file)) return { error: '素材原文件不存在，无法建立 AI Flow 对应' };
    // The stored import hash can be stale only if the managed file was changed outside Nest.
    // Rechecking here makes a browser-confirmed link refer to the exact current version.
    const currentHash = await hashFile(file);
    if (asset.hash !== currentHash) {
      asset.hash = currentHash;
      asset.modifiedAt = Date.now();
      writeJson(indexFile(libraryPath), data);
    }
    const startedAt = Date.now();
    pendingAIFlowAssetLink = {
      id: crypto.randomUUID(),
      libraryRoot: path.resolve(libraryPath),
      assetId: asset.id,
      assetName: asset.name,
      currentHash,
      startedAt,
      expiresAt: startedAt + AI_FLOW_ASSET_LINK_TTL_MS,
    };
    return { ok: true, intent: publicAIFlowAssetLinkIntent(), library: publicLibrary(data) };
  }, 'editor');
}

function cancelAIFlowAssetLink(assetId) {
  return enqueueLibraryMutation(() => {
    const intent = activeAIFlowAssetLinkIntent();
    if (intent && assetId && intent.assetId !== String(assetId)) return { error: '当前准备关联的是其他素材' };
    pendingAIFlowAssetLink = null;
    return { ok: true };
  }, 'editor');
}

function parseAIFlowAssetLinkRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('AI Flow 素材关联请求无效');
  const pageUrl = normalizeRemoteUrl(input.pageUrl);
  if (!pageUrl) throw new Error('AI Flow 网页地址无效');
  let configured;
  try {
    configured = new URL(normalizeBaseUrl(readAIFlowSettings().baseUrl));
  } catch {
    throw new Error('请先配置有效的 AI Flow 服务地址');
  }
  if (new URL(pageUrl).origin !== configured.origin) throw new Error('请在当前配置的 AI Flow 网页中确认素材关联');
  const remote = input.remote && typeof input.remote === 'object' && !Array.isArray(input.remote) ? input.remote : {};
  const locatorInput = [remote.srcUrl, remote.linkUrl, remote.url].find(candidate => normalizeRemoteUrl(candidate));
  const url = normalizeRemoteUrl(locatorInput);
  const remoteKey = createRemoteLocatorKey(locatorInput);
  const remoteAssetId = String(remote.remoteAssetId || remote.id || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200) || null;
  if (!url && !remoteAssetId) throw new Error('未识别到 AI Flow 网页素材地址');
  return {
    url,
    remoteKey,
    remoteAssetId,
    name: String(remote.label || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300),
  };
}

async function confirmAIFlowAssetLink(req) {
  const body = await readCollectorBody(req, 8 * 1024);
  let input;
  try {
    input = JSON.parse(body.toString('utf8'));
  } catch {
    throw new Error('AI Flow 素材关联请求无效');
  }
  const remote = parseAIFlowAssetLinkRequest(input);
  const intent = activeAIFlowAssetLinkIntent();
  if (!intent) throw new Error('没有待确认的素材关联；请先在小旺仔详情中点击“准备关联”');
  collectorPermission();
  const outcome = await enqueueLibraryMutation(() => {
    const latest = activeAIFlowAssetLinkIntent();
    if (!latest || latest.id !== intent.id) return { error: '素材关联已过期，请重新在小旺仔中准备关联' };
    const data = readLibrary();
    const asset = data?.assets.find(item => item.id === latest.assetId);
    if (!data || !asset || asset.hash !== latest.currentHash) return { error: '本地素材已变化或已删除，请重新准备关联' };
    const existing = findAIFlowMappingConflict(data.aiFlowMappings, {
      assetId: asset.id,
      currentHash: latest.currentHash,
      provider: 'ai-flow',
      remoteAssetId: remote.remoteAssetId,
      url: remote.url,
      remoteKey: remote.remoteKey,
      status: 'confirmed',
    });
    if (existing) return { error: '该 AI Flow 网页素材已关联至其他小旺仔素材，请先解除原关联' };
    const result = upsertAIFlowMapping(data.aiFlowMappings, {
      assetId: asset.id,
      currentHash: latest.currentHash,
      provider: 'ai-flow',
      origin: 'browser-extension',
      remoteAssetId: remote.remoteAssetId,
      url: remote.url,
      remoteKey: remote.remoteKey,
      name: remote.name || 'AI Flow 网页素材',
      matchMethod: 'browser-extension',
      status: 'confirmed',
    });
    data.aiFlowMappings = result.data;
    writeJson(indexFile(libraryPath), data);
    pendingAIFlowAssetLink = null;
    notifyLibraryChanged(data);
    return { ok: true, message: result.created ? 'AI Flow 素材已关联' : 'AI Flow 素材关联已更新' };
  });
  if (outcome?.error) throw new Error(outcome.error);
  return outcome;
}

function unlinkAIFlowAssetLink(assetId, mappingId) {
  return enqueueLibraryMutation(() => {
    const data = readLibrary();
    if (!data) return { error: '请先打开资源库' };
    const id = String(mappingId || '').trim();
    const asset = data.assets.find(item => item.id === String(assetId || ''));
    if (!asset || !id) return { error: 'AI Flow 素材关联不存在' };
    const before = data.aiFlowMappings?.mappings || [];
    const next = before.filter(mapping => !(mapping.id === id && mapping.assetId === asset.id));
    if (next.length === before.length) return { error: 'AI Flow 素材关联不存在' };
    data.aiFlowMappings = normalizeAIFlowMappings({ mappings: next });
    writeJson(indexFile(libraryPath), data);
    notifyLibraryChanged(data);
    return { ok: true, library: publicLibrary(data) };
  }, 'editor');
}

function writeCollectorResult(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function listCollectorLibraryAssets(req) {
  const input = parseCollectorJson(await readCollectorBody(req, 4 * 1024), '素材库目录请求无效');
  const data = collectorPermission();
  const requestedFolderId = String(input.folderId || '').trim();
  const folderId = requestedFolderId || null;
  if (folderId && !data.folders.some(folder => String(folder.id) === folderId)) throw new Error('该素材库文件夹已不存在');
  const folders = (Array.isArray(data.folders) ? data.folders : [])
    .filter(folder => String(folder.parentId || '') === String(folderId || ''))
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'zh-CN'))
    .map(folder => ({ id: String(folder.id), name: String(folder.name || '未命名文件夹').slice(0, 80) }));
  const assets = (Array.isArray(data.assets) ? data.assets : [])
    .filter(asset => /^(image|video|audio)\//.test(String(asset?.type || '')))
    .filter(asset => String(asset.folderId || '') === String(folderId || ''))
    .sort((left, right) => Number(right?.modifiedAt || right?.createdAt || 0) - Number(left?.modifiedAt || left?.createdAt || 0))
    .map(asset => {
      let thumbnail = '';
      if (String(asset.type || '').startsWith('image/') && asset.file) {
        try {
          const image = nativeImage.createFromPath(storedAssetPath(asset.file));
          if (!image.isEmpty()) thumbnail = image.resize({ width: 120, height: 120, quality: 'good' }).toDataURL();
        } catch {}
      }
      return { id: String(asset.id || ''), name: String(asset.name || asset.originalName || '未命名素材').slice(0, 80), type: String(asset.type || ''), thumbnail };
    });
  const currentFolder = folderId ? data.folders.find(folder => String(folder.id) === folderId) : null;
  return { ok: true, folderId, folderName: currentFolder?.name || '素材库根目录', parentId: currentFolder?.parentId || null, folders, assets };
}

function readCollectorBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      error ? reject(error) : resolve(value);
    };
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        const error = new Error('采集内容超过允许大小');
        req.destroy(error);
        finish(error);
        return;
      }
      chunks.push(chunk);
    });
    req.once('error', error => finish(error));
    req.once('aborted', () => finish(new Error('浏览器取消了采集请求')));
    req.once('end', () => finish(null, Buffer.concat(chunks, size)));
  });
}

async function importCollectorImage(req) {
  const mime = String(req.headers['content-type'] || '').split(';')[0].toLowerCase();
  const extensions = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
    'image/svg+xml': '.svg', 'image/avif': '.avif', 'image/bmp': '.bmp',
  };
  if (!extensions[mime]) throw new Error(`不支持的图片格式：${mime || '未知'}`);
  const raw = await readCollectorBody(req, 50 * 1024 * 1024);
  const name = decodeURIComponent(String(req.headers['x-nest-name'] || '网页图片'))
    .replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || '网页图片';
  const temp = path.join(app.getPath('temp'), `${name.replace(/\.[^.]+$/, '')}-${crypto.randomUUID()}${extensions[mime]}`);
  try {
    await fs.promises.writeFile(temp, raw);
    const result = await enqueueLibraryMutation(() => importPaths([temp], null));
    if (result?.error) throw new Error(result.error);
    notifyLibraryChanged(readLibrary());
    return result?.lastImport || {};
  } finally {
    await fs.promises.rm(temp, { force: true }).catch(() => {});
  }
}

async function importCollectorImageUrl(req) {
  const body = await readCollectorBody(req, 10 * 1024);
  let url;
  try {
    url = JSON.parse(body.toString('utf8')).url;
  } catch {
    throw new Error('网页图片请求无效');
  }
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('仅支持网页图片');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载失败 ${response.status}`);
  const mime = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  const extensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/avif': '.avif' };
  if (!extensions[mime]) throw new Error('网页内容不是支持的图片');
  const temp = path.join(app.getPath('temp'), `nest-clip-${crypto.randomUUID()}${extensions[mime]}`);
  try {
    await fs.promises.writeFile(temp, await responseToBuffer(response));
    const result = await enqueueLibraryMutation(() => importPaths([temp], null));
    if (result?.error) throw new Error(result.error);
    notifyLibraryChanged(readLibrary());
    return result?.lastImport || {};
  } finally {
    await fs.promises.rm(temp, { force: true }).catch(() => {});
  }
}

const COLLECTOR_ASSET_MIME_EXTENSIONS = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
  'image/svg+xml': '.svg', 'image/avif': '.avif', 'image/bmp': '.bmp',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
  'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/flac': '.flac',
  'audio/aac': '.aac', 'audio/mp4': '.m4a', 'audio/ogg': '.ogg', 'audio/opus': '.opus',
  'audio/x-ms-wma': '.wma', 'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt', 'text/markdown': '.md', 'text/fountain': '.fountain',
};
const COLLECTOR_ASSET_EXTENSIONS = new Set(Object.values(COLLECTOR_ASSET_MIME_EXTENSIONS).concat('.jpeg', '.markdown', '.m4v'));
const MAX_COLLECTOR_ASSET_BYTES = 500 * 1024 * 1024;

function decodedCollectorHeader(value, fallback = '') {
  try {
    return decodeURIComponent(String(value || '')) || fallback;
  } catch {
    return fallback;
  }
}

function collectorAssetDetails(req) {
  const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const requested = decodedCollectorHeader(req.headers['x-nest-name'], 'AI Flow 素材')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  const requestedExtension = path.extname(requested).toLowerCase();
  const extension = COLLECTOR_ASSET_EXTENSIONS.has(requestedExtension)
    ? requestedExtension
    : COLLECTOR_ASSET_MIME_EXTENSIONS[mime];
  if (!extension) throw new Error(`不支持的 AI Flow 素材格式：${mime || requestedExtension || '未知'}`);
  const stem = path.basename(requested, requestedExtension || extension)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'AI Flow 素材';
  return { mime, name: `${stem}${extension}` };
}

function collectorNumericHeader(req, name, label, { optional = false } = {}) {
  const raw = String(req.headers[name] || '').trim();
  if (!raw && optional) return '';
  if (!/^\d{1,18}$/.test(raw)) throw new Error(`${label}无效`);
  return raw;
}

function collectorAIFlowServerOrigin(req) {
  return validatedAIFlowPageOrigin(decodedCollectorHeader(req.headers['x-nest-aiflow-page']));
}

function collectorLocalFolderHeader(req, name) {
  const value = String(req.headers[name] || '').trim();
  if (!value) return '';
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new Error('AI Flow 同步目标无效');
  return value;
}

async function writeCollectorAsset(req, target) {
  const declaredLength = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_COLLECTOR_ASSET_BYTES) {
    throw new Error('AI Flow 素材超过 500 MB，暂不支持通过扩展同步');
  }
  let received = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > MAX_COLLECTOR_ASSET_BYTES) {
        callback(new Error('AI Flow 素材超过 500 MB，暂不支持通过扩展同步'));
        return;
      }
      callback(null, chunk);
    },
  });
  await pipeline(req, limiter, fs.createWriteStream(target, { flags: 'wx' }));
  if (!received) throw new Error('AI Flow 未返回素材内容');
  return received;
}

async function importCollectorAIFlowAsset(req) {
  const permission = collectorPermission();
  const assetId = collectorNumericHeader(req, 'x-nest-aiflow-asset-id', 'AI Flow 素材 ID');
  const projectId = collectorNumericHeader(req, 'x-nest-aiflow-project-id', 'AI Flow 项目 ID', { optional: true });
  const serverOrigin = collectorAIFlowServerOrigin(req);
  const remoteFolderId = collectorNumericHeader(req, 'x-nest-aiflow-folder-id', 'AI Flow 文件夹 ID', { optional: true });
  const rootFolderId = collectorLocalFolderHeader(req, 'x-nest-aiflow-root-folder-id');
  const asset = collectorAssetDetails(req);
  const selectedFolder = resolveMappedAIFlowFolder(permission, {
    remoteFolderId,
    rootFolderId,
    serverOrigin,
    projectId,
  });
  const target = {
    libraryRoot: path.resolve(libraryPath),
    folderId: selectedFolder.id,
    folderName: selectedFolder.name,
  };
  const directory = path.join(app.getPath('temp'), `nest-aiflow-asset-${crypto.randomUUID()}`);
  const file = path.join(directory, asset.name);
  try {
    await fs.promises.mkdir(directory, { recursive: true });
    await writeCollectorAsset(req, file);
    const importedAt = Date.now();
    const sourceMetadata = {
      provider: 'AI Flow', kind: 'server-asset', assetId, projectId, serverOrigin, importedAt,
    };
    const result = await enqueueLibraryMutation(async () => {
      const latest = collectorPermission();
      if (!libraryPath || target.libraryRoot !== path.resolve(libraryPath)) {
        return { error: '资源库已切换，请重新在目标资源库中选择文件夹' };
      }
      resolveSelectedFolder(latest, target.folderId);
      // A previous local import may already contain the exact bytes. The old
      // duplicate path only skipped it, losing the server identity needed for
      // later two-way deletion. Attach metadata without copying a second file.
      const duplicateHash = await hashFile(file);
      const existing = latest.assets.find(candidate => candidate.folderId === target.folderId && candidate.hash === duplicateHash);
      if (existing) {
        if (!existing.importSource) {
          existing.importSource = sourceMetadata;
          existing.modifiedAt = Date.now();
        }
        latest.lastImport = { imported: 0, duplicates: 1, errors: [], queuedForAIFlow: 0, finishedAt: Date.now() };
        writeJson(indexFile(libraryPath), latest);
        return publicLibrary(latest);
      }
      return importPaths([file], target.folderId, {
        dedupeByFolder: true,
        metadataForPath: () => sourceMetadata,
      });
    });
    if (result?.error) throw new Error(result.error);
    notifyLibraryChanged(readLibrary());
    return { ...(result?.lastImport || {}), folderName: target.folderName, assetId };
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

async function importCollectorAIFlowVideo(req) {
  const body = await readCollectorBody(req, 10 * 1024);
  let input;
  try {
    input = JSON.parse(body.toString('utf8'));
  } catch {
    throw new Error('AI Flow 视频请求无效');
  }
  const permission = collectorPermission();
  const client = aiFlowClient();
  const { taskId } = parseAIFlowVideoSource(input?.srcUrl, client.baseUrl);
  const selectedFolder = selectedExtensionImportFolder(permission);
  const target = {
    libraryRoot: path.resolve(libraryPath),
    folderId: selectedFolder.id,
    folderName: selectedFolder.name,
  };
  if (client.authMode === 'session') {
    const status = await readAIFlowSessionStatus(client.baseUrl);
    if (!status.authenticated) throw new Error('请先在小旺仔素材库中登录 AI Flow 账号');
  }
  const video = { taskId, name: `AI Flow ${taskId}`, model: '', prompt: '', duration: 0, completedAt: 0 };
  const download = await downloadAIFlowVideo(client, video);
  try {
    const metadata = new Map([[download.file, aiFlowSourceMetadata('server', video)]]);
    const result = await enqueueLibraryMutation(() => {
      const latest = collectorPermission();
      if (!libraryPath || target.libraryRoot !== path.resolve(libraryPath)) {
        return { error: '资源库已切换，请重新在目标资源库中选择文件夹' };
      }
      resolveSelectedFolder(latest, target.folderId);
      return importPaths([download.file], target.folderId, { metadataForPath: file => metadata.get(file) });
    });
    if (result?.error) throw new Error(result.error);
    notifyLibraryChanged(readLibrary());
    return { ...(result?.lastImport || {}), folderName: target.folderName };
  } finally {
    await fs.promises.rm(download.directory, { recursive: true, force: true }).catch(() => {});
  }
}

const AIFLOW_UPLOAD_INTENT_TTL_MS = 10 * 60 * 1000;
const MAX_AIFLOW_UPLOAD_ITEMS = 100;
const MAX_AIFLOW_UPLOAD_BYTES = 500 * 1024 * 1024;
const AIFLOW_UPLOAD_MIME_BY_EXTENSION = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.bmp': 'image/bmp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.aac': 'audio/aac', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.opus': 'audio/opus', '.wma': 'audio/x-ms-wma',
};

function uploadMimeForAsset(asset) {
  const extension = path.extname(String(asset?.file || asset?.originalName || '')).toLowerCase();
  const mime = AIFLOW_UPLOAD_MIME_BY_EXTENSION[extension];
  if (!mime || !/^(image|video|audio)\//.test(String(asset?.type || mime))) return '';
  return mime;
}

function activeAIFlowUpload(intentId = '') {
  const intent = pendingAIFlowUpload;
  if (!intent || intent.expiresAt <= Date.now()) {
    pendingAIFlowUpload = null;
    throw new Error('小旺仔上传准备已过期，请重新右键选择素材');
  }
  if (intentId && intent.id !== String(intentId)) throw new Error('小旺仔上传请求无效，请重新右键选择素材');
  if (!libraryPath || intent.libraryRoot !== path.resolve(libraryPath)) throw new Error('资源库已切换，请重新选择要上传的素材');
  return intent;
}

function normalizedAIFlowReferenceRemoteIds(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => String(value || '').trim())
    .filter(value => /^\d{1,18}$/.test(value)))];
}

function normalizeAIFlowReferenceAttachments(data) {
  const now = Date.now();
  const attachments = (Array.isArray(data?.aiFlowReferenceAttachments) ? data.aiFlowReferenceAttachments : [])
    .map(item => {
      const id = String(item?.id || '').trim();
      const projectId = String(item?.projectId || '').trim();
      const remoteAssetIds = normalizedAIFlowReferenceRemoteIds(item?.remoteAssetIds);
      const expiresAt = Number(item?.expiresAt) || 0;
      let serverOrigin = '';
      try { serverOrigin = new URL(String(item?.serverOrigin || '')).origin; } catch {}
      if (!id || !projectId || !serverOrigin || !remoteAssetIds.length || expiresAt <= now) return null;
      return {
        id,
        serverOrigin,
        projectId,
        remoteAssetIds,
        createdAt: Number(item?.createdAt) || now,
        expiresAt,
      };
    })
    .filter(Boolean);
  data.aiFlowReferenceAttachments = attachments;
  return attachments;
}

function publicAIFlowReferenceAttachment(attachment) {
  if (!attachment) return null;
  return {
    id: attachment.id,
    remoteAssetIds: [...attachment.remoteAssetIds],
    projectId: attachment.projectId,
    expiresAt: attachment.expiresAt,
  };
}

function pendingAIFlowReferenceAttachmentForPage(data, { serverOrigin, projectId }) {
  const attachment = normalizeAIFlowReferenceAttachments(data).find(item => item.serverOrigin === serverOrigin && item.projectId === projectId) || null;
  pendingAIFlowReferenceAttachment = attachment;
  return attachment;
}

function queueAIFlowReferenceAttachment(data, { serverOrigin, projectId, remoteAssetIds }) {
  const ids = normalizedAIFlowReferenceRemoteIds(remoteAssetIds);
  if (!ids.length) return null;
  const attachments = normalizeAIFlowReferenceAttachments(data);
  let attachment = attachments.find(item => item.serverOrigin === serverOrigin && item.projectId === projectId) || null;
  if (attachment) {
    attachment.remoteAssetIds = normalizedAIFlowReferenceRemoteIds([...attachment.remoteAssetIds, ...ids]);
    attachment.expiresAt = Date.now() + AIFLOW_UPLOAD_INTENT_TTL_MS;
  } else {
    attachment = {
      id: crypto.randomUUID(),
      serverOrigin,
      projectId,
      remoteAssetIds: ids,
      createdAt: Date.now(),
      expiresAt: Date.now() + AIFLOW_UPLOAD_INTENT_TTL_MS,
    };
    attachments.push(attachment);
  }
  data.aiFlowReferenceAttachments = attachments;
  pendingAIFlowReferenceAttachment = attachment;
  return attachment;
}

function existingAIFlowReferenceRemoteAssets(data, assetIds, { serverOrigin, projectId }) {
  const entries = [];
  for (const assetId of Array.isArray(assetIds) ? assetIds : []) {
    const asset = data.assets.find(item => String(item?.id || '') === String(assetId || ''));
    const source = asset?.importSource;
    if (source?.provider !== 'AI Flow' || source?.kind !== 'server-asset' || String(source?.projectId || '') !== projectId) continue;
    const remoteAssetId = String(source?.assetId || '').trim();
    if (!/^\d{1,18}$/.test(remoteAssetId)) continue;
    try {
      if (new URL(String(source?.serverOrigin || '')).origin !== serverOrigin) continue;
    } catch {
      continue;
    }
    entries.push({ assetId: String(asset.id), remoteAssetId });
  }
  return entries;
}

function existingAIFlowReferenceRemoteIds(data, assetIds, page) {
  return normalizedAIFlowReferenceRemoteIds(existingAIFlowReferenceRemoteAssets(data, assetIds, page).map(item => item.remoteAssetId));
}

function preparedAIFlowUploadAsset(asset, target = null) {
  if (!asset?.file) throw new Error('选中的素材不存在或没有本地原文件');
  const mime = uploadMimeForAsset(asset);
  if (!mime) throw new Error(`“${asset.name}”不是可上传的图片、视频或音频`);
  const file = storedAssetPath(asset.file);
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile()) throw new Error(`“${asset.name}”的本地原文件不存在`);
  if (stat.size > MAX_AIFLOW_UPLOAD_BYTES) throw new Error(`“${asset.name}”超过 500 MB，暂不支持通过扩展上传`);
  return {
    id: asset.id,
    file,
    name: asset.originalName || path.basename(asset.file),
    mime,
    size: stat.size,
    ...(target ? {
      targetFolderId: target.remoteFolderId || '',
      targetFolderName: target.remoteFolderName || '我的素材',
      targetRootFolderId: target.rootFolderId,
      projectId: target.projectId,
      serverOrigin: target.serverOrigin,
    } : {}),
  };
}

function beginAIFlowExtensionUpload(assetIds, destinations = null, options = {}) {
  const data = collectorPermission();
  const ids = [...new Set((Array.isArray(assetIds) ? assetIds : []).map(id => String(id || '')).filter(Boolean))];
  if (!ids.length) throw new Error('请先选择至少一个素材');
  if (ids.length > MAX_AIFLOW_UPLOAD_ITEMS) throw new Error(`单次最多上传 ${MAX_AIFLOW_UPLOAD_ITEMS} 个素材`);
  const mode = options?.mode === 'prompt-reference' ? 'prompt-reference' : 'manual';
  const assets = ids.map(id => {
    const asset = data.assets.find(item => String(item.id) === id);
    return preparedAIFlowUploadAsset(asset, destinations?.get(id) || null);
  });
  const now = Date.now();
  pendingAIFlowUpload = {
    id: crypto.randomUUID(),
    libraryRoot: path.resolve(libraryPath),
    createdAt: now,
    expiresAt: now + AIFLOW_UPLOAD_INTENT_TTL_MS,
    mode,
    assets,
  };
  // Reference uploads must not wait for the content script's 3-second
  // fallback timer. Wake the authenticated Edge extension immediately; it
  // will still keep the timer as a recovery path if the page was just opened.
  if (mode === 'prompt-reference') publishAIFlowLiveWake();
  return {
    ok: true,
    count: assets.length,
    totalBytes: assets.reduce((total, asset) => total + asset.size, 0),
    expiresAt: pendingAIFlowUpload.expiresAt,
    mode,
    names: assets.slice(0, 6).map(asset => asset.name),
  };
}

function beginAIFlowFolderExtensionUpload(folderId) {
  const data = collectorPermission();
  const folder = data.folders.find(item => String(item.id) === String(folderId || ''));
  if (!folder) throw new Error('文件夹不存在或已被删除');
  const target = folderTarget(data, folder.id);
  if (target) {
    const plan = folderAssetsForUpload(data, folder.id);
    if (!plan.assets.length) throw new Error('该文件夹及其子文件夹中没有可上传的素材');
    if (plan.assets.length > MAX_AIFLOW_UPLOAD_ITEMS) throw new Error(`该文件夹有 ${plan.assets.length} 个素材，单次最多上传 ${MAX_AIFLOW_UPLOAD_ITEMS} 个`);
    const destinations = new Map(plan.assets.map(item => [String(item.asset.id), item.target]));
    const result = beginAIFlowExtensionUpload(plan.assets.map(item => item.asset.id), destinations);
    return { ...result, folderName: plan.target.rootFolderName, skipped: plan.skipped.length, requiresTargetSelection: false };
  }
  const folderIds = collectFolderSubtreeIds(data.folders, String(folder.id));
  const assets = data.assets.filter(asset => folderIds.has(asset.folderId) && asset?.importSource?.provider !== 'AI Flow');
  if (!assets.length) throw new Error('该文件夹及其子文件夹中没有可上传的本地素材');
  if (assets.length > MAX_AIFLOW_UPLOAD_ITEMS) throw new Error(`该文件夹有 ${assets.length} 个素材，单次最多上传 ${MAX_AIFLOW_UPLOAD_ITEMS} 个`);
  const result = beginAIFlowExtensionUpload(assets.map(asset => asset.id));
  return { ...result, folderName: folder.name, skipped: 0, requiresTargetSelection: true };
}

function parseCollectorJson(body, errorMessage) {
  try {
    const value = JSON.parse(body.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
    return value;
  } catch {
    throw new Error(errorMessage);
  }
}

function collectorNumericValue(value, label, { optional = false } = {}) {
  const id = String(value ?? '').trim();
  if (!id && optional) return '';
  if (!/^\d{1,18}$/.test(id)) throw new Error(`${label}无效`);
  return id;
}

function validatedAIFlowPageOrigin(pageUrl) {
  let page;
  let configured;
  try {
    page = new URL(String(pageUrl || ''));
    configured = new URL(normalizeBaseUrl(readAIFlowSettings().baseUrl));
  } catch {
    throw new Error('AI Flow 网页地址无效，请在当前配置的 AI Flow 页面重试');
  }
  if (!['http:', 'https:'].includes(page.protocol) || page.origin !== configured.origin) {
    throw new Error('请在当前配置的 AI Flow 服务页面中操作');
  }
  return configured.origin;
}

async function mirrorCollectorAIFlowFolders(req) {
  const input = parseCollectorJson(await readCollectorBody(req, 512 * 1024), 'AI Flow 目录同步请求无效');
  const serverOrigin = validatedAIFlowPageOrigin(input.pageUrl);
  const projectId = collectorNumericValue(input.projectId, 'AI Flow 项目 ID');
  const sourceFolders = Array.isArray(input.folders) ? input.folders : null;
  if (!sourceFolders) throw new Error('AI Flow 未返回可用的文件夹列表');
  const permission = collectorPermission();
  const requestedTargetId = String(input.targetFolderId || '').trim();
  let target;
  if (requestedTargetId) {
    if (!input.live) throw new Error('AI Flow 同步目标无效');
    target = resolveSelectedFolder(permission, requestedTargetId);
    const rootSync = target.aiFlowRootSync;
    if (!rootSync || rootSync.liveSyncDisabledByUser === true || rootSync.projectId !== projectId || new URL(rootSync.serverOrigin).origin !== serverOrigin) {
      throw new Error('该目录未开启 AI Flow 实时同步');
    }
  } else {
    target = selectedExtensionImportFolder(permission);
  }
  const targetInfo = { libraryRoot: path.resolve(libraryPath), folderId: target.id, folderName: target.name };
  const result = await enqueueLibraryMutation(() => {
    const latest = collectorPermission();
    if (!libraryPath || targetInfo.libraryRoot !== path.resolve(libraryPath)) return { error: '资源库已切换，请重新选择接收目录结构的父文件夹' };
    resolveSelectedFolder(latest, targetInfo.folderId);
    const mirrored = mirrorAIFlowFolderStructure(latest, {
      targetFolderId: targetInfo.folderId,
      serverOrigin,
      projectId,
      folders: sourceFolders,
    });
    syncPhysicalFolders(libraryPath, latest);
    writeJson(indexFile(libraryPath), latest);
    return { ...mirrored, folderName: targetInfo.folderName, targetFolderId: targetInfo.folderId, library: publicLibrary(latest) };
  });
  if (result?.error) throw new Error(result.error);
  notifyLibraryChanged(readLibrary());
  return result;
}

async function resolveCollectorAIFlowFolderTarget(req) {
  const input = parseCollectorJson(await readCollectorBody(req, 12 * 1024), 'AI Flow 文件夹对应请求无效');
  const serverOrigin = validatedAIFlowPageOrigin(input.pageUrl);
  const projectId = collectorNumericValue(input.projectId, 'AI Flow 项目 ID');
  const remoteFolderId = collectorNumericValue(input.folderId, 'AI Flow 文件夹 ID', { optional: true });
  const permission = collectorPermission();
  // Do not fall back to the last extension import target. A current-folder
  // sync must have an explicit mapping created by “同步目录和素材”, otherwise
  // a remote folder can silently land in a different local folder.
  const root = resolveMappedAIFlowFolder(permission, { serverOrigin, projectId });
  const target = resolveMappedAIFlowFolder(permission, {
    remoteFolderId,
    rootFolderId: root.id,
    serverOrigin,
    projectId,
  });
  return {
    rootFolderId: root.id,
    targetFolderId: target.id,
    targetFolderName: target.name,
    remoteFolderId,
    projectId,
  };
}

async function previewCollectorAIFlowFolderDiff(req) {
  const input = parseCollectorJson(await readCollectorBody(req, 4 * 1024 * 1024), 'AI Flow 差异预览请求无效');
  const serverOrigin = validatedAIFlowPageOrigin(input.pageUrl);
  const projectId = collectorNumericValue(input.projectId, 'AI Flow 项目 ID');
  const remoteFolderId = collectorNumericValue(input.folderId, 'AI Flow 文件夹 ID', { optional: true });
  if (!Array.isArray(input.items)) throw new Error('AI Flow 未返回当前文件夹素材列表');
  // The diff module is intentionally pure: this route only compares the
  // browser's current remote snapshot with the mapped local folder. It never
  // queues work, repairs a mapping, or writes the library index.
  const permission = collectorReadPermission();
  return {
    ok: true,
    ...previewMappedAIFlowFolderDiff(permission, {
      serverOrigin,
      projectId,
      remoteFolderId,
      remoteItems: input.items,
    }),
  };
}

async function prepareCollectorAIFlowUpload(req, { mode = 'manual', optional = false } = {}) {
  const input = parseCollectorJson(await readCollectorBody(req, 12 * 1024), 'AI Flow 上传请求无效');
  const serverOrigin = validatedAIFlowPageOrigin(input.pageUrl);
  const projectId = collectorNumericValue(input.projectId, 'AI Flow 项目 ID');
  const folderId = collectorNumericValue(input.folderId, 'AI Flow 文件夹 ID', { optional: true });
  let intent;
  try {
    intent = activeAIFlowUpload();
  } catch (error) {
    if (optional && mode === 'prompt-reference') {
      const attachment = await enqueueLibraryMutation(() => {
        const data = collectorPermission();
        return publicAIFlowReferenceAttachment(pendingAIFlowReferenceAttachmentForPage(data, { serverOrigin, projectId }));
      });
      return attachment ? { pending: false, attachment } : { pending: false };
    }
    if (optional) return { pending: false };
    throw error;
  }
  if ((intent.mode || 'manual') !== mode) {
    if (optional && mode === 'prompt-reference') {
      const attachment = await enqueueLibraryMutation(() => {
        const data = collectorPermission();
        return publicAIFlowReferenceAttachment(pendingAIFlowReferenceAttachmentForPage(data, { serverOrigin, projectId }));
      });
      return attachment ? { pending: false, attachment } : { pending: false };
    }
    if (optional) return { pending: false };
    throw new Error('当前待上传素材不是此操作准备的，请回到小旺仔素材库重新选择');
  }
  for (const asset of intent.assets) {
    if (!asset.serverOrigin) continue;
    if (new URL(asset.serverOrigin).origin !== serverOrigin || asset.projectId !== projectId) {
      throw new Error('请在该文件夹对应的 AI Flow 项目中点击“上传小旺仔素材”');
    }
  }
  let attachment = null;
  let uploadAssets = intent.assets;
  if (mode === 'prompt-reference') {
    const resolved = await enqueueLibraryMutation(() => {
      const data = collectorPermission();
      const existing = existingAIFlowReferenceRemoteAssets(data, intent.assets.map(asset => asset.id), { serverOrigin, projectId });
      const queued = existing.length
        ? queueAIFlowReferenceAttachment(data, { serverOrigin, projectId, remoteAssetIds: existing.map(item => item.remoteAssetId) })
        : pendingAIFlowReferenceAttachmentForPage(data, { serverOrigin, projectId });
      if (existing.length) writeJson(indexFile(libraryPath), data);
      return {
        attachment: publicAIFlowReferenceAttachment(queued),
        existingAssetIds: new Set(existing.map(item => item.assetId)),
      };
    });
    attachment = resolved.attachment;
    uploadAssets = intent.assets.filter(asset => !resolved.existingAssetIds.has(String(asset.id)));
    if (!uploadAssets.length) {
      pendingAIFlowUpload = null;
      return { pending: false, attachment };
    }
  }
  return {
    pending: true,
    uploadId: intent.id,
    serverOrigin,
    projectId,
    folderId,
    expiresAt: intent.expiresAt,
    ...(attachment ? { attachment } : {}),
    assets: uploadAssets.map(asset => ({
      id: asset.id,
      name: asset.name,
      mime: asset.mime,
      size: asset.size,
      targetFolderId: asset.targetFolderId || folderId,
      targetFolderName: asset.targetFolderName || '',
      targetRootFolderId: asset.targetRootFolderId || '',
      projectId: asset.projectId || projectId,
    })),
  };
}

async function prepareCollectorAIFlowReferenceUpload(req) {
  return prepareCollectorAIFlowUpload(req, { mode: 'prompt-reference', optional: true });
}

async function prepareCollectorAIFlowReferenceSelection(req) {
  const input = parseCollectorJson(await readCollectorBody(req, 12 * 1024), '延长参考素材请求无效');
  validatedAIFlowPageOrigin(input.pageUrl);
  collectorNumericValue(input.projectId, 'AI Flow 项目 ID');
  const assetIds = [...new Set((Array.isArray(input.assetIds) ? input.assetIds : [input.assetId])
    .map(id => String(id || '').trim()).filter(Boolean))].slice(0, 8);
  if (!assetIds.length) throw new Error('请先选择一个素材');
  const result = beginAIFlowExtensionUpload(assetIds, null, { mode: 'prompt-reference' });
  return { ok: true, ...result };
}

async function matchCollectorStoryboardAssets(req) {
  const input = parseCollectorJson(await readCollectorBody(req, 12 * 1024), '分镜人物匹配请求无效');
  validatedAIFlowPageOrigin(input.pageUrl);
  collectorNumericValue(input.projectId, 'AI Flow 项目 ID');
  const names = [...new Set((Array.isArray(input.names) ? input.names : [])
    .map(name => String(name || '').trim().replace(/\s+/g, ' ').slice(0, 40))
    .filter(name => name.length >= 2))].slice(0, 24);
  if (!names.length) throw new Error('分镜中没有识别到可匹配的人名');
  const data = collectorPermission();
  const matches = (data.assets || []).map(asset => {
    // Character matching is for visual identity references. Audio/video files
    // can contain the same name but cannot tell the model which person to use.
    if (!/^image\//.test(String(asset?.type || ''))) return null;
    const searchable = `${asset.name || ''} ${(asset.tags || []).join(' ')}`.toLocaleLowerCase('zh-CN');
    let score = 0; let matchedName = '';
    for (const name of names) {
      const needle = name.toLocaleLowerCase('zh-CN');
      if (!searchable.includes(needle)) continue;
      const exact = String(asset.name || '').toLocaleLowerCase('zh-CN') === needle;
      const nextScore = exact ? 100 : searchable.startsWith(needle) ? 80 : 60;
      if (nextScore > score) { score = nextScore; matchedName = name; }
    }
    return score ? { id: String(asset.id), name: String(asset.name || '未命名素材').slice(0, 80), matchedName, score } : null;
  }).filter(Boolean).sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, 'zh-CN'));
  const selectedNames = new Set();
  const uniqueMatches = matches.filter(item => {
    if (selectedNames.has(item.matchedName)) return false;
    selectedNames.add(item.matchedName);
    return true;
  }).slice(0, 8);
  return { ok: true, names, assets: uniqueMatches };
}

async function completeCollectorAIFlowReferenceUpload(req) {
  const input = parseCollectorJson(await readCollectorBody(req, 12 * 1024), 'AI Flow 引用上传完成请求无效');
  const serverOrigin = validatedAIFlowPageOrigin(input.pageUrl);
  const projectId = collectorNumericValue(input.projectId, 'AI Flow 项目 ID');
  const intent = activeAIFlowUpload(input.uploadId);
  if ((intent.mode || 'manual') !== 'prompt-reference') throw new Error('当前上传不是引用素材上传');
  const allowed = new Set(intent.assets.map(asset => String(asset.id)));
  const uploadedAssets = (Array.isArray(input.uploadedAssets) ? input.uploadedAssets : [])
    .slice(0, MAX_AIFLOW_UPLOAD_ITEMS)
    .map(item => ({ assetId: String(item?.assetId || '').trim(), remoteAssetId: String(item?.remoteAssetId || '').trim() }))
    .filter(item => allowed.has(item.assetId) && /^\d{1,18}$/.test(item.remoteAssetId));
  const result = await enqueueLibraryMutation(() => {
    const latest = collectorPermission();
    const confirmed = [];
    for (const item of uploadedAssets) {
      const asset = latest.assets.find(candidate => String(candidate.id) === item.assetId);
      if (!asset?.hash) continue;
      const mapping = upsertAIFlowMapping(latest.aiFlowMappings, {
        assetId: asset.id, currentHash: asset.hash, provider: 'ai-flow', origin: 'prompt-reference',
        remoteAssetId: item.remoteAssetId, name: asset.name || 'AI Flow 素材', projectId,
        matchMethod: 'upload-reference', status: 'confirmed',
      });
      latest.aiFlowMappings = mapping.data;
      confirmed.push(item.assetId);
    }
    const attachment = queueAIFlowReferenceAttachment(latest, {
      serverOrigin,
      projectId,
      remoteAssetIds: uploadedAssets.map(item => item.remoteAssetId),
    }) || pendingAIFlowReferenceAttachmentForPage(latest, { serverOrigin, projectId });
    writeJson(indexFile(libraryPath), latest);
    return { confirmed, attachment: publicAIFlowReferenceAttachment(attachment) };
  });
  pendingAIFlowUpload = null;
  notifyLibraryChanged(readLibrary());
  return { ok: true, confirmed: result.confirmed.length, attachment: result.attachment };
}

async function completeCollectorAIFlowReferenceAttachment(req) {
  const input = parseCollectorJson(await readCollectorBody(req, 12 * 1024), 'AI Flow 引用加入完成请求无效');
  const serverOrigin = validatedAIFlowPageOrigin(input.pageUrl);
  const projectId = collectorNumericValue(input.projectId, 'AI Flow 项目 ID');
  const attachmentId = String(input.attachmentId || '').trim();
  const attachedAssetIds = normalizedAIFlowReferenceRemoteIds(input.attachedAssetIds).slice(0, MAX_AIFLOW_UPLOAD_ITEMS);
  if (!attachmentId || !attachedAssetIds.length) return { ok: true, acknowledged: 0, remaining: 0 };
  return enqueueLibraryMutation(() => {
    const data = collectorPermission();
    const attachment = pendingAIFlowReferenceAttachmentForPage(data, { serverOrigin, projectId });
    if (!attachment || attachment.id !== attachmentId) return { ok: true, acknowledged: 0, remaining: 0, ignored: true };
    const accepted = new Set(attachedAssetIds.filter(id => attachment.remoteAssetIds.includes(id)));
    if (!accepted.size) return { ok: true, acknowledged: 0, remaining: attachment.remoteAssetIds.length };
    attachment.remoteAssetIds = attachment.remoteAssetIds.filter(id => !accepted.has(id));
    const attachments = normalizeAIFlowReferenceAttachments(data).filter(item => item.id !== attachment.id || item.remoteAssetIds.length);
    data.aiFlowReferenceAttachments = attachments;
    pendingAIFlowReferenceAttachment = attachments.find(item => item.id === attachment.id) || null;
    writeJson(indexFile(libraryPath), data);
    return { ok: true, acknowledged: accepted.size, remaining: attachment.remoteAssetIds.length };
  });
}

async function prepareCollectorAIFlowLivePlan(req) {
  const input = parseCollectorJson(await readCollectorBody(req, 12 * 1024), 'AI Flow 实时同步请求无效');
  const serverOrigin = validatedAIFlowPageOrigin(input.pageUrl);
  const projectId = collectorNumericValue(input.projectId, 'AI Flow 项目 ID');
  const permission = collectorPermission();
  const roots = liveSyncRootsForPage(permission, { serverOrigin, projectId });
  const pending = pendingLiveUploadsForPage(permission, { serverOrigin, projectId });
  const now = Date.now();
  const forceRetry = input.forceRetry === true;
  const readyUploads = prioritizedLiveUploads(pending, { now, includeDeferred: forceRetry });
  const nextRetryAt = forceRetry ? 0 : nextLiveUploadRetryAt(pending, { now });
  const deletes = pendingRemoteDeletesForPage(permission, { serverOrigin, projectId });
  const moves = pendingRemoteMovesForPage(permission, { serverOrigin, projectId });
  const missing = [];
  const assets = [];
  for (const item of readyUploads.slice(0, MAX_AIFLOW_UPLOAD_ITEMS)) {
    try {
      assets.push(preparedAIFlowUploadAsset(item.asset, {
        remoteFolderId: item.target.remoteFolderId,
        remoteFolderName: (permission.folders || []).find(folder => String(folder.id) === item.target.localFolderId)?.name || '我的素材',
        rootFolderId: item.target.rootFolderId,
        projectId: item.target.projectId,
        serverOrigin: item.target.serverOrigin,
      }));
    } catch {
      missing.push(item.asset.id);
    }
  }
  if (missing.length) {
    await enqueueLibraryMutation(() => {
      const latest = collectorPermission();
      removePendingLiveUploads(latest, missing);
      writeJson(indexFile(libraryPath), latest);
      return { ok: true };
    });
  }
  return {
    serverOrigin,
    projectId,
    roots,
    assets,
    deletes: deletes.slice(0, MAX_AIFLOW_UPLOAD_ITEMS),
    moves: moves.slice(0, MAX_AIFLOW_UPLOAD_ITEMS),
    nextRetryAt,
    wakeSequence: aiFlowLiveWakeSequence,
  };
}

async function readCollectorAIFlowLiveStatus(req) {
  const input = parseCollectorJson(await readCollectorBody(req, 12 * 1024), 'AI Flow 实时同步状态请求无效');
  const serverOrigin = validatedAIFlowPageOrigin(input.pageUrl);
  const projectId = collectorNumericValue(input.projectId, 'AI Flow 项目 ID');
  // This endpoint is intentionally read-only. It shares the paired bridge,
  // configured AI Flow page-origin, and editor permission boundary with the
  // live-sync plan, but it never normalizes or writes the queue.
  const permission = collectorPermission();
  return { ok: true, ...liveSyncStatusForPage(permission, { serverOrigin, projectId }) };
}

async function cancelCollectorAIFlowLiveUpload(req) {
  const input = parseCollectorJson(await readCollectorBody(req, 12 * 1024), 'AI Flow 取消上传请求无效');
  const serverOrigin = validatedAIFlowPageOrigin(input.pageUrl);
  const projectId = collectorNumericValue(input.projectId, 'AI Flow 项目 ID');
  const assetId = String(input.assetId || '').trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(assetId)) throw new Error('待取消的素材无效');
  const result = await enqueueLibraryMutation(() => {
    const latest = collectorPermission();
    const allowed = new Set(pendingLiveUploadsForPage(latest, { serverOrigin, projectId }).map(item => String(item.asset.id)));
    if (!allowed.has(assetId)) return { removed: 0 };
    const removed = removePendingLiveUploads(latest, [assetId]);
    if (removed) writeJson(indexFile(libraryPath), latest);
    return { removed };
  });
  if (result?.error) throw new Error(result.error);
  if (result.removed) {
    publishAIFlowLiveWake();
    notifyLibraryChanged(readLibrary());
  }
  return {
    ok: true,
    removed: result.removed,
    message: result.removed ? '已取消尚未开始的上传任务' : '该素材已开始上传、已完成或不属于当前 AI Flow 项目',
  };
}

async function waitCollectorAIFlowLiveWake(req, res) {
  const input = parseCollectorJson(await readCollectorBody(req, 12 * 1024), 'AI Flow 即时同步请求无效');
  const serverOrigin = validatedAIFlowPageOrigin(input.pageUrl);
  const projectId = collectorNumericValue(input.projectId, 'AI Flow 项目 ID');
  const since = Math.max(0, Number(input.since) || 0);
  if (since < aiFlowLiveWakeSequence) return { wakeSequence: aiFlowLiveWakeSequence, woke: true };
  // A local import can land just before the extension attaches its long-poll.
  // Treat an already queued, scoped asset as a wake-up instead of waiting for
  // some later unrelated file change.
  const pending = pendingLiveUploadsForPage(collectorPermission(), { serverOrigin, projectId });
  const deletes = pendingRemoteDeletesForPage(collectorPermission(), { serverOrigin, projectId });
  const moves = pendingRemoteMovesForPage(collectorPermission(), { serverOrigin, projectId });
  const now = Date.now();
  const readyUploads = prioritizedLiveUploads(pending, { now });
  const nextRetryAt = nextLiveUploadRetryAt(pending, { now });
  if (readyUploads.length || deletes.length || moves.length) return { wakeSequence: aiFlowLiveWakeSequence, woke: true, pending: true, nextRetryAt };
  if (nextRetryAt) return { wakeSequence: aiFlowLiveWakeSequence, woke: true, pending: true, nextRetryAt };
  return new Promise(resolve => {
    let finished = false;
    const finish = result => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      aiFlowLiveWakeWaiters.delete(wake);
      res.removeListener('close', closed);
      resolve(result);
    };
    const wake = () => finish({ wakeSequence: aiFlowLiveWakeSequence, woke: true });
    const closed = () => finish({ wakeSequence: aiFlowLiveWakeSequence, closed: true });
    const timeout = setTimeout(() => finish({ wakeSequence: aiFlowLiveWakeSequence, timedOut: true }), 25 * 1000);
    aiFlowLiveWakeWaiters.add(wake);
    res.once('close', closed);
  });
}

async function completeCollectorAIFlowLiveUpload(req) {
  const input = parseCollectorJson(await readCollectorBody(req, 12 * 1024), 'AI Flow 实时上传完成请求无效');
  const serverOrigin = validatedAIFlowPageOrigin(input.pageUrl);
  const projectId = collectorNumericValue(input.projectId, 'AI Flow 项目 ID');
  const assetIds = Array.isArray(input.assetIds) ? input.assetIds.map(value => String(value || '')).filter(Boolean).slice(0, MAX_AIFLOW_UPLOAD_ITEMS) : [];
  const uploadedAssets = (Array.isArray(input.uploadedAssets) ? input.uploadedAssets : []).slice(0, MAX_AIFLOW_UPLOAD_ITEMS).map(item => ({ assetId: String(item?.assetId || '').trim(), remoteAssetId: String(item?.remoteAssetId || '').trim() })).filter(item => item.assetId && /^\d{1,18}$/.test(item.remoteAssetId));
  if (!assetIds.length) return { ok: true, removed: 0 };
  const result = await enqueueLibraryMutation(() => {
    const latest = collectorPermission();
    const allowed = new Set(pendingLiveUploadsForPage(latest, { serverOrigin, projectId }).map(item => String(item.asset.id)));
    const accepted = assetIds.filter(id => allowed.has(id));
    const acceptedSet = new Set(accepted);
    const removed = removePendingLiveUploads(latest, accepted);
    for (const item of uploadedAssets) {
      if (!acceptedSet.has(item.assetId)) continue;
      const asset = latest.assets.find(candidate => String(candidate.id) === item.assetId);
      if (!asset?.hash) continue;
      const mapping = upsertAIFlowMapping(latest.aiFlowMappings, {
        assetId: asset.id, currentHash: asset.hash, provider: 'ai-flow', origin: 'live-sync',
        remoteAssetId: item.remoteAssetId, name: asset.name || 'AI Flow 素材', projectId,
        matchMethod: 'upload-batch', status: 'confirmed',
      });
      latest.aiFlowMappings = mapping.data;
    }
    writeJson(indexFile(libraryPath), latest);
    return { removed, library: publicLibrary(latest) };
  });
  if (result?.error) throw new Error(result.error);
  notifyLibraryChanged(readLibrary());
  return { ok: true, removed: result.removed };
}

async function completeCollectorAIFlowLiveDelete(req) {
  const input = parseCollectorJson(await readCollectorBody(req, 12 * 1024), 'AI Flow 实时删除确认无效');
  const serverOrigin = validatedAIFlowPageOrigin(input.pageUrl);
  const projectId = collectorNumericValue(input.projectId, 'AI Flow 项目 ID');
  const remoteAssetIds = (Array.isArray(input.remoteAssetIds) ? input.remoteAssetIds : []).map(value => String(value || '').trim()).filter(value => /^\d{1,18}$/.test(value)).slice(0, MAX_AIFLOW_UPLOAD_ITEMS);
  if (!remoteAssetIds.length) return { ok: true, removed: 0 };
  const result = await enqueueLibraryMutation(() => {
    const latest = collectorPermission();
    const allowed = new Set(pendingRemoteDeletesForPage(latest, { serverOrigin, projectId }).map(item => item.remoteAssetId));
    const removed = removePendingRemoteDeletes(latest, remoteAssetIds.filter(id => allowed.has(id)), { serverOrigin, projectId });
    writeJson(indexFile(libraryPath), latest);
    return { removed };
  });
  if (result?.error) throw new Error(result.error);
  notifyLibraryChanged(readLibrary());
  return { ok: true, removed: result.removed };
}

async function completeCollectorAIFlowLiveMove(req) {
  const input = parseCollectorJson(await readCollectorBody(req, 12 * 1024), 'AI Flow 实时移动确认无效');
  const serverOrigin = validatedAIFlowPageOrigin(input.pageUrl);
  const projectId = collectorNumericValue(input.projectId, 'AI Flow 项目 ID');
  const moves = liveMoveRecords(input.moves);
  if (!moves.length) return { ok: true, removed: 0 };
  const result = await enqueueLibraryMutation(() => {
    const latest = collectorPermission();
    const allowed = new Set(pendingRemoteMovesForPage(latest, { serverOrigin, projectId }).map(liveMoveKey));
    const accepted = moves.filter(item => allowed.has(liveMoveKey(item)));
    const removed = removePendingRemoteMoves(latest, accepted, { serverOrigin, projectId });
    if (removed) writeJson(indexFile(libraryPath), latest);
    return { removed };
  });
  if (result?.error) throw new Error(result.error);
  if (result.removed) notifyLibraryChanged(readLibrary());
  return { ok: true, removed: result.removed };
}

async function reportCollectorAIFlowLiveDeleteFailure(req) {
  const input = parseCollectorJson(await readCollectorBody(req, 12 * 1024), 'AI Flow 实时删除失败请求无效');
  const serverOrigin = validatedAIFlowPageOrigin(input.pageUrl);
  const projectId = collectorNumericValue(input.projectId, 'AI Flow 项目 ID');
  const failures = (Array.isArray(input.failures) ? input.failures : []).slice(0, MAX_AIFLOW_UPLOAD_ITEMS).map(item => ({ remoteAssetId: String(item?.remoteAssetId || '').trim(), error: String(item?.error || '').trim().slice(0, 500) })).filter(item => /^\d{1,18}$/.test(item.remoteAssetId) && item.error);
  if (!failures.length) return { ok: true, updated: 0 };
  const result = await enqueueLibraryMutation(() => {
    const latest = collectorPermission();
    const updated = recordRemoteDeleteFailures(latest, failures, { serverOrigin, projectId });
    writeJson(indexFile(libraryPath), latest);
    return { updated };
  });
  if (result?.error) throw new Error(result.error);
  return { ok: true, updated: result.updated };
}

async function reportCollectorAIFlowLiveMoveFailure(req) {
  const input = parseCollectorJson(await readCollectorBody(req, 12 * 1024), 'AI Flow 实时移动失败请求无效');
  const serverOrigin = validatedAIFlowPageOrigin(input.pageUrl);
  const projectId = collectorNumericValue(input.projectId, 'AI Flow 项目 ID');
  const failures = liveMoveRecords(input.failures, { includeError: true });
  if (!failures.length) return { ok: true, updated: 0 };
  const result = await enqueueLibraryMutation(() => {
    const latest = collectorPermission();
    const updated = recordRemoteMoveFailures(latest, failures, { serverOrigin, projectId });
    if (updated) writeJson(indexFile(libraryPath), latest);
    return { updated };
  });
  if (result?.error) throw new Error(result.error);
  if (result.updated) notifyLibraryChanged(readLibrary());
  return { ok: true, updated: result.updated };
}

async function reportCollectorAIFlowLiveUploadFailure(req) {
  const input = parseCollectorJson(await readCollectorBody(req, 12 * 1024), 'AI Flow 实时上传失败请求无效');
  const serverOrigin = validatedAIFlowPageOrigin(input.pageUrl);
  const projectId = collectorNumericValue(input.projectId, 'AI Flow 项目 ID');
  const failures = (Array.isArray(input.failures) ? input.failures : [])
    .slice(0, MAX_AIFLOW_UPLOAD_ITEMS)
    .map(item => ({
      assetId: String(item?.assetId || '').trim(),
      error: String(item?.error || '').trim().slice(0, 500),
    }))
    .filter(item => item.assetId && item.error);
  if (!failures.length) return { ok: true, updated: 0 };
  const result = await enqueueLibraryMutation(() => {
    const latest = collectorPermission();
    const recorded = recordLiveUploadFailures(latest, failures, { serverOrigin, projectId });
    if (recorded.updated) writeJson(indexFile(libraryPath), latest);
    return recorded;
  });
  if (result?.error) throw new Error(result.error);
  if (result.updated) notifyLibraryChanged(readLibrary());
  return { ok: true, updated: result.updated, nextRetryAt: result.nextRetryAt };
}

async function streamCollectorAIFlowUploadData(req, res) {
  const input = parseCollectorJson(await readCollectorBody(req, 12 * 1024), 'AI Flow 上传文件请求无效');
  const intent = activeAIFlowUpload(input.uploadId);
  const assetId = String(input.assetId || '').trim();
  const asset = intent.assets.find(item => String(item.id) === assetId);
  if (!asset) throw new Error('该素材不在当前待上传列表中');
  const stat = await fs.promises.stat(asset.file).catch(() => null);
  if (!stat?.isFile()) throw new Error(`“${asset.name}”的本地原文件已不存在`);
  if (stat.size > MAX_AIFLOW_UPLOAD_BYTES) throw new Error(`“${asset.name}”超过 500 MB，暂不支持通过扩展上传`);
  res.writeHead(200, {
    'content-type': asset.mime,
    'content-length': String(stat.size),
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
  });
  await pipeline(openLibraryReadStream(asset.file), res);
}

async function streamCollectorAIFlowLiveUploadData(req, res) {
  const input = parseCollectorJson(await readCollectorBody(req, 12 * 1024), 'AI Flow 实时上传文件请求无效');
  const serverOrigin = validatedAIFlowPageOrigin(input.pageUrl);
  const projectId = collectorNumericValue(input.projectId, 'AI Flow 项目 ID');
  const assetId = String(input.assetId || '').trim();
  if (!assetId) throw new Error('AI Flow 实时上传素材无效');
  const data = collectorPermission();
  const pending = pendingLiveUploadsForPage(data, { serverOrigin, projectId });
  const item = pending.find(candidate => String(candidate.asset.id) === assetId);
  if (!item) throw new Error('该素材不在当前 AI Flow 实时上传队列中');
  const asset = preparedAIFlowUploadAsset(item.asset, {
    remoteFolderId: item.target.remoteFolderId,
    remoteFolderName: (data.folders || []).find(folder => String(folder.id) === item.target.localFolderId)?.name || '我的素材',
    rootFolderId: item.target.rootFolderId,
    projectId: item.target.projectId,
    serverOrigin: item.target.serverOrigin,
  });
  const stat = await fs.promises.stat(asset.file).catch(() => null);
  if (!stat?.isFile()) throw new Error(`“${asset.name}”的本地原文件已不存在`);
  // The extension currently materializes bridge responses as Blob objects.
  // Keep the same bounded payload rule as manual uploads so two live workers
  // cannot exhaust memory with oversized media.
  if (stat.size > MAX_AIFLOW_UPLOAD_BYTES) throw new Error(`“${asset.name}”超过 500 MB，暂不支持通过扩展上传`);
  res.writeHead(200, {
    'content-type': asset.mime,
    'content-length': String(stat.size),
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
  });
  await pipeline(openLibraryReadStream(asset.file), res);
}

function startSecureClipServer() {
  const promptReviewer = require('./prompt-review.cjs').createPromptReview({ settings: readAISettings, secrets: readAISecrets, router: aiRouter, recordUsage: recordAIUsage });
  getWebCollectorBridgeKey();
  const server = http.createServer(async (req, res) => {
    const origin = String(req.headers.origin || '');
    const extensionOrigin = origin.startsWith('chrome-extension://');
    res.setHeader('Access-Control-Allow-Origin', extensionOrigin ? origin : 'null');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type,x-nest-name,x-nest-bridge,x-nest-aiflow-asset-id,x-nest-aiflow-project-id,x-nest-aiflow-page,x-nest-aiflow-folder-id,x-nest-aiflow-root-folder-id');
    if (req.method === 'OPTIONS') {
      res.writeHead(extensionOrigin ? 204 : 403);
      return res.end();
    }
    if (req.method !== 'POST' || !extensionOrigin || !collectorBridgeMatches(req.headers['x-nest-bridge'])) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('浏览器采集扩展未配对，请在小旺仔素材库中重新准备扩展');
    }
    try {
      const readOnlyDiffRequest = req.url === '/aiflow-folder-diff-preview' || req.url === '/aiflow-library-assets' || ['/prompt-review-status', '/prompt-review', '/prompt-review-result'].includes(req.url);
      if (!readOnlyDiffRequest) collectorPermission();
      let result;
      if (req.url === '/prompt-review-status') result = promptReviewer.status();
      else if (req.url === '/prompt-review') result = promptReviewer.start(parseCollectorJson(await readCollectorBody(req, 256 * 1024), '审查请求格式错误'));
      else if (req.url === '/prompt-review-result') result = promptReviewer.result(parseCollectorJson(await readCollectorBody(req, 4096), '审查编号无效').jobId);
      else if (req.url === '/clip-data') result = await importCollectorImage(req);
      else if (req.url === '/clip') result = await importCollectorImageUrl(req);
      else if (req.url === '/aiflow-video') result = await importCollectorAIFlowVideo(req);
      else if (req.url === '/aiflow-asset-data') result = await importCollectorAIFlowAsset(req);
      else if (req.url === '/aiflow-asset-link') result = await confirmAIFlowAssetLink(req);
      else if (req.url === '/aiflow-folder-target') result = await resolveCollectorAIFlowFolderTarget(req);
      else if (req.url === '/aiflow-folder-diff-preview') result = await previewCollectorAIFlowFolderDiff(req);
      else if (req.url === '/aiflow-library-assets') result = await listCollectorLibraryAssets(req);
      else if (req.url === '/aiflow-reference-select') result = await prepareCollectorAIFlowReferenceSelection(req);
      else if (req.url === '/aiflow-match-storyboard-assets') result = await matchCollectorStoryboardAssets(req);
      else if (req.url === '/aiflow-folder-structure') result = await mirrorCollectorAIFlowFolders(req);
      else if (req.url === '/aiflow-upload-plan') result = await prepareCollectorAIFlowUpload(req);
      else if (req.url === '/aiflow-reference-upload-plan') result = await prepareCollectorAIFlowReferenceUpload(req);
      else if (req.url === '/aiflow-reference-upload-complete') result = await completeCollectorAIFlowReferenceUpload(req);
      else if (req.url === '/aiflow-reference-attach-complete') result = await completeCollectorAIFlowReferenceAttachment(req);
      else if (req.url === '/aiflow-live-plan') result = await prepareCollectorAIFlowLivePlan(req);
      else if (req.url === '/aiflow-live-status') result = await readCollectorAIFlowLiveStatus(req);
      else if (req.url === '/aiflow-live-upload-cancel') result = await cancelCollectorAIFlowLiveUpload(req);
      else if (req.url === '/aiflow-live-wait') result = await waitCollectorAIFlowLiveWake(req, res);
      else if (req.url === '/aiflow-live-upload-complete') result = await completeCollectorAIFlowLiveUpload(req);
      else if (req.url === '/aiflow-live-upload-failed') result = await reportCollectorAIFlowLiveUploadFailure(req);
      else if (req.url === '/aiflow-live-delete-complete') result = await completeCollectorAIFlowLiveDelete(req);
      else if (req.url === '/aiflow-live-delete-failed') result = await reportCollectorAIFlowLiveDeleteFailure(req);
      else if (req.url === '/aiflow-live-move-complete') result = await completeCollectorAIFlowLiveMove(req);
      else if (req.url === '/aiflow-live-move-failed') result = await reportCollectorAIFlowLiveMoveFailure(req);
      else if (req.url === '/aiflow-upload-data') {
        await streamCollectorAIFlowUploadData(req, res);
        return;
      }
      else if (req.url === '/aiflow-live-upload-data') {
        await streamCollectorAIFlowLiveUploadData(req, res);
        return;
      }
      else {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('Not found');
      }
      return writeCollectorResult(res, 200, result);
    } catch (error) {
      return writeCollectorResult(res, 400, { error: redact(error.message) });
    }
  });
  server.on('error', error => { if (error.code !== 'EADDRINUSE') console.error('Clip server:', error); });
  server.listen(32145, '127.0.0.1');
  return server;
}

async function prepareBrowserExtension(browser) {
  const macApplications = '/Applications';
  const choices = {
    chrome: { name: 'Google Chrome', url: 'chrome://extensions', paths: process.platform === 'darwin' ? [path.join(macApplications, 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome')] : [path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')] },
    edge: { name: 'Microsoft Edge', url: 'edge://extensions', paths: process.platform === 'darwin' ? [path.join(macApplications, 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge')] : [path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'), path.join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe')] },
  };
  const choice = choices[browser];
  if (!choice) return { ok: false, error: '不支持的浏览器' };
  const extensionSources = app.isPackaged
    ? [
        // The release build copies this directory beside app.asar so browsers can load it.
        path.join(process.resourcesPath, 'browser-extension'),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'browser-extension'),
        // Portable builds keep the extension inside app.asar; Electron can read it directly.
        path.join(app.getAppPath(), 'browser-extension'),
        path.join(process.resourcesPath, 'app', 'browser-extension'),
      ]
    : [path.join(app.getAppPath(), 'browser-extension')];
  const source = extensionSources.find(candidate => fs.existsSync(path.join(candidate, 'manifest.json')));
  const target = path.join(app.getPath('userData'), 'Nest 网页采集器');
  try {
    if (!source) throw new Error('安装包中缺少网页采集扩展，请安装最新版本');
    await fs.promises.rm(target, { recursive: true, force: true });
    await fs.promises.cp(source, target, { recursive: true });
    await fs.promises.writeFile(path.join(target, 'config.js'), `// 由小旺仔素材库生成，请勿分享。\nglobalThis.NEST_BRIDGE_KEY = ${JSON.stringify(getWebCollectorBridgeKey())};\n`, 'utf8');
    const executable = choice.paths.find(item => item && fs.existsSync(item));
    if (!executable) return { ok: false, error: `没有检测到 ${choice.name}`, path: target };
    // Reveal the unpacked directory first, then bring a dedicated Edge extension
    // manager window forward. This gives the user both required surfaces.
    shell.showItemInFolder(path.join(target, 'manifest.json'));
    const openManager = setTimeout(() => {
      spawn(executable, ['--new-window', choice.url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    }, 350);
    openManager.unref?.();
    clipboard.writeText(target);
    return { ok: true, browser: choice.name, path: target, managerUrl: choice.url, directoryOpened: true };
  } catch (error) {
    return { ok: false, error: error.message, path: target };
  }
}

aiFlowSourceMetadata = function aiFlowSourceMetadataV2(kind, record) {
  const base = { provider: 'AI Flow', kind, importedAt: Date.now() };
  if (kind !== 'server') return { ...base, relativePath: record.relativePath || '' };
  return {
    ...base,
    taskId: record.taskId,
    model: record.model || '',
    prompt: String(record.prompt || '').slice(0, 2000),
    duration: Number(record.duration) || 0,
    completedAt: Number(record.completedAt) || 0,
    projectId: record.projectId || '',
    projectName: record.projectName || '',
    episodeId: record.episodeId || '',
    episodeName: record.episodeName || '',
    episodeSort: record.episodeSort ?? null,
    episodeNumber: record.episodeNumber ?? null,
    storyOrder: record.storyOrder ?? null,
    shotNumber: record.shotNumber ?? null,
    versionNumber: record.versionNumber ?? null,
  };
};

function compareAIFlowVideoOrder(left, right) {
  const order = value => Number.isFinite(Number(value)) ? Number(value) : Number.MAX_SAFE_INTEGER;
  return order(left.storyOrder) - order(right.storyOrder)
    || order(left.shotNumber) - order(right.shotNumber)
    || order(left.versionNumber) - order(right.versionNumber)
    || Number(right.completedAt || 0) - Number(left.completedAt || 0)
    || String(left.name || '').localeCompare(String(right.name || ''), 'zh-CN');
}

async function listAIFlowServerVideos(options = {}) {
  const client = aiFlowClient();
  let account = null;
  if (client.authMode === 'session') {
    const status = await readAIFlowSessionStatus(client.baseUrl);
    if (!status.authenticated) return { error: '请先登录 AI Flow 账号' };
    account = status.account;
  }
  const selectedEpisodeId = options?.episodeId == null ? '' : String(options.episodeId).trim();
  const [projects, rawVideos] = await Promise.all([
    client.listProjects(),
    client.listCompletedVideos({ limit: selectedEpisodeId ? 2000 : 300, episodeId: selectedEpisodeId || undefined }),
  ]);
  const videos = attachProjectAndEpisodeLabels(rawVideos, projects).sort(compareAIFlowVideoOrder);
  return rememberAIFlowScan('server', videos, {
    baseUrl: client.baseUrl,
    authMode: client.authMode,
    accountId: account?.id || '',
    sourceLabel: client.authMode === 'session' ? 'AI Flow 已登录账号' : 'AI Flow 服务',
    projects,
    selectedEpisodeId,
  });
}

startClipServer = startSecureClipServer;
ipcMain.removeHandler('extension:prepare');
ipcMain.handle('extension:prepare', (_, browser) => prepareBrowserExtension(browser));
ipcMain.handle('extension:open-manager', async (_, browser) => {
  const choices = {
    chrome: { name: 'Google Chrome', url: 'chrome://extensions', paths: [path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')] },
    edge: { name: 'Microsoft Edge', url: 'edge://extensions', paths: [path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'), path.join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe')] },
  };
  const choice = choices[browser];
  if (!choice) return { ok: false, error: '不支持的浏览器' };
  const executable = choice.paths.find(item => item && fs.existsSync(item));
  if (!executable) return { ok: false, error: `没有检测到 ${choice.name}` };
  try {
    spawn(executable, ['--new-window', choice.url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return { ok: true, mode: 'uninstall', browser: choice.name };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});
ipcMain.handle('library:set-extension-import-target', (_, folderId) => setExtensionImportTarget(folderId));
ipcMain.removeHandler('aiflow:list-server-videos');
ipcMain.handle('aiflow:list-server-videos', async (_, options = {}) => {
  try {
    return await listAIFlowServerVideos(options);
  } catch (error) {
    return { error: redact(error.message) };
  }
});

require('./lan-chat-client.cjs').registerChat({ app, ipcMain, dialog, getAssetPath: id => { const asset = readLibrary()?.assets?.find(item => item.id === id); return asset?.file ? storedAssetPath(asset.file) : null; } });
