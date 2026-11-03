import { MarkdownReader } from './markdown-reader.jsx';
import { LanChat } from './lan-chat.jsx';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { waveformCache } from "./waveform-cache.js";
import { subscribeAssetAudio } from "./audio-asset-subscription.js";
import {
  Archive,
  ArrowDownAZ,
  ArrowUpAZ,
  Bell,
  Box,
  Briefcase,
  Brush,
  Bug,
  Camera,
  Check,
  ChevronDown,
  Clapperboard,
  ClipboardCopy,
  Clock,
  Columns3,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileText,
  Filter,
  Folder,
  FolderOpen,
  Grid2X2,
  HardDrive,
  Heart,
  Image as ImageIcon,
  Import,
  Infinity as InfinityIcon,
  Info,
  LayoutGrid,
  Link2,
  List,
  LogIn,
  LogOut,
  MapPin,
  Maximize2,
  Menu,
  Minus,
  MoreHorizontal,
  Music,
  Palette,
  Pause,
  Pencil,
  Play,
  Plus,
  Puzzle,
  RotateCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  StickyNote,
  Tag,
  Trash2,
  Video,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import "./styles.css";
import "./ai-assistant.css";
import "./ai-settings-page.css";
import ReferenceBoard from "./reference-board.jsx";
import appIcon from "../build/icon.png";
import directorPrankVideo from "./assets/director-prank.mp4";
import communitySupportAvatar from "./assets/community-support-avatar.png";
import communitySupportPaymentQr from "./assets/community-support-payment-qr.png";
import { buildFolderRows, toggleExpandedFolder } from "./folder-tree.js";
import {
  DEFAULT_THEME,
  THEME_FIELDS,
  THEME_PRESETS,
  THEME_STORAGE_KEY,
  contrastRatio,
  hexToRgba,
  hsvToRgb,
  loadTheme,
  normalizeHex,
  readableText,
  rgbToHsl,
  rgbToHsv,
  rgbaToHex,
  themeStyle,
} from "./theme-utils.js";
import { audioPreviewManager } from "./audio-preview-manager.js";
import { BACKGROUND_MUSIC_STORAGE_KEY, BACKGROUND_MUSIC_VOLUME_STORAGE_KEY, backgroundMusic, backgroundMusicEnabledFromStorage, backgroundMusicVolumeFromStorage } from "./background-music.js";
import { assetMatchesTag, buildTagTree } from "./tag-tree.js";

const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "3.0.4";
const CURRENT_RELEASE_NOTES = [
  {
    type: "新增",
    title: "深度视频转换",
    items: ["视频右键即可生成灰度深度视频，原视频和音频会保留。", "转换过程显示进度，未完成时可取消并自动清理临时文件。"],
  },
  {
    type: "优化",
    title: "AI Flow 文件夹同步",
    items: ["连接文件夹中的导入、移动和上传会进入同步队列。", "自动刷新开启后会更新连接素材的显示状态。"],
  },
  {
    type: "优化",
    title: "聊天与文件传输",
    items: ["支持发送任意文件，单个附件上限提升至 10 GB。", "新加入成员可读取历史消息，接收文件保留原始下载名称。"],
  },
  {
    type: "优化",
    title: "素材与参考画布",
    items: ["Markdown 可作为素材导入并按标题、列表、表格和代码块阅读。", "无限参考板底部素材栏可调整高度，并可从中拖入素材。"],
  },
  {
    type: "修复",
    title: "界面与资源库稳定性",
    items: ["移除不再使用的“合集”，简化素材库侧栏与插件权限。", "旧资源库会自动清理历史合集数据，不影响素材和真实文件夹。"],
  },
];
const DB_NAME = "nest-assets";
const STORE = "assets";
const seed = [
  {
    id: "seed-1",
    name: "Sea glass study",
    type: "image/svg+xml",
    size: 18430,
    width: 900,
    height: 1200,
    tags: ["灵感", "摄影"],
    favorite: true,
    createdAt: Date.now() - 5000,
    url: "./samples/sea.svg",
  },
  {
    id: "seed-2",
    name: "Soft architecture",
    type: "image/svg+xml",
    size: 21800,
    width: 1200,
    height: 820,
    tags: ["建筑", "留白"],
    createdAt: Date.now() - 4000,
    url: "./samples/arch.svg",
  },
  {
    id: "seed-3",
    name: "Orange chair",
    type: "image/svg+xml",
    size: 9200,
    width: 900,
    height: 1120,
    tags: ["家具", "配色"],
    createdAt: Date.now() - 3000,
    url: "./samples/chair.svg",
  },
  {
    id: "seed-4",
    name: "Editorial objects",
    type: "image/svg+xml",
    size: 11000,
    width: 1200,
    height: 800,
    tags: ["静物", "编辑"],
    createdAt: Date.now() - 2000,
    url: "./samples/objects.svg",
  },
  {
    id: "seed-5",
    name: "Quiet landscape",
    type: "image/svg+xml",
    size: 24400,
    width: 1200,
    height: 900,
    tags: ["自然", "摄影"],
    createdAt: Date.now() - 1000,
    url: "./samples/landscape.svg",
  },
];

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function getAssets() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = db.transaction(STORE).objectStore(STORE).getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function saveAsset(asset) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = db.transaction(STORE, "readwrite").objectStore(STORE).put(asset);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}
async function removeAsset(id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}
const PENDING_KEY = "nest-pending-edits";
const INTERNAL_DRAG = "application/x-nest-asset-ids";
const FOLDER_DRAG = "application/x-nest-folder-id";
const ROOT_FOLDER_DROP = "__folder_root__";
const SIDEBAR_WIDTH_KEY = "nest-sidebar-width";
const VIEW_MODE_KEY = "nest-view-mode";
const VIEW_MODES = ["standard", "compact", "list"];
const SORT_OPTIONS = [
  ["recent", "最近添加", Clock],
  ["oldest", "最早添加", Clock],
  ["nameAsc", "名称 A–Z", ArrowDownAZ],
  ["nameDesc", "名称 Z–A", ArrowUpAZ],
  ["sizeDesc", "大小：大到小", Columns3],
  ["sizeAsc", "大小：小到大", Columns3],
];
const FILTER_TYPES = [
  ["image", "图片"],
  ["video", "视频"],
  ["audio", "音频"],
  ["text", "剧本"],
  ["application", "文档"],
];
const FILTER_FORMATS = [
  "JPG",
  "PNG",
  "WEBP",
  "GIF",
  "SVG",
  "MP4",
  "MOV",
  "MP3",
  "WAV",
  "FLAC",
  "PDF",
  "DOCX",
  "TXT",
  "MD",
  "FOUNTAIN",
];
const MIME_FORMAT = {
  jpeg: "JPG",
  "svg+xml": "SVG",
  quicktime: "MOV",
  mpeg: "MP3",
  mp4: "MP4",
  "x-m4v": "M4V",
  "x-ms-wma": "WMA",
};
const assetFormat = (asset) => {
  if (asset.documentFormat) return asset.documentFormat;
  const fromName = asset.name?.match(/\.([a-z0-9]+)$/i)?.[1];
  if (fromName) return (MIME_FORMAT[fromName.toLowerCase()] || fromName).toUpperCase();
  const subtype = (asset.type?.split("/")[1] || "").toLowerCase();
  return (MIME_FORMAT[subtype] || subtype).toUpperCase();
};
const clampSidebarWidth = (value) =>
  Math.min(440, Math.max(190, Number(value) || 232));
const TETRIS_ACCESS_CODE = "963";
function readPending() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || "{}");
  } catch {
    return {};
  }
}
function writePending(id, data) {
  const all = readPending();
  all[id] = { ...(all[id] || {}), ...data };
  localStorage.setItem(PENDING_KEY, JSON.stringify(all));
}
function clearPending(id) {
  const all = readPending();
  delete all[id];
  if (Object.keys(all).length)
    localStorage.setItem(PENDING_KEY, JSON.stringify(all));
  else localStorage.removeItem(PENDING_KEY);
}
const fmt = (n) =>
  n > 1e6
    ? `${(n / 1e6).toFixed(1)} MB`
    : n < 1000
      ? "< 1 KB"
      : `${Math.round(n / 1000)} KB`;
const fmtCapacity = (n) => {
  const value = Number(n) || 0,
    tb = value / 1024 ** 4;
  return tb >= 1
    ? `${tb.toFixed(tb >= 10 ? 1 : 2)} TB`
    : `${(value / 1024 ** 3).toFixed(1)} GB`;
};
const FOLDER_ICONS = [
  ["folder", Folder],
  ["tag", Tag],
  ["image", ImageIcon],
  ["video", Video],
  ["file", FileText],
  ["star", Star],
  ["heart", Heart],
  ["briefcase", Briefcase],
  ["camera", Camera],
  ["music", Music],
  ["box", Box],
  ["brush", Brush],
  ["bell", Bell],
];
const FOLDER_COLORS = [
  "#f35f64",
  "#ff9f2f",
  "#f6c744",
  "#45c28b",
  "#44b9d8",
  "#438df5",
  "#8267ec",
  "#dc7fbd",
  "#8f98a3",
];
const folderIcon = (key) =>
  FOLDER_ICONS.find(([name]) => name === key)?.[1] || Folder;
if (window.nestDesktop?.platform)
  document.documentElement.dataset.platform = window.nestDesktop.platform;

function PixelImportIcon({ size = 16 }) {
  return (
    <svg
      className="pixel-icon pixel-icon--grass"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
    >
      <rect x="1" y="1" width="14" height="14" fill="#10291d" />
      <rect x="2" y="2" width="12" height="4" fill="#51c878" />
      <rect x="2" y="5" width="12" height="2" fill="#287347" />
      <rect x="2" y="7" width="12" height="7" fill="#70442b" />
      <rect x="3" y="8" width="3" height="2" fill="#925c3b" />
      <rect x="10" y="10" width="3" height="2" fill="#542f22" />
      <path d="M7 4h2v4h2v2H9v2H7v-2H5V8h2z" fill="#effff5" />
    </svg>
  );
}

function PixelChestIcon({ size = 20 }) {
  return (
    <svg
      className="pixel-icon pixel-icon--chest"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
    >
      <rect x="2" y="6" width="16" height="11" fill="#0a0d0d" />
      <rect x="3" y="5" width="14" height="5" fill="#5b341c" />
      <rect x="4" y="4" width="12" height="1" fill="#754820" />
      <rect x="4" y="5" width="12" height="3" fill="#ba7837" />
      <rect x="5" y="5" width="7" height="1" fill="#efb665" />
      <rect x="12" y="5" width="3" height="2" fill="#895321" />
      <rect x="4" y="8" width="12" height="1" fill="#815022" />
      <rect x="3" y="9" width="14" height="7" fill="#8f4f25" />
      <rect x="4" y="10" width="3" height="5" fill="#bc7135" />
      <rect x="7" y="10" width="6" height="5" fill="#9d5929" />
      <rect x="13" y="10" width="3" height="5" fill="#5c3019" />
      <rect x="3" y="15" width="14" height="1" fill="#482415" />
      <rect x="8" y="8" width="4" height="5" fill="#17120d" />
      <rect x="9" y="9" width="2" height="3" fill="#f1cf67" />
      <rect x="9" y="9" width="1" height="1" fill="#fff1a1" />
      <rect x="9" y="11" width="2" height="1" fill="#a76924" />
    </svg>
  );
}

function PixelPortalIcon({ size = 16 }) {
  return (
    <svg
      className="pixel-icon pixel-icon--portal"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
    >
      <rect x="1" y="1" width="14" height="14" fill="#160b2a" />
      <rect x="2" y="2" width="12" height="12" fill="#392153" />
      <rect x="3" y="3" width="10" height="10" fill="#6e3ca1" />
      <rect x="4" y="4" width="8" height="8" fill="#8d54c9" />
      <rect x="5" y="4" width="3" height="2" fill="#d5adff" />
      <rect x="8" y="7" width="3" height="2" fill="#562a86" />
      <rect x="5" y="10" width="4" height="1" fill="#c088ff" />
      <rect x="10" y="3" width="2" height="2" fill="#f1e2ff" />
    </svg>
  );
}

function PixelNavIcon({ kind, size = 17 }) {
  return (
    <svg
      className={`pixel-nav-icon pixel-nav-icon--${kind}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
    >
      {kind === "all" && (
        <>
          <rect x="1" y="1" width="6" height="6" fill="#21423f" />
          <rect x="2" y="2" width="3" height="3" fill="#63d9c2" />
          <rect x="9" y="1" width="6" height="6" fill="#21423f" />
          <rect x="10" y="2" width="3" height="3" fill="#36a98d" />
          <rect x="1" y="9" width="6" height="6" fill="#21423f" />
          <rect x="2" y="10" width="3" height="3" fill="#36a98d" />
          <rect x="9" y="9" width="6" height="6" fill="#21423f" />
          <rect x="10" y="10" width="3" height="3" fill="#8ff5dd" />
        </>
      )}
      {kind === "unclassified" && (
        <>
          <rect x="2" y="3" width="12" height="11" fill="#1a2020" />
          <rect x="3" y="4" width="10" height="8" fill="#72837c" />
          <rect x="3" y="4" width="10" height="2" fill="#a7b6ae" />
          <rect x="4" y="7" width="8" height="1" fill="#44524d" />
          <rect x="5" y="9" width="6" height="2" fill="#52635d" />
        </>
      )}
      {kind === "favorite" && (
        <path
          d="M2 4h3v1h1V4h4v1h1V4h3v2h1v4h-1v1h-1v1h-1v1h-1v1H7v-1H6v-1H5v-1H4v-1H3V6H2z"
          fill="#e07587"
        />
      )}
      {kind === "recent" && (
        <>
          <path d="M5 1h6v1h2v2h1v8h-1v2h-2v1H5v-1H3v-2H2V4h1V2h2z" fill="#5e4c26" />
          <rect x="5" y="3" width="6" height="1" fill="#f0d274" />
          <rect x="4" y="5" width="8" height="7" fill="#c79b42" />
          <rect x="7" y="6" width="2" height="4" fill="#fff0a4" />
          <rect x="9" y="9" width="2" height="2" fill="#fff0a4" />
        </>
      )}
      {kind === "image" && (
        <>
          <rect x="1" y="2" width="14" height="12" fill="#392618" />
          <rect x="2" y="3" width="12" height="10" fill="#9bd8f0" />
          <rect x="3" y="4" width="2" height="2" fill="#fff3a2" />
          <path d="M2 11h3v-2h2v1h2V8h2v2h3v3H2z" fill="#36a878" />
          <rect x="2" y="12" width="12" height="1" fill="#1d6a52" />
        </>
      )}
      {kind === "video" && (
        <>
          <rect x="1" y="3" width="14" height="11" fill="#12191e" />
          <rect x="2" y="4" width="12" height="8" fill="#405563" />
          <rect x="2" y="2" width="12" height="2" fill="#77909b" />
          <rect x="4" y="2" width="2" height="2" fill="#15252b" />
          <rect x="8" y="2" width="2" height="2" fill="#15252b" />
          <path d="M7 6h2v1h1v2H9v1H7z" fill="#8bffd0" />
        </>
      )}
      {kind === "audio" && (
        <>
          <rect x="8" y="2" width="2" height="9" fill="#69d4bb" />
          <rect x="10" y="2" width="4" height="2" fill="#9bf4dd" />
          <rect x="3" y="10" width="5" height="4" fill="#2f7d6b" />
          <rect x="4" y="9" width="4" height="4" fill="#6ad5bc" />
          <rect x="8" y="11" width="5" height="3" fill="#2f7d6b" />
          <rect x="9" y="10" width="4" height="3" fill="#8fe5d0" />
        </>
      )}
      {kind === "script" && (
        <>
          <rect x="3" y="1" width="10" height="14" fill="#4a351e" />
          <rect x="4" y="2" width="8" height="12" fill="#e8d09a" />
          <rect x="5" y="4" width="5" height="1" fill="#946e3e" />
          <rect x="5" y="7" width="6" height="1" fill="#946e3e" />
          <rect x="5" y="10" width="4" height="1" fill="#946e3e" />
          <rect x="10" y="12" width="2" height="2" fill="#c29352" />
        </>
      )}
    </svg>
  );
}

function App() {
  const [assets, setAssets] = useState([]),
    [selected, setSelected] = useState(null),
    [query, setQuery] = useState(""),
    [currentTag, setCurrentTag] = useState(null),
    [filter, setFilter] = useState("全部素材"),
    [drag, setDrag] = useState(false),
    [ready, setReady] = useState(false);
  const [library, setLibrary] = useState(null),
    [activeFolder, setActiveFolder] = useState(null),
    [expandedFolderIds, setExpandedFolderIds] = useState(() => new Set()),
    [sidebarWidth, setSidebarWidth] = useState(() =>
      clampSidebarWidth(localStorage.getItem(SIDEBAR_WIDTH_KEY)),
    ),
    [sortOrder, setSortOrder] = useState("recent"),
    [message, setMessage] = useState(""),
    [viewMode, setViewMode] = useState(() =>
      VIEW_MODES.includes(localStorage.getItem(VIEW_MODE_KEY))
        ? localStorage.getItem(VIEW_MODE_KEY)
        : "standard",
    ),
    [selectedIds, setSelectedIds] = useState([]),
    [referenceAssetIds, setReferenceAssetIds] = useState([]),
    [referenceUploadPreparing, setReferenceUploadPreparing] = useState(false),
    [marquee, setMarquee] = useState(null),
    [dropFolderId, setDropFolderId] = useState(undefined),
    [importing, setImporting] = useState(false),
    [importProgress, setImportProgress] = useState(null),
    [importCancelRequested, setImportCancelRequested] = useState(false),
    [depthVideoJob, setDepthVideoJob] = useState(null),
    [previewId, setPreviewId] = useState(null),
    [zoom, setZoom] = useState(1),
    [rotation, setRotation] = useState(0),
    [checker, setChecker] = useState(false),
    [virtualRange, setVirtualRange] = useState({ start: 0, end: 200, before: 0, after: 0 }),
    [libraryChoosing, setLibraryChoosing] = useState(false);
  const [dialogState, setDialogState] = useState(null),
    [themePanel, setThemePanel] = useState(false),
    [theme, setTheme] = useState(loadTheme),
    [systemDark, setSystemDark] = useState(
      () => matchMedia("(prefers-color-scheme: dark)").matches,
    );
  const [sortPanel, setSortPanel] = useState(false),
    [filterPanel, setFilterPanel] = useState(false),
    [quickTypes, setQuickTypes] = useState([]),
    [quickFormats, setQuickFormats] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [renamingFolder, setRenamingFolder] = useState(null);
  const [batchRenamePanel, setBatchRenamePanel] = useState(false);
  const [aiFlowImportPanel, setAiFlowImportPanel] = useState(false);
  const [extensionPanel, setExtensionPanel] = useState(false),
    [extensionResult, setExtensionResult] = useState(null),
    [extensionBusy, setExtensionBusy] = useState(false),
    [plugins, setPlugins] = useState([]),
    [mcpConfig, setMcpConfig] = useState(null);
  const [updateInfo, setUpdateInfo] = useState(null),
    [updatePanel, setUpdatePanel] = useState(false),
    [updateChecking, setUpdateChecking] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(null),
    [updateFile, setUpdateFile] = useState(""),
    [updateError, setUpdateError] = useState("");
  const [supportPanel, setSupportPanel] = useState(false);
  const [backgroundMusicEnabled, setBackgroundMusicEnabled] = useState(() => backgroundMusicEnabledFromStorage());
  const [backgroundMusicVolume, setBackgroundMusicVolume] = useState(() => backgroundMusicVolumeFromStorage());
  const supportWelcomeKey = `nest-support-welcome-${APP_VERSION}`;
  const [aiPanel, setAiPanel] = useState(false),
    [aiSettingsPanel, setAiSettingsPanel] = useState(false),
    [aiResultIds, setAiResultIds] = useState(null);
  const [activeModule, setActiveModule] = useState("library");
  const [directorPrankPlaying, setDirectorPrankPlaying] = useState(false);
  const directorPrankVideoRef = useRef(null);
  const directorPrankEscCount = useRef(0);
  const [tetrisPasswordOpen, setTetrisPasswordOpen] = useState(false),
    [tetrisPassword, setTetrisPassword] = useState(""),
    [tetrisPasswordError, setTetrisPasswordError] = useState("");
  const [activeReferenceBoardId, setActiveReferenceBoardId] = useState(null);
  const [diskInfo, setDiskInfo] = useState(null);
  const [teamPanel, setTeamPanel] = useState(false);
  const [expandedTags, setExpandedTags] = useState(() => new Set());
  const [dropTag, setDropTag] = useState(null);
  const desktop = Boolean(window.nestDesktop);
  const canEdit = !desktop || ["owner", "admin", "editor"].includes(library?.currentMember?.role);
  const allTags = useMemo(() => [...new Set([...(library?.tags || []), ...assets.flatMap(asset => asset.tags || [])])], [library?.tags, assets]);
  const tagRows = useMemo(() => buildTagTree(allTags, expandedTags), [allTags, expandedTags]);
  const referenceAssets = useMemo(
    () => referenceAssetIds.map((id) => assets.find((asset) => asset.id === id)).filter(Boolean),
    [assets, referenceAssetIds],
  );
  const resolvedThemeMode =
    theme.mode === "system" ? (systemDark ? "dark" : "light") : theme.mode;
  const renderedTheme =
    theme.mode === "system"
      ? { ...theme, colors: colorsForMode(resolvedThemeMode, theme.colors) }
      : theme;
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)"),
      change = (event) => setSystemDark(event.matches);
    media.addEventListener?.("change", change);
    return () => media.removeEventListener?.("change", change);
  }, []);
  useEffect(() => {
    const volume = backgroundMusic.setVolume(backgroundMusicVolume);
    try { localStorage.setItem(BACKGROUND_MUSIC_VOLUME_STORAGE_KEY, String(volume)); } catch { /* storage can be blocked */ }
  }, [backgroundMusicVolume]);
  useEffect(() => {
    try { localStorage.setItem(BACKGROUND_MUSIC_STORAGE_KEY, String(backgroundMusicEnabled)); } catch { /* storage can be blocked */ }
    if (backgroundMusicEnabled) void backgroundMusic.start();
    else backgroundMusic.pause();
    return () => backgroundMusic.pause();
  }, [backgroundMusicEnabled]);
  useEffect(() => {
    if (!desktop || !ready || localStorage.getItem(supportWelcomeKey)) return;
    setSupportPanel(true);
  }, [desktop, ready, supportWelcomeKey]);
  const closeSupportPanel = () => {
    localStorage.setItem(supportWelcomeKey, "seen");
    setSupportPanel(false);
  };
  useEffect(() => {
    if (!window.nestDesktop?.setTitleBarColors) return;
    window.nestDesktop.setTitleBarColors({
      background: normalizeHex(renderedTheme.colors.sidebar),
      symbols: readableText(renderedTheme.colors.sidebar),
    });
  }, [renderedTheme.colors.sidebar]);
  const recycleBinName =
    window.nestDesktop?.platform === "darwin" ? "废纸篓" : "回收站";
  const input = useRef(),
    assetsRef = useRef([]),
    saveTimers = useRef(new Map()),
    pendingSaves = useRef(new Map()),
    desktopTimers = useRef(new Map()),
    desktopChanges = useRef(new Map()),
    marqueeStart = useRef(null),
    marqueeBase = useRef(new Set()),
    lastSelectedId = useRef(null),
    sidebarResizing = useRef(false),
    contextMenuRef = useRef(null),
    externalDragActive = useRef(false),
    externalDragTimer = useRef(null),
    lastUpdateCheck = useRef(0),
    lastNotifiedVersion = useRef(""),
    mainScrollRef = useRef(null),
    assetGridRef = useRef(null),
    virtualRaf = useRef(0),
    folderRenameInputRef = useRef(null),
    folderRenameSaving = useRef(false);
  const askText = (title, defaultValue = "", placeholder = "") =>
    new Promise((resolve) =>
      setDialogState({
        kind: "prompt",
        title,
        defaultValue,
        placeholder,
        resolve,
      }),
    );
  const askConfirm = (title, detail = "") =>
    new Promise((resolve) =>
      setDialogState({ kind: "confirm", title, detail, resolve }),
    );
  const askFolder = (folders, parentId = null) =>
    new Promise((resolve) =>
      setDialogState({
        kind: "folder",
        title: "新建文件夹",
        folders,
        parentId,
        resolve,
      }),
    );
  const resolveDialog = (value) => {
    dialogState?.resolve(value);
    setDialogState(null);
  };
  useEffect(() => {
    if (desktop) {
      window.nestDesktop
        .currentLibrary()
        .then((lib) => {
          if (lib) {
            setLibrary(lib);
            assetsRef.current = lib.assets;
            setAssets(lib.assets);
          }
        })
        .catch((error) => setMessage(`打开资源库失败：${error.message}`))
        .finally(() => setReady(true));
      const unsubscribeLibrary = window.nestDesktop.onLibraryChanged?.(
        (lib) => {
          if (lib) {
            setLibrary(lib);
            assetsRef.current = lib.assets;
            setAssets(lib.assets);
          }
        },
      );
      const unsubscribeDrag = window.nestDesktop.onExternalDragError?.(
        (error) => {
          setMessage(`无法拖出素材：${error}`);
          setTimeout(() => setMessage(""), 5000);
        },
      );
      return () => {
        unsubscribeLibrary?.();
        unsubscribeDrag?.();
      };
    }
    getAssets().then((a) => {
      const pending = readPending();
      const loaded = (a.length ? a : seed).map((asset) =>
        pending[asset.id] ? { ...asset, ...pending[asset.id] } : asset,
      );
      assetsRef.current = loaded;
      setAssets(loaded);
      setReady(true);
      for (const asset of loaded) {
        if (pending[asset.id])
          saveAsset({ ...asset, url: "" }).then(() => clearPending(asset.id));
      }
    });
  }, []);
  useEffect(() => {
    if (!desktop) return;
    const poll = async () => {
      const now = Date.now();
      if (now - lastUpdateCheck.current < 60000) return;
      lastUpdateCheck.current = now;
      const result = await window.nestDesktop.checkUpdate();
      if (!result?.ok) return;
      setUpdateInfo(result);
      if (result.available && result.latest !== lastNotifiedVersion.current) {
        lastNotifiedVersion.current = result.latest;
        setUpdatePanel(true);
      }
    };
    const startup = setTimeout(poll, 1800),
      interval = setInterval(poll, 5 * 60 * 1000),
      onFocus = () => poll(),
      onVisible = () => {
        if (document.visibilityState === "visible") poll();
      };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(startup);
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [desktop]);
  useEffect(
    () =>
      desktop
        ? window.nestDesktop.onUpdateProgress?.(setUpdateProgress)
        : undefined,
    [desktop],
  );
  useEffect(
    () =>
      desktop
        ? window.nestDesktop.onImportProgress?.(setImportProgress)
        : undefined,
    [desktop],
  );
  useEffect(
    () =>
      desktop
        ? window.nestDesktop.depthVideo?.onProgress?.((progress) => {
            setDepthVideoJob((current) =>
              current?.assetId === progress?.assetId
                ? { ...current, ...progress }
                : current,
            );
          })
        : undefined,
    [desktop],
  );
  useEffect(() => {
    if (!desktop || !library?.path || !window.nestDesktop?.storageInfo) {
      setDiskInfo(null);
      return;
    }
    let active = true;
    const refresh = () =>
      window.nestDesktop
        .storageInfo()
        .then((info) => {
          if (active && !info?.error) setDiskInfo(info);
        })
        .catch(() => {});
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [desktop, library?.path]);
  useEffect(() => {
    if (!window.nestDesktop?.setExtensionImportTarget) return;
    void Promise.resolve(
      window.nestDesktop.setExtensionImportTarget(
        library && activeFolder ? activeFolder : null,
      ),
    ).catch(() => {});
  }, [library?.id, library?.path, activeFolder]);
  useEffect(() => {
    setReferenceAssetIds((ids) => {
      const next = ids.filter((id) => assets.some((asset) => asset.id === id));
      return next.length === ids.length ? ids : next;
    });
  }, [assets]);
  const checkUpdate = async () => {
    setUpdateChecking(true);
    lastUpdateCheck.current = Date.now();
    const result = await window.nestDesktop.checkUpdate();
    setUpdateChecking(false);
    if (result?.error) {
      setMessage(result.error);
      setTimeout(() => setMessage(""), 4000);
      return;
    }
    setUpdateInfo(result);
    if (result.available) lastNotifiedVersion.current = result.latest;
    setUpdatePanel(true);
  };
  const downloadUpdate = async () => {
    setUpdateError("");
    setUpdateFile("");
    setUpdateProgress({ percent: 0, received: 0, total: 0 });
    const result = await window.nestDesktop.downloadUpdate({
      url: updateInfo.downloadUrl,
      name: updateInfo.downloadName,
      digest: updateInfo.downloadDigest,
    });
    if (result?.error) {
      setUpdateError(result.error);
      setUpdateProgress(null);
      return;
    }
    setUpdateFile(result.filePath);
    setUpdateProgress((current) => ({
      ...current,
      percent: 100,
      verified: result.verified,
    }));
  };
  const flushSaves = () => {
    const writes = [];
    for (const [id, asset] of pendingSaves.current) {
      clearTimeout(saveTimers.current.get(id));
      writes.push(
        saveAsset({ ...asset, url: "" }).then(() => clearPending(id)),
      );
    }
    pendingSaves.current.clear();
    saveTimers.current.clear();
    if (desktop) {
      for (const [id, changes] of desktopChanges.current) {
        clearTimeout(desktopTimers.current.get(id));
        writes.push(window.nestDesktop.updateAsset(id, changes));
      }
      desktopChanges.current.clear();
      desktopTimers.current.clear();
    }
    return Promise.allSettled(writes);
  };
  const installUpdate = async () => {
    setUpdateError("正在保存数据并启动独立更新程序…");
    await flushSaves();
    const result = await window.nestDesktop.installUpdate(updateFile);
    if (result?.error) {
      setUpdateError(result.error);
      return;
    }
    if (result?.quitting)
      setUpdateError(
        result.updater === "portable"
          ? "更新程序已启动，正在退出并替换当前版本…"
          : "安装程序已启动，当前程序正在退出…",
      );
  };
  useEffect(() => {
    const onPageHide = () => flushSaves();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushSaves();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      flushSaves();
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (e.target.closest?.('input,textarea,select,[contenteditable="true"]'))
          return;
        flushSaves();
        setPreviewId(null);
        setSelected(null);
        setSelectedIds([]);
        setMarquee(null);
        marqueeStart.current = null;
        setContextMenu(null);
        setExtensionPanel(false);
        setThemePanel(false);
        setAiSettingsPanel(false);
        setAiPanel(false);
        setAiFlowImportPanel(false);
        setSortPanel(false);
        setFilterPanel(false);
        setSupportPanel(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!contextMenu) return;
    const close = (event) => {
      if (event && contextMenuRef.current?.contains(event.target)) return;
      setContextMenu(null);
    };
    // Capture phase still sees the pointer when a surrounding React panel stops
    // propagation, which previously left folder menus stranded on screen.
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      window.removeEventListener("blur", close);
    };
  }, [contextMenu]);
  const activeFolderIds = useMemo(() => {
    if (!activeFolder) return null;
    const ids = new Set([activeFolder]),
      folders = library?.folders || [];
    for (let changed = true; changed;) {
      changed = false;
      for (const folder of folders)
        if (
          folder.parentId &&
          ids.has(folder.parentId) &&
          !ids.has(folder.id)
        ) {
          ids.add(folder.id);
          changed = true;
        }
    }
    return ids;
  }, [library, activeFolder]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const aiResultIdSet = useMemo(() => aiResultIds ? new Set(aiResultIds) : null, [aiResultIds]);
  const sortedAssets = useMemo(() => {
    const compareName = new Intl.Collator("zh-CN").compare;
    return [...assets].sort((a, b) =>
      sortOrder === "oldest" ? a.createdAt - b.createdAt
        : sortOrder === "nameAsc" ? compareName(a.name, b.name)
          : sortOrder === "nameDesc" ? compareName(b.name, a.name)
            : sortOrder === "sizeDesc" ? b.size - a.size
              : sortOrder === "sizeAsc" ? a.size - b.size
                : b.createdAt - a.createdAt);
  }, [assets, sortOrder]);
  const normalizedQuery = query.toLowerCase();
  const shown = useMemo(
    () =>
      sortedAssets
        .filter((a) => {
          const q = normalizedQuery;
          const match =
            !q ||
            a.name.toLowerCase().includes(q) ||
            (a.tags || []).some((t) => t.toLowerCase().includes(q)) ||
            (a.documentText || "").toLowerCase().includes(q);
          const tagMatch = assetMatchesTag(a.tags, currentTag);
          const f =
            filter === "全部素材" ||
            (filter === "收藏夹" && a.favorite) ||
            (filter === "图片" && a.type.startsWith("image")) ||
            (filter === "视频" && a.type.startsWith("video")) ||
            (filter === "音频" && a.type.startsWith("audio")) ||
            (filter === "剧本" && (a.type.startsWith("text") || a.type === "application/pdf" || a.documentFormat === "DOCX")) ||
            (filter === "未分类" && !a.folderId) ||
            (filter === "最近" && Date.now() - a.createdAt < 7 * 86400000);
          const quickType =
            !quickTypes.length ||
            quickTypes.some((type) => a.type.startsWith(type));
          const quickFormat =
            !quickFormats.length || quickFormats.includes(assetFormat(a));
          return (
            (!aiResultIdSet || aiResultIdSet.has(a.id)) &&
            match &&
            tagMatch &&
            f &&
            quickType &&
            quickFormat &&
            (!activeFolderIds || activeFolderIds.has(a.folderId))
          );
        }),
    [
      sortedAssets,
      normalizedQuery,
      currentTag,
      filter,
      activeFolderIds,
      sortOrder,
      quickTypes,
      quickFormats,
      aiResultIdSet,
    ],
  );
  const displayed = shown.slice(virtualRange.start, virtualRange.end);
  useLayoutEffect(() => {
    const main = mainScrollRef.current;
    if (!main || activeModule !== "library") return;
    const header = main.querySelector(":scope > header");
    const toolbar = main.querySelector(":scope > .toolbar");
    const measure = () => main.style.setProperty("--reference-sticky-top",
      `${(header?.getBoundingClientRect().height || 0) + (toolbar?.getBoundingClientRect().height || 0)}px`);
    measure();
    const observer = new ResizeObserver(measure);
    if (header) observer.observe(header);
    if (toolbar) observer.observe(toolbar);
    return () => observer.disconnect();
  }, [activeModule]);
  const updateVirtualRange = (element = mainScrollRef.current) => {
    if (!element || !assetGridRef.current) return;
    cancelAnimationFrame(virtualRaf.current);
    virtualRaf.current = requestAnimationFrame(() => {
      const grid = assetGridRef.current, first = grid.querySelector("article"), gap = viewMode === "list" ? 4 : viewMode === "compact" ? 8 : 11;
      const columns = viewMode === "list" ? 1 : Math.max(1, Math.round(grid.clientWidth / Math.max(145, first?.getBoundingClientRect().width || (viewMode === "compact" ? 155 : 195))));
      const rowHeight = Math.max(56, (first?.getBoundingClientRect().height || (viewMode === "list" ? 60 : 190)) + gap);
      const rows = Math.ceil(shown.length / columns), relativeTop = Math.max(0, element.scrollTop - grid.offsetTop), overscan = 5;
      const requestedStart = Math.max(0, Math.floor(relativeTop / rowHeight) - overscan);
      const startRow = rows ? Math.min(rows - 1, requestedStart) : 0;
      const requestedEnd = Math.ceil((relativeTop + element.clientHeight) / rowHeight) + overscan;
      const endRow = rows ? Math.max(startRow + 1, Math.min(rows, requestedEnd)) : 0;
      const next = { start: startRow * columns, end: Math.min(shown.length, endRow * columns), before: startRow * rowHeight, after: Math.max(0, (rows - endRow) * rowHeight) };
      setVirtualRange(current => current.start === next.start && current.end === next.end && current.before === next.before && current.after === next.after ? current : next);
    });
  };
  const allShownSelected =
    shown.length > 0 && shown.every((asset) => selectedIdSet.has(asset.id));
  const toggleSelectAll = () => {
    const shownIds = new Set(shown.map((asset) => asset.id));
    setSelectedIds((ids) =>
      allShownSelected
        ? ids.filter((id) => !shownIds.has(id))
        : [...new Set([...ids, ...shownIds])],
    );
    setSelected(null);
  };
  useEffect(() => {
    if (selected && !shown.some((a) => a.id === selected.id)) setSelected(null);
  }, [shown, selected]);
  const inspectorOpen = Boolean(selected || aiPanel);
  const [inspectorFrame, setInspectorFrame] = useState({ ready: false, overlayWidth: 0 });
  // Open the native frame first, then mount the fixed inspector. This preserves
  // the workspace width for normal windows and avoids a blank exposed frame.
  useLayoutEffect(() => {
    const setInspectorOpen = window.nestDesktop?.setInspectorOpen;
    let disposed = false;
    if (!setInspectorOpen) {
      setInspectorFrame({ ready: inspectorOpen, overlayWidth: inspectorOpen ? 350 : 0 });
      return () => { disposed = true; };
    }
    if (!inspectorOpen) {
      setInspectorFrame({ ready: false, overlayWidth: 0 });
      void setInspectorOpen(false, 350, { immediate: true });
      return () => { disposed = true; };
    }
    setInspectorFrame({ ready: false, overlayWidth: 0 });
    void setInspectorOpen(true, 350, { immediate: true }).then(() => {
      if (disposed) return;
      // The native frame has already grown to the right. Keep this full width
      // reserved in the layout so the wider grid never runs underneath it.
      setInspectorFrame({ ready: true, overlayWidth: 350 });
    }).catch(() => {
      if (!disposed) setInspectorFrame({ ready: true, overlayWidth: 350 });
    });
    return () => { disposed = true; };
  }, [inspectorOpen]);
  const toggleAiPanel = async () => {
    if (aiPanel) {
      setAiPanel(false);
      return;
    }
    setAiPanel(true);
  };
  const closeDirectorPrank = () => {
    directorPrankVideoRef.current?.pause();
    setDirectorPrankPlaying(false);
    directorPrankEscCount.current = 0;
    void window.nestDesktop?.setFullscreen(false);
  };
  const playDirectorPrank = () => {
    setSelected(null);
    setAiPanel(false);
    directorPrankEscCount.current = 0;
    setDirectorPrankPlaying(true);
    void window.nestDesktop?.setFullscreen(true);
  };
  useEffect(() => {
    if (!directorPrankPlaying) return;
    const video = directorPrankVideoRef.current;
    if (video) {
      video.currentTime = 0;
      void video.play().catch(() => setMessage("恶搞短片没有开始播放"));
    }
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      directorPrankEscCount.current += 1;
      if (directorPrankEscCount.current >= 2) {
        closeDirectorPrank();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [directorPrankPlaying]);
  useEffect(() => {
    setVirtualRange({ start: 0, end: 200, before: 0, after: 0 });
    requestAnimationFrame(() => updateVirtualRange());
  }, [query, currentTag, filter, activeFolder, sortOrder, viewMode, shown.length]);
  useEffect(() => {
    const main = mainScrollRef.current;
    if (!main || typeof ResizeObserver === "undefined") return;
    let settleTimer;
    const refresh = () => {
      clearTimeout(settleTimer);
      updateVirtualRange(main);
      settleTimer = setTimeout(() => updateVirtualRange(main), 140);
    };
    const observer = new ResizeObserver(refresh);
    observer.observe(main);
    window.addEventListener("resize", refresh);
    return () => {
      clearTimeout(settleTimer);
      observer.disconnect();
      window.removeEventListener("resize", refresh);
    };
  }, [viewMode, shown.length]);
  useEffect(() => {
    audioPreviewManager.stop();
  }, [
    query,
    currentTag,
    filter,
    activeFolder,
    sortOrder,
    quickTypes,
    quickFormats,
  ]);
  useEffect(() => {
    const stop = () => audioPreviewManager.stop(),
      hidden = () => {
        if (document.visibilityState === "hidden") stop();
      };
    window.addEventListener("blur", stop);
    window.addEventListener("pagehide", stop);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", stop);
      window.removeEventListener("pagehide", stop);
      document.removeEventListener("visibilitychange", hidden);
      stop();
    };
  }, []);
  const orderedFolders = useMemo(
    () => buildFolderRows(library?.folders || [], expandedFolderIds),
    [library, expandedFolderIds],
  );
  const allOrderedFolders = useMemo(
    () =>
      buildFolderRows(library?.folders || [], new Set(), {
        includeHidden: true,
      }),
    [library],
  );
  const currentFolder = activeFolder
    ? (library?.folders || []).find((folder) => folder.id === activeFolder)
    : null;
  const folderBreadcrumbs = useMemo(() => {
    const byId = new Map((library?.folders || []).map(folder => [folder.id, folder]));
    const trail = [];
    const visited = new Set();
    let current = activeFolder ? byId.get(activeFolder) : null;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      trail.unshift(current);
      current = byId.get(current.parentId);
    }
    return trail;
  }, [library, activeFolder]);
  const contentFolders = useMemo(
    () =>
      filter === "全部素材" && !query && !currentTag
        ? (library?.folders || []).filter(
            (folder) => (folder.parentId || null) === (activeFolder || null),
          )
        : [],
    [library, filter, query, currentTag, activeFolder],
  );
  const folderAssetCounts = useMemo(() => {
    const folders = library?.folders || [],
      byId = new Map(folders.map((folder) => [folder.id, folder])),
      counts = new Map(folders.map((folder) => [folder.id, 0]));
    for (const asset of assets) {
      let id = asset.folderId;
      const visited = new Set();
      while (id && byId.has(id) && !visited.has(id)) {
        visited.add(id);
        counts.set(id, (counts.get(id) || 0) + 1);
        id = byId.get(id).parentId;
      }
    }
    return counts;
  }, [library, assets]);
  const folderPreviewById = useMemo(() => new Map(), []);
  const openFolder = (folder) => {
    setActiveModule("library");
    setFilter("全部素材");
    setQuery("");
    setCurrentTag(null);
    setActiveFolder(folder.id);
    setSelected(null);
    setSelectedIds([]);
  };
  const openLibraryRoot = () => {
    setActiveModule("library");
    setFilter("全部素材");
    setQuery("");
    setCurrentTag(null);
    setActiveFolder(null);
    setSelected(null);
    setSelectedIds([]);
  };
  const applyLibrary = (lib, { reset = false } = {}) => {
    if (!lib || lib.error) {
      if (lib?.error) setMessage(lib.error);
      return;
    }
    setMessage("");
    setLibrary(lib);
    assetsRef.current = lib.assets;
    setAssets(lib.assets);
    if (reset) {
      setActiveFolder(null);
      setSelected(null);
    } else
      setSelected((current) =>
        current ? lib.assets.find((a) => a.id === current.id) || null : null,
      );
  };
  const createReferenceBoard = async (input = {}) => {
    if (!desktop || !canEdit) return { error: "请在桌面版打开资源库后创建参考板" };
    try {
      const result = await window.nestDesktop.createReferenceBoard(input);
      if (result?.error) setMessage(result.error);
      else if (result?.library) applyLibrary(result.library);
      return result;
    } catch (error) {
      const result = { error: `新建参考板失败：${error.message}` };
      setMessage(result.error);
      return result;
    }
  };
  const updateReferenceBoard = async (id, changes) => {
    if (!desktop || !canEdit) return { error: "当前用户没有编辑参考板的权限" };
    try {
      const result = await window.nestDesktop.updateReferenceBoard(id, changes);
      if (result?.error) setMessage(result.error);
      else if (result?.library) applyLibrary(result.library);
      return result;
    } catch (error) {
      const result = { error: `保存参考板失败：${error.message}` };
      setMessage(result.error);
      return result;
    }
  };
  const deleteReferenceBoard = async (id) => {
    if (!desktop || !canEdit) return { error: "当前用户没有编辑参考板的权限" };
    try {
      const result = await window.nestDesktop.deleteReferenceBoard(id);
      if (result?.error) setMessage(result.error);
      else if (result?.library) applyLibrary(result.library);
      return result;
    } catch (error) {
      const result = { error: `删除参考板失败：${error.message}` };
      setMessage(result.error);
      return result;
    }
  };
  const openReferenceBoard = (id = null) => {
    setActiveReferenceBoardId(id || library?.referenceBoards?.[0]?.id || null);
    setActiveModule("reference-board");
    setAiPanel(false);
  };
  const requestTetrisAccess = () => {
    setTetrisPassword("");
    setTetrisPasswordError("");
    setTetrisPasswordOpen(true);
  };
  const unlockTetris = () => {
    if (tetrisPassword !== TETRIS_ACCESS_CODE) {
      setTetrisPasswordError("密码不正确，请重新输入。");
      return;
    }
    setSelected(null);
    setAiPanel(false);
    setTetrisPasswordOpen(false);
    setTetrisPasswordError("");
    setActiveModule("tetris");
  };
  const createBoardFromReferences = async () => {
    const result = await createReferenceBoard({ name: "已选素材参考板", assetIds: referenceAssetIds });
    if (!result?.error) {
      setReferenceAssetIds([]);
      openReferenceBoard(result?.board?.id || null);
    }
  };
  const beginAIFlowExtensionUpload = async (asset) => {
    if (!desktop || !asset || !canEdit) return;
    const ids = selectedIds.includes(asset.id) ? selectedIds : [asset.id];
    const selectedAssets = assetsRef.current.filter((item) => ids.includes(item.id));
    const totalBytes = selectedAssets.reduce((total, item) => total + (Number(item.size) || 0), 0);
    const units = ["B", "KB", "MB", "GB"];
    const unit = totalBytes ? Math.min(units.length - 1, Math.floor(Math.log(totalBytes) / Math.log(1024))) : 0;
    const sizeLabel = totalBytes ? `${(totalBytes / 1024 ** unit).toFixed(unit ? 1 : 0)} ${units[unit]}` : "大小将在上传前核对";
    if (!await askConfirm(
      `上传 ${selectedAssets.length} 个素材到 AI Flow？`,
      `总大小：${sizeLabel}\n\n确认后，请到已登录的 AI Flow 网页进入目标“我的素材”文件夹，再点击扩展加入的“上传小旺仔素材”。文件在该网页按钮被点击前不会上传；准备将在 10 分钟后失效。`,
    )) return;
    try {
      const result = await window.nestDesktop.aiFlow.beginExtensionUpload(ids);
      if (result?.error) {
        setMessage(result.error);
      } else {
        setMessage(`已准备 ${result.count} 个素材。请在 AI Flow 目标文件夹点击“上传小旺仔素材”（10 分钟内有效）。`);
      }
    } catch (error) {
      setMessage(`准备上传到 AI Flow 失败：${error.message}`);
    }
    setTimeout(() => setMessage(""), 8000);
  };
  const beginAIFlowReferenceUpload = async () => {
    if (!desktop || !canEdit || !referenceAssets.length || referenceUploadPreparing) return;
    const ids = referenceAssets.map((asset) => asset.id);
    const totalBytes = referenceAssets.reduce((total, item) => total + (Number(item.size) || 0), 0);
    const units = ["B", "KB", "MB", "GB"];
    const unit = totalBytes ? Math.min(units.length - 1, Math.floor(Math.log(totalBytes) / Math.log(1024))) : 0;
    const sizeLabel = totalBytes ? `${(totalBytes / 1024 ** unit).toFixed(unit ? 1 : 0)} ${units[unit]}` : "大小将在上传前核对";
    if (!await askConfirm(
      `上传 ${referenceAssets.length} 个引用素材到 AI Flow？`,
      `总大小：${sizeLabel}\n\n确认后会由已登录的 Edge 扩展上传，并自动加入当前 AI Flow 页面顶部的“图片 / 视频 / 音频”引用栏；必要时会切换 AI Flow 到“多模态”引用模式。不会上传未在本栏选中的素材，也不会刷新整页或改动你的提示词。`,
    )) return;
    setReferenceUploadPreparing(true);
    try {
      const result = await window.nestDesktop.aiFlow.beginExtensionUpload(ids, { mode: "prompt-reference" });
      if (result?.error) {
        setMessage(result.error);
      } else {
        setMessage(`正在上传 ${result.count} 个引用素材；Edge 会自动加入当前 AI Flow 顶部引用栏。`);
      }
    } catch (error) {
      setMessage(`准备 AI Flow 引用上传失败：${error.message}`);
    } finally {
      setReferenceUploadPreparing(false);
      setTimeout(() => setMessage(""), 9000);
    }
  };
  const beginAIFlowFolderExtensionUpload = async (folder) => {
    if (!desktop || !folder || !canEdit) return;
    const folderIds = new Set([folder.id]);
    for (let changed = true; changed;) {
      changed = false;
      for (const candidate of library?.folders || []) {
        if (candidate.parentId && folderIds.has(candidate.parentId) && !folderIds.has(candidate.id)) {
          folderIds.add(candidate.id);
          changed = true;
        }
      }
    }
    const folderAssets = assetsRef.current.filter(item => folderIds.has(item.folderId));
    const totalBytes = folderAssets.reduce((total, item) => total + (Number(item.size) || 0), 0);
    const units = ["B", "KB", "MB", "GB"];
    const unit = totalBytes ? Math.min(units.length - 1, Math.floor(Math.log(totalBytes) / Math.log(1024))) : 0;
    const sizeLabel = totalBytes ? `${(totalBytes / 1024 ** unit).toFixed(unit ? 1 : 0)} ${units[unit]}` : "大小将在上传前核对";
    if (!await askConfirm(
      `上传“${folder.name}”文件夹到 AI Flow？`,
      `将准备本文件夹及下级文件夹中的 ${folderAssets.length} 个素材（${sizeLabel}）。已对应 AI Flow 的目录会自动上传到对应位置；未对应目录请在 AI Flow 网页选好目标“我的素材”文件夹后点击“上传小旺仔素材”。网页按钮点击前不会上传。`,
    )) return;
    try {
      const result = await window.nestDesktop.aiFlow.beginFolderExtensionUpload(folder.id);
      if (result?.error) setMessage(result.error);
      else setMessage(result.requiresTargetSelection ? `已准备 ${result.count} 个素材；请在 AI Flow 网页选定目标文件夹后点击“上传小旺仔素材”。` : `已准备 ${result.count} 个素材，将自动上传到 AI Flow 对应文件夹；请在网页点击“上传小旺仔素材”。`);
    } catch (error) {
      setMessage(`准备上传文件夹失败：${error.message}`);
    }
    setTimeout(() => setMessage(""), 9000);
  };
  const aiFlowLiveRootForFolder = (folder) => {
    const foldersById = new Map((library?.folders || []).map(item => [String(item.id), item]));
    let current = folder;
    const visited = new Set();
    while (current && !visited.has(String(current.id))) {
      visited.add(String(current.id));
      if (current.aiFlowRootSync) return current;
      current = foldersById.get(String(current.parentId || ''));
    }
    return null;
  };
  const aiFlowLiveSyncEnabledForFolder = (folder) => {
    const root = aiFlowLiveRootForFolder(folder);
    return Boolean(root?.aiFlowRootSync && root.aiFlowRootSync.liveSyncDisabledByUser !== true);
  };
  // Every folder within an enabled paired root is visibly connected to AI Flow.
  const aiFlowFolderConnected = (folder) => aiFlowLiveSyncEnabledForFolder(folder);
  const toggleAIFlowLiveSync = async (folder) => {
    if (!desktop || !folder || !canEdit) return;
    const root = aiFlowLiveRootForFolder(folder);
    if (!root) {
      setMessage("只有已执行“同步目录和素材”的本地根目录可以开启实时同步");
      setTimeout(() => setMessage(""), 5000);
      return;
    }
    const enabled = !aiFlowLiveSyncEnabledForFolder(folder);
    if (enabled && !await askConfirm(
      `开启“${root.name}”的 AI Flow 实时同步？`,
      "开启后，AI Flow 网页保持打开且已登录时，本地新增素材约每 3 秒检查上传，网页新增素材每约 10 秒回拉到本地；不会删除或移动任一端已有素材。",
    )) return;
    try {
      const result = await window.nestDesktop.aiFlow.setLiveSync(root.id, enabled);
      if (result?.error) setMessage(result.error);
      else setMessage(enabled ? `已开启实时同步，已排队 ${result.queued || 0} 个本地素材。` : "已关闭实时同步；不会再自动上传或下载。");
      if (result?.library) applyLibrary(result.library);
    } catch (error) {
      setMessage(`设置实时同步失败：${error.message}`);
    }
    setTimeout(() => setMessage(""), 8000);
  };
  const pendingAIFlowUploadsByAssetId = useMemo(
    () => new Map((library?.aiFlowLiveSync?.pendingUploads || []).map(item => [String(item.assetId || ""), item]).filter(([assetId]) => Boolean(assetId))),
    [library?.aiFlowLiveSync?.pendingUploads],
  );
  const activeAIFlowSync = currentFolder ? (() => {
    const root = aiFlowLiveRootForFolder(currentFolder);
    if (!root) return null;
    const pending = (library?.aiFlowLiveSync?.pendingUploads || []).filter(item => String(item.rootFolderId || "") === String(root.id)).length;
    return {
      enabled: aiFlowLiveSyncEnabledForFolder(currentFolder),
      pending,
      syncedAt: Number(root.aiFlowRootSync?.syncedAt) || 0,
    };
  })() : null;
  const chooseLibrary = async (action) => {
    if (libraryChoosing) return;
    setLibraryChoosing(true);
    try {
      applyLibrary(await action(), { reset: true });
    } finally {
      setLibraryChoosing(false);
    }
  };
  const createLibrary = () =>
    chooseLibrary(() => window.nestDesktop.createLibrary());
  const openLibrary = () =>
    chooseLibrary(() => window.nestDesktop.openLibrary());
  const showLibraryInfo = async () => {
    if (!library) {
      setMessage("Nest 本地素材库");
      return;
    }
    const health = await window.nestDesktop.health();
    if (!health) return;
    const text = `路径：${library.path}\n素材：${health.total} 个\n缺失文件：${health.missing.length}\n每日备份：${health.backupDir}`;
    if (health.missing.length) {
      if (
        await askConfirm(
          "发现缺失文件",
          `${text}\n\n是否备份索引并移除缺失记录？`,
        )
      )
        applyLibrary(await window.nestDesktop.repair());
    } else await askConfirm("资源库状态正常", text);
  };
  const deleteCurrentLibrary = async () => {
    if (!desktop || !library) return;
    const name = library.name || "当前素材库";
    const assetCount = library.assets?.length || 0;
    const confirmed = await askConfirm(
      `删除素材库“${name}”？`,
      `这会将整个本地素材库目录移入 Windows 回收站（含 ${assetCount} 个素材、索引和备份）。AI Flow 服务器素材不会被删除。`,
    );
    if (!confirmed) return;
    const result = await window.nestDesktop.deleteLibrary(name);
    if (result?.error) {
      setMessage(result.error);
      setTimeout(() => setMessage(""), 5000);
      return;
    }
    setAiSettingsPanel(false);
    setSelected(null);
    setSelectedIds([]);
    setActiveFolder(null);
    setAssets([]);
    assetsRef.current = [];
    setLibrary(null);
  };
  const prepareExtension = async (browser) => {
    setExtensionBusy(true);
    setExtensionResult(null);
    try {
      setExtensionResult(await window.nestDesktop.prepareExtension(browser));
    } catch (error) {
      setExtensionResult({ ok: false, error: error.message });
    } finally {
      setExtensionBusy(false);
    }
  };
  const uninstallExtension = async (browser) => {
    setExtensionBusy(true);
    setExtensionResult(null);
    try {
      setExtensionResult(await window.nestDesktop.openExtensionManager(browser));
    } catch (error) {
      setExtensionResult({ ok: false, error: error.message });
    } finally {
      setExtensionBusy(false);
    }
  };
  const showImportResult = (lib) => {
    applyLibrary(lib);
    if (lib?.importCanceled) {
      const r = lib?.lastImport || {};
      setMessage(
        `已取消导入，已导入 ${Number(r.imported) || 0} 个，跳过重复 ${Number(r.duplicates) || 0} 个`,
      );
      setTimeout(() => setMessage(""), 5000);
      return;
    }
    if (lib?.lastImport) {
      const r = lib.lastImport;
      setMessage(
        r.errors.length && !r.imported
          ? r.errors[0]
          : `已导入 ${r.imported} 个，跳过重复 ${r.duplicates} 个${r.errors.length ? `，失败 ${r.errors.length} 个` : ""}`,
      );
      setTimeout(() => setMessage(""), 5000);
    }
  };
  const nativeImport = async () => {
    if (importing) return;
    setImporting(true);
    setImportProgress({ phase: "choosing-files" });
    try {
      showImportResult(await window.nestDesktop.importAssets(activeFolder));
    } catch (error) {
      setMessage(`导入失败：${error.message}`);
      setTimeout(() => setMessage(""), 5000);
    } finally {
      setImporting(false);
      setImportProgress(null);
      setImportCancelRequested(false);
    }
  };
  const nativeImportFolder = async () => {
    if (importing) return;
    setImporting(true);
    setImportProgress({ phase: "choosing-folder" });
    try {
      const result = await window.nestDesktop.importFolder(activeFolder);
      showImportResult(result);
      if (!result?.importCanceled)
        await new Promise((resolve) => setTimeout(resolve, 550));
    } catch (error) {
      setMessage(`导入文件夹失败：${error.message}`);
      setTimeout(() => setMessage(""), 5000);
    } finally {
      setImporting(false);
      setImportProgress(null);
      setImportCancelRequested(false);
    }
  };
  const importAIFlowItems = async (source, scanId, ids) => {
    if (importing || !ids?.length) return;
    setImporting(true);
    setImportProgress({ phase: source === "server" ? "downloading-aiflow" : "scanning", processed: 0, total: ids.length });
    try {
      const result = await (source === "server"
        ? window.nestDesktop.aiFlow.importServerVideos(scanId, ids, activeFolder)
        : window.nestDesktop.aiFlow.importLocalAssets(scanId, ids, activeFolder));
      showImportResult(result);
      if (!result?.error && !result?.importCanceled) setAiFlowImportPanel(false);
      return result;
    } catch (error) {
      const message = `导入 AI Flow ${source === "server" ? "视频" : "素材"}失败：${error.message}`;
      setMessage(message);
      setTimeout(() => setMessage(""), 5000);
      return { error: message };
    } finally {
      setImporting(false);
      setImportProgress(null);
      setImportCancelRequested(false);
    }
  };
  const droppedImport = async (files, targetFolderId = activeFolder) => {
    if (importing) return;
    setImporting(true);
    setImportProgress({ phase: "scanning", scanned: 0, found: 0 });
    try {
      showImportResult(
        await window.nestDesktop.importDropped([...files], targetFolderId),
      );
    } catch (error) {
      setMessage(`导入失败：${error.message}`);
      setTimeout(() => setMessage(""), 5000);
    } finally {
      setImporting(false);
      setImportProgress(null);
      setImportCancelRequested(false);
      setDrag(false);
    }
  };
  const droppedWebImage = async (transfer, targetFolderId = activeFolder) => {
    const files = [...transfer.files];
    if (files.length) return droppedImport(files, targetFolderId);
    const html = transfer.getData("text/html");
    let url = html
      ? new DOMParser().parseFromString(html, "text/html").querySelector("img")
          ?.src || ""
      : "";
    if (!url)
      url =
        transfer
          .getData("text/uri-list")
          .split(/\r?\n/)
          .find((x) => x && !x.startsWith("#")) || "";
    if (!url) url = transfer.getData("text/plain").trim();
    if (/^https?:\/\//i.test(url)) {
      setImporting(true);
      setImportProgress({ phase: "downloading-web" });
      try {
        showImportResult(await window.nestDesktop.importUrl(url, targetFolderId));
      } catch (error) {
        setMessage(`导入失败：${error.message}`);
        setTimeout(() => setMessage(""), 5000);
      } finally {
        setImporting(false);
        setImportProgress(null);
        setImportCancelRequested(false);
        setDrag(false);
      }
      return;
    }
    setDrag(false);
    setMessage(
      "没有识别到图片文件或图片网址，可使用 Nest 网页采集扩展右键保存",
    );
    setTimeout(() => setMessage(""), 4500);
  };
  const cancelImport = async () => {
    if (!importing || importCancelRequested || !window.nestDesktop?.cancelImport)
      return;
    setImportCancelRequested(true);
    const result = await window.nestDesktop.cancelImport();
    if (result?.ok) {
      setImportProgress((progress) => ({ ...progress, cancelRequested: true }));
      return;
    }
    setImportCancelRequested(false);
  };
  const addFolderAt = async (parentId = activeFolder) => {
    const options = await askFolder(allOrderedFolders, parentId);
    if (!options?.name?.trim()) return;
    try {
      const lib = await window.nestDesktop.addFolder(options);
      applyLibrary(lib);
      if (!lib?.error) {
        setFilter("全部素材");
        setQuery("");
        setCurrentTag(null);
        setActiveFolder(options.parentId || null);
        if (options.parentId)
          setExpandedFolderIds((current) =>
            new Set(current).add(options.parentId),
          );
        setMessage(`文件夹“${options.name.trim()}”已创建`);
        setTimeout(() => setMessage(""), 2500);
      }
    } catch (error) {
      setMessage(`新建文件夹失败：${error.message}`);
      setTimeout(() => setMessage(""), 5000);
    }
  };
  const addFolder = () => addFolderAt(null);
  const addLibraryTag = async () => {
    const name = await askText("新建标签", "", "输入标签名称");
    if (!name?.trim()) return;
    try {
      applyLibrary(await window.nestDesktop.addTag(name.trim()));
    } catch (error) {
      setMessage(`新建标签失败：${error.message}`);
      setTimeout(() => setMessage(""), 5000);
    }
  };
  const deleteLibraryTag = async (name) => {
    if (
      await askConfirm(`删除标签“${name}”？`, "该标签也会从所有素材中移除。")
    ) {
      applyLibrary(await window.nestDesktop.deleteTag(name));
      if (currentTag === name) setCurrentTag(null);
    }
  };
  const renameFolder = (folder) => {
    if (!canEdit || !folder) return;
    setContextMenu(null);
    setRenamingFolder({ id: folder.id, name: folder.name });
  };
  const cancelFolderRename = () => {
    folderRenameSaving.current = false;
    setRenamingFolder(null);
  };
  const commitFolderRename = async () => {
    const draft = renamingFolder;
    if (!draft || folderRenameSaving.current) return;
    const name = draft.name.trim();
    if (!name) {
      setMessage("文件夹名称不能为空");
      requestAnimationFrame(() => folderRenameInputRef.current?.focus());
      return;
    }
    const current = library?.folders?.find(folder => folder.id === draft.id);
    if (!current || name === current.name) return cancelFolderRename();
    folderRenameSaving.current = true;
    try {
      const result = await window.nestDesktop.updateFolder(draft.id, { name });
      if (result?.error) {
        setMessage(result.error);
        requestAnimationFrame(() => folderRenameInputRef.current?.focus());
        return;
      }
      applyLibrary(result);
      setRenamingFolder(null);
      setMessage(`文件夹已重命名为“${name}”`);
      setTimeout(() => setMessage(""), 2500);
    } catch (error) {
      setMessage(`重命名失败：${error.message}`);
    } finally {
      folderRenameSaving.current = false;
    }
  };
  useEffect(() => {
    if (!renamingFolder) return;
    const frame = requestAnimationFrame(() => {
      folderRenameInputRef.current?.focus();
      folderRenameInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [renamingFolder?.id]);
  useEffect(() => {
    const onRenameShortcut = (event) => {
      if (
        event.key !== "F2" ||
        !desktop ||
        !canEdit ||
        !activeFolder ||
        event.target.closest?.('input,textarea,select,[contenteditable="true"]')
      ) return;
      const folder = library?.folders?.find(item => item.id === activeFolder);
      if (!folder) return;
      event.preventDefault();
      renameFolder(folder);
    };
    window.addEventListener("keydown", onRenameShortcut);
    return () => window.removeEventListener("keydown", onRenameShortcut);
  }, [activeFolder, canEdit, desktop, library, renamingFolder?.id]);
  const deleteFolder = async (folder) => {
    const count = folderAssetCounts.get(folder.id) || 0;
    if (
      await askConfirm(
        `删除文件夹“${folder.name}”及全部内容？`,
        `将递归删除所有子文件夹和其中 ${count} 个素材，原始文件会移入${recycleBinName}。`,
      )
    ) {
      const lib = await window.nestDesktop.deleteFolder(folder.id);
      applyLibrary(lib);
      if (lib?.lastDelete?.completed) {
        if (
          activeFolder &&
          !lib.folders.some((item) => item.id === activeFolder)
        )
          setActiveFolder(null);
        setSelectedIds([]);
        setMessage(
          `已删除 ${lib.lastDelete.removedFolders} 个文件夹和 ${lib.lastDelete.removedAssets} 个素材`,
        );
      } else if (lib?.lastDelete?.errors?.length)
        setMessage(
          `${lib.lastDelete.errors.length} 个文件无法移入${recycleBinName}，相关文件夹已保留`,
        );
      setTimeout(() => setMessage(""), 5000);
    }
  };
  const toggleSelected = (id) =>
    setSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  const batchUpdate = async (changes) => {
    flushSaves();
    applyLibrary(await window.nestDesktop.batchUpdate(selectedIds, changes));
    setSelectedIds([]);
  };
  const batchTag = async () => {
    const tag = await askText("批量添加标签", "", "输入标签名称");
    if (tag?.trim()) batchUpdate({ addTag: tag.trim() });
  };
  const batchRating = async () => {
    const value = await askText("批量评分", "", "输入 0–5；0 表示清除评分");
    if (value === null) return;
    const rating = Number(value);
    if (!Number.isInteger(rating) || rating < 0 || rating > 5) return setMessage("评分必须是 0 到 5 的整数");
    batchUpdate({ rating });
  };
  const batchNote = async () => {
    const note = await askText("批量备注", "", "输入要应用到所选素材的备注；留空可清除");
    if (note !== null) batchUpdate({ note: note.trim() });
  };
  const batchMove = async () => {
    const choices = allOrderedFolders
      .map((f, i) => `${i + 1}. ${"—".repeat(f.depth)}${f.name}`)
      .join("\n");
    const value = await askText(
      "移动所选素材",
      "",
      `输入 0 移到未分类，或输入文件夹编号\n${choices}`,
    );
    if (value !== null) {
      const folder = allOrderedFolders[Number(value) - 1];
      if (value === "0" || folder)
        batchUpdate({ folderId: folder?.id || null });
      else if (value !== "") setMessage("文件夹编号无效");
    }
  };
  const batchRename = async (template) => {
    flushSaves();
    const result = await window.nestDesktop.batchRename(selectedIds, template);
    if (result?.error) {
      setMessage(result.error);
      setTimeout(() => setMessage(""), 4000);
      return false;
    }
    applyLibrary(result);
    setSelectedIds([]);
    setBatchRenamePanel(false);
    setMessage("批量重命名完成");
    setTimeout(() => setMessage(""), 2500);
    return true;
  };
  const batchDelete = async () => {
    if (
      await askConfirm(
        `删除所选的 ${selectedIds.length} 个素材？`,
        `原文件会移到${recycleBinName}。`,
      )
    ) {
      flushSaves();
      const lib = await window.nestDesktop.batchDelete(selectedIds);
      applyLibrary(lib);
      setSelectedIds([]);
      if (lib?.lastDelete?.errors?.length) {
        setMessage(
          `有 ${lib.lastDelete.errors.length} 个文件无法移入${recycleBinName}，记录已保留`,
        );
        setTimeout(() => setMessage(""), 5000);
      }
    }
  };
  const contextRename = async (asset) => {
    const name = await askText("重命名素材", asset.name, "输入素材名称");
    if (name?.trim()) patch(asset.id, { name: name.trim() });
  };
  const contextTag = async (asset) => {
    const tag = await askText("添加标签", "", "输入标签名称");
    if (tag?.trim())
      patch(asset.id, {
        tags: [...new Set([...(asset.tags || []), tag.trim()])],
      });
  };
  const contextNote = async (asset) => {
    const note = await askText("添加注释", asset.note || "", "输入素材注释");
    if (note !== null) patch(asset.id, { note });
  };
  const contextMove = async (asset, folderId) =>
    applyLibrary(
      await window.nestDesktop.batchUpdate([asset.id], { folderId }),
    );
  const copyAssetToClipboard = async (asset) => {
    if (!desktop || !asset) return;
    const result = await window.nestDesktop.copyAsset(asset.id);
    setMessage(result?.error ? result.error : "文件已复制，可粘贴到其他位置");
    setTimeout(() => setMessage(""), 2500);
  };
  const startExternalAssetDrag = (event, asset) => {
    event.preventDefault();
    event.stopPropagation();
    const ids = selectedIds.includes(asset.id) ? selectedIds : [asset.id];
    externalDragActive.current = true;
    clearTimeout(externalDragTimer.current);
    externalDragTimer.current = setTimeout(() => {
      externalDragActive.current = false;
    }, 30000);
    window.nestDesktop?.startExternalDrag(ids);
  };
  const startAssetDrag = (event, asset) => {
    if (event.target.closest("button,input")) {
      event.preventDefault();
      return;
    }
    if (event.altKey) {
      startExternalAssetDrag(event, asset);
      return;
    }
    const ids = selectedIds.includes(asset.id) ? selectedIds : [asset.id];
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(INTERNAL_DRAG, JSON.stringify(ids));
    event.dataTransfer.setData("text/plain", asset.name);
  };
  const dropAssets = async (event, folderId) => {
    const raw = event.dataTransfer.getData(INTERNAL_DRAG);
    if (!raw) return false;
    event.preventDefault();
    event.stopPropagation();
    let ids = [];
    try {
      ids = JSON.parse(raw);
    } catch {}
    if (!Array.isArray(ids) || !ids.length) return false;
    flushSaves();
    applyLibrary(await window.nestDesktop.batchUpdate(ids, { folderId }));
    setSelectedIds([]);
    setDropFolderId(undefined);
    setDrag(false);
    setMessage(folderId ? "素材已移动到文件夹" : "素材已移动到未分类");
    setTimeout(() => setMessage(""), 2500);
    return true;
  };
  const isExternalFileDrop = (transfer) =>
    desktop &&
    !transfer.types.includes(INTERNAL_DRAG) &&
    !transfer.types.includes(FOLDER_DRAG) &&
    transfer.types.includes("Files");
  const dropExternalOnFolder = (event, folderId) => {
    if (!isExternalFileDrop(event.dataTransfer) || importing || !canEdit) return false;
    event.preventDefault();
    event.stopPropagation();
    setDropFolderId(undefined);
    setDrag(false);
    droppedWebImage(event.dataTransfer, folderId);
    return true;
  };
  const dropAssetsOnTag = async (event, tag) => {
    const raw = event.dataTransfer.getData(INTERNAL_DRAG);
    if (!raw) return;
    event.preventDefault();
    event.stopPropagation();
    let ids = [];
    try { ids = JSON.parse(raw); } catch {}
    if (!Array.isArray(ids) || !ids.length) return;
    flushSaves();
    const result = await window.nestDesktop.batchUpdate(ids, { addTag: tag });
    applyLibrary(result);
    setSelectedIds([]);
    setDropTag(null);
    setMessage(`已为 ${ids.length} 个素材添加标签“${tag}”`);
    setTimeout(() => setMessage(""), 2500);
  };
  const toggleFolderExpanded = (id) =>
    setExpandedFolderIds((current) => toggleExpandedFolder(current, id));
  const startFolderDrag = (event, folder) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(FOLDER_DRAG, folder.id);
    event.dataTransfer.setData("text/plain", folder.name);
  };
  const dropMovedFolder = async (event, parentId) => {
    const id = event.dataTransfer.getData(FOLDER_DRAG);
    if (!id) return false;
    event.preventDefault();
    event.stopPropagation();
    if (id === parentId) {
      setDropFolderId(undefined);
      return false;
    }
    const result = await window.nestDesktop.updateFolder(id, { parentId });
    applyLibrary(result);
    if (!result?.error) {
      if (parentId)
        setExpandedFolderIds((current) => new Set(current).add(parentId));
      setMessage(parentId ? "文件夹已移动到新父级" : "文件夹已移动到根目录");
      setTimeout(() => setMessage(""), 2500);
    }
    setDropFolderId(undefined);
    setDrag(false);
    return true;
  };
  const contextDelete = async (asset) => {
    if (
      await askConfirm(
        `删除“${asset.name}”？`,
        `原文件会移到${recycleBinName}。`,
      )
    )
      del(asset.id);
  };
  const revealAsset = async (id) => {
    const result = await window.nestDesktop.revealAsset(id, true);
    if (result?.error) {
      setMessage(result.error);
      setTimeout(() => setMessage(""), 5000);
    } else if (result?.library) applyLibrary(result.library);
  };
  const openAssetAction = async (id) => {
    const result = await window.nestDesktop.openAsset(id);
    if (result?.error) {
      setMessage(result.error);
      setTimeout(() => setMessage(""), 5000);
    }
  };
  const exportAssetAction = async (id) => {
    const result = await window.nestDesktop.exportAsset(id);
    if (result?.error) setMessage(result.error);
    else if (result?.ok) setMessage("素材已导出");
    if (!result?.canceled) setTimeout(() => setMessage(""), 3500);
  };
  const duplicateAssetAction = async (id) => {
    const result = await window.nestDesktop.duplicateAsset(id);
    applyLibrary(result);
    if (!result?.error) {
      setMessage("素材已复制");
      setTimeout(() => setMessage(""), 2500);
    }
  };
  const convertDepthVideo = async (asset) => {
    if (!desktop || !asset || depthVideoJob) return;
    setDepthVideoJob({ assetId: asset.id, progress: 0, phase: "starting", cancelRequested: false, message: "正在启动深度视频转换器…" });
    try {
      const status = await window.nestDesktop.depthVideo.status();
      if (status?.error) {
        setMessage(status.error);
        setTimeout(() => setMessage(""), 6000);
        return;
      }
      const result = await window.nestDesktop.depthVideo.convert(asset.id);
      if (result?.cancelled) {
        setMessage("已取消深度视频转换，未生成素材");
        setTimeout(() => setMessage(""), 4000);
      } else if (result?.error) {
        setMessage(result.error);
        setTimeout(() => setMessage(""), 6000);
      } else {
        if (result?.library) applyLibrary(result.library);
        setMessage("深度视频已导入到原素材文件夹");
        setTimeout(() => setMessage(""), 5000);
      }
    } catch (error) {
      setMessage(`深度视频转换失败：${error.message}`);
      setTimeout(() => setMessage(""), 6000);
    } finally {
      setDepthVideoJob(null);
    }
  };
  const cancelDepthVideo = async () => {
    const job = depthVideoJob;
    if (!desktop || !job || job.cancelRequested || !["starting", "converting"].includes(job.phase)) return;
    setDepthVideoJob((current) =>
      current ? { ...current, cancelRequested: true, phase: "cancelling", message: "正在取消深度视频转换…" } : current,
    );
    const result = await window.nestDesktop.depthVideo.cancel(job.assetId);
    if (result?.error) {
      setDepthVideoJob((current) =>
        current?.assetId === job.assetId
          ? { ...current, cancelRequested: false, phase: "converting", message: result.error }
          : current,
      );
      setMessage(result.error);
      setTimeout(() => setMessage(""), 4000);
    }
  };
  const previewIndex = shown.findIndex((a) => a.id === previewId),
    previewAsset = shown[previewIndex];
  const shouldShowBugFeedback = desktop && !message && !depthVideoJob && !previewAsset && !dialogState && !aiFlowImportPanel && !extensionPanel && !themePanel && !aiSettingsPanel && !updatePanel && !supportPanel && !teamPanel && !batchRenamePanel;
  const resetPreviewView = () => {
    setZoom(1);
    setRotation(0);
  };
  const movePreview = (delta) => {
    if (!shown.length) return;
    setPreviewId(
      shown[(previewIndex + delta + shown.length) % shown.length].id,
    );
    resetPreviewView();
  };
  const clickAsset = (event, asset) => {
    if (event.shiftKey && lastSelectedId.current) {
      const from = shown.findIndex(
          (item) => item.id === lastSelectedId.current,
        ),
        to = shown.findIndex((item) => item.id === asset.id);
      if (from >= 0 && to >= 0) {
        const range = shown
          .slice(Math.min(from, to), Math.max(from, to) + 1)
          .map((item) => item.id);
        setSelectedIds((ids) =>
          event.ctrlKey || event.metaKey
            ? [...new Set([...ids, ...range])]
            : range,
        );
        setSelected(asset);
        return;
      }
    }
    if (event.ctrlKey || event.metaKey) {
      setSelectedIds((ids) =>
        ids.includes(asset.id)
          ? ids.filter((id) => id !== asset.id)
          : [...ids, asset.id],
      );
      setSelected(asset);
    } else {
      setSelectedIds([]);
      setSelected(asset);
    }
    lastSelectedId.current = asset.id;
  };
  const toggleReferenceAsset = (assetId) => {
    setReferenceAssetIds((ids) =>
      ids.includes(assetId)
        ? ids.filter((id) => id !== assetId)
        : [...ids, assetId],
    );
  };
  const beginMarquee = (event) => {
    if (
      event.button !== 0 ||
      event.target.closest("article,button,input,select,textarea")
    )
      return;
    event.currentTarget.setPointerCapture(event.pointerId);
    marqueeStart.current = { x: event.clientX, y: event.clientY, moved: false };
    marqueeBase.current = new Set(
      event.ctrlKey || event.metaKey ? selectedIds : [],
    );
    setMarquee({
      left: event.clientX,
      top: event.clientY,
      width: 0,
      height: 0,
    });
  };
  const moveMarquee = (event) => {
    const start = marqueeStart.current;
    if (!start) return;
    const dx = event.clientX - start.x,
      dy = event.clientY - start.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) start.moved = true;
    const box = {
      left: Math.min(start.x, event.clientX),
      top: Math.min(start.y, event.clientY),
      right: Math.max(start.x, event.clientX),
      bottom: Math.max(start.y, event.clientY),
    };
    setMarquee({
      left: box.left,
      top: box.top,
      width: box.right - box.left,
      height: box.bottom - box.top,
    });
    if (!start.moved) return;
    const ids = new Set(marqueeBase.current);
    document.querySelectorAll("article[data-asset-id]").forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (
        rect.right >= box.left &&
        rect.left <= box.right &&
        rect.bottom >= box.top &&
        rect.top <= box.bottom
      )
        ids.add(element.dataset.assetId);
    });
    setSelectedIds([...ids]);
    setSelected(null);
  };
  const endMarquee = (event) => {
    const start = marqueeStart.current;
    if (!start) return;
    if (!start.moved) {
      setSelectedIds([]);
      setSelected(null);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    marqueeStart.current = null;
    setMarquee(null);
  };
  const beginSidebarResize = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    sidebarResizing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add("resizing-sidebar");
  };
  const moveSidebarResize = (event) => {
    if (sidebarResizing.current)
      setSidebarWidth(clampSidebarWidth(event.clientX));
  };
  const endSidebarResize = (event) => {
    if (!sidebarResizing.current) return;
    sidebarResizing.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    document.body.classList.remove("resizing-sidebar");
    const width = clampSidebarWidth(event.clientX);
    setSidebarWidth(width);
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
  };
  const resetSidebarWidth = () => {
    setSidebarWidth(232);
    localStorage.setItem(SIDEBAR_WIDTH_KEY, "232");
  };
  const cycleViewMode = () =>
    setViewMode((current) => {
      const next =
        VIEW_MODES[(VIEW_MODES.indexOf(current) + 1) % VIEW_MODES.length];
      localStorage.setItem(VIEW_MODE_KEY, next);
      return next;
    });
  const importFiles = async (files) => {
    for (const file of [...files].filter((f) =>
      /^(image|video|audio)\//.test(f.type),
    )) {
      const tempUrl = URL.createObjectURL(file);
      const dims = file.type.startsWith("image/")
        ? await new Promise((res) => {
            const im = new Image();
            im.onload = () => res([im.naturalWidth, im.naturalHeight]);
            im.onerror = () => res([0, 0]);
            im.src = tempUrl;
          })
        : [0, 0];
      const a = {
        id: crypto.randomUUID(),
        name: file.name.replace(/\.[^.]+$/, ""),
        type: file.type,
        size: file.size,
        width: dims[0],
        height: dims[1],
        tags: [],
        favorite: false,
        createdAt: Date.now(),
        blob: file,
        url: tempUrl,
      };
      await saveAsset({ ...a, url: "" });
      assetsRef.current = [a, ...assetsRef.current];
      setAssets(assetsRef.current);
    }
  };
  const patch = (id, data) => {
    const target = assetsRef.current.find((a) => a.id === id);
    if (!target) return;
    const updated = { ...target, ...data };
    assetsRef.current = assetsRef.current.map((a) =>
      a.id === id ? updated : a,
    );
    setAssets(assetsRef.current);
    setSelected((s) => (s?.id === id ? updated : s));
    if (desktop) {
      desktopChanges.current.set(id, {
        ...(desktopChanges.current.get(id) || {}),
        ...data,
      });
      clearTimeout(desktopTimers.current.get(id));
      desktopTimers.current.set(
        id,
        setTimeout(async () => {
          const changes = desktopChanges.current.get(id);
          desktopChanges.current.delete(id);
          desktopTimers.current.delete(id);
          if (!changes) return;
          try {
            const result = await window.nestDesktop.updateAsset(id, changes);
            if (result?.error) {
              setMessage(result.error);
              setTimeout(() => setMessage(""), 5000);
              const current = await window.nestDesktop.currentLibrary();
              applyLibrary(current);
              return;
            }
            applyLibrary(result);
          } catch (error) {
            setMessage(`保存失败：${error.message}`);
            setTimeout(() => setMessage(""), 5000);
          }
        }, 300),
      );
      return;
    }
    writePending(id, data);
    pendingSaves.current.set(id, updated);
    clearTimeout(saveTimers.current.get(id));
    saveTimers.current.set(
      id,
      setTimeout(() => {
        const pending = pendingSaves.current.get(id);
        if (pending)
          saveAsset({ ...pending, url: "" }).then(() => clearPending(id));
        pendingSaves.current.delete(id);
        saveTimers.current.delete(id);
      }, 250),
    );
  };
  const del = async (id) => {
    if (desktop) {
      clearTimeout(desktopTimers.current.get(id));
      desktopTimers.current.delete(id);
      desktopChanges.current.delete(id);
      applyLibrary(await window.nestDesktop.deleteAsset(id));
      return;
    }
    clearTimeout(saveTimers.current.get(id));
    const doomed = assetsRef.current.find((a) => a.id === id);
    if (doomed?.url?.startsWith("blob:")) URL.revokeObjectURL(doomed.url);
    await removeAsset(id);
    assetsRef.current = assetsRef.current.filter((a) => a.id !== id);
    setAssets(assetsRef.current);
    setSelected(null);
  };
  useEffect(() => {
    const onShortcut = (event) => {
      if (
        event.target.closest('input,textarea,select,[contenteditable="true"]')
      )
        return;
      if (previewId && event.key === "Escape") {
        event.preventDefault();
        setPreviewId(null);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        toggleSelectAll();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        const asset =
          selected ||
          assetsRef.current.find((item) => selectedIds.includes(item.id));
        if (asset) {
          event.preventDefault();
          copyAssetToClipboard(asset);
        }
      }
      if (
        event.code === "Space" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        const asset = previewId
          ? assetsRef.current.find(item => item.id === previewId && item.type?.startsWith("audio"))
          : null;
        if (asset) {
          event.preventDefault();
          audioPreviewManager.toggle(asset);
        }
      }
      const previewAudio = previewId ? assetsRef.current.find(item => item.id === previewId && item.type?.startsWith("audio")) : null;
      if (previewAudio && event.key === "ArrowLeft") { event.preventDefault(); audioPreviewManager.seekBy(previewAudio, -5); }
      else if (previewId && event.key === "ArrowLeft") movePreview(-1);
      if (previewAudio && event.key === "ArrowRight") { event.preventDefault(); audioPreviewManager.seekBy(previewAudio, 5); }
      else if (previewId && event.key === "ArrowRight") movePreview(1);
      if (previewId && event.key.toLowerCase() === "r")
        setRotation((value) => (value + 90) % 360);
      if (previewId && event.key === "0") resetPreviewView();
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [shown, selectedIds, selected, previewId]);
  useEffect(() => {
    if (!ready) return;
    const hydrated = assetsRef.current.map((a) =>
      a.blob && !a.url ? { ...a, url: URL.createObjectURL(a.blob) } : a,
    );
    assetsRef.current = hydrated;
    setAssets(hydrated);
  }, [ready]);
  useEffect(() => {
    const blocked = Boolean(desktop && ready && !library),
      background = document.querySelectorAll("aside,main");
    background.forEach((element) =>
      blocked
        ? element.setAttribute("inert", "")
        : element.removeAttribute("inert"),
    );
    return () =>
      background.forEach((element) => element.removeAttribute("inert"));
  }, [desktop, ready, library]);
  const nav = [
    ["全部素材", "all"],
    ["未分类", "unclassified"],
    ["收藏夹", "favorite"],
    ["最近", "recent"],
    ["图片", "image"],
    ["视频", "video"],
    ["音频", "audio"],
    ["剧本", "script"],
  ];
  const importPercent =
    importProgress?.phase === "complete"
      ? 100
      : importProgress?.phase === "downloading-aiflow" && importProgress.total
        ? Math.round(((importProgress.processed || 0) + (importProgress.totalBytes ? Math.min(1, (importProgress.received || 0) / importProgress.totalBytes) : 0)) / importProgress.total * 100)
        : importProgress?.phase === "downloaded-aiflow" && importProgress.total
          ? Math.round(((importProgress.processed || 0) / importProgress.total) * 100)
      : importProgress?.phase === "importing" && importProgress.total
        ? Math.round((importProgress.processed / importProgress.total) * 100)
        : 0;
  const importCancelable =
    importing && ["scanning", "importing"].includes(importProgress?.phase);
  const importStatus =
    importProgress?.phase === "scanning"
      ? importCancelRequested
        ? "正在取消导入…"
        : `已扫描 ${importProgress.scanned || 0} 项 · 发现 ${importProgress.found || 0} 个素材`
      : importProgress?.phase === "downloading-aiflow"
        ? `正在从 AI Flow 下载 ${importProgress.name || "视频"} · ${importPercent}%`
        : importProgress?.phase === "downloaded-aiflow"
          ? `AI Flow 已下载 ${importProgress.processed || 0} / ${importProgress.total || 0}`
      : importProgress?.phase === "importing"
        ? importCancelRequested
          ? "正在取消导入…"
          : `正在导入 ${importProgress.processed || 0} / ${importProgress.total || 0} · ${importPercent}%`
        : importProgress?.phase === "complete"
          ? "导入完成 · 100%"
          : importProgress?.phase === "choosing-files"
            ? "请选择要导入的素材"
            : importProgress?.phase === "downloading-web"
              ? "正在下载网页素材…"
              : "请选择需要导入的文件夹";
  return (
    <div
      className={`app theme-${resolvedThemeMode} ${inspectorFrame.ready ? "detail-open" : ""} ${activeModule === "reference-board" ? "reference-board-mode" : ""} ${activeModule === "tetris" ? "tetris-mode" : ""}`}
      style={{
        "--sidebar-width": `${sidebarWidth}px`,
        "--inspector-overlay-width": `${inspectorFrame.overlayWidth}px`,
        ...themeStyle(renderedTheme, resolvedThemeMode),
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (externalDragActive.current) return;
        if (
          e.dataTransfer.types.includes(INTERNAL_DRAG) ||
          e.dataTransfer.types.includes(FOLDER_DRAG)
        ) {
          e.dataTransfer.dropEffect = "move";
          return;
        }
        setDrag(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setDrag(false);
          setDropFolderId(undefined);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (externalDragActive.current) {
          externalDragActive.current = false;
          clearTimeout(externalDragTimer.current);
          setDrag(false);
          return;
        }
        if (
          e.dataTransfer.types.includes(INTERNAL_DRAG) ||
          e.dataTransfer.types.includes(FOLDER_DRAG)
        ) {
          setDrag(false);
          setDropFolderId(undefined);
          return;
        }
        desktop
          ? droppedWebImage(e.dataTransfer)
          : (setDrag(false), importFiles(e.dataTransfer.files));
      }}
    >
      <aside>
        <div className="sidebar-scroll-content">
        <div className="brand">
          <div className="mark">
            <img src={appIcon} alt="" />
          </div>
          <span>小旺仔素材库</span>
          <button
            disabled={libraryChoosing}
            aria-label="打开其他资源库"
            title="打开其他资源库"
            onClick={desktop ? openLibrary : undefined}
          >
            <Menu size={19} />
          </button>
        </div>
        <section
          className={`import-actions ${importing ? "busy" : ""} ${importProgress?.phase || ""}`}
          aria-busy={importing}
        >
          <div className="import-actions-head">
            <span>
              <PixelImportIcon size={16} />
            </span>
            <div>
              <strong>{importing ? "正在导入素材…" : "添加到素材库"}</strong>
              <small>{importing ? importStatus : "文件或完整目录结构"}</small>
            </div>
            {importing && importProgress?.phase !== "scanning" && (
              <b>{importPercent}%</b>
            )}
          </div>
          <div className="import-actions-grid">
            <button
              className="import-action primary"
              disabled={importing || !canEdit}
              onClick={desktop ? nativeImport : () => input.current.click()}
            >
              <PixelImportIcon size={16} />
              <span>导入素材</span>
              <small>选择文件</small>
            </button>
            {desktop && library && (
              <button
                className="import-action folder"
                disabled={importing || !canEdit}
                onClick={nativeImportFolder}
              >
                <PixelChestIcon size={20} />
                <span>导入文件夹</span>
                <small>保留子目录</small>
              </button>
            )}
            {desktop && library && (
              <button
                className="import-action aiflow"
                disabled={importing || !canEdit}
                onClick={() => setAiFlowImportPanel(true)}
              >
                <PixelPortalIcon size={16} />
                <span>导入 AI Flow 素材</span>
                <small>服务器已完成视频或本机“我的素材”</small>
              </button>
            )}
          </div>
          {importing && (
            <div
              className={`folder-import-progress ${importProgress?.phase === "scanning" || importProgress?.phase === "choosing-folder" ? "indeterminate" : ""}`}
            >
              <i style={{ width: `${importPercent}%` }} />
            </div>
          )}
          {importCancelable && (
            <button
              className="import-cancel"
              disabled={importCancelRequested}
              onClick={cancelImport}
            >
              {importCancelRequested ? "正在取消…" : "取消本次导入"}
            </button>
          )}
        </section>
        {desktop && library && (
          <button
            className="new-folder-primary"
            disabled={importing || !canEdit}
            onClick={addFolder}
          >
            <PixelChestIcon size={17} /> 新建文件夹
          </button>
        )}
        <input
          ref={input}
          hidden
          multiple
          type="file"
          accept="image/*,video/*,audio/*,.pdf,.docx,.txt,.md,.markdown,.fountain"
          onChange={(e) => importFiles(e.target.files)}
        />
        <nav className="asset-filter-nav">
          {nav.map(([n, icon]) => (
            <button
              className={`${filter === n && !activeFolder && !currentTag ? "active" : ""} ${n === "未分类" && dropFolderId === null ? "drop-target" : ""}`}
              onDragOver={
                n === "未分类"
                  ? (e) => {
                      if (e.dataTransfer.types.includes(INTERNAL_DRAG)) {
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = "move";
                        setDropFolderId(null);
                      }
                    }
                  : undefined
              }
              onDragLeave={
                n === "未分类" ? () => setDropFolderId(undefined) : undefined
              }
              onDrop={n === "未分类" ? (e) => dropAssets(e, null) : undefined}
              onClick={() => {
                setActiveModule("library");
                setFilter(n);
                setCurrentTag(null);
                if (n === "全部素材") setQuery("");
                setActiveFolder(null);
                setSelected(null);
                setSelectedIds([]);
              }}
              key={n}
            >
              <PixelNavIcon kind={icon} size={17} />
              <span>{n}</span>
              {n === "全部素材" && <b>{assets.length}</b>}
            </button>
          ))}
        </nav>
        <div className="nav-title"><span>制作参考</span></div>
        <nav className="reference-board-nav">
          <button
            className={activeModule === "reference-board" ? "active" : ""}
            onClick={() => openReferenceBoard()}
            title="打开 PureRef 风格的无限参考画布"
          >
            <StickyNote size={16} />
            <span>无限参考板</span>
            <b>{(library?.referenceBoards || []).length}</b>
          </button>
        </nav>
        <div
          className={`nav-title folder-root-drop ${dropFolderId === ROOT_FOLDER_DROP ? "drop-target" : ""}`}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(FOLDER_DRAG)) {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = "move";
              setDropFolderId(ROOT_FOLDER_DROP);
            }
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget))
              setDropFolderId(undefined);
          }}
          onDrop={(e) => dropMovedFolder(e, null)}
        >
          <span>文件夹</span>
          <button
            disabled={!canEdit}
            aria-label="新建文件夹"
            title="新建根文件夹"
            onClick={desktop ? addFolder : undefined}
          >
            <Plus size={15} />
          </button>
        </div>
        <nav className="compact-folder-tree">
          {desktop ? (
            orderedFolders.map((f) => (
              <div
                draggable={canEdit}
                data-depth={f.depth}
                className={`folder-row ${activeFolder === f.id ? "active" : ""} ${dropFolderId === f.id ? "drop-target" : ""}`}
                style={{ "--folder-depth": f.depth }}
                key={f.id}
                onDragStart={(e) => startFolderDrag(e, f)}
                onDragEnd={() => setDropFolderId(undefined)}
                onDragOver={(e) => {
                  if (
                    e.dataTransfer.types.includes(INTERNAL_DRAG) ||
                    e.dataTransfer.types.includes(FOLDER_DRAG) ||
                    (canEdit && isExternalFileDrop(e.dataTransfer))
                  ) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = isExternalFileDrop(e.dataTransfer)
                      ? "copy"
                      : "move";
                    setDropFolderId(f.id);
                  }
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget))
                    setDropFolderId(undefined);
                }}
                onDrop={(e) => {
                  if (dropExternalOnFolder(e, f.id)) return;
                  return e.dataTransfer.types.includes(FOLDER_DRAG)
                    ? dropMovedFolder(e, f.id)
                    : dropAssets(e, f.id);
                }}
                title={`拖入“${f.name}”（保留最外层文件夹，子文件夹素材会平铺导入）`}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({
                    kind: "folder",
                    x: e.clientX,
                    y: e.clientY,
                    folder: f,
                  });
                }}
              >
                <button
                  className={`folder-toggle ${expandedFolderIds.has(f.id) ? "" : "collapsed"}`}
                  aria-label={
                    expandedFolderIds.has(f.id)
                      ? `收起 ${f.name}`
                      : `展开 ${f.name}`
                  }
                  disabled={!f.hasChildren}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (f.hasChildren) toggleFolderExpanded(f.id);
                  }}
                >
                  <ChevronDown size={12} />
                </button>
                {renamingFolder?.id === f.id ? (
                  <div className="folder-main folder-main-editing" onClick={event => event.stopPropagation()}>
                    <FolderMark folder={f} preview={folderPreviewById.get(f.id)} />
                    <input
                      ref={folderRenameInputRef}
                      aria-label={`重命名 ${f.name}`}
                      value={renamingFolder.name}
                      maxLength={50}
                      onChange={event => setRenamingFolder(current => current?.id === f.id ? { ...current, name: event.target.value } : current)}
                      onKeyDown={event => {
                        if (event.key === "Enter") { event.preventDefault(); commitFolderRename(); }
                        if (event.key === "Escape") { event.preventDefault(); cancelFolderRename(); }
                      }}
                      onBlur={commitFolderRename}
                    />
                  </div>
                ) : (
                  <button
                    className="folder-main"
                    onClick={(e) => {
                      e.stopPropagation();
                      openFolder(f);
                    }}
                  >
                  <FolderMark
                    folder={f}
                    preview={folderPreviewById.get(f.id)}
                  />
                  {aiFlowFolderConnected(f) && (
                    <i className="aiflow-live-bolt" title="AI Flow 实时连接中" aria-label="AI Flow 实时连接中">
                      <Zap size={12} fill="currentColor" />
                    </i>
                  )}
                   <span>
                     {f.name} <small>({folderAssetCounts.get(f.id) || 0})</small>
                   </span>
                  </button>
                )}
                <button
                  className="folder-action"
                  disabled={!canEdit}
                  title="更多操作"
                  onClick={(e) => {
                    e.stopPropagation();
                    setContextMenu({
                      kind: "folder",
                      x: e.clientX,
                      y: e.clientY,
                      folder: f,
                    });
                  }}
                >
                  <MoreHorizontal size={14} />
                </button>
                <button
                  className="folder-action danger"
                  disabled={!canEdit}
                  title="删除文件夹"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteFolder(f);
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            ))
          ) : (
            <>
              <button>
                <Folder size={17} />
                <span>灵感收集</span>
                <b>{assets.filter((a) => a.tags.includes("灵感")).length}</b>
              </button>
              <button>
                <Folder size={17} />
                <span>品牌项目</span>
              </button>
            </>
          )}
        </nav>
        <div className="nav-title">
          <span>标签</span>
          <button
            disabled={!canEdit}
            aria-label="新建标签"
            title="新建标签"
            onClick={desktop ? addLibraryTag : undefined}
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="tag-list">
          {tagRows.map((tag, i) => (
            <div className={`tag-entry tag-tree-entry ${dropTag === tag.path ? "drop-target" : ""}`} style={{"--tag-depth":tag.depth}} key={tag.path}
              onDragOver={event => { if (event.dataTransfer.types.includes(INTERNAL_DRAG) && canEdit) { event.preventDefault(); event.dataTransfer.dropEffect="move"; setDropTag(tag.path); } }}
              onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropTag(null); }}
              onDrop={event => canEdit && dropAssetsOnTag(event, tag.path)}>
              <button className="tag-toggle" disabled={!tag.hasChildren} onClick={() => setExpandedTags(current => { const next=new Set(current);next.has(tag.path)?next.delete(tag.path):next.add(tag.path);return next; })} aria-label={tag.hasChildren ? `${expandedTags.has(tag.path)?"收起":"展开"} ${tag.name}` : undefined}>
                {tag.hasChildren && <ChevronDown size={11}/>}
              </button>
              <button
                className={`tag-filter ${currentTag === tag.path ? "active" : ""}`}
                onClick={() => {
                  setActiveModule("library");
                  setCurrentTag((current) => (current === tag.path ? null : tag.path));
                  setFilter("全部素材");
                  setActiveFolder(null);
                  setSelected(null);
                  setSelectedIds([]);
                }}
              >
                <i className={`dot c${i % 4}`} />
                {tag.name}
              </button>
              {desktop && tag.explicit && (
                <button
                  className="tag-remove"
                  disabled={!canEdit}
                  aria-label={`删除标签 ${tag.path}`}
                  title="删除标签"
                  onClick={() => deleteLibraryTag(tag.path)}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
        </div>
        {desktop && library && (
          <SidebarFooter
            info={diskInfo}
            recycleBinName={recycleBinName}
            openSupport={() => setSupportPanel(true)}
            openRecycle={async () => {
              const result = await window.nestDesktop.openRecycleBin();
              if (result?.error) {
                setMessage(`无法打开${recycleBinName}：${result.error}`);
                setTimeout(() => setMessage(""), 3500);
              }
            }}
          />
        )}
      </aside>
      <div
        className="sidebar-resizer"
        role="separator"
        aria-label="调整左侧栏宽度"
        aria-orientation="vertical"
        title="拖动调整左侧栏宽度，双击恢复默认"
        onPointerDown={beginSidebarResize}
        onPointerMove={moveSidebarResize}
        onPointerUp={endSidebarResize}
        onPointerCancel={endSidebarResize}
        onDoubleClick={resetSidebarWidth}
      />
      <main
        ref={mainScrollRef}
        className={`view-${viewMode}`}
        onScroll={(e) => updateVirtualRange(e.currentTarget)}
      >
        <header>
          <div className="breadcrumbs">
            {activeModule === "reference-board" ? (
              <><StickyNote size={15}/><strong>无限参考板</strong></>
            ) : (
              <>
                <button className="breadcrumb-link" onClick={openLibraryRoot}>资源库</button>
                {folderBreadcrumbs.map(folder => (
                  <React.Fragment key={folder.id}>
                    <b>›</b>
                    <button className="breadcrumb-link" onClick={() => openFolder(folder)}>{folder.name}</button>
                  </React.Fragment>
                ))}
                {!activeFolder && <><b>›</b><strong>{filter}</strong></>}
              </>
            )}
          </div>
          {activeModule === "library" && <div className="search">
            <Search size={18} />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setAiResultIds(null);
              }}
              placeholder="搜索素材"
            />
            {(query || aiResultIds) && (
              <button
                className="search-clear"
                aria-label="清除搜索"
                title="清除搜索"
                onClick={() => {
                  setQuery("");
                  setAiResultIds(null);
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>}
          <div className="top-action-strip"><LanChat selectedIds={selectedIds.length ? selectedIds : (selected ? [selected.id] : [])} />
            <button
              className="top-pill director-prank-button"
              title="不要点这个按钮"
              onClick={playDirectorPrank}
            >
              <Clapperboard size={14} />
              <span>AI导演</span>
            </button>
            <button
              className={`top-pill tetris-header-button ${activeModule === "tetris" ? "on" : ""}`}
              title="无穷大"
              onClick={requestTetrisAccess}
            >
              <InfinityIcon size={15} />
              <span>无穷大</span>
            </button>
            <button
              className={`top-pill ai-header-button ${aiPanel ? "on" : ""}`}
              title="AI 助手"
              onClick={toggleAiPanel}
            >
              <Sparkles size={14} />
              <span>AI助手</span>
            </button>
            <button
              className={`top-pill update-button ${updateInfo?.available ? "has-update" : ""}`}
              title={
                updateInfo?.available
                  ? `发现新版本 ${updateInfo.latest}`
                  : "检查更新"
              }
              onClick={checkUpdate}
              disabled={updateChecking}
            >
              <RotateCw size={14} />
              <span>{updateChecking ? "检查中" : "检查更新"}</span>
              {updateInfo?.available && <i />}
            </button>
            <button
              className="top-pill"
              title="扩展、插件与 MCP"
              onClick={async () => {
                setExtensionResult(null);
                setPlugins(await window.nestDesktop.listPlugins());
                setMcpConfig(await window.nestDesktop.mcpConfig());
                setExtensionPanel(true);
              }}
            >
              <Puzzle size={14} />
              <span>扩展</span>
            </button>
            <button
              className="top-pill"
              title="自定义配色"
              onClick={() => setThemePanel(true)}
            >
              <SlidersHorizontal size={14} />
              <span>自定义配色</span>
            </button>
            <button
              className="top-pill"
              title="设置"
              onClick={() => {
                setAiSettingsPanel(true);
                setAiPanel(false);
              }}
            >
              <Settings size={14} />
              <span>设置</span>
            </button>
            <button
              className="top-pill library-status-pill"
              title="资源库健康与备份"
              onClick={showLibraryInfo}
            >
              <Archive size={14} />
              <span>资源库状态检查</span>
            </button>
          </div>
        </header>
        {directorPrankPlaying && (
          <section className="director-prank-overlay" aria-label="全面开战视频播放">
            <video
              ref={directorPrankVideoRef}
              src={directorPrankVideo}
              playsInline
              onEnded={closeDirectorPrank}
            />
          </section>
        )}
        {activeModule === "tetris" && (
          <TetrisModule
            close={() => {
              setSelected(null);
              setActiveModule("library");
            }}
          />
        )}
        {activeModule === "reference-board" && (
          <ReferenceBoard
            boards={library?.referenceBoards || []}
            assets={assets}
            folders={library?.folders || []}
            preferredFolderId={activeFolder}
            canEdit={canEdit}
            activeBoardId={activeReferenceBoardId}
            setActiveBoardId={setActiveReferenceBoardId}
            createBoard={createReferenceBoard}
            updateBoard={updateReferenceBoard}
            deleteBoard={deleteReferenceBoard}
            close={() => setActiveModule("library")}
            openAsset={(asset) => {
              setSelected(asset);
              setActiveModule("library");
            }}
          />
        )}
        <section className="toolbar">
          <div>
            <h1>{activeFolder ? currentFolder?.name : filter}</h1>
            <span>
              {contentFolders.length} 个文件夹 · {shown.length} 个素材
            </span>
            {activeAIFlowSync && (
              <span
                className={`aiflow-live-status ${activeAIFlowSync.enabled ? "enabled" : "disabled"}`}
                title="网页保持打开且已登录时，本地新增素材和引用栏上传都会立即唤醒 Edge；3 秒检查仅作断线兜底。网页素材每约 10 秒回拉。等待上传的素材会显示在卡片上。"
              >
                <RotateCw size={12} />
                AI Flow {activeAIFlowSync.enabled ? "实时同步已开启" : "实时同步已关闭"} · 新增即时上传 · 引用即时唤醒 · 3 秒兜底 · 回拉每 10 秒 · 待上传 {activeAIFlowSync.pending} 项
                {activeAIFlowSync.syncedAt ? ` · 目录对应于 ${new Date(activeAIFlowSync.syncedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : ""}
              </span>
            )}
          </div>
          <div className="view-actions">
            {activeFolder && (
              <button
                onClick={() => setActiveFolder(currentFolder?.parentId || null)}
              >
                <FolderOpen size={15} /> 返回上级
              </button>
            )}
            <button disabled={!canEdit} onClick={addFolder}>
              <Plus size={15} /> 新建根文件夹
            </button>
            <button
              className={allShownSelected ? "on" : ""}
              disabled={!shown.length}
              onClick={toggleSelectAll}
            >
              <LayoutGrid size={15} /> {allShownSelected ? "取消全选" : "全选"}
            </button>
            <div className="popover-anchor">
              <button
                className={sortPanel ? "on" : ""}
                onClick={() => {
                  setSortPanel((v) => !v);
                  setFilterPanel(false);
                }}
              >
                <ChevronDown size={15} />{" "}
                {SORT_OPTIONS.find((item) => item[0] === sortOrder)?.[1]}
              </button>
              {sortPanel && (
                <SortMenu
                  value={sortOrder}
                  choose={(value) => {
                    setSortOrder(value);
                    setSortPanel(false);
                  }}
                />
              )}
            </div>
            <div className="popover-anchor">
              <button
                className={
                  filterPanel || quickTypes.length + quickFormats.length
                    ? "on"
                    : ""
                }
                onClick={() => {
                  setFilterPanel((v) => !v);
                  setSortPanel(false);
                }}
              >
                <Filter size={15} /> 筛选
                {quickTypes.length + quickFormats.length > 0 && (
                  <b className="filter-count">
                    {quickTypes.length + quickFormats.length}
                  </b>
                )}
              </button>
              {filterPanel && (
                <FilterPopover
                  types={quickTypes}
                  formats={quickFormats}
                  setTypes={setQuickTypes}
                  setFormats={setQuickFormats}
                  close={() => setFilterPanel(false)}
                />
              )}
            </div>
            <button
              className="view-mode-button"
              title="切换视图"
              aria-label="切换视图"
              onClick={cycleViewMode}
            >
              {viewMode === "list" ? (
                <List size={17} />
              ) : viewMode === "compact" ? (
                <Grid2X2 size={17} />
              ) : (
                <LayoutGrid size={17} />
              )}
              <span>
                {viewMode === "list"
                  ? "列表"
                  : viewMode === "compact"
                    ? "紧凑"
                    : "标准"}
              </span>
            </button>
            <button
              title="打开其他资源库"
              onClick={desktop ? openLibrary : undefined}
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </section>
        <ReferenceShelf
          assets={referenceAssets}
          remove={(id) => setReferenceAssetIds((ids) => ids.filter((item) => item !== id))}
          clear={() => setReferenceAssetIds([])}
          open={(asset) => setSelected(asset)}
          upload={beginAIFlowReferenceUpload}
          uploading={referenceUploadPreparing}
          createBoard={createBoardFromReferences}
        />
        {contentFolders.length > 0 && (
          <section className="content-folders">
            {contentFolders.map((folder) => (
              <button
                key={folder.id}
                className={dropFolderId === folder.id ? "drop-target" : ""}
                onClick={() => openFolder(folder)}
                onDoubleClick={() => openFolder(folder)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({
                    kind: "folder",
                    x: e.clientX,
                    y: e.clientY,
                    folder,
                  });
                }}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes(INTERNAL_DRAG)) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = "move";
                    setDropFolderId(folder.id);
                  }
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget))
                    setDropFolderId(undefined);
                }}
                onDrop={(e) => dropAssets(e, folder.id)}
              >
                <FolderMark folder={folder} />
                <span>
                  <strong>{folder.name}</strong>
                  <small>{folderAssetCounts.get(folder.id) || 0} 个素材</small>
                </span>
                <ChevronDown size={16} />
              </button>
            ))}
          </section>
        )}
        {shown.length ? (
          <section
            className="masonry"
            ref={assetGridRef}
            onPointerDown={beginMarquee}
            onPointerMove={moveMarquee}
            onPointerUp={endMarquee}
            onPointerCancel={endMarquee}
          >
            {virtualRange.before > 0 && <div className="virtual-spacer" style={{ height: virtualRange.before }} aria-hidden="true" />}
            {displayed.map((a) => (
              <article
                key={a.id}
                data-asset-id={a.id}
                draggable={desktop}
                onDragStart={(e) => startAssetDrag(e, a)}
                onDragEnd={() => {
                  externalDragActive.current = false;
                  clearTimeout(externalDragTimer.current);
                  setDropFolderId(undefined);
                  setDrag(false);
                }}
                className={`${selected?.id === a.id ? "selected" : ""} ${selectedIdSet.has(a.id) ? "multi-selected" : ""} ${referenceAssetIds.includes(a.id) ? "referenced" : ""}`}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelected(a);
                  setContextMenu({ x: e.clientX, y: e.clientY, asset: a });
                }}
                onDoubleClick={() => {
                  setPreviewId(a.id);
                  resetPreviewView();
                }}
                onClick={(e) => clickAsset(e, a)}
              >
                <div
                  className="thumb"
                  title="拖动卡片可在软件内移动；按住 Alt 拖动可拖出软件"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleReferenceAsset(a.id);
                  }}
                >
                  <span
                    className="external-drag-handle"
                    draggable={desktop}
                    aria-label="拖出软件"
                    title="从这里拖到桌面、文件夹、其他软件或浏览器"
                    onClick={(e) => e.stopPropagation()}
                    onDragStart={(e) => startExternalAssetDrag(e, a)}
                  >
                    <ExternalLink size={13} />
                  </span>
                  <Media
                    asset={a}
                    onSize={(width, height) => {
                      if (!a.width) patch(a.id, { width, height });
                    }}
                  />
                  <button
                    className="select-dot"
                    aria-label="选择素材"
                    onClick={(e) => {
                      e.stopPropagation();
                      lastSelectedId.current = a.id;
                      toggleSelected(a.id);
                    }}
                  >
                    {selectedIdSet.has(a.id) ? "✓" : ""}
                  </button>
                  <button
                    aria-label={a.favorite ? "取消收藏" : "收藏"}
                    title={a.favorite ? "取消收藏" : "收藏"}
                    className={a.favorite ? "fav yes" : "fav"}
                    onClick={(e) => {
                      e.stopPropagation();
                      patch(a.id, { favorite: !a.favorite });
                    }}
                  >
                    <Heart
                      size={17}
                      fill={a.favorite ? "currentColor" : "none"}
                    />
                  </button>
                  <div className="dimensions">
                    {a.width || "—"} × {a.height || "—"}
                  </div>
                  {referenceAssetIds.includes(a.id) && <span className="reference-added">已引用</span>}
                </div>
                  <div className="meta" title="拖动名称可移动到内部文件夹">
                    <strong title={a.name}>{a.name}</strong>
                    <div>
                      {(() => {
                        const pendingUpload = pendingAIFlowUploadsByAssetId.get(String(a.id));
                        if (pendingUpload) return <span className={`aiflow-source-badge ${pendingUpload.lastError ? "failed" : "pending"}`} title={pendingUpload.lastError || "正在等待 AI Flow 网页上传"}>{pendingUpload.lastError ? "上传失败" : "等待上传"}</span>;
                        return a.importSource?.provider === "AI Flow" && <span className="aiflow-source-badge">来自 AI Flow</span>;
                      })()}
                      {a.tags.slice(0, 2).map((t) => (
                        <span key={t}>{t}</span>
                      ))}
                  </div>
                </div>
              </article>
            ))}
            {virtualRange.after > 0 && <div className="virtual-spacer" style={{ height: virtualRange.after }} aria-hidden="true" />}
          </section>
        ) : (
          !contentFolders.length && (
            <div className="empty">
              <ImageIcon size={34} />
              <h2>这里还没有素材或文件夹</h2>
              <p>新建文件夹，或拖入图片、视频和外部文件夹。</p>
              <button
                onClick={desktop ? nativeImport : () => input.current.click()}
              >
                选择图片
              </button>
            </div>
          )
        )}
      </main>
      {marquee && <div className="selection-marquee" style={marquee} />}
      {inspectorFrame.ready && !aiPanel && selected && (
        <Detail
          asset={assets.find((a) => a.id === selected.id) || selected}
          folders={allOrderedFolders}
          close={() => setSelected(null)}
          openAI={() => setAiPanel(true)}
          patch={patch}
          del={del}
          open={openAssetAction}
          reveal={revealAsset}
          confirmAction={askConfirm}
          canEdit={canEdit}
          openMore={(event, asset) =>
            setContextMenu({ x: event.clientX, y: event.clientY, asset })
          }
        />
      )}
      {inspectorFrame.ready && aiPanel && desktop && (
        <AIAssistant
          library={library}
          folder={currentFolder}
          selectedIds={
            selectedIds.length ? selectedIds : selected ? [selected.id] : []
          }
          query={query}
          filter={filter}
        close={toggleAiPanel}
          settings={() => setAiSettingsPanel(true)}
          applyLibrary={applyLibrary}
          showResults={(ids) => {
            setAiResultIds(ids);
            setFilter("全部素材");
            setQuery("");
            setActiveFolder(null);
          }}
        />
      )}
      {(drag || importing) && (
        <div className="drop">
          <Import size={38} />
          <strong>
            {importing ? importStatus : "释放即可导入"}
          </strong>
          {importing ? (
            <>
              <div
                className={`drop-import-progress ${importProgress?.phase === "scanning" ? "indeterminate" : ""}`}
                aria-label={`导入进度 ${importPercent}%`}
              >
                <i style={{ width: `${importPercent}%` }} />
              </div>
              {importCancelable && (
                <button
                  className="drop-import-cancel"
                  disabled={importCancelRequested}
                  onClick={cancelImport}
                >
                  {importCancelRequested ? "正在取消…" : "取消导入"}
                </button>
              )}
            </>
          ) : (
            <span>支持常用图片、视频、MP3、WAV、FLAC、M4A 等音频</span>
          )}
        </div>
      )}
      {message && library && <div className="toast">{message}</div>}
      {selectedIds.length > 0 && desktop && (
        <div className="batch-bar">
          <strong>已选择 {selectedIds.length} 项</strong>
          <button disabled={!canEdit} onClick={() => batchUpdate({ favorite: true })}>
            <Heart size={15} /> 收藏
          </button>
          <button disabled={!canEdit} onClick={batchTag}>
            <Tag size={15} /> 标签
          </button>
          <button disabled={!canEdit} onClick={batchMove}>
            <Folder size={15} /> 移动
          </button>
          <button disabled={!canEdit} onClick={() => setBatchRenamePanel(true)}>
            <Pencil size={15} /> 重命名
          </button>
          <button disabled={!canEdit} onClick={batchRating}>
            <Star size={15} /> 评分
          </button>
          <button disabled={!canEdit} onClick={batchNote}>
            <StickyNote size={15} /> 备注
          </button>
          <button disabled={!canEdit} className="danger" onClick={batchDelete}>
            <Trash2 size={15} /> 删除
          </button>
          <button aria-label="取消选择" onClick={() => setSelectedIds([])}>
            <X size={16} />
          </button>
        </div>
      )}
      {previewAsset && (
        <Preview
          asset={previewAsset}
          zoom={zoom}
          rotation={rotation}
          checker={checker}
          setZoom={setZoom}
          setRotation={setRotation}
          setChecker={setChecker}
          reset={resetPreviewView}
          close={() => setPreviewId(null)}
          previous={() => movePreview(-1)}
          next={() => movePreview(1)}
        />
      )}
      {desktop && ready && !library && (
        <div
          className="welcome"
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-title"
        >
          <div className="welcome-card">
            <div className="mark big">
              <img src={appIcon} alt="小旺仔素材库图标" />
            </div>
            <h1 id="welcome-title">建立你的素材资源库</h1>
            <p>
              资源库会在你选择的文件夹中保存原始素材和索引，可整体备份或迁移。
            </p>
            {message && <span className="welcome-error">{message}</span>}
            <button
              autoFocus
              className="primary"
              disabled={libraryChoosing}
              onClick={createLibrary}
            >
              {libraryChoosing ? "正在选择…" : "创建资源库"}
            </button>
            <button disabled={libraryChoosing} onClick={openLibrary}>
              打开已有资源库
            </button>
          </div>
        </div>
      )}
      {contextMenu?.kind === "folder" ? (
        <FolderContextMenu
          readOnly={!canEdit}
          menu={contextMenu}
          menuRef={contextMenuRef}
          close={() => setContextMenu(null)}
          actions={{
            open: () => {
              setFilter("全部素材");
              setActiveFolder(contextMenu.folder.id);
              setSelected(null);
            },
            add: () => addFolderAt(contextMenu.folder.id),
            uploadToAIFlow: desktop ? () => beginAIFlowFolderExtensionUpload(contextMenu.folder) : null,
            toggleLiveSync: desktop && aiFlowLiveRootForFolder(contextMenu.folder) ? () => toggleAIFlowLiveSync(contextMenu.folder) : null,
            rename: () => renameFolder(contextMenu.folder),
            delete: () => deleteFolder(contextMenu.folder),
          }}
          liveSyncEnabled={aiFlowLiveSyncEnabledForFolder(contextMenu.folder)}
        />
      ) : (
        contextMenu && (
          <AssetContextMenu
            readOnly={!canEdit}
            menu={contextMenu}
            menuRef={contextMenuRef}
            folders={allOrderedFolders}
            close={() => setContextMenu(null)}
            actions={{
              open: () => openAssetAction(contextMenu.asset.id),
              preview: () => {
                setPreviewId(contextMenu.asset.id);
                setZoom(1);
              },
              tag: () => contextTag(contextMenu.asset),
              note: () => contextNote(contextMenu.asset),
              move: (folderId) => contextMove(contextMenu.asset, folderId),
              duplicate: () => duplicateAssetAction(contextMenu.asset.id),
              convertDepthVideo: /^video\//i.test(String(contextMenu.asset.type || "")) || /\.(mp4|webm|mov|m4v)$/i.test(String(contextMenu.asset.file || "")) ? () => convertDepthVideo(contextMenu.asset) : null,
              depthVideoBusy: Boolean(depthVideoJob),
              rename: () => contextRename(contextMenu.asset),
              export: () => exportAssetAction(contextMenu.asset.id),
              reveal: () => revealAsset(contextMenu.asset.id),
              copyAsset: () => copyAssetToClipboard(contextMenu.asset),
              copyFolder: async () => {
                const result = await window.nestDesktop.copyAssetFolder(
                  contextMenu.asset.id,
                );
                setMessage(result?.error || "所在目录已复制");
                setTimeout(() => setMessage(""), 2500);
              },
              copyPath: async () => {
                const result = await window.nestDesktop.copyAssetPath(
                  contextMenu.asset.id,
                );
                if (result?.error) setMessage(result.error);
                else {
                  if (result?.library) applyLibrary(result.library);
                  setMessage("文件路径已复制");
                }
                setTimeout(() => setMessage(""), 2500);
              },
              uploadToAIFlow: desktop ? () => beginAIFlowExtensionUpload(contextMenu.asset) : null,
              delete: () => contextDelete(contextMenu.asset),
            }}
          />
        )
      )}
      {dialogState && <AppDialog state={dialogState} resolve={resolveDialog} />}
      {tetrisPasswordOpen && (
        <TetrisAccessDialog
          password={tetrisPassword}
          error={tetrisPasswordError}
          changePassword={(value) => {
            setTetrisPassword(value);
            setTetrisPasswordError("");
          }}
          close={() => {
            setTetrisPasswordOpen(false);
            setTetrisPasswordError("");
          }}
          unlock={unlockTetris}
        />
      )}
      {aiFlowImportPanel && (
        <AIFlowImportDialog
          close={() => !importing && setAiFlowImportPanel(false)}
          importing={importing}
          importItems={importAIFlowItems}
          folderName={activeFolder ? library?.folders?.find((folder) => folder.id === activeFolder)?.name || "当前文件夹" : "未选择文件夹"}
          hasTargetFolder={Boolean(activeFolder)}
          applyLibrary={applyLibrary}
        />
      )}
      {extensionPanel && (
        <ExtensionPanel
          busy={extensionBusy}
          result={extensionResult}
          install={prepareExtension}
          uninstall={uninstallExtension}
          plugins={plugins}
          mcpConfig={mcpConfig}
          openPluginsFolder={() => window.nestDesktop.openPluginsFolder()}
          togglePlugin={async (id, enabled) => {
            const result = await window.nestDesktop.setPluginEnabled(id, enabled);
            if (result?.error) setMessage(result.error);
            else setPlugins(result.plugins || []);
          }}
          close={() => setExtensionPanel(false)}
        />
      )}
      {themePanel && (
        <ThemePanel
          value={theme}
          preview={setTheme}
          save={(next) => {
            setTheme(next);
            localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next));
            localStorage.removeItem("nest-theme-color");
          }}
          close={() => setThemePanel(false)}
        />
      )}
      {aiSettingsPanel && (
        <AISettings
          close={() => {
            setAiSettingsPanel(false);
          }}
          library={library}
          diskInfo={diskInfo}
          theme={theme}
          setTheme={setTheme}
          checkUpdate={checkUpdate}
          updateInfo={updateInfo}
          updateChecking={updateChecking}
          deleteCurrentLibrary={deleteCurrentLibrary}
          backgroundMusicEnabled={backgroundMusicEnabled}
          setBackgroundMusicEnabled={setBackgroundMusicEnabled}
          backgroundMusicVolume={backgroundMusicVolume}
          setBackgroundMusicVolume={setBackgroundMusicVolume}
        />
      )}
      {updatePanel && updateInfo && (
        <UpdatePanel
          info={updateInfo}
          progress={updateProgress}
          file={updateFile}
          error={updateError}
          close={() => setUpdatePanel(false)}
          download={downloadUpdate}
          install={installUpdate}
        />
      )}
      {supportPanel && <SupportPanel close={closeSupportPanel} />}
      {depthVideoJob && <DepthVideoProgress job={depthVideoJob} cancel={cancelDepthVideo} />}
      {teamPanel && <TeamPanel library={library} close={() => setTeamPanel(false)} changed={(team) => setLibrary((current) => current ? {...current, team} : current)} />}
      {batchRenamePanel && <BatchRenameDialog assets={selectedIds.map(id => assets.find(asset => asset.id === id)).filter(Boolean)} folders={library?.folders || []} close={() => setBatchRenamePanel(false)} apply={batchRename} />}
      {shouldShowBugFeedback && (
        <button
          className="bug-feedback"
          title="在软件内打开腾讯文档 Bug 反馈表"
          onClick={async () => {
            const result = await window.nestDesktop?.openBugFeedback();
            if (result?.error) {
              setMessage(result.error);
              setTimeout(() => setMessage(""), 4000);
            }
          }}
        >
          <Bug size={16} />
          <span>Bug 反馈</span>
        </button>
      )}
    </div>
  );
}

const roleName = (role) => ({ owner: "所有者", admin: "管理员", editor: "编辑者", viewer: "查看者" })[role] || "未加入";

const previewBatchName = (template, asset, index, folders) => {
  const folder = folders.find(item => item.id === asset.folderId);
  const values = { name: asset.name || "未命名素材", index: String(index + 1).padStart(Math.max(2, String(index + 1).length), "0"), folder: folder?.name || "未分类", tag: asset.tags?.[0] || "无标签" };
  return (String(template || "").trim() || "{name}_{index}").replace(/\{(name|index|folder|tag)\}/g, (_, key) => values[key]).replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").replace(/[. ]+$/g, "").trim().slice(0, 180) || "未命名素材";
};

function BatchRenameDialog({ assets, folders, close, apply }) {
  const [template, setTemplate] = useState("{name}_{index}"), [busy, setBusy] = useState(false);
  const insert = token => setTemplate(current => `${current}${token}`);
  const submit = async event => { event.preventDefault(); if (busy || !assets.length) return; setBusy(true); if (!(await apply(template))) setBusy(false); };
  return <div className="modal-backdrop batch-rename-backdrop" onMouseDown={event => event.target === event.currentTarget && close()}>
    <form className="app-dialog batch-rename-dialog" onSubmit={submit} onKeyDown={event => event.key === "Escape" && close()}>
      <div className="dialog-head"><div><h2>批量重命名</h2><small>将重命名素材标题和本地原文件，共 {assets.length} 项</small></div><button type="button" aria-label="关闭" onClick={close}><X size={18}/></button></div>
      <label className="batch-template-field"><span>命名模板</span><input autoFocus value={template} maxLength={180} onChange={event => setTemplate(event.target.value)} /></label>
      <div className="batch-tokens">{[["{name}","原名称"],["{index}","序号"],["{folder}","文件夹"],["{tag}","首个标签"]].map(([token,label])=><button type="button" key={token} onClick={()=>insert(token)}><code>{token}</code><span>{label}</span></button>)}</div>
      <section className="batch-rename-preview"><header><b>实时预览</b><small>最多显示前 8 项</small></header>{assets.slice(0,8).map((asset,index)=><div key={asset.id}><span title={asset.name}>{asset.name}</span><i>→</i><b title={previewBatchName(template,asset,index,folders)}>{previewBatchName(template,asset,index,folders)}</b></div>)}</section>
      <div className="dialog-actions"><button type="button" onClick={close}>取消</button><button className="primary" disabled={busy || !template.trim()} type="submit">{busy ? "正在重命名…" : `应用到 ${assets.length} 项`}</button></div>
    </form>
  </div>;
}

function TeamPanel({ library, close, changed }) {
  const [info, setInfo] = useState(null), [name, setName] = useState(""), [role, setRole] = useState("viewer"), [status, setStatus] = useState("");
  const load = () => window.nestDesktop?.teamInfo().then(setInfo);
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const onKeyDown = (event) => event.key === "Escape" && close();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);
  const run = async (action) => {
    setStatus("");
    const result = await action;
    if (result?.error) return setStatus(result.error);
    if (result?.team) changed(result.team);
    await load();
  };
  const canManage = ["owner", "admin"].includes(info?.role);
  return <div className="modal-backdrop team-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <div className="team-dialog" role="dialog" aria-modal="true" aria-label="成员与权限">
      <div className="team-head"><div><strong>成员与权限</strong><small>共享资源库的本地协作身份与操作范围</small></div><button onClick={close} aria-label="关闭"><X size={18}/></button></div>
      <div className="team-notice">权限用于多人协作时防止误操作；资源库仍是本地文件，不能替代服务器级安全控制。</div>
      <section className="team-current"><span style={{background: info?.profile?.color || "#4f9cf9"}}>{(info?.profile?.name || "我").slice(0,1)}</span><div><b>{info?.profile?.name || "我"}</b><small>当前设备身份 · {roleName(info?.role)}</small></div></section>
      <section className="team-members">
        <header><b>资源库成员</b><small>{info?.members?.length || 0} 人</small></header>
        {(info?.members || []).map(member => <div className="team-member" key={member.id}>
          <i style={{background: member.color}}>{member.name.slice(0,1)}</i><span><b>{member.name}</b><small>{member.id === info.ownerId ? "资源库所有者" : "协作成员"}</small></span>
          <select value={member.id === info.ownerId ? "owner" : member.role} disabled={!canManage || member.id === info.ownerId} onChange={(event) => run(window.nestDesktop.updateMember(member.id,{role:event.target.value}))}>
            {member.id === info.ownerId && <option value="owner">所有者</option>}<option value="admin">管理员</option><option value="editor">编辑者</option><option value="viewer">查看者</option>
          </select>
          <button className="team-remove" disabled={!canManage || member.id === info.ownerId || member.id === info.profile?.id} onClick={() => run(window.nestDesktop.removeMember(member.id))}><Trash2 size={15}/></button>
        </div>)}
      </section>
      {canManage && <form className="team-add" onSubmit={(event) => {event.preventDefault();if(!name.trim())return;run(window.nestDesktop.addMember({name,role})).then(()=>setName(""));}}>
        <input value={name} onChange={event=>setName(event.target.value)} placeholder="输入新成员名称" maxLength={40}/><select value={role} onChange={event=>setRole(event.target.value)}><option value="viewer">查看者</option><option value="editor">编辑者</option><option value="admin">管理员</option></select><button type="submit"><Plus size={15}/>添加</button>
      </form>}
      <div className="team-matrix"><b>权限说明</b><span><em>查看者</em>浏览、搜索与预览</span><span><em>编辑者</em>导入、整理、标签和删除素材</span><span><em>管理员</em>以上全部，并可管理成员</span></div>
      {status && <p className="team-error">{status}</p>}
    </div>
  </div>;
}

function SidebarFooter({ info, recycleBinName, openRecycle, openSupport }) {
  const usedPercent = info?.total
      ? Math.min(
          100,
          Math.max(0, (Number(info.used) / Number(info.total)) * 100),
        )
      : 0,
    root = String(info?.root || "").replace(/[\\/]+$/, ""),
    diskLabel = `本地磁盘 (${root || "—"})`;
  return (
    <div className="sidebar-fixed-footer">
      <button className="sidebar-recycle" onClick={openRecycle}>
        <Trash2 size={16} />
        <span>{recycleBinName}</span>
      </button>
      <div
        className="sidebar-disk"
        title={
          info
            ? `${diskLabel} · 剩余 ${fmtCapacity(info.free)} / 共 ${fmtCapacity(info.total)}`
            : "正在读取磁盘容量"
        }
      >
        <HardDrive size={19} />
        <span>
          <b>{diskLabel}</b>
          <small>
            {info
              ? `剩余 ${fmtCapacity(info.free)} / 共 ${fmtCapacity(info.total)}`
              : "正在读取磁盘容量…"}
          </small>
          <i>
            <em style={{ width: `${usedPercent}%` }} />
          </i>
        </span>
      </div>
      <button
        type="button"
        className="sidebar-version"
        title="打开社区支持"
        onClick={openSupport}
      >
        <Heart size={11} />
        <span className="version-number">v{APP_VERSION}</span>
      </button>
    </div>
  );
}

function AIAssistant({
  library,
  folder,
  selectedIds,
  query,
  filter,
  close,
  settings,
  applyLibrary,
  showResults,
}) {
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(null),
    [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [prompt, setPrompt] = useState(""),
    [messages, setMessages] = useState([]),
    [plan, setPlan] = useState(null),
    [audit, setAudit] = useState([]);
  const chatEndRef = useRef(null);
  const context = { folderId: folder?.id || null, selectedIds, query, filter };
  const refreshAudit = () => window.nestDesktop.ai.audit().then(setAudit);
  useEffect(() => {
    refreshAudit();
  }, []);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);
  const planFrom = (operation, data) => {
    const items = data?.items || [];
    if (operation === "tags")
      return {
        kind: "AI 标签",
        actions: items.map((item) => ({
          tool: "add_tags",
          assetId: item.assetId,
          tags: item.tags || [],
          reason: item.reason,
        })),
      };
    if (operation === "classify")
      return {
        kind: "AI 智能分类",
        actions: items.flatMap((item) => [
          ...(item.targetFolderId
            ? [
                {
                  tool: "move_asset",
                  assetId: item.assetId,
                  targetFolderId: item.targetFolderId,
                  confidence: item.confidence,
                  reason: item.reason,
                },
              ]
            : []),
          ...(item.tags?.length
            ? [{ tool: "add_tags", assetId: item.assetId, tags: item.tags }]
            : []),
        ]),
      };
    if (operation === "rename")
      return {
        kind: "AI 重命名",
        actions: items.map((item) => ({
          tool: "rename_asset",
          assetId: item.assetId,
          newName: item.newName,
          reason: item.reason,
        })),
      };
    return null;
  };
  const resultText = (value) => {
    if (!value) return "没有收到可显示的回复。";
    if (value.message || value.summary) return value.message || value.summary;
    return JSON.stringify(value, null, 2);
  };
  const run = async (operation, chatPrompt = null) => {
    const submittedPrompt = chatPrompt?.trim() || "";
    if (chatPrompt !== null && !submittedPrompt) return;
    if (chatPrompt !== null) {
      setMessages((items) => [...items, { role: "user", content: submittedPrompt }]);
      setPrompt("");
    }
    setBusy(true);
    setError("");
    setResult(null);
    setPlan(null);
    try {
      const started = await window.nestDesktop.ai.startTask(operation, {
        context,
        prompt: chatPrompt !== null ? submittedPrompt : prompt,
        assetId: selectedIds[0],
      });
      if (started?.error) throw new Error(started.error);
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 220));
        const task = await window.nestDesktop.ai.getTask(started.id);
        setProgress(task);
        if (task?.status === "completed") {
          const completedResult = task.result.result;
          if (chatPrompt !== null) {
            setMessages((items) => [
              ...items,
              { role: "assistant", content: resultText(completedResult) },
            ]);
          } else {
            setResult(completedResult);
            setPlan(planFrom(operation, completedResult));
          }
          if (["search", "similar", "duplicates"].includes(operation))
            showResults(task.result.result.assetIds || []);
          break;
        }
        if (["failed", "cancelled"].includes(task?.status))
          throw new Error(task.error || "AI 任务已取消");
      }
    } catch (reason) {
      setError(reason.message);
      if (chatPrompt !== null)
        setMessages((items) => [
          ...items,
          { role: "error", content: reason.message },
        ]);
    } finally {
      setBusy(false);
    }
  };
  const execute = async () => {
    if (!plan?.actions?.length) return;
    setBusy(true);
    const response = await window.nestDesktop.ai.executePlan(plan, true);
    setBusy(false);
    if (response?.error) {
      setError(response.error);
      return;
    }
    if (response?.library) applyLibrary(response.library);
    setPlan(null);
    setResult({ message: "操作已安全执行，可在操作记录中撤销。" });
    refreshAudit();
  };
  const undo = async (id) => {
    const response = await window.nestDesktop.ai.undo(id);
    if (response?.library) applyLibrary(response.library);
    if (response?.error) setError(response.error);
    refreshAudit();
  };
  const actions = [
    [
      "analyze",
      "分析素材",
      "分析内容、色彩、构图等",
      Eye,
      busy || selectedIds.length !== 1,
    ],
    ["tags", "AI 标签", "智能生成标签建议", Tag, busy || !selectedIds.length],
    [
      "classify",
      "智能分类",
      "自动分析并分类素材",
      FolderOpen,
      busy || !selectedIds.length,
    ],
    [
      "similar",
      "查找相似",
      "寻找相似素材",
      Search,
      busy || selectedIds.length !== 1,
    ],
    ["duplicates", "检测重复", "查找重复或相似文件", ImageIcon, busy],
    [
      "rename",
      "AI 重命名",
      "智能生成文件名",
      Pencil,
      busy || !selectedIds.length,
    ],
    ["chat", "生成描述", "生成素材描述信息", Info, busy || !selectedIds.length],
    ["search", "整理建议", "根据当前目录提供建议", Sparkles, busy],
  ];
  const suggestions = [
    "这张图片的主要内容是什么？",
    "适合添加哪些标签？",
    "还有哪些类似的书房场景？",
    "这批素材如何整理更合理？",
  ];
  return (
    <aside className="detail ai-assistant">
      <div className="inspector-tabs">
        <button
          disabled={!selectedIds.length}
          title={selectedIds.length ? "切换到素材详情" : "请先选择一个素材"}
          onClick={() => {
            if (selectedIds.length) close();
          }}
        >
          详情
        </button>
        <button className="active">
          <Sparkles size={14} /> AI 助手
        </button>
      </div>
      <div className="ai-head">
        <div>
          <strong>
            <Sparkles size={17} /> AI 助手
          </strong>
        </div>
        <button title="AI 与模型设置" onClick={settings}>
          <SlidersHorizontal size={17} />
        </button>
        <button aria-label="关闭 AI 助手" onClick={close}>
          <X size={18} />
        </button>
      </div>
      <div className="ai-scroll">
        <section className="ai-context">
          <small>当前上下文</small>
          <b>
            <Folder size={16} /> {library?.name || "资源库"}
            {folder ? ` / ${folder.name}` : ""}
          </b>
          <span>
            <ImageIcon size={16} />{" "}
            {selectedIds.length
              ? `已选择 ${selectedIds.length} 个素材`
              : "未选择素材"}{" "}
            · {filter}
          </span>
        </section>
        <div className="ai-section-title">快捷功能</div>
        <section className="ai-quick">
          {actions.map(([key, title, detail, Icon, disabled]) => (
            <button key={key} disabled={disabled} onClick={() => run(key)}>
              <i>
                <Icon />
              </i>
              <span>
                <b>{title}</b>
                <small>{detail}</small>
              </span>
            </button>
          ))}
        </section>
        {busy && (
          <section className="ai-progress">
            <div>
              <i
                style={{
                  width: `${progress?.total ? (progress.completed / progress.total) * 100 : 8}%`,
                }}
              />
            </div>
            <span>AI 正在分析 · {progress?.status || "queued"}</span>
            {["queued", "running"].includes(progress?.status) && (
              <button
                onClick={() =>
                  progress?.id && window.nestDesktop.ai.pauseTask(progress.id)
                }
              >
                暂停
              </button>
            )}
            {progress?.status === "paused" && (
              <button
                onClick={() =>
                  progress?.id && window.nestDesktop.ai.resumeTask(progress.id)
                }
              >
                继续
              </button>
            )}
            <button
              onClick={() =>
                progress?.id && window.nestDesktop.ai.cancelTask(progress.id)
              }
            >
              取消
            </button>
          </section>
        )}
        {error && <p className="ai-error">{error}</p>}
        {result && (
          <section className="ai-result">
            <div className="ai-result-title">
              <Sparkles size={15} />
              <strong>AI 结果</strong>
            </div>
            {result.message || result.summary ? (
              <p>
                {result.message || result.summary}
                {result.assetIds?.length
                  ? `，涉及 ${result.assetIds.length} 个素材`
                  : ""}
              </p>
            ) : (
              <pre>{JSON.stringify(result, null, 2)}</pre>
            )}
            {plan?.actions?.length > 0 && (
              <div className="ai-plan">
                <b>AI 操作计划 · {plan.actions.length} 项</b>
                <p>不会删除或覆盖原文件。执行前已通过权限与路径校验。</p>
                <button disabled={busy} onClick={execute}>
                  确认执行
                </button>
              </div>
            )}
          </section>
        )}
        <div className="ai-section-title">对话助手</div>
        <section className="ai-conversation" aria-label="AI 对话记录">
          {messages.length ? (
            messages.map((message, index) => (
              <article className={`ai-message ${message.role}`} key={`${message.role}-${index}`}>
                <small>{message.role === "user" ? "我" : message.role === "error" ? "发送失败" : "AI 助手"}</small>
                <p>{message.content}</p>
              </article>
            ))
          ) : (
            <div className="ai-conversation-empty">
              <Sparkles size={18} />
              <span>选择下面的问题，或直接输入你想了解的素材内容。</span>
            </div>
          )}
          {busy && messages.at(-1)?.role === "user" && (
            <article className="ai-message assistant pending">
              <small>AI 助手</small>
              <p>正在思考…</p>
            </article>
          )}
          <div ref={chatEndRef} />
        </section>
        <div className="ai-suggestions">
          {suggestions.map((text) => (
            <button key={text} onClick={() => setPrompt(text)}>
              {text}
            </button>
          ))}
        </div>
        <section className="ai-chat">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!busy && prompt.trim()) run("chat", prompt);
              }
            }}
            placeholder="问问你的素材库…"
          />
          <button
            disabled={busy || !prompt.trim()}
            title="发送"
            onClick={() => run("chat", prompt)}
          >
            <Sparkles size={18} />
          </button>
        </section>
        <p className="ai-disclaimer">AI 生成的内容可能不准确，仅供参考</p>
        <p className="ai-privacy">
          相似与重复检测完全在本地执行。云端模型不会收到本地文件路径。
        </p>
        <section className="ai-history">
          <strong>AI 操作记录</strong>
          {audit.length ? (
            audit.slice(0, 8).map((item) => (
              <div key={item.id}>
                <span>
                  <b>{item.kind}</b>
                  <small>
                    {new Date(item.createdAt).toLocaleString()} ·{" "}
                    {item.actions?.length || 0} 项
                  </small>
                </span>
                <button
                  disabled={item.status === "undone"}
                  onClick={() => undo(item.id)}
                >
                  {item.status === "undone" ? "已撤销" : "撤销"}
                </button>
              </div>
            ))
          ) : (
            <p>还没有 AI 文件操作。</p>
          )}
        </section>
      </div>
    </aside>
  );
}

function AISettings({ close, library, diskInfo, theme, setTheme, checkUpdate, updateInfo, updateChecking, deleteCurrentLibrary, backgroundMusicEnabled, setBackgroundMusicEnabled, backgroundMusicVolume, setBackgroundMusicVolume }) {
  const [tab, setTab] = useState("AI 与模型"),
    [value, setValue] = useState(null),
    [active, setActive] = useState("openai"),
    [key, setKey] = useState(""),
    [status, setStatus] = useState(""),
    [saving, setSaving] = useState(false),
    [usage, setUsage] = useState(null);
  const SETTING_TABS = [
    ["通用", "⚙"],
    ["外观", "◈"],
    ["快捷键", "⌨"],
    ["存储", "▣"],
    ["素材库", "▤"],
    ["AI 与模型", "✦"],
    ["更新", "↻"],
  ];
  useEffect(() => {
    window.nestDesktop.ai.settings().then((settings) => {
      setValue(settings);
      setActive(settings.defaultProviderId);
    });
    window.nestDesktop.ai.usage().then(setUsage);
  }, []);
  if (!value)
    return (
      <div className={"ai-settings-page" + (tab !== "AI 与模型" ? " no-side" : "")}>
        <p>正在读取 AI 设置…</p>
      </div>
    );
  const provider =
      value.providers.find((item) => item.id === active) || value.providers[0],
    patchProvider = (changes) =>
      setValue((current) => ({
        ...current,
        providers: current.providers.map((item) =>
          item.id === provider.id ? { ...item, ...changes } : item,
        ),
      }));
  const save = async () => {
    setSaving(true);
    const providers = value.providers.map((item) =>
      item.id === provider.id && key.trim()
        ? { ...item, apiKey: key.trim() }
        : item,
    );
    const response = await window.nestDesktop.ai.saveSettings({
      ...value,
      providers,
    });
    setSaving(false);
    if (response?.error) {
      setStatus(response.error);
      return;
    }
    setKey("");
    setValue(response.settings);
    setStatus("设置已安全保存");
  };
  const test = async () => {
    setStatus("正在测试连接…");
    if (key.trim()) await save();
    const response = await window.nestDesktop.ai.testProvider(provider.id);
    setStatus(
      response?.ok
        ? `连接成功 · ${response.model}`
        : response?.error || "连接失败",
    );
  };
  const toggles = [
    ["enabled", "启用 AI 助手", "在右侧边栏启用 AI 助手功能"],
    [
      "readFolderContext",
      "自动读取当前文件夹上下文",
      "进入文件夹会自动读取上下文信息",
    ],
    [
      "readSelectedAssets",
      "自动读取当前选中素材",
      "选中素材后自动读取素材信息用于分析",
    ],
    ["allowLowRisk", "允许 AI 执行低风险操作", "标签、备注等操作仍可撤销"],
  ];
  return (
    <div className={"ai-settings-page" + (tab !== "AI 与模型" ? " no-side" : "")}>
      <header className="ai-settings-top">
        <div className="ai-settings-brand">
          <span>
            <Sparkles size={17} />
          </span>
          <b>小旺仔素材库</b>
          <em>专业版</em>
        </div>
        <div className="ai-settings-crumb">
          <button onClick={close}>‹</button>
          <span>设置</span>
          <b>›</b>
          <strong>{tab}</strong>
        </div>
        <div className="ai-settings-search">
          <Search size={16} />
          搜索设置
        </div>
        <button className="ai-settings-assistant" onClick={close}>
          <Sparkles size={15} /> AI 助手
        </button>
        <button onClick={close}>
          <X size={19} />
        </button>
      </header>
      <aside className="ai-settings-nav">
        <h2>设置</h2>
        {SETTING_TABS.map(([name, icon]) => (
          <button
            key={name}
            className={tab === name ? "active" : ""}
            onClick={() => setTab(name)}
          >
            <i>{icon}</i>
            {name}
          </button>
        ))}
        <footer>
          版本 {APP_VERSION}
          <br />
          <small>小旺仔素材库</small>
        </footer>
      </aside>
      <main className="ai-settings-main">
        {tab === "AI 与模型" ? (
          <>
            <h2>默认 AI 服务与模型</h2>
        <section className="ai-model-card">
          <div className="ai-model-row">
            <label>
              默认 AI 服务
              <select
                value={value.defaultProviderId}
                onChange={(event) => {
                  setValue({ ...value, defaultProviderId: event.target.value });
                  setActive(event.target.value);
                }}
              >
                {value.providers.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              默认模型
              <input
                value={provider.model}
                onChange={(event) =>
                  patchProvider({ model: event.target.value })
                }
              />
            </label>
            <label>
              Vision 模型
              <input
                value={provider.visionModel || ""}
                onChange={(event) =>
                  patchProvider({ visionModel: event.target.value })
                }
              />
            </label>
          </div>
          <div className="ai-model-config">
            <div>
              <label>
                API Key
                <input
                  type="password"
                  autoComplete="off"
                  value={key}
                  placeholder={
                    provider.hasApiKey
                      ? "已安全保存 · 留空不修改"
                      : "输入 API Key"
                  }
                  onChange={(event) => setKey(event.target.value)}
                />
              </label>
              <label>
                Base URL
                <input
                  value={provider.baseUrl}
                  onChange={(event) =>
                    patchProvider({ baseUrl: event.target.value })
                  }
                />
              </label>
            </div>
            <div>
              <label>
                Timeout（秒）
                <input
                  type="number"
                  min="1"
                  max="300"
                  value={Math.round(provider.timeout / 1000)}
                  onChange={(event) =>
                    patchProvider({
                      timeout: Number(event.target.value) * 1000,
                    })
                  }
                />
              </label>
              <label>
                Temperature <b>{Number(provider.temperature).toFixed(2)}</b>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.05"
                  value={provider.temperature}
                  onChange={(event) =>
                    patchProvider({ temperature: Number(event.target.value) })
                  }
                />
              </label>
            </div>
          </div>
          <div className="ai-model-actions">
            <button onClick={test}>◉ 测试连接</button>
            <button className="primary" disabled={saving} onClick={save}>
              <Check size={15} />
              {saving ? "保存中…" : "保存设置"}
            </button>
          </div>
        </section>
        <h2>可用 AI 服务</h2>
        <section className="ai-provider-strip">
          {value.providers.map((item) => (
            <button
              key={item.id}
              className={active === item.id ? "active" : ""}
              onClick={() => setActive(item.id)}
            >
              <span>
                <Sparkles size={18} />
              </span>
              <div>
                <b>{item.name}</b>
                <small>
                  {item.baseUrl.replace(/^https?:\/\//, "").split("/")[0]}
                </small>
              </div>
              <em>{item.hasApiKey ? "已连接" : "未连接"}</em>
            </button>
          ))}
        </section>
        <div className="ai-settings-lower">
          <section>
            <h2>AI 行为</h2>
            {toggles.map(([keyName, title, detail]) => (
              <label className="ai-switch-row" key={keyName}>
                <span>
                  <b>{title}</b>
                  <small>{detail}</small>
                </span>
                <input
                  type="checkbox"
                  checked={value[keyName]}
                  onChange={(event) =>
                    setValue({ ...value, [keyName]: event.target.checked })
                  }
                />
                <i />
              </label>
            ))}
          </section>
          <section>
            <h2>智能分类设置</h2>
            <label className="ai-confidence">
              <span>
                最低置信度阈值{" "}
                <b>{Math.round(value.confidenceThreshold * 100)}%</b>
              </span>
              <input
                type="range"
                min="0.5"
                max="1"
                step="0.01"
                value={value.confidenceThreshold}
                onChange={(event) =>
                  setValue({
                    ...value,
                    confidenceThreshold: Number(event.target.value),
                  })
                }
              />
              <small>低于阈值的结果将标记，供人工确认</small>
            </label>
            <label>
              低置信度处理方式
              <select
                value={value.lowConfidenceAction || "review"}
                onChange={(event) =>
                  setValue({
                    ...value,
                    lowConfidenceAction: event.target.value,
                  })
                }
              >
                <option value="review">仅标记为低置信，不自动应用</option>
                <option value="ignore">忽略低置信度建议</option>
              </select>
            </label>
          </section>
        </div>
        <h2>使用统计</h2>
        <section className="ai-usage-grid">
          <div>
            <i>◇</i>
            <span>
              请求次数<b>{usage?.requests || 0} 次</b>
            </span>
          </div>
          <div>
            <i>▧</i>
            <span>
              Tokens 使用量<b>{usage?.totalTokens || 0}</b>
            </span>
          </div>
          <div>
            <i>◎</i>
            <span>
              本地分析<b>不计云端额度</b>
            </span>
          </div>
        </section>
        {status && <p className="ai-page-status">{status}</p>}
          </>
        ) : (
          <>
            {tab === "通用" && (
              <section className="settings-generic settings-general">
                <div className="settings-general-group">
                  <h2>关于本软件</h2>
                  <div className="settings-kv">
                    <div><span>应用版本</span><b>v{APP_VERSION}</b></div>
                    <div><span>资源库</span><b>{library?.name || "未打开"}</b></div>
                    <div><span>素材数量</span><b>{library?.assets?.length ?? 0} 个</b></div>
                    <div><span>库路径</span><b className="mono">{library?.path || "—"}</b></div>
                    <div><span>界面语言</span><b>简体中文</b></div>
                  </div>
                </div>
                <div className="settings-general-group settings-background-music-card">
                  <div className="settings-background-music-heading">
                    <div>
                      <h2>背景音乐</h2>
                      <p>优先播放新添加的歌曲；播放结束后自动下一首，默认音量 30%。</p>
                    </div>
                    <span>{backgroundMusicEnabled ? "已开启" : "已暂停"}</span>
                  </div>
                  <label className="ai-switch-row settings-background-music-toggle">
                    <span>
                      <b>自动播放背景音乐</b>
                      <small>关闭后会立即暂停，并记住你的选择。</small>
                    </span>
                    <input type="checkbox" checked={backgroundMusicEnabled} onChange={(event) => setBackgroundMusicEnabled(event.target.checked)} />
                    <i />
                  </label>
                  <label className="settings-background-music-volume">
                    <span><b>音量</b><output>{Math.round(backgroundMusicVolume * 100)}%</output></span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={Math.round(backgroundMusicVolume * 100)}
                      aria-label="背景音乐音量"
                      onChange={(event) => setBackgroundMusicVolume(Number(event.target.value) / 100)}
                    />
                  </label>
                </div>
              </section>
            )}
            {tab === "外观" && (
              <section className="settings-generic">
                <h2>主题模式</h2>
                <div className="settings-chip-row">
                  {[["dark", "深色"], ["light", "浅色"], ["system", "跟随系统"], ["oled", "OLED 黑色"]].map(([id, name]) => (
                    <button key={id} className={theme.mode === id ? "on" : ""} onClick={() => { const next = { ...theme, mode: id, colors: colorsForMode(id, theme.colors) }; setTheme(next); localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next)); localStorage.removeItem("nest-theme-color"); }}>
                      {name}
                    </button>
                  ))}
                </div>
                <h2>主题预设</h2>
                <div className="settings-chip-row">
                  {THEME_PRESETS.map((preset) => (
                    <button key={preset.id} className={theme.preset === preset.id ? "on" : ""} style={{ background: preset.colors.accent, color: "#fff" }} onClick={() => { const next = { ...theme, preset: preset.id, colors: { ...preset.colors } }; setTheme(next); localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next)); localStorage.removeItem("nest-theme-color"); }}>
                      {preset.name}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {tab === "快捷键" && (
              <section className="settings-generic">
                <h2>快捷键</h2>
                <div className="settings-kv">
                  {[["Ctrl / ⌘ + A", "全选当前视图素材"], ["Ctrl / ⌘ + C", "复制选中文件"], ["空格", "试听 / 暂停音频"], ["Esc", "关闭面板与浮层"], ["← / →", "预览切换上一个 / 下一个"], ["R", "预览旋转 90°"], ["0", "预览复位缩放"], ["双击", "快速预览素材"]].map(([k, d]) => (
                    <div key={k}><span>{d}</span><b className="mono">{k}</b></div>
                  ))}
                </div>
              </section>
            )}
            {tab === "存储" && (
              <section className="settings-generic">
                <h2>存储位置</h2>
                <div className="settings-kv">
                  <div><span>库路径</span><b className="mono">{library?.path || "—"}</b></div>
                  <div><span>磁盘空间</span><b>{diskInfo ? `剩余 ${fmtCapacity(diskInfo.free)} / 共 ${fmtCapacity(diskInfo.total)}` : "读取中…"}</b></div>
                  <div><span>素材文件</span><b>库目录 assets/ 文件夹</b></div>
                  <div><span>每日备份</span><b>库目录 .nest-backups/ 文件夹</b></div>
                </div>
              </section>
            )}
            {tab === "素材库" && (
              <section className="settings-generic library-management-settings">
                <h2>素材库管理</h2>
                <p className="settings-hint">管理当前打开的本地素材库。删除操作只影响本地目录，不会删除 AI Flow 服务器素材。</p>
                <div className="settings-kv">
                  <div><span>当前素材库</span><b>{library?.name || "未打开"}</b></div>
                  <div><span>素材数量</span><b>{library?.assets?.length ?? 0} 个</b></div>
                  <div><span>库路径</span><b className="mono">{library?.path || "—"}</b></div>
                </div>
                <div className="settings-actions danger-actions">
                  <button className="danger" disabled={!library} onClick={deleteCurrentLibrary}>
                    <Trash2 size={15} /> 删除当前素材库
                  </button>
                </div>
                <p className="settings-hint">删除前会请求确认。成功后目录会移入 Windows 回收站，可在回收站恢复。</p>
              </section>
            )}
            {tab === "更新" && (
              <section className="settings-generic">
                <h2>软件更新</h2>
                <div className="settings-kv">
                  <div><span>当前版本</span><b>v{APP_VERSION}</b></div>
                  <div><span>最新版本</span><b>{updateInfo?.latest ? `v${updateInfo.latest}` : "—"}</b></div>
                </div>
                <div className="settings-actions">
                  <button className="primary" disabled={updateChecking} onClick={checkUpdate}>
                    {updateChecking ? "检查中…" : "检查更新"}
                  </button>
                </div>
                {updateInfo?.available && <p className="settings-hint">发现新版本 v{updateInfo.latest}，可在顶部「检查更新」中下载安装。</p>}
                <ReleaseNotes />
              </section>
            )}
          </>
        )}
      </main>
      {tab === "AI 与模型" && (
        <aside className="ai-settings-side">
          <h2>小旺仔助手设置</h2>
        <section className="ai-assistant-profile">
          <div className="ai-profile-head">
            <span>
              <Sparkles size={24} />
            </span>
            <div>
              <b>
                {value.assistantName || "小旺仔助手"}
              </b>
              <small>你的素材小管家，帮你找、看、理、懂素材</small>
            </div>
            <i>{value.enabled ? "● 已启用" : "○ 已停用"}</i>
          </div>
          <label>
            显示名称
            <input
              value={value.assistantName || ""}
              onChange={(event) =>
                setValue({ ...value, assistantName: event.target.value })
              }
            />
          </label>
          <label>
            助手提示语（可选）
            <textarea
              maxLength="200"
              value={value.systemPrompt || ""}
              onChange={(event) =>
                setValue({ ...value, systemPrompt: event.target.value })
              }
            />
            <small>{(value.systemPrompt || "").length} / 200</small>
          </label>
        </section>
        <section>
          <h2>模型能力预览</h2>
          <div className="ai-capabilities">
            {[
              "文本理解",
              "图像理解 (Vision)",
              "智能分类",
              "素材问答",
              "批量分析",
              "操作建议",
            ].map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>
        </aside>
      )}
    </div>
  );
}

function SortMenu({ value, choose }) {
  return (
    <div className="toolbar-popover sort-popover">
      <small>排序方式</small>
      {SORT_OPTIONS.map(([key, label, Icon]) => (
        <button
          key={key}
          className={value === key ? "selected" : ""}
          onClick={() => choose(key)}
        >
          <Icon size={16} />
          <span>{label}</span>
          {value === key && <Check size={16} />}
        </button>
      ))}
    </div>
  );
}
function FilterPopover({ types, formats, setTypes, setFormats, close }) {
  const toggle = (list, setList, value) =>
    setList(
      list.includes(value)
        ? list.filter((item) => item !== value)
        : [...list, value],
    );
  return (
    <div className="toolbar-popover filter-popover">
      <div className="popover-title">
        <strong>筛选素材</strong>
        <button
          onClick={() => {
            setTypes([]);
            setFormats([]);
          }}
        >
          清除全部
        </button>
      </div>
      <small>类型</small>
      <div className="filter-chips">
        {FILTER_TYPES.map(([key, label]) => (
          <button
            key={key}
            className={types.includes(key) ? "selected" : ""}
            onClick={() => toggle(types, setTypes, key)}
          >
            {label}
          </button>
        ))}
      </div>
      <small>格式</small>
      <div className="filter-chips formats">
        {FILTER_FORMATS.map((value) => (
          <button
            key={value}
            className={formats.includes(value) ? "selected" : ""}
            onClick={() => toggle(formats, setFormats, value)}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="filter-actions">
        <button
          onClick={() => {
            setTypes([]);
            setFormats([]);
          }}
        >
          重置
        </button>
        <button className="primary" onClick={close}>
          应用筛选 ({types.length + formats.length})
        </button>
      </div>
    </div>
  );
}
function AssetPalette({ asset }) {
  const [colors, setColors] = useState([
    "#1D4ED8",
    "#2F7DFF",
    "#60A5FA",
    "#0F1B2D",
    "#64748B",
    "#DCE9FF",
  ]);
  useEffect(() => {
    if (!asset?.type?.startsWith("image") || !asset.url) return;
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 48;
        canvas.height = 48;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(image, 0, 0, 48, 48);
        const data = ctx.getImageData(0, 0, 48, 48).data,
          counts = new Map();
        for (let i = 0; i < data.length; i += 20) {
          if (data[i + 3] < 180) continue;
          const rgb = [data[i], data[i + 1], data[i + 2]].map((v) =>
            Math.min(255, Math.round(v / 32) * 32),
          );
          const key = rgb.join(",");
          counts.set(key, (counts.get(key) || 0) + 1);
        }
        const palette = [...counts]
          .sort((a, b) => b[1] - a[1])
          .map(
            ([key]) =>
              "#" +
              key
                .split(",")
                .map((v) => Number(v).toString(16).padStart(2, "0"))
                .join("")
                .toUpperCase(),
          )
          .filter(
            (value, index, array) =>
              array.findIndex((other) => {
                const a = parseInt(value.slice(1), 16),
                  b = parseInt(other.slice(1), 16);
                return (
                  Math.abs((a >> 16) - (b >> 16)) +
                    Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) +
                    Math.abs((a & 255) - (b & 255)) <
                  70
                );
              }) === index,
          )
          .slice(0, 6);
        if (!cancelled && palette.length) setColors(palette);
      } catch {}
    };
    image.src = asset.url;
    return () => {
      cancelled = true;
    };
  }, [asset?.id, asset?.url]);
  return (
    <div className="asset-palette">
      {colors.map((color) => (
        <button
          key={color}
          title={`复制 ${color}`}
          style={{ background: color }}
          onClick={() => navigator.clipboard?.writeText(color)}
        />
      ))}
    </div>
  );
}
function DocumentReader({ asset }) {
  const textRef = useRef(null);
  const scenes = asset.documentStructure?.scenes || [];
  const lines = (asset.documentText || "").split("\n");
  const goToScene = (scene) => {
    const reader = textRef.current;
    const target = reader?.querySelector(`[data-line="${scene.line}"]`);
    if (reader && target) reader.scrollTo({ top: Math.max(0, target.offsetTop - reader.offsetTop - 8), behavior: "smooth" });
  };
  if (asset.type === "text/markdown" || /^(MD|MARKDOWN)$/i.test(asset.documentFormat || "")) return <MarkdownReader key={asset.id} text={asset.documentText || ""} />;
  return <section className="document-reader">
    <header><FileText size={16}/><b>剧本文本</b><span>{(asset.documentText || "").length.toLocaleString()} 字符</span></header>
    {scenes.length > 0 && <nav className="fountain-scenes" aria-label="场景导航">
      <strong>{scenes.length} 个场景</strong>
      {scenes.map((scene, index) => <button key={`${scene.line}-${index}`} onClick={() => goToScene(scene)} title={`${scene.characters.join("、") || "无角色"} · ${scene.dialogueCount} 段对白`}>
        <span>{index + 1}</span>{scene.title}
      </button>)}
    </nav>}
    {asset.documentText ? <pre ref={textRef}>{lines.map((line, index) => <span key={index} data-line={index + 1} className={scenes.some(scene => scene.line === index + 1) ? "fountain-scene-line" : ""}>{line || " "}{index < lines.length - 1 ? "\n" : ""}</span>)}</pre> : <div className="document-empty">未提取到可搜索文本，可点击“打开”使用系统阅读器查看原文件。</div>}
  </section>;
}

function Detail({
  asset,
  folders = [],
  close,
  patch,
  del,
  open,
  reveal,
  confirmAction,
  canEdit,
  openMore,
}) {
  const [tag, setTag] = useState("");
  const isDocument = asset.type?.startsWith("text") || asset.type === "application/pdf" || asset.documentFormat === "DOCX";
  const add = () => {
    if (tag.trim()) {
      patch(asset.id, {
        tags: [...new Set([...(asset.tags || []), tag.trim()])],
      });
      setTag("");
    }
  };
  const folderName =
    folders.find((folder) => folder.id === asset.folderId)?.name || "未分类";
  return (
    <aside className="detail">
      <div className="detail-head">
        <strong>{asset.name}</strong>
        <div>
          <button
            title="收藏"
            onClick={() => patch(asset.id, { favorite: !asset.favorite })}
          >
            <Star size={17} fill={asset.favorite ? "currentColor" : "none"} />
          </button>
          <button aria-label="关闭详情" title="关闭 (Esc)" onClick={close}>
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="detail-preview">
        <Media asset={asset} preview />
      </div>
      <div className="detail-body">
        <input
          className="name-input"
          value={asset.name}
          onChange={(e) => patch(asset.id, { name: e.target.value })}
        />
        <div className="rating" aria-label="评分">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className={n <= (asset.rating || 0) ? "rated" : ""}
              onClick={() =>
                patch(asset.id, { rating: n === asset.rating ? 0 : n })
              }
            >
              ★
            </button>
          ))}
        </div>
        {isDocument && <DocumentReader asset={asset}/>} 
        {!isDocument && <><label><Palette size={15} /> 主色板</label><AssetPalette asset={asset} /></>}
        <div className="facts">
          <div>
            <span>格式</span>
            <b>{assetFormat(asset) || "—"}</b>
          </div>
          <div>
            <span>尺寸</span>
            <b>
              {asset.width || "—"} × {asset.height || "—"}
            </b>
          </div>
          <div>
            <span>大小</span>
            <b>{fmt(asset.size)}</b>
          </div>
        </div>
        <label>
          <Folder size={15} /> 所在文件夹
        </label>
        <select
          className="folder-select"
          value={asset.folderId || ""}
          onChange={(e) =>
            patch(asset.id, { folderId: e.target.value || null })
          }
        >
          <option value="">未分类</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {"— ".repeat(f.depth)}
              {f.name}
            </option>
          ))}
        </select>
        <label>
          <Tag size={15} /> 标签
        </label>
        <div className="tags">
          {(asset.tags || []).map((t) => (
            <button
              key={t}
              onClick={() =>
                patch(asset.id, { tags: asset.tags.filter((x) => x !== t) })
              }
            >
              {t}
              <X size={12} />
            </button>
          ))}
        </div>
        <div className="add-tag">
          <input
            placeholder="添加标签"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
          />
          <button onClick={add}>
            <Plus size={16} />
          </button>
        </div>
        <label>
          <Info size={15} /> 备注
        </label>
        <textarea
          placeholder="写下关于这个素材的想法…"
          value={asset.note || ""}
          onChange={(e) => patch(asset.id, { note: e.target.value })}
        />
        <label>
          <MapPin size={15} /> 使用位置
        </label>
        <button className="usage-row" onClick={() => reveal(asset.id)}>
          <span>
            <b>{folderName}</b>
            <small>素材库索引 · 1 个位置</small>
          </span>
          <b>›</b>
        </button>
        <div className="detail-actions">
          <button className="open" onClick={() => open(asset.id)}>
            打开 <ChevronDown size={15} />
          </button>
          <button title="定位文件" onClick={() => reveal(asset.id)}>
            <Download size={16} />
          </button>
          <button title="更多操作" onClick={(e) => openMore?.(e, asset)}>
            <MoreHorizontal size={17} />
          </button>
        </div>
        <button
          className="delete"
          onClick={async () => {
            if (
              await confirmAction(
                "删除这个素材？",
                "原文件会移到系统回收站或废纸篓。",
              )
            )
              del(asset.id);
          }}
        >
          <Trash2 size={16} /> 删除素材
        </button>
      </div>
    </aside>
  );
}

function FolderMark({ folder }) {
  const Icon = folderIcon(folder.icon);
  return (
    <Icon
      className="folder-glyph"
      size={14}
      style={{ color: folder.color || "#9ba4ae" }}
    />
  );
}

function AppDialog({ state, resolve }) {
  const isFolder = state.kind === "folder";
  const [value, setValue] = useState(state.defaultValue || ""),
    [parentId, setParentId] = useState(state.parentId || ""),
    [icon, setIcon] = useState("folder"),
    [color, setColor] = useState("#45c28b");
  const cancelValue = state.kind === "prompt" || isFolder ? null : false;
  const submit = (e) => {
    e.preventDefault();
    resolve(
      isFolder
        ? { name: value.trim(), parentId: parentId || null, icon, color }
        : state.kind === "prompt"
          ? value
          : true,
    );
  };
  return (
    <div
      className="modal-backdrop app-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) resolve(cancelValue);
      }}
    >
      <form
        className={`app-dialog ${isFolder ? "folder-dialog" : ""}`}
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === "Escape") resolve(cancelValue);
        }}
      >
        <div className="dialog-head">
          <h2>{state.title}</h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={() => resolve(cancelValue)}
          >
            <X size={18} />
          </button>
        </div>
        {state.detail && <p>{state.detail}</p>}
        {(state.kind === "prompt" || isFolder) && (
          <div className="dialog-field">
            <label>{isFolder ? "文件夹名称" : "名称"}</label>
            <div className="counted-input">
              <input
                autoFocus
                maxLength={isFolder ? 50 : 200}
                value={value}
                placeholder={
                  state.placeholder || (isFolder ? "输入文件夹名称" : "请输入")
                }
                onChange={(e) => setValue(e.target.value)}
              />
              {isFolder && <span>{value.length}/50</span>}
            </div>
          </div>
        )}
        {isFolder && (
          <>
            <div className="dialog-field">
              <label>父级位置</label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">资源库根目录</option>
                {state.folders.map((f) => (
                  <option value={f.id} key={f.id}>
                    {"— ".repeat(f.depth)}
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="dialog-field">
              <label>文件夹图标</label>
              <div className="icon-picker">
                {FOLDER_ICONS.map(([key, Icon]) => (
                  <button
                    type="button"
                    className={icon === key ? "chosen" : ""}
                    key={key}
                    onClick={() => setIcon(key)}
                  >
                    <Icon size={20} />
                  </button>
                ))}
              </div>
            </div>
            <div className="dialog-field">
              <label>文件夹颜色</label>
              <div className="color-picker">
                {FOLDER_COLORS.map((c) => (
                  <button
                    type="button"
                    aria-label={`选择颜色 ${c}`}
                    className={color === c ? "chosen" : ""}
                    style={{ background: c }}
                    key={c}
                    onClick={() => setColor(c)}
                  >
                    {color === c && "✓"}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={() => resolve(cancelValue)}>
            取消
          </button>
          <button
            className="primary"
            type="submit"
            disabled={(state.kind === "prompt" || isFolder) && !value.trim()}
          >
            {isFolder ? "创建" : state.kind === "confirm" ? "确认" : "保存"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AIFlowImportDialog({ close, importing, importItems, folderName, hasTargetFolder, applyLibrary }) {
  const [source, setSource] = useState("server");
  const [settings, setSettings] = useState(null);
  const [token, setToken] = useState("");
  const [scan, setScan] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedEpisodeId, setSelectedEpisodeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const scanRequestRef = useRef(0);

  useEffect(() => {
    let alive = true;
    window.nestDesktop.aiFlow
      .settings()
      .then((result) => {
        if (!alive) return;
        if (result?.error) setStatus(result.error);
        else setSettings(result);
      })
      .catch((error) => alive && setStatus(`读取 AI Flow 设置失败：${error.message}`))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const updateSetting = (key, value) =>
    setSettings((current) => ({ ...current, [key]: value }));
  const clearScan = ({ clearProjects = false } = {}) => {
    scanRequestRef.current += 1;
    setScan(null);
    setSelected(new Set());
    if (clearProjects) {
      setProjects([]);
      setSelectedProjectId("");
      setSelectedEpisodeId("");
    }
  };
  const resetScan = (nextSource = source) => {
    setSource(nextSource);
    clearScan({ clearProjects: true });
    setStatus("");
  };
  const persist = async (overrides = {}) => {
    if (!settings) return null;
    const pending = { ...settings, ...overrides };
    setSaving(true);
    try {
      const input = {
        baseUrl: pending.baseUrl,
        localRoot: pending.localRoot,
        authMode: pending.authMode,
        ...(pending.authMode === "token" && token.trim() ? { token } : {}),
      };
      const result = await window.nestDesktop.aiFlow.saveSettings(input);
      if (result?.error) {
        setStatus(result.error);
        return null;
      }
      setSettings(result.settings);
      setToken("");
      return result.settings;
    } catch (error) {
      setStatus(`保存 AI Flow 设置失败：${error.message}`);
      return null;
    } finally {
      setSaving(false);
    }
  };
  const selectAuthMode = async (authMode) => {
    if (!settings || settings.authMode === authMode || loading || importing) return;
    const saved = await persist({ authMode });
    if (!saved) return;
    clearScan({ clearProjects: true });
    setStatus(authMode === "session" ? "请登录 AI Flow 账号后读取本人已完成视频" : "已切换为访问令牌方式");
  };
  const signIn = async () => {
    const saved = await persist({ authMode: "session" });
    if (!saved) return;
    setLoading(true);
    setStatus("正在打开 AI Flow 登录窗口…");
    try {
      const result = await window.nestDesktop.aiFlow.signIn();
      if (result?.error) {
        setStatus(result.error);
        return;
      }
      if (result?.settings) setSettings(result.settings);
      if (result?.cancelled) {
        setStatus("已取消 AI Flow 登录");
        return;
      }
      clearScan({ clearProjects: true });
      const account = result?.account;
      setStatus(account ? `已登录 ${account.displayName || account.username || "AI Flow 账号"}` : "AI Flow 登录成功");
    } catch (error) {
      setStatus(`登录 AI Flow 失败：${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  const signOut = async () => {
    if (!settings) return;
    setLoading(true);
    try {
      const result = await window.nestDesktop.aiFlow.signOut();
      if (result?.error) {
        setStatus(result.error);
        return;
      }
      if (result?.settings) setSettings(result.settings);
      if (result?.library) applyLibrary(result.library);
      clearScan({ clearProjects: true });
      const detachedCount = Number(result?.detached?.roots || 0) + Number(result?.detached?.folders || 0);
      setStatus(detachedCount ? `已退出 AI Flow 账号，并解除 ${detachedCount} 个文件夹连接` : "已退出 AI Flow 账号");
    } catch (error) {
      setStatus(`退出 AI Flow 失败：${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  const refresh = async (requestedEpisodeId = selectedEpisodeId) => {
    const episodeId = typeof requestedEpisodeId === "string" || typeof requestedEpisodeId === "number"
      ? String(requestedEpisodeId).trim()
      : String(selectedEpisodeId || "").trim();
    const requestId = ++scanRequestRef.current;
    const saved = await persist();
    if (!saved) return;
    if (requestId !== scanRequestRef.current) return;
    if (source === "server" && saved.authMode === "session" && !saved.sessionAuthenticated) {
      setStatus("请先登录 AI Flow 账号");
      return;
    }
    setLoading(true);
    setStatus("");
    try {
      const result = source === "server"
        ? episodeId
          ? await window.nestDesktop.aiFlow.listServerVideos({ episodeId })
          : await window.nestDesktop.aiFlow.listServerVideos()
        : await window.nestDesktop.aiFlow.listLocalAssets();
      if (requestId !== scanRequestRef.current) return;
      if (result?.error) {
        setStatus(result.error);
        return;
      }
      setScan(result);
      if (source === "server" && Array.isArray(result.projects))
        setProjects(result.projects);
      setSelected(new Set());
      const label = source === "server" ? "视频" : "素材";
      setStatus(result.videos?.length ? `已发现 ${result.videos.length} 个可导入${label}` : `没有发现可导入的${label}`);
    } catch (error) {
      if (requestId === scanRequestRef.current)
        setStatus(`读取 AI Flow ${source === "server" ? "视频" : "素材"}失败：${error.message}`);
    } finally {
      if (requestId === scanRequestRef.current) setLoading(false);
    }
  };
  const selectProject = (projectId) => {
    setSelectedProjectId(projectId);
    setSelectedEpisodeId("");
    clearScan();
    setStatus(
      projectId
        ? "请选择具体集数后自动读取；选择“全部集数”后可手动读取当前项目视频。"
        : "已切换为全部项目，请点击“读取已完成任务”。",
    );
  };
  const selectEpisode = (episodeId) => {
    setSelectedEpisodeId(episodeId);
    clearScan();
    if (!episodeId) {
      setStatus(
        selectedProjectId
          ? "已选择当前项目的全部集数，请点击“读取已完成任务”。"
          : "已选择全部项目、全部集数，请点击“读取已完成任务”。",
      );
      return;
    }
    setStatus("正在读取所选集数的已完成视频…");
    void refresh(episodeId);
  };
  const testConnection = async () => {
    const saved = await persist();
    if (!saved) return;
    if (saved.authMode === "session" && !saved.sessionAuthenticated) {
      setStatus("请先登录 AI Flow 账号");
      return;
    }
    setLoading(true);
    try {
      const result = await window.nestDesktop.aiFlow.testConnection();
      setStatus(result?.error || "AI Flow 连接正常");
    } catch (error) {
      setStatus(`连接 AI Flow 失败：${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  const clearToken = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const result = await window.nestDesktop.aiFlow.saveSettings({
        baseUrl: settings.baseUrl,
        localRoot: settings.localRoot,
        authMode: settings.authMode,
        clearToken: true,
      });
      if (result?.error) setStatus(result.error);
      else {
        setSettings(result.settings);
        setToken("");
        setStatus("已移除本机保存的 AI Flow 令牌");
      }
    } catch (error) {
      setStatus(`移除令牌失败：${error.message}`);
    } finally {
      setSaving(false);
    }
  };
  const toggle = (id) =>
    setSelected((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAll = () => {
    const ids = videos.map((item) => item.id);
    const allVisibleSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };
  const submit = async () => {
    if (!scan || !selected.size || importing) return;
    const result = await importItems(source, scan.scanId, [...selected]);
    if (result?.error) setStatus(result.error);
  };
  const formatBytes = (value) => {
    const bytes = Number(value) || 0;
    if (!bytes) return "大小未知";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const unit = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / 1024 ** unit).toFixed(unit ? 1 : 0)} ${units[unit]}`;
  };
  const formatDuration = (value) => {
    const seconds = Number(value) || 0;
    if (!seconds) return "时长未知";
    const minute = Math.floor(seconds / 60);
    return `${minute ? `${minute}:` : ""}${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  };
  const settingsReady = Boolean(settings);
  const selectedProject = useMemo(
    () => projects.find((project) => String(project.id) === String(selectedProjectId)),
    [projects, selectedProjectId],
  );
  const episodes = selectedProject?.episodes || [];
  const videos = useMemo(() => {
    const numberOrLast = (value) => {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric;
      const parsedDate = Date.parse(String(value || "").replace(" ", "T"));
      return Number.isFinite(parsedDate) ? parsedDate : Number.MAX_SAFE_INTEGER;
    };
    return (scan?.videos || [])
      .filter((video) =>
        source !== "server" || !selectedProjectId
          ? true
          : String(video.projectId || "") === String(selectedProjectId),
      )
      .filter((video) =>
        source !== "server" || !selectedEpisodeId
          ? true
          : String(video.episodeId || "") === String(selectedEpisodeId),
      )
      .slice()
      .sort((left, right) => {
        for (const key of ["storyOrder", "shotNumber", "versionNumber"]) {
          const delta = numberOrLast(left[key]) - numberOrLast(right[key]);
          if (delta) return delta;
        }
        return Number(right.completedAt || 0) - Number(left.completedAt || 0)
          || String(left.name || "").localeCompare(String(right.name || ""), "zh-CN");
      });
  }, [scan, source, selectedProjectId, selectedEpisodeId]);
  const allVisibleSelected = videos.length > 0 && videos.every((video) => selected.has(video.id));
  const projectNameFor = (video) =>
    video.projectName ||
    projects.find((project) => String(project.id) === String(video.projectId || ""))?.name ||
    "未归属项目";
  const episodeNameFor = (video) => {
    if (video.episodeName) return video.episodeName;
    const project = projects.find((item) => String(item.id) === String(video.projectId || ""));
    return project?.episodes?.find((episode) => String(episode.id) === String(video.episodeId || ""))?.name || "未归属集数";
  };
  const sequenceLabelFor = (video) => {
    const parts = [];
    if (video.storyOrder !== undefined && video.storyOrder !== null && video.storyOrder !== "")
      parts.push(`顺序 ${video.storyOrder}`);
    if (video.shotNumber !== undefined && video.shotNumber !== null && video.shotNumber !== "")
      parts.push(`镜头 ${video.shotNumber}`);
    if (video.versionNumber !== undefined && video.versionNumber !== null && video.versionNumber !== "")
      parts.push(`版本 ${video.versionNumber}`);
    return parts.join(" · ");
  };
  const accountLabel = settings?.account?.displayName || settings?.account?.username || "";
  return (
    <div
      className="modal-backdrop aiflow-import-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && !importing && close()}
    >
      <section className="app-dialog aiflow-import-dialog" role="dialog" aria-modal="true" aria-label="导入 AI Flow 素材">
        <div className="dialog-head">
          <div>
            <h2>导入 AI Flow 素材</h2>
            <small>{hasTargetFolder ? `只读取你勾选的 AI Flow 素材；导入后复制到「${folderName}」，不会移动、删除或反向写入 AI Flow 原文件。` : `当前为「${folderName}」。AI Flow 导入会沿用原有逻辑；浏览器扩展不会误导入根目录，请先在左侧选择文件夹。`}</small>
          </div>
          <button type="button" aria-label="关闭" disabled={importing} onClick={close}><X size={18} /></button>
        </div>
        <div className="aiflow-source-tabs" role="tablist" aria-label="AI Flow 来源">
          <button type="button" className={source === "server" ? "active" : ""} onClick={() => resetScan("server")}>
            <Video size={15} /> AI Flow 服务
          </button>
          <button type="button" className={source === "local" ? "active" : ""} onClick={() => resetScan("local")}>
            <HardDrive size={15} /> 本机素材
          </button>
        </div>
        {settingsReady ? (
          <div className="aiflow-settings-grid">
            {source === "server" && <>
              <label>
                <span>AI Flow 服务地址</span>
                <input value={settings.baseUrl || ""} onChange={(event) => updateSetting("baseUrl", event.target.value)} placeholder="https://your-ai-flow.example.com" disabled={loading || importing} />
              </label>
              <section className="aiflow-auth-panel" aria-label="AI Flow 账号授权">
                <div className="aiflow-auth-panel-head">
                  <span><ShieldCheck size={16} /> <b>账号登录</b><small>推荐 · 仅访问当前账号有权限的视频</small></span>
                  {settings.authMode === "session" && (settings.sessionAuthenticated ? <i className="connected">已登录 {accountLabel || "AI Flow"}</i> : <i>未登录</i>)}
                </div>
                <div className="aiflow-auth-mode" role="tablist" aria-label="AI Flow 认证方式">
                  <button type="button" role="tab" aria-selected={settings.authMode === "session"} className={settings.authMode === "session" ? "active" : ""} disabled={loading || saving || importing} onClick={() => selectAuthMode("session")}>
                    <LogIn size={14} /> 账号登录
                  </button>
                  <button type="button" role="tab" aria-selected={settings.authMode === "token"} className={settings.authMode === "token" ? "active" : ""} disabled={loading || saving || importing} onClick={() => selectAuthMode("token")}>
                    高级：访问令牌
                  </button>
                </div>
                {settings.authMode === "session" ? (
                  <div className="aiflow-login-state">
                    <p>{settings.sessionAuthenticated ? `当前已授权：${accountLabel || "AI Flow 账号"}（登录状态已保存在本机）` : "点击登录后，在独立的 AI Flow 窗口完成登录；登录状态会保存在本机，素材库不会保存你的密码。"}</p>
                    <div>
                      <button type="button" className="primary" disabled={loading || saving || importing} onClick={signIn}><LogIn size={15} /> {settings.sessionAuthenticated ? "重新登录" : "登录 AI Flow"}</button>
                      {settings.sessionAuthenticated && <button type="button" disabled={loading || saving || importing} onClick={signOut}><LogOut size={15} /> 退出登录</button>}
                    </div>
                  </div>
                ) : (
                  <label className="aiflow-token-field">
                    <span>访问令牌 {settings.hasToken ? <em>已安全保存</em> : <em>未设置</em>}</span>
                    <input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder={settings.hasToken ? "留空则继续使用已保存令牌" : "输入 AI Flow Bearer Token"} autoComplete="off" disabled={loading || importing} />
                    {settings.hasToken && <button type="button" disabled={saving || loading || importing} onClick={clearToken}>移除令牌</button>}
                  </label>
                )}
              </section>
            </>}
            {source === "local" && (
              <label>
                <span>AI Flow 本地素材目录</span>
                <input value={settings.localRoot || ""} onChange={(event) => updateSetting("localRoot", event.target.value)} placeholder="D:\\AI_Flow\\Assets save-dev\\ep01" disabled={loading || importing} />
              </label>
            )}
            <div className="aiflow-settings-actions">
              {source === "server" && <button type="button" disabled={loading || saving || importing} onClick={testConnection}>测试连接</button>}
              <button type="button" className="primary" disabled={loading || saving || importing} onClick={() => refresh()}>
                <RotateCw size={15} /> {loading ? "处理中…" : source === "server" ? "读取已完成任务" : "扫描本机素材"}
              </button>
            </div>
          </div>
        ) : <div className="aiflow-empty">正在读取 AI Flow 设置…</div>}
        {source === "server" && (
          <div className="aiflow-settings-grid" style={{ marginTop: 10, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
            <label>
              <span>项目</span>
              <select
                value={selectedProjectId}
                onChange={(event) => selectProject(event.target.value)}
                disabled={loading || saving || importing || !projects.length}
                style={{ width: "100%", height: 35, padding: "0 10px", border: "1px solid var(--ui-border)", borderRadius: 7, background: "var(--bg-card)", color: "var(--text-primary)" }}
              >
                <option value="">全部项目</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name || `项目 ${project.id}`}</option>)}
              </select>
            </label>
            <label>
              <span>集数</span>
              <select
                value={selectedEpisodeId}
                onChange={(event) => selectEpisode(event.target.value)}
                disabled={loading || saving || importing || !projects.length || (selectedProjectId && !episodes.length)}
                style={{ width: "100%", height: 35, padding: "0 10px", border: "1px solid var(--ui-border)", borderRadius: 7, background: "var(--bg-card)", color: "var(--text-primary)" }}
              >
                <option value="">全部集数</option>
                {episodes.map((episode) => <option key={episode.id} value={episode.id}>{episode.name || `第 ${episode.episodeNumber || episode.sortOrder || episode.id} 集`}</option>)}
              </select>
            </label>
            <small style={{ gridColumn: "1 / -1", color: "var(--text-secondary)", fontSize: 9 }}>
              {projects.length ? "选择具体集数后会自动读取该集全部已完成视频；列表按剧情顺序、镜头、版本排序。" : "先读取一次已完成任务，即可按项目和集数筛选。"}
            </small>
          </div>
        )}
        <div className="aiflow-video-toolbar">
          <div>
            <b>{source === "server" ? "已完成视频" : "本机 AI Flow 素材"}</b>
            <small>{scan?.truncated ? `仅显示前 ${videos.length} 项，请缩小本机输出目录后重试` : scan ? `${videos.length} 项` : "点击上方按钮读取"}</small>
          </div>
          <button type="button" disabled={!videos.length || loading || importing} onClick={toggleAll}>{allVisibleSelected ? "清空选择" : "全选"}</button>
        </div>
        <div className="aiflow-video-list" aria-busy={loading || importing}>
          {!loading && !videos.length && <div className="aiflow-empty">{status || (source === "server" ? (settings?.authMode === "session" ? "登录 AI Flow 账号后读取你有权限访问的已完成任务。" : "配置访问令牌后读取 AI Flow 已完成任务。") : "填写 AI Flow 的“我的素材”目录（例如 ep01），扫描本机图片、音频、视频和文档。")}</div>}
          {videos.map((video) => (
            <label className={`aiflow-video-row ${selected.has(video.id) ? "selected" : ""}`} key={video.id}>
              <input type="checkbox" checked={selected.has(video.id)} onChange={() => toggle(video.id)} disabled={importing} />
              {source === "server" || video.kind === "video" ? <Video size={18} /> : video.kind === "image" ? <ImageIcon size={18} /> : video.kind === "audio" ? <Music size={18} /> : <FileText size={18} />}
              <span>
                <b title={video.name}>{video.name}</b>
                <small title={source === "server" ? `${projectNameFor(video)} · ${episodeNameFor(video)} · ${video.prompt || ""}` : video.relativePath}>{source === "server" ? `${projectNameFor(video)} · ${episodeNameFor(video)}${video.model ? ` · ${video.model}` : ""}` : video.relativePath}</small>
              </span>
              <i>{source === "server" ? [sequenceLabelFor(video), formatDuration(video.duration), video.completedAt ? new Date(video.completedAt).toLocaleString() : ""].filter(Boolean).join(" · ") : `${formatBytes(video.size)} · ${video.modifiedAt ? new Date(video.modifiedAt).toLocaleString() : ""}`}</i>
            </label>
          ))}
        </div>
        {status && <p className={`aiflow-status ${/失败|错误|无效|不存在|权限/.test(status) ? "error" : ""}`}>{status}</p>}
        <div className="dialog-actions">
          <button type="button" disabled={importing} onClick={close}>取消</button>
          <button className="primary" type="button" disabled={!scan || !selected.size || loading || importing} onClick={submit}>
            <Import size={15} /> {importing ? "正在导入…" : `导入 ${selected.size} 个${source === "server" ? "视频" : "素材"}`}
          </button>
        </div>
      </section>
    </div>
  );
}

function ExtensionPanel({ busy, result, install, uninstall, plugins, mcpConfig, openPluginsFolder, togglePlugin, close }) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
    >
      <div className="app-dialog extension-dialog">
        <div className="dialog-head">
          <h2>扩展、插件与 MCP</h2>
          <button aria-label="关闭" onClick={close} disabled={busy}>
            <X size={18} />
          </button>
        </div>
        <p>网页采集器用于浏览器导入；本地插件默认关闭并按清单授权；MCP 默认只读。</p>
        <h3 className="extension-section-title">网页采集器</h3>
        <div className="browser-choices">
          <button disabled={busy} onClick={() => install("chrome")}>
            <b className="browser-logo chrome-logo">●</b>
            <span>
              <strong>Google Chrome</strong>
              <small>安装到谷歌浏览器</small>
            </span>
            <ChevronDown size={18} />
          </button>
          <button disabled={busy} onClick={() => install("edge")}>
            <b className="browser-logo edge-logo">e</b>
            <span>
              <strong>Microsoft Edge</strong>
              <small>准备后自动打开 edge://extensions</small>
            </span>
            <ChevronDown size={18} />
          </button>
        </div>
        <button className="extension-uninstall" disabled={busy} onClick={() => uninstall("edge")}>
          <Trash2 size={15} /> 卸载 Edge 扩展
        </button>
        <small className="extension-uninstall-hint">将打开 Edge 扩展页；请在“小旺仔网页采集器”卡片点击“移除”确认。浏览器不允许软件静默卸载扩展。</small>
        {busy && <div className="extension-status">正在准备扩展…</div>}
        {result?.ok && result.mode === "uninstall" && (
          <div className="extension-result success">
            <strong>已打开 Edge 扩展卸载页</strong>
            <span>在“小旺仔网页采集器”卡片点击“移除”，再确认即可完成卸载。</span>
          </div>
        )}
        {result?.ok && result.mode !== "uninstall" && (
          <div className="extension-result success">
            <strong>扩展已准备好</strong>
            <span>本地扩展目录和 Edge 扩展页均已自动打开；1. 在浏览器中打开“开发者模式”</span>
            <span>
              2. 点击“加载已解压的扩展程序”，再选择下方已复制到剪贴板的目录
            </span>
            <code>{result.path}</code>
          </div>
        )}
        {result && !result.ok && (
          <div className="extension-result error">
            <strong>准备失败</strong>
            <span>{result.error}</span>
            {result.path && <code>{result.path}</code>}
          </div>
        )}
        <h3 className="extension-section-title">本地插件</h3>
        <div className="plugin-list">
          {plugins?.map(plugin => <div className={plugin.valid ? "plugin-row" : "plugin-row invalid"} key={plugin.id || plugin.directory}>
            <Puzzle size={17}/><span><strong>{plugin.name || plugin.directory}</strong><small>{plugin.valid ? `${plugin.version} · ${(plugin.permissions || []).join(" / ") || "无权限"}` : plugin.error}</small></span>
            <button disabled={!plugin.valid} onClick={() => togglePlugin(plugin.id, !plugin.enabled)}>{plugin.enabled ? "停用" : "启用"}</button>
          </div>)}
          {!plugins?.length && <div className="extension-status">尚未安装本地插件。插件必须包含 manifest.json，且默认禁用。</div>}
          <button className="secondary-wide" onClick={openPluginsFolder}>打开插件目录</button>
        </div>
        <h3 className="extension-section-title">MCP 接入</h3>
        <div className="extension-result">
          <strong>本地 stdio MCP（默认只读）</strong>
          {mcpConfig?.error ? <span>{mcpConfig.error}</span> : <><span>可搜索素材并读取真实文件夹。</span><code>{JSON.stringify(mcpConfig)}</code><button className="secondary-wide" onClick={() => navigator.clipboard.writeText(JSON.stringify(mcpConfig, null, 2))}>复制 MCP 配置</button></>}
        </div>
        <div className="dialog-actions">
          <button onClick={close} disabled={busy}>
            {result?.ok ? "完成" : "取消"}
          </button>
        </div>
      </div>
    </div>
  );
}

const LIGHT_COLORS = {
  main: "#eef3fa",
  sidebar: "#f7f9fc",
  card: "#ffffff",
  overlay: "#f9fbff",
  text: "#142238",
  muted: "#607089",
  border: "#cbd6e5",
  hover: "#e5edf8",
  selected: "#d8e7fb",
};
const OLED_COLORS = {
  main: "#000000",
  sidebar: "#030507",
  card: "#080b0f",
  overlay: "#0c1016",
  text: "#f1f6ff",
  muted: "#8491a3",
  border: "#27303d",
  hover: "#101722",
  selected: "#13243b",
};
function colorsForMode(mode, current) {
  if (mode === "light")
    return { ...current, ...LIGHT_COLORS, accent: current.accent };
  if (mode === "oled")
    return { ...current, ...OLED_COLORS, accent: current.accent };
  if (
    mode === "dark" &&
    (current.main === LIGHT_COLORS.main || current.main === OLED_COLORS.main)
  )
    return { ...THEME_PRESETS[0].colors, accent: current.accent };
  return current;
}
function ThemePanel({ value, preview, save, close }) {
  const [draft, setDraft] = useState(() => structuredClone(value)),
    [editing, setEditing] = useState("accent");
  const original = useRef(value);
  const change = (next) => setDraft(next);
  const chooseMode = (mode) => {
    const next = { ...draft, mode, colors: colorsForMode(mode, draft.colors) };
    change(next);
    preview(next);
  };
  const choosePreset = (preset) => {
    const next = { ...draft, preset: preset.id, colors: { ...preset.colors } };
    if (draft.mode === "light")
      next.colors = colorsForMode("light", next.colors);
    if (draft.mode === "oled") next.colors = colorsForMode("oled", next.colors);
    change(next);
    preview(next);
  };
  const setColor = (key, color) =>
    change({
      ...draft,
      preset: "custom",
      colors: {
        ...draft.colors,
        [key]: normalizeHex(color, draft.colors[key]),
      },
    });
  const cancel = () => {
    preview(original.current);
    close();
  };
  useEffect(() => {
    const onEscape = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        preview(original.current);
        close();
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [close, preview]);
  const ratio = contrastRatio(draft.colors.accent, draft.colors.main),
    accentText = readableText(draft.colors.accent);
  return (
    <div
      className="modal-backdrop theme-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
    >
      <div
        className="app-dialog appearance-dialog"
        style={themeStyle(draft, draft.mode)}
      >
        <div className="dialog-head appearance-head">
          <div>
            <h2>主题与外观</h2>
            <p>塑造属于你的素材工作空间</p>
          </div>
          <button
            type="button"
            className="appearance-close"
            aria-label="关闭主题与外观"
            title="关闭"
            onClick={(e) => {
              e.stopPropagation();
              cancel();
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div className="appearance-scroll">
          <section className="appearance-section">
            <div className="section-title">
              <span>主题模式</span>
              <small>窗口与系统外观</small>
            </div>
            <div className="theme-mode-grid">
              {[
                ["dark", "深色", "低光环境更舒适"],
                ["light", "浅色", "明亮清晰"],
                ["system", "跟随系统", "自动同步 Windows"],
                ["oled", "OLED 黑色", "纯黑节能"],
              ].map(([id, name, desc]) => (
                <button
                  key={id}
                  className={draft.mode === id ? "selected" : ""}
                  onClick={() => chooseMode(id)}
                >
                  <i className={`mode-orb ${id}`} />
                  <span>
                    <b>{name}</b>
                    <small>{desc}</small>
                  </span>
                  {draft.mode === id && <Check size={16} />}
                </button>
              ))}
            </div>
          </section>
          <section className="appearance-section">
            <div className="section-title">
              <span>主题预设</span>
              <small>完整配色方案，而不只是一种颜色</small>
            </div>
            <div className="preset-grid">
              {THEME_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  className={draft.preset === preset.id ? "selected" : ""}
                  onClick={() => choosePreset(preset)}
                >
                  <div
                    className="preset-mini"
                    style={{
                      "--p-main": preset.colors.main,
                      "--p-side": preset.colors.sidebar,
                      "--p-card": preset.colors.card,
                      "--p-accent": preset.colors.accent,
                    }}
                  >
                    <i />
                    <span />
                    <b />
                  </div>
                  <strong>{preset.name}</strong>
                  <small>{preset.colors.accent.toUpperCase()}</small>
                </button>
              ))}
              <button
                className={draft.preset === "custom" ? "selected" : ""}
                onClick={() => setEditing("accent")}
              >
                <div
                  className="preset-mini custom-preset"
                  style={{
                    "--p-main": draft.colors.main,
                    "--p-side": draft.colors.sidebar,
                    "--p-card": draft.colors.card,
                    "--p-accent": draft.colors.accent,
                  }}
                >
                  <i />
                  <span />
                  <b />
                </div>
                <strong>自定义</strong>
                <small>精细调整</small>
              </button>
            </div>
          </section>
          <div className="appearance-columns">
            <section className="appearance-section color-settings">
              <div className="section-title">
                <span>界面颜色</span>
                <small>各层级互相独立</small>
              </div>
              <div className="color-field-grid">
                {THEME_FIELDS.map(([key, label]) => (
                  <button
                    key={key}
                    className={editing === key ? "active" : ""}
                    onClick={() => setEditing(key)}
                  >
                    <i style={{ background: draft.colors[key] }} />
                    <span>{label}</span>
                    <code>{draft.colors[key].toUpperCase()}</code>
                    <ChevronDown size={14} />
                  </button>
                ))}
              </div>
              <ColorEditor
                label={THEME_FIELDS.find((x) => x[0] === editing)?.[1]}
                value={draft.colors[editing]}
                alpha={
                  editing === "overlay" ||
                  editing === "hover" ||
                  editing === "selected"
                }
                onChange={(color) => setColor(editing, color)}
              />
            </section>
            <section className="appearance-section preview-section">
              <div className="section-title">
                <span>实时 UI 预览</span>
                <small>实际组件与交互状态</small>
              </div>
              <MiniThemePreview colors={draft.colors} />
              <div className={`contrast-card ${ratio < 3 ? "warning" : ""}`}>
                <div>
                  <i
                    style={{
                      background: draft.colors.accent,
                      color: accentText,
                    }}
                  >
                    Aa
                  </i>
                  <span>
                    <b>智能文字颜色</b>
                    <small>
                      按钮文字自动使用{" "}
                      {accentText === "#FFFFFF" ? "浅色" : "深色"}
                    </small>
                  </span>
                </div>
                <strong>{ratio.toFixed(2)} : 1</strong>
                {ratio < 3 && <p>⚠ 当前强调色与主背景对比度较低，仍可保存。</p>}
              </div>
            </section>
          </div>
        </div>
        <div className="dialog-actions appearance-actions">
          <button
            onClick={() => {
              const next = structuredClone(DEFAULT_THEME);
              change(next);
              preview(next);
            }}
          >
            恢复默认
          </button>
          <span>所有更改仅保存在本机</span>
          <button onClick={cancel}>取消</button>
          <button
            className="primary"
            style={{ color: accentText }}
            onClick={() => {
              save(draft);
              close();
            }}
          >
            <Check size={16} /> 保存外观
          </button>
        </div>
      </div>
    </div>
  );
}
function ColorEditor({ label, value, alpha, onChange }) {
  const rgba = hexToRgba(value),
    hsv = rgbToHsv(rgba),
    hsl = rgbToHsl(rgba),
    [recent, setRecent] = useState(() => {
      try {
        return JSON.parse(localStorage.getItem("nest-recent-colors") || "[]");
      } catch {
        return [];
      }
    }),
    raf = useRef(0);
  const emit = (next) => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => onChange(rgbaToHex(next, alpha)));
  };
  const updateSV = (event) => {
    const rect = event.currentTarget.getBoundingClientRect(),
      s = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      v =
        1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    emit({ ...hsvToRgb({ h: hsv.h, s, v }), a: rgba.a });
  };
  const remember = (color) => {
    const next = [
      normalizeHex(color),
      ...recent.filter((x) => x !== normalizeHex(color)),
    ].slice(0, 8);
    setRecent(next);
    localStorage.setItem("nest-recent-colors", JSON.stringify(next));
  };
  const inputHex = (event) => {
    const normalized = normalizeHex(event.target.value, "");
    if (normalized) onChange(normalized);
  };
  return (
    <div className="color-editor">
      <div className="color-editor-title">
        <span>编辑：{label}</span>
        <button
          title="复制颜色值"
          onClick={() => navigator.clipboard?.writeText(value)}
        >
          <Copy size={14} />
        </button>
        <button
          title="粘贴颜色值"
          onClick={async () => {
            try {
              const text = await navigator.clipboard.readText();
              const color = normalizeHex(text, "");
              if (color) {
                onChange(color);
                remember(color);
              }
            } catch {}
          }}
        >
          <ClipboardCopy size={14} />
        </button>
      </div>
      <div
        className="sv-picker"
        style={{ "--picker-hue": `hsl(${hsv.h} 100% 50%)` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          updateSV(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) updateSV(e);
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          remember(value);
        }}
      >
        <i style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
      </div>
      <label className="color-slider hue">
        <span>色相 Hue</span>
        <input
          type="range"
          min="0"
          max="359"
          value={Math.round(hsv.h)}
          onChange={(e) =>
            emit({
              ...hsvToRgb({ h: +e.target.value, s: hsv.s, v: hsv.v }),
              a: rgba.a,
            })
          }
        />
        <b>{Math.round(hsv.h)}°</b>
      </label>
      {alpha && (
        <label className="color-slider alpha">
          <span>透明度</span>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(rgba.a * 100)}
            onChange={(e) => emit({ ...rgba, a: +e.target.value / 100 })}
          />
          <b>{Math.round(rgba.a * 100)}%</b>
        </label>
      )}
      <div className="color-values">
        <label>
          <span>HEX</span>
          <input
            defaultValue={value.toUpperCase()}
            key={value}
            onBlur={inputHex}
            onKeyDown={(e) => {
              if (e.key === "Enter") inputHex(e);
            }}
          />
        </label>
        <label>
          <span>RGB</span>
          <input
            readOnly
            value={`${Math.round(rgba.r)}, ${Math.round(rgba.g)}, ${Math.round(rgba.b)}`}
          />
        </label>
        <label>
          <span>HSL</span>
          <input
            readOnly
            value={`${Math.round(hsl.h)}°, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%`}
          />
        </label>
      </div>
      <div className="recent-colors">
        <span>最近使用</span>
        <div>
          {recent.length ? (
            recent.map((color) => (
              <button
                key={color}
                title={color}
                style={{ background: color }}
                onClick={() => onChange(color)}
              />
            ))
          ) : (
            <small>选择颜色后会显示在这里</small>
          )}
        </div>
      </div>
    </div>
  );
}
function MiniThemePreview({ colors }) {
  return (
    <div className="mini-ui" style={themeStyle({ colors })}>
      <aside>
        <b>W</b>
        <i />
        <i className="folder-selected" />
        <i />
        <i />
      </aside>
      <main>
        <header>
          <span />
          <button />
        </header>
        <div className="mini-content">
          <article className="mini-card">
            <i />
            <span />
            <small />
          </article>
          <article className="mini-card selected">
            <i />
            <span />
            <small />
          </article>
          <label>
            <Search size={11} />
            <span>搜索素材</span>
          </label>
          <div className="mini-buttons">
            <button className="mini-primary">主按钮</button>
            <button>次级按钮</button>
            <em>标签</em>
          </div>
          <div className="mini-states">
            <i>Hover</i>
            <b>Selected</b>
          </div>
        </div>
      </main>
    </div>
  );
}
function UpdatePanel({
  info,
  progress,
  file,
  error,
  close,
  download,
  install,
}) {
  const downloading = progress && progress.percent < 100 && !file;
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !downloading) close();
      }}
    >
      <div className="app-dialog update-dialog">
        <div className="dialog-head">
          <h2>{info.available ? "发现新版本" : "已经是最新版"}</h2>
          <button aria-label="关闭" disabled={downloading} onClick={close}>
            <X size={18} />
          </button>
        </div>
        <div className="update-versions">
          <span>
            当前版本 <b>v{info.current}</b>
          </span>
          <i>→</i>
          <span>
            最新版本 <b>v{info.latest}</b>
          </span>
        </div>
        {info.available ? (
          <>
            <p>
              {info.downloadName
                ? `已识别为${info.installKind}：${info.downloadName}`
                : "当前版本暂未提供适合此设备的安装包。"}
            </p>
            {progress && (
              <div className="update-progress">
                <div>
                  <i style={{ width: `${progress.percent || 0}%` }} />
                </div>
                <span>
                  {file
                    ? "下载并校验完成"
                    : `正在下载 ${Math.round(progress.percent || 0)}%`}
                </span>
                <small>
                  {file && progress.verified
                    ? "SHA256 已验证 · 点击后由独立 updater 备份并替换旧版本"
                    : progress.total
                      ? `${fmt(progress.received)} / ${fmt(progress.total)}`
                      : "正在连接下载服务器…"}
                </small>
              </div>
            )}
            {error && <p className="update-error">{error}</p>}
            {!progress && <ReleaseNotes remoteNotes={info.notes} />}
            <div className="dialog-actions">
              <button onClick={close} disabled={downloading}>
                稍后提醒
              </button>
              {file ? (
                <button className="primary" onClick={install}>
                  <Download size={16} /> 立即更新并重启
                </button>
              ) : (
                <button
                  className="primary"
                  onClick={download}
                  disabled={downloading || !info.downloadName}
                >
                  <Download size={16} /> {downloading ? "正在下载" : "立即更新"}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p>当前安装的版本已经是 GitHub 上发布的最新版本。</p>
            <ReleaseNotes />
            <div className="dialog-actions">
              <button className="primary" onClick={close}>
                知道了
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReleaseNotes({ remoteNotes = "" }) {
  return (
    <section className="release-notes" aria-label={`版本 ${APP_VERSION} 更新内容`}>
      <header>
        <div>
          <span>v{APP_VERSION} 正式版</span>
          <h3>本次更新</h3>
        </div>
        <small>新增、优化与修复</small>
      </header>
      <div className="release-note-grid">
        {CURRENT_RELEASE_NOTES.map((note) => (
          <article key={note.title}>
            <em>{note.type}</em>
            <h4>{note.title}</h4>
            <ul>
              {note.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </article>
        ))}
      </div>
      {remoteNotes && (
        <details className="release-remote-notes">
          <summary>GitHub 发布说明</summary>
          <pre>{remoteNotes}</pre>
        </details>
      )}
    </section>
  );
}

function DepthVideoProgress({ job, cancel }) {
  const progress = Math.max(0, Math.min(100, Math.round(Number(job.progress) || 0)));
  const cancelling = job.phase === 'cancelling' || job.cancelRequested;
  const importing = job.phase === 'importing';
  const canCancel = !cancelling && !importing && ['starting', 'converting'].includes(job.phase);
  return (
    <section className="depth-video-progress" role="status" aria-live="polite" aria-label={`深度视频转换进度 ${progress}%`}>
      <div className="depth-video-progress-head">
        <span><Sparkles size={18} /></span>
        <div>
          <strong>{cancelling ? '正在取消深度视频转换' : importing ? '正在导入深度视频' : '正在转换深度视频'}</strong>
          <small>{job.message || '正在准备转换器…'}</small>
        </div>
      </div>
      <div className={`depth-video-progress-track ${job.phase === 'starting' || cancelling ? 'indeterminate' : ''}`}>
        <i style={{ width: `${progress}%` }} />
      </div>
      <div className="depth-video-progress-foot">
        <b>{importing ? '100%' : `${progress}%`}</b>
        {canCancel ? (
          <button type="button" onClick={cancel}>
            <X size={14} /> 取消转换
          </button>
        ) : (
          <span>{cancelling ? '正在终止转换器…' : importing ? '即将完成' : '请稍候…'}</span>
        )}
      </div>
    </section>
  );
}

function SupportPanel({ close }) {
  return (
    <div
      className="support-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        className="support-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-dialog-title"
      >
        <button className="support-close" type="button" aria-label="关闭" onClick={close}>
          <X size={18} />
        </button>
        <div className="support-emblem" aria-hidden="true">
          <img src={communitySupportAvatar} alt="" />
        </div>
        <span className="support-version">社区支持</span>
        <h2 id="support-dialog-title">愿这个小项目，陪你走得更远</h2>
        <p className="support-intro">
          如果它曾替你省下一点时间，陪你把一个想法变成现实，
          欢迎留下建议和反馈。每一次使用、每一条声音，都会帮助小旺仔素材库继续变得更好。
        </p>
        <section className="support-card">
          <div className="support-payment-qr">
            <img src={communitySupportPaymentQr} alt="支付宝收款码" />
          </div>
          <div className="support-card-copy">
            <strong>支付宝扫码支持</strong>
            <p>
              感谢你的支持。也欢迎继续通过软件内的 Bug 反馈与功能建议，直接告诉我们你最需要什么。
            </p>
            <span><Heart size={13} /> 每一条反馈都会被认真阅读</span>
          </div>
        </section>
      </section>
    </div>
  );
}

function AssetContextMenu({ menu, menuRef, folders, actions, close, readOnly }) {
  const [moving, setMoving] = useState(false);
  const run = (fn) => {
    close();
    fn();
  };
  const rows = [
    [FolderOpen, "打开", actions.open],
    [Eye, "快速预览", actions.preview],
    ...(!readOnly ? [[Tag, "添加标签", actions.tag], [StickyNote, "添加注释", actions.note]] : []),
  ];
  return (
    <div
      ref={menuRef}
      className="asset-menu"
      style={{
        left: Math.min(menu.x, window.innerWidth - 250),
        top: Math.min(menu.y, window.innerHeight - 520),
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {rows.map(([Icon, label, fn]) => (
        <button key={label} onClick={() => run(fn)}>
          <Icon size={16} />
          <span>{label}</span>
        </button>
      ))}
      <div className="menu-separator" />
      {!readOnly && <button onClick={() => setMoving((x) => !x)}>
        <Folder size={16} />
        <span>移动到文件夹</span>
        <b>›</b>
      </button>}
      {moving && (
        <div className="move-submenu">
          <button onClick={() => run(() => actions.move(null))}>
            <Archive size={15} />
            未分类
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              style={{ paddingLeft: 12 + f.depth * 12 }}
              onClick={() => run(() => actions.move(f.id))}
            >
              <FolderMark folder={f} />
              {f.name}
            </button>
          ))}
        </div>
      )}
      {!readOnly && <button onClick={() => run(actions.duplicate)}>
        <Copy size={16} />
        <span>复制素材</span>
      </button>}
      {!readOnly && actions.convertDepthVideo && <button onClick={() => run(actions.convertDepthVideo)} disabled={actions.depthVideoBusy} title="生成灰度深度视频并保留原视频和音频">
        <Sparkles size={16} />
        <span>{actions.depthVideoBusy ? "正在转换深度视频…" : "转换深度视频"}</span>
      </button>}
      {!readOnly && <button onClick={() => run(actions.rename)}>
        <Pencil size={16} />
        <span>重命名</span>
      </button>}
      {!readOnly && actions.uploadToAIFlow && <button onClick={() => run(actions.uploadToAIFlow)}>
        <Import size={16} />
        <span>上传到 AI Flow</span>
      </button>}
      <div className="menu-separator" />
      <button onClick={() => run(actions.copyAsset)}>
        <ClipboardCopy size={16} />
        <span>复制文件</span>
      </button>
      <button onClick={() => run(actions.copyFolder)}>
        <Folder size={16} />
        <span>复制所在目录</span>
      </button>
      <button onClick={() => run(actions.copyPath)}>
        <ClipboardCopy size={16} />
        <span>复制完整路径</span>
      </button>
      <button onClick={() => run(actions.export)}>
        <Download size={16} />
        <span>导出原始文件</span>
      </button>
      <button onClick={() => run(actions.reveal)}>
        <FolderOpen size={16} />
        <span>在资源管理器中显示</span>
      </button>
      <div className="menu-separator" />
      {!readOnly && <button className="menu-danger" onClick={() => run(actions.delete)}>
        <Trash2 size={16} />
        <span>删除</span>
      </button>}
    </div>
  );
}

function FolderContextMenu({ menu, menuRef, actions, close, readOnly, liveSyncEnabled = false }) {
  const run = (fn) => {
    close();
    fn();
  };
  return (
    <div
      ref={menuRef}
      className="asset-menu folder-menu"
      style={{
        left: Math.min(menu.x, window.innerWidth - 230),
        top: Math.min(menu.y, window.innerHeight - 320),
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button onClick={() => run(actions.open)}>
        <FolderOpen size={16} />
        <span>打开文件夹</span>
      </button>
      {!readOnly && <button onClick={() => run(actions.add)}>
        <Plus size={16} />
        <span>新建子文件夹</span>
      </button>}
      {!readOnly && actions.uploadToAIFlow && <button onClick={() => run(actions.uploadToAIFlow)}>
        <Import size={16} />
        <span>上传文件夹到 AI Flow</span>
      </button>}
      {!readOnly && actions.toggleLiveSync && <button onClick={() => run(actions.toggleLiveSync)}>
        <RotateCw size={16} />
        <span>{liveSyncEnabled ? "关闭 AI Flow 实时同步" : "开启 AI Flow 实时同步"}</span>
      </button>}
      <div className="menu-separator" />
      {!readOnly && <button onClick={() => run(actions.rename)}>
        <Pencil size={16} />
        <span>重命名</span>
      </button>}
      {!readOnly && <button className="menu-danger" onClick={() => run(actions.delete)}>
        <Trash2 size={16} />
        <span>删除文件夹</span>
      </button>}
    </div>
  );
}

function Preview({
  asset,
  zoom,
  rotation,
  checker,
  setZoom,
  setRotation,
  setChecker,
  reset,
  close,
  previous,
  next,
}) {
  const image = asset.type?.startsWith("image");
  const overlayRef = useRef(null);
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!image) return;
      e.preventDefault();
      setZoom((z) =>
        Math.min(4, Math.max(0.25, z + (e.deltaY < 0 ? 0.25 : -0.25))),
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [image]);
  return (
    <div className="preview-overlay" ref={overlayRef}>
      <div className="preview-top">
        <strong>{asset.name}</strong>
        {image && (
          <>
            <button title="适应窗口" onClick={reset}>
              <Maximize2 size={17} />
              适应
            </button>
            <button
              title="向右旋转 90°"
              onClick={() => setRotation((r) => (r + 90) % 360)}
            >
              <RotateCw size={17} />
              旋转
            </button>
            <button
              className={checker ? "on" : ""}
              title="透明背景"
              onClick={() => setChecker((v) => !v)}
            >
              <i className="checker-icon" />
              透明背景
            </button>
            <button
              title="缩小"
              onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
            >
              −
            </button>
            <b>{Math.round(zoom * 100)}%</b>
            <button
              title="放大"
              onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
            >
              ＋
            </button>
          </>
        )}
        <button
          className="preview-close"
          title="关闭预览 (Esc)"
          aria-label="关闭预览"
          onClick={close}
        >
          <X size={18} />
          <span>关闭预览</span>
        </button>
      </div>
      <button
        className="preview-arrow left"
        title="上一个 (←)"
        onClick={previous}
      >
        ‹
      </button>
      <div
        className={`preview-stage ${checker ? "checker" : ""}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <Media
          asset={asset}
          preview
          style={
            image
              ? { transform: `scale(${zoom}) rotate(${rotation}deg)` }
              : undefined
          }
        />
      </div>
      <button className="preview-arrow right" title="下一个 (→)" onClick={next}>
        ›
      </button>
    </div>
  );
}

const durationText = (value) => {
  if (!Number.isFinite(value)) return "";
  const seconds = Math.round(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};
function AudioWaveform({ src, large = false }) {
  const canvasRef = useRef(null),
    [visible, setVisible] = useState(large);
  useEffect(() => {
    if (large || !canvasRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "260px 0px" },
    );
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [large]);
  useEffect(() => {
    if (!src || !visible) return;
    const controller = new AbortController();
    let context;
    const draw = async () => {
      try {
        const columns = large ? 180 : 88;
        const cacheKey = JSON.stringify([src, columns]);
        let peaks = waveformCache.get(cacheKey);
        if (!peaks) {
          const response = await fetch(src, { signal: controller.signal });
          if (!response.ok) throw new Error(`Audio fetch: ${response.status}`);
          const bytes = await response.arrayBuffer();
          if (controller.signal.aborted) return;
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (!AudioCtx) return;
          context = new AudioCtx();
          const buffer = await context.decodeAudioData(bytes);
          if (controller.signal.aborted) return;
          const samples = buffer.getChannelData(0);
          const step = Math.max(1, Math.floor(samples.length / columns));
          peaks = new Float32Array(columns);
          for (let i = 0; i < columns; i++) {
            const end = Math.min(samples.length, (i + 1) * step);
            for (let j = i * step; j < end; j += Math.max(1, Math.floor(step / 80)))
              peaks[i] = Math.max(peaks[i], Math.abs(samples[j]));
          }
          waveformCache.set(cacheKey, peaks);
        }
        const canvas = canvasRef.current;
        if (!canvas) return;
        const width = large ? 720 : 300,
          height = large ? 150 : 92,
          dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        const ctx = canvas.getContext("2d");
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);
        const barWidth = width / columns;
        ctx.fillStyle = large ? "#77a9f5" : "#9299a2";
        for (let i = 0; i < columns; i++) {
          const h = Math.max(2, peaks[i] * (height - 8));
          ctx.fillRect(
            i * barWidth,
            (height - h) / 2,
            Math.max(1, barWidth - 1),
            h,
          );
        }
      } catch (error) {
        if (error.name !== "AbortError")
          console.warn("Audio waveform:", error.message);
      } finally {
        context?.close?.();
      }
    };
    draw();
    return () => {
      controller.abort();
      context?.close?.();
    };
  }, [src, large, visible]);
  return (
    <canvas ref={canvasRef} className="audio-waveform" aria-hidden="true" />
  );
}
function useAudioPreviewState(assetId) {
  const [state, setState] = useState(audioPreviewManager.getState());
  useEffect(
    () => subscribeAssetAudio(audioPreviewManager, assetId, (next) => setState({ ...next })),
    [assetId],
  );
  return state;
}
function AudioMedia({ asset, preview = false, style }) {
  const state = useAudioPreviewState(asset.id),
    active = state.id === asset.id,
    playing = active && state.playing,
    current = active ? state.currentTime : 0,
    duration = active ? state.duration : 0,
    progress = duration ? current / duration : 0;
  const format = (
    asset.type?.split("/")[1] ||
    asset.name.split(".").pop() ||
    "audio"
  )
    .replace("mpeg", "mp3")
    .toUpperCase();
  const bpm = asset.name.match(
    /(?:^|[\s_\-])BPM[\s_\-:]*(\d{2,3})(?:\D|$)/i,
  )?.[1];
  const scrubbingPointer = useRef(null);
  useEffect(() => {
    if (preview) audioPreviewManager.openFull(asset);
    return () => {
      if (preview && audioPreviewManager.getState().id === asset.id)
        audioPreviewManager.stop();
    };
  }, [preview, asset.id, asset.url]);
  const seek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect(),
      ratio = (e.clientX - rect.left) / rect.width;
    if (preview) audioPreviewManager.seek(asset, ratio);
  };
  return (
    <div
      className={`audio-media ${preview ? "preview" : ""} ${playing ? "is-playing" : ""}`}
      style={style}
      onPointerEnter={() => { if (!preview) audioPreviewManager.hover(asset); }}
      onPointerLeave={() => { if (!preview) audioPreviewManager.leave(asset.id); }}
    >
      <div
        className="audio-wave-card"
        onPointerDown={preview ? (event) => {
          event.preventDefault();
          scrubbingPointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          seek(event);
        } : undefined}
        onPointerMove={preview ? (event) => {
          if (scrubbingPointer.current === event.pointerId) seek(event);
        } : undefined}
        onPointerUp={preview ? (event) => {
          if (scrubbingPointer.current !== event.pointerId) return;
          scrubbingPointer.current = null;
          seek(event);
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        } : undefined}
      >
        <span className="audio-badge">
          {format}
          {bpm ? ` / BPM: ${bpm}` : ""}
        </span>
        {active && duration > 0 && (
          <span className="audio-duration">
            {durationText(current)} / {durationText(duration)}
          </span>
        )}
        <AudioWaveform src={asset.url} large={preview} />
        <i
          className="audio-play-depth"
          style={{ width: `${progress * 100}%` }}
        />
        {playing && (
          <div className="audio-playing-indicator" aria-label="正在试听">
            <i />
            <i />
            <i />
          </div>
        )}
      </div>
      {preview ? (
        <>
          <span>{asset.name}</span>
          {duration > 0 && (
            <small>
              时长 {durationText(duration)} · {format}
            </small>
          )}
          <div className="audio-full-controls">
            <button
              onClick={() => audioPreviewManager.toggle(asset)}
              aria-label={playing ? "暂停" : "播放"}
            >
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <span>{durationText(current) || "0:00"}</span>
            <input
              aria-label="播放进度"
              type="range"
              min="0"
              max="1000"
              value={Math.round(progress * 1000)}
              onChange={(e) =>
                audioPreviewManager.seek(asset, Number(e.target.value) / 1000)
              }
            />
            <Volume2 size={16} />
            <input
              aria-label="音量"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={state.volume}
              onChange={(e) =>
                audioPreviewManager.setVolume(Number(e.target.value))
              }
            />
          </div>
        </>
      ) : (
        playing && (
          <div className="audio-hover-status">
            <Pause size={11} />
            <span>正在播放</span>
            <Volume2 size={11} />
          </div>
        )
      )}
    </div>
  );
}
function Media({ asset, preview = false, onSize, style }) {
  if (asset.type?.startsWith("audio"))
    return <AudioMedia asset={asset} preview={preview} style={style} />;
  if (asset.type?.startsWith("text") || asset.type === "application/pdf" || asset.documentFormat === "DOCX")
    return <DocumentMedia asset={asset} preview={preview} style={style} />;
  return asset.type?.startsWith("video") ? (
    <video
      src={asset.url}
      controls={preview}
      muted={!preview}
      loop={!preview}
      playsInline
      preload="metadata"
      style={style}
      onLoadedMetadata={(e) => {
        onSize?.(e.currentTarget.videoWidth, e.currentTarget.videoHeight);
        if (
          !preview &&
          Number.isFinite(e.currentTarget.duration) &&
          e.currentTarget.duration > 0.1
        )
          e.currentTarget.currentTime = 0.1;
      }}
    />
  ) : (
    <img
      src={asset.url || undefined}
      alt={asset.name || ""}
      draggable={false}
      loading={preview ? "eager" : "lazy"}
      decoding="async"
      style={style}
      onLoad={(e) =>
        onSize?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)
      }
    />
  );
}

function ReferenceShelf({ assets, remove, clear, open, upload, uploading, createBoard }) {
  if (!assets.length) return null;
  return (
    <section className="reference-shelf" aria-label="已选引用素材">
      <header>
        <span><Link2 size={15} /> 已选引用素材 <b>{assets.length}</b></span>
        <small>点击下方素材缩略图即可添加；不会移动或复制原文件</small>
        <div className="reference-shelf-actions">
          <button type="button" className="reference-shelf-board" onClick={createBoard} disabled={uploading} title="将这一栏素材以引用方式放入新的无限参考板">
            <StickyNote size={13} /> 放入参考板
          </button>
          <button type="button" className="reference-shelf-upload" onClick={upload} disabled={uploading} title="上传已选素材并自动加入当前 AI Flow 顶部引用栏">
            <Import size={13} /> {uploading ? "准备上传…" : "上传到 AI Flow"}
          </button>
          <button type="button" onClick={clear} disabled={uploading}>清空</button>
        </div>
      </header>
      <div className="reference-shelf-list">
        {assets.map((asset) => (
          <div className="reference-shelf-card" key={asset.id}>
            <button type="button" className="reference-shelf-open" title="查看素材详情" onClick={() => open(asset)}>
              <div className="reference-shelf-thumb"><Media asset={asset} /></div>
              <span>{asset.name}</span>
            </button>
            <button type="button" className="reference-shelf-remove" aria-label={`移除引用素材 ${asset.name}`} title="移除引用" onClick={() => remove(asset.id)}>
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function TetrisModule({ close }) {
  const frameRef = useRef(null);
  const focusGame = () => frameRef.current?.contentWindow?.focus();

  useEffect(() => {
    const timer = window.setTimeout(focusGame, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <section className="tetris-module" aria-label="俄罗斯方块">
      <div className="tetris-module-bar">
        <span>
          <Puzzle size={16} />
          <b>俄罗斯方块</b>
          <small>空格开始或暂停 · 方向键移动 · 上键旋转</small>
        </span>
        <div className="tetris-module-actions">
          <button type="button" onClick={focusGame} title="将键盘操作交给游戏">
            <Play size={13} />
            <span>聚焦游戏</span>
          </button>
          <button type="button" onClick={close} title="返回素材库">
            <X size={14} />
            <span>返回素材库</span>
          </button>
        </div>
      </div>
      <iframe
        ref={frameRef}
        src="./tetris/index.html"
        title="俄罗斯方块"
        onLoad={focusGame}
      />
    </section>
  );
}

function TetrisAccessDialog({ password, error, changePassword, close, unlock }) {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      className="modal-backdrop tetris-access-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <form
        className="app-dialog tetris-access-dialog"
        aria-labelledby="tetris-access-title"
        onSubmit={(event) => {
          event.preventDefault();
          unlock();
        }}
      >
        <div className="tetris-access-icon"><InfinityIcon size={24} /></div>
        <h2 id="tetris-access-title">无穷大</h2>
        <p>密码请找小旺仔要。</p>
        <label htmlFor="tetris-access-password">访问密码</label>
        <input
          ref={inputRef}
          id="tetris-access-password"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={password}
          onChange={(event) => changePassword(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "tetris-access-error" : undefined}
        />
        {error && <small id="tetris-access-error" role="alert">{error}</small>}
        <div className="dialog-actions">
          <button type="button" onClick={close}>取消</button>
          <button type="submit" className="primary">确认</button>
        </div>
      </form>
    </div>
  );
}

function DocumentMedia({ asset, preview, style }) {
  const excerpt = (asset.documentText || "").replace(/\s+/g, " ").trim();
  return <div className={`document-media ${preview ? "preview" : ""}`} style={style}>
    <FileText size={preview ? 48 : 28}/><b>{assetFormat(asset) || "DOC"}</b>
    <span>{excerpt ? excerpt.slice(0, preview ? 240 : 72) : "文档素材"}</span>
  </div>;
}

createRoot(document.getElementById("root")).render(<App />);
