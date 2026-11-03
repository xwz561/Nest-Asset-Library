import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
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
  ClipboardCopy,
  Clock,
  Columns3,
  Copy,
  Download,
  Eye,
  FileText,
  Filter,
  Folder,
  FolderOpen,
  Grid2X2,
  HardDrive,
  Heart,
  Image as ImageIcon,
  Import,
  Info,
  LayoutGrid,
  List,
  MapPin,
  Maximize2,
  Menu,
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
  SlidersHorizontal,
  Sparkles,
  Star,
  StickyNote,
  Tag,
  Trash2,
  Video,
  Volume2,
  X,
} from "lucide-react";
import "./styles.css";
import "./ai-assistant.css";
import "./ai-settings-page.css";
import appIcon from "../build/icon.png";
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

const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "2.0.9";
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
  const fromName = asset.name?.match(/\.([a-z0-9]+)$/i)?.[1];
  if (fromName) return (MIME_FORMAT[fromName.toLowerCase()] || fromName).toUpperCase();
  const subtype = (asset.type?.split("/")[1] || "").toLowerCase();
  return (MIME_FORMAT[subtype] || subtype).toUpperCase();
};
const clampSidebarWidth = (value) =>
  Math.min(440, Math.max(190, Number(value) || 232));
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
    [marquee, setMarquee] = useState(null),
    [dropFolderId, setDropFolderId] = useState(undefined),
    [importing, setImporting] = useState(false),
    [importProgress, setImportProgress] = useState(null),
    [previewId, setPreviewId] = useState(null),
    [zoom, setZoom] = useState(1),
    [rotation, setRotation] = useState(0),
    [checker, setChecker] = useState(false),
    [visibleLimit, setVisibleLimit] = useState(160),
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
  const [extensionPanel, setExtensionPanel] = useState(false),
    [extensionResult, setExtensionResult] = useState(null),
    [extensionBusy, setExtensionBusy] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null),
    [updatePanel, setUpdatePanel] = useState(false),
    [updateChecking, setUpdateChecking] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(null),
    [updateFile, setUpdateFile] = useState(""),
    [updateError, setUpdateError] = useState("");
  const [aiPanel, setAiPanel] = useState(false),
    [aiSettingsPanel, setAiSettingsPanel] = useState(false),
    [aiResultIds, setAiResultIds] = useState(null);
  const [diskInfo, setDiskInfo] = useState(null);
  const desktop = Boolean(window.nestDesktop);
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
    externalDragActive = useRef(false),
    externalDragTimer = useRef(null),
    lastUpdateCheck = useRef(0),
    lastNotifiedVersion = useRef("");
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
            setMessage("网页采集的新素材已加入");
            setTimeout(() => setMessage(""), 3500);
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
        setSortPanel(false);
        setFilterPanel(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
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
  const shown = useMemo(
    () =>
      assets
        .filter((a) => {
          const q = query.toLowerCase();
          const match =
            !q ||
            a.name.toLowerCase().includes(q) ||
            (a.tags || []).some((t) => t.toLowerCase().includes(q));
          const tagMatch = !currentTag || (a.tags || []).includes(currentTag);
          const f =
            filter === "全部素材" ||
            (filter === "收藏夹" && a.favorite) ||
            (filter === "图片" && a.type.startsWith("image")) ||
            (filter === "视频" && a.type.startsWith("video")) ||
            (filter === "音频" && a.type.startsWith("audio")) ||
            (filter === "未分类" && !a.folderId) ||
            (filter === "最近" && Date.now() - a.createdAt < 7 * 86400000);
          const quickType =
            !quickTypes.length ||
            quickTypes.some((type) => a.type.startsWith(type));
          const quickFormat =
            !quickFormats.length || quickFormats.includes(assetFormat(a));
          return (
            (!aiResultIds || aiResultIds.includes(a.id)) &&
            match &&
            tagMatch &&
            f &&
            quickType &&
            quickFormat &&
            (!activeFolderIds || activeFolderIds.has(a.folderId))
          );
        })
        .sort((a, b) =>
          sortOrder === "oldest"
            ? a.createdAt - b.createdAt
            : sortOrder === "nameAsc"
              ? a.name.localeCompare(b.name, "zh-CN")
              : sortOrder === "nameDesc"
                ? b.name.localeCompare(a.name, "zh-CN")
                : sortOrder === "sizeDesc"
                  ? b.size - a.size
                  : sortOrder === "sizeAsc"
                    ? a.size - b.size
                    : b.createdAt - a.createdAt,
        ),
    [
      assets,
      query,
      currentTag,
      filter,
      activeFolderIds,
      sortOrder,
      quickTypes,
      quickFormats,
      aiResultIds,
    ],
  );
  const displayed = shown.slice(0, visibleLimit);
  const allShownSelected =
    shown.length > 0 && shown.every((asset) => selectedIds.includes(asset.id));
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
  useEffect(() => {
    if (!window.nestDesktop?.setInspectorOpen) return;
    window.nestDesktop.setInspectorOpen(inspectorOpen, 350);
  }, [inspectorOpen]);
  const toggleAiPanel = async () => {
    if (aiPanel) {
      setAiPanel(false);
      if (!selected)
        await window.nestDesktop?.setInspectorOpen(false, 350, {
          immediate: true,
        });
      return;
    }
    if (!selected)
      await window.nestDesktop?.setInspectorOpen(true, 350, {
        immediate: true,
      });
    setAiPanel(true);
  };
  useEffect(
    () => setVisibleLimit(160),
    [query, currentTag, filter, activeFolder, sortOrder],
  );
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
    setFilter("全部素材");
    setQuery("");
    setCurrentTag(null);
    setActiveFolder(folder.id);
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
  const showImportResult = (lib) => {
    applyLibrary(lib);
    if (lib?.importCanceled) return;
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
    try {
      showImportResult(await window.nestDesktop.importAssets(activeFolder));
    } catch (error) {
      setMessage(`导入失败：${error.message}`);
      setTimeout(() => setMessage(""), 5000);
    } finally {
      setImporting(false);
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
    }
  };
  const droppedImport = async (files) => {
    if (importing) return;
    setImporting(true);
    try {
      showImportResult(
        await window.nestDesktop.importDropped([...files], activeFolder),
      );
    } catch (error) {
      setMessage(`导入失败：${error.message}`);
      setTimeout(() => setMessage(""), 5000);
    } finally {
      setImporting(false);
      setDrag(false);
    }
  };
  const droppedWebImage = async (transfer) => {
    const files = [...transfer.files];
    if (files.length) return droppedImport(files);
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
      try {
        showImportResult(await window.nestDesktop.importUrl(url, activeFolder));
      } catch (error) {
        setMessage(`导入失败：${error.message}`);
        setTimeout(() => setMessage(""), 5000);
      } finally {
        setImporting(false);
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
  const addFolder = () => addFolderAt(activeFolder);
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
  const renameFolder = async (folder) => {
    const name = await askText("重命名文件夹", folder.name, "输入新名称");
    if (name?.trim())
      applyLibrary(
        await window.nestDesktop.updateFolder(folder.id, { name: name.trim() }),
      );
  };
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
  const startAssetDrag = (event, asset) => {
    if (event.target.closest("button,input")) {
      event.preventDefault();
      return;
    }
    const ids = selectedIds.includes(asset.id) ? selectedIds : [asset.id],
      isAudio = asset.type?.startsWith("audio");
    if (isAudio || event.target.closest(".thumb")) {
      event.preventDefault();
      event.stopPropagation();
      externalDragActive.current = true;
      clearTimeout(externalDragTimer.current);
      externalDragTimer.current = setTimeout(() => {
        externalDragActive.current = false;
      }, 30000);
      window.nestDesktop?.startExternalDrag(ids);
      return;
    }
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
  const previewIndex = shown.findIndex((a) => a.id === previewId),
    previewAsset = shown[previewIndex];
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
        const playingId = audioPreviewManager.getState().id,
          asset =
            (selected?.type?.startsWith("audio") && selected) ||
            assetsRef.current.find(
              (item) => item.id === playingId && item.type?.startsWith("audio"),
            );
        if (asset) {
          event.preventDefault();
          audioPreviewManager.toggle(asset);
        }
      }
      if (previewId && event.key === "ArrowLeft") movePreview(-1);
      if (previewId && event.key === "ArrowRight") movePreview(1);
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
    ["全部素材", LayoutGrid],
    ["未分类", Archive],
    ["收藏夹", Heart],
    ["最近", Sparkles],
    ["图片", ImageIcon],
    ["视频", Video],
    ["音频", Music],
  ];
  const importPercent =
    importProgress?.phase === "complete"
      ? 100
      : importProgress?.phase === "importing" && importProgress.total
        ? Math.round((importProgress.processed / importProgress.total) * 100)
        : 0;
  const importStatus =
    importProgress?.phase === "scanning"
      ? `已扫描 ${importProgress.scanned || 0} 项 · 发现 ${importProgress.found || 0} 个素材`
      : importProgress?.phase === "importing"
        ? `正在导入 ${importProgress.processed || 0} / ${importProgress.total || 0} · ${importPercent}%`
        : importProgress?.phase === "complete"
          ? "导入完成 · 100%"
          : "请选择需要导入的文件夹";
  return (
    <div
      className={`app theme-${resolvedThemeMode} ${selected || aiPanel ? "detail-open" : ""}`}
      style={{
        "--sidebar-width": `${sidebarWidth}px`,
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
              <Import size={16} />
            </span>
            <div>
              <strong>{importing ? "正在导入文件夹…" : "添加到素材库"}</strong>
              <small>{importing ? importStatus : "文件或完整目录结构"}</small>
            </div>
            {importing && importProgress?.phase !== "scanning" && (
              <b>{importPercent}%</b>
            )}
          </div>
          <div className="import-actions-grid">
            <button
              className="import-action primary"
              disabled={importing}
              onClick={desktop ? nativeImport : () => input.current.click()}
            >
              <Plus size={16} />
              <span>导入素材</span>
              <small>选择文件</small>
            </button>
            {desktop && library && (
              <button
                className="import-action folder"
                disabled={importing}
                onClick={nativeImportFolder}
              >
                <FolderOpen size={16} />
                <span>导入文件夹</span>
                <small>保留子目录</small>
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
        </section>
        {desktop && library && (
          <button
            className="new-folder-primary"
            disabled={importing}
            onClick={addFolder}
          >
            <Folder size={17} /> 新建文件夹
          </button>
        )}
        <input
          ref={input}
          hidden
          multiple
          type="file"
          accept="image/*,video/*,audio/*"
          onChange={(e) => importFiles(e.target.files)}
        />
        <nav>
          {nav.map(([n, I]) => (
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
                setFilter(n);
                setCurrentTag(null);
                if (n === "全部素材") setQuery("");
                setActiveFolder(null);
                setSelected(null);
                setSelectedIds([]);
              }}
              key={n}
            >
              <I size={17} />
              <span>{n}</span>
              {n === "全部素材" && <b>{assets.length}</b>}
            </button>
          ))}
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
            aria-label="新建文件夹"
            title={activeFolder ? "在当前文件夹中新建子文件夹" : "新建文件夹"}
            onClick={desktop ? addFolder : undefined}
          >
            <Plus size={15} />
          </button>
        </div>
        <nav className="compact-folder-tree">
          {desktop ? (
            orderedFolders.map((f) => (
              <div
                draggable
                data-depth={f.depth}
                className={`folder-row ${activeFolder === f.id ? "active" : ""} ${dropFolderId === f.id ? "drop-target" : ""}`}
                style={{ "--folder-depth": f.depth }}
                key={f.id}
                onDragStart={(e) => startFolderDrag(e, f)}
                onDragEnd={() => setDropFolderId(undefined)}
                onDragOver={(e) => {
                  if (
                    e.dataTransfer.types.includes(INTERNAL_DRAG) ||
                    e.dataTransfer.types.includes(FOLDER_DRAG)
                  ) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = "move";
                    setDropFolderId(f.id);
                  }
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget))
                    setDropFolderId(undefined);
                }}
                onDrop={(e) =>
                  e.dataTransfer.types.includes(FOLDER_DRAG)
                    ? dropMovedFolder(e, f.id)
                    : dropAssets(e, f.id)
                }
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
                  <span>
                    {f.name} <small>({folderAssetCounts.get(f.id) || 0})</small>
                  </span>
                </button>
                <button
                  className="folder-action"
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
            aria-label="新建标签"
            title="新建标签"
            onClick={desktop ? addLibraryTag : undefined}
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="tag-list">
          {[
            ...new Set([
              ...(library?.tags || []),
              ...assets.flatMap((a) => a.tags || []),
            ]),
          ].map((t, i) => (
            <div className="tag-entry" key={t}>
              <button
                className={`tag-filter ${currentTag === t ? "active" : ""}`}
                onClick={() => {
                  setCurrentTag((current) => (current === t ? null : t));
                  setFilter("全部素材");
                  setActiveFolder(null);
                  setSelected(null);
                  setSelectedIds([]);
                }}
              >
                <i className={`dot c${i % 4}`} />
                {t}
              </button>
              {desktop && (
                <button
                  className="tag-remove"
                  aria-label={`删除标签 ${t}`}
                  title="删除标签"
                  onClick={() => deleteLibraryTag(t)}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
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
        className={`view-${viewMode}`}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (
            el.scrollHeight - el.scrollTop - el.clientHeight < 900 &&
            visibleLimit < shown.length
          )
            setVisibleLimit((x) => x + 160);
        }}
      >
        <header>
          <div className="breadcrumbs">
            <span>资源库</span>
            <b>›</b>
            {activeFolder && (
              <>
                <span>{currentFolder?.name}</span>
                <b>›</b>
              </>
            )}
            <strong>{filter}</strong>
          </div>
          <div className="search">
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
          </div>
          <div className="top-action-strip">
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
              title="安装网页采集扩展"
              onClick={() => {
                setExtensionResult(null);
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
            <button
              className="top-pill user-pill"
              title="当前用户"
              onClick={() => {
                setMessage("当前用户：N");
                setTimeout(() => setMessage(""), 2200);
              }}
            >
              <span>用户 N</span>
            </button>
          </div>
        </header>
        <section className="toolbar">
          <div>
            <h1>{activeFolder ? currentFolder?.name : filter}</h1>
            <span>
              {contentFolders.length} 个文件夹 · {shown.length} 个素材
            </span>
          </div>
          <div className="view-actions">
            {activeFolder && (
              <button
                onClick={() => setActiveFolder(currentFolder?.parentId || null)}
              >
                <FolderOpen size={15} /> 返回上级
              </button>
            )}
            <button onClick={() => addFolderAt(activeFolder)}>
              <Plus size={15} /> 新建文件夹
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
            onPointerDown={beginMarquee}
            onPointerMove={moveMarquee}
            onPointerUp={endMarquee}
            onPointerCancel={endMarquee}
          >
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
                className={`${selected?.id === a.id ? "selected" : ""} ${selectedIds.includes(a.id) ? "multi-selected" : ""}`}
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
                  draggable={desktop}
                  onDragStart={(e) => startAssetDrag(e, a)}
                  title="拖到桌面、其他软件或浏览器上传区域"
                >
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
                    {selectedIds.includes(a.id) ? "✓" : ""}
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
                </div>
                <div className="meta" title="拖动名称可移动到内部文件夹">
                  <strong>{a.name}</strong>
                  <div>
                    {a.tags.slice(0, 2).map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
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
      {!aiPanel && selected && (
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
          openMore={(event, asset) =>
            setContextMenu({ x: event.clientX, y: event.clientY, asset })
          }
        />
      )}
      {aiPanel && desktop && (
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
            {importing ? "正在导入并检查重复素材…" : "释放即可导入"}
          </strong>
          <span>支持常用图片、视频、MP3、WAV、FLAC、M4A 等音频</span>
        </div>
      )}
      {message && library && <div className="toast">{message}</div>}
      {selectedIds.length > 0 && desktop && (
        <div className="batch-bar">
          <strong>已选择 {selectedIds.length} 项</strong>
          <button onClick={() => batchUpdate({ favorite: true })}>
            <Heart size={15} /> 收藏
          </button>
          <button onClick={batchTag}>
            <Tag size={15} /> 标签
          </button>
          <button onClick={batchMove}>
            <Folder size={15} /> 移动
          </button>
          <button className="danger" onClick={batchDelete}>
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
            <div className="mark big">N</div>
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
          menu={contextMenu}
          close={() => setContextMenu(null)}
          actions={{
            open: () => {
              setFilter("全部素材");
              setActiveFolder(contextMenu.folder.id);
              setSelected(null);
            },
            add: () => addFolderAt(contextMenu.folder.id),
            rename: () => renameFolder(contextMenu.folder),
            delete: () => deleteFolder(contextMenu.folder),
          }}
        />
      ) : (
        contextMenu && (
          <AssetContextMenu
            menu={contextMenu}
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
              delete: () => contextDelete(contextMenu.asset),
            }}
          />
        )
      )}
      {dialogState && <AppDialog state={dialogState} resolve={resolveDialog} />}
      {extensionPanel && (
        <ExtensionPanel
          busy={extensionBusy}
          result={extensionResult}
          install={prepareExtension}
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
      {desktop && library && (
        <SidebarFooter
          info={diskInfo}
          recycleBinName={recycleBinName}
          openRecycle={async () => {
            const result = await window.nestDesktop.openRecycleBin();
            if (result?.error) {
              setMessage(`无法打开${recycleBinName}：${result.error}`);
              setTimeout(() => setMessage(""), 3500);
            }
          }}
        />
      )}
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
    </div>
  );
}

function SidebarFooter({ info, recycleBinName, openRecycle }) {
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
    [plan, setPlan] = useState(null),
    [audit, setAudit] = useState([]);
  const context = { folderId: folder?.id || null, selectedIds, query, filter };
  const refreshAudit = () => window.nestDesktop.ai.audit().then(setAudit);
  useEffect(() => {
    refreshAudit();
  }, []);
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
  const run = async (operation) => {
    setBusy(true);
    setError("");
    setResult(null);
    setPlan(null);
    try {
      const started = await window.nestDesktop.ai.startTask(operation, {
        context,
        prompt,
        assetId: selectedIds[0],
      });
      if (started?.error) throw new Error(started.error);
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 220));
        const task = await window.nestDesktop.ai.getTask(started.id);
        setProgress(task);
        if (task?.status === "completed") {
          setResult(task.result.result);
          setPlan(planFrom(operation, task.result.result));
          if (["search", "similar", "duplicates"].includes(operation))
            showResults(task.result.result.assetIds || []);
          break;
        }
        if (["failed", "cancelled"].includes(task?.status))
          throw new Error(task.error || "AI 任务已取消");
      }
    } catch (reason) {
      setError(reason.message);
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
            <Sparkles size={17} /> AI 助手 <em>BETA</em>
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
            placeholder="问问你的素材库…"
          />
          <button
            disabled={busy || !prompt.trim()}
            title="发送"
            onClick={() => run("chat")}
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

function AISettings({ close }) {
  const [value, setValue] = useState(null),
    [active, setActive] = useState("openai"),
    [key, setKey] = useState(""),
    [status, setStatus] = useState(""),
    [saving, setSaving] = useState(false),
    [usage, setUsage] = useState(null);
  useEffect(() => {
    window.nestDesktop.ai.settings().then((settings) => {
      setValue(settings);
      setActive(settings.defaultProviderId);
    });
    window.nestDesktop.ai.usage().then(setUsage);
  }, []);
  if (!value)
    return (
      <div className="ai-settings-page">
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
    <div className="ai-settings-page">
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
          <strong>AI 与模型</strong>
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
        {[
          ["通用", "⚙"],
          ["外观", "◈"],
          ["快捷键", "⌨"],
          ["存储", "▣"],
          ["AI 与模型", "✦"],
          ["更新", "↻"],
        ].map(([name, icon]) => (
          <button
            key={name}
            className={name === "AI 与模型" ? "active" : ""}
            disabled={name !== "AI 与模型"}
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
      </main>
      <aside className="ai-settings-side">
        <h2>小旺仔助手设置</h2>
        <section className="ai-assistant-profile">
          <div className="ai-profile-head">
            <span>
              <Sparkles size={24} />
            </span>
            <div>
              <b>
                {value.assistantName || "小旺仔助手"} <em>BETA</em>
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
function Detail({
  asset,
  folders = [],
  close,
  patch,
  del,
  open,
  reveal,
  confirmAction,
  openMore,
}) {
  const [tag, setTag] = useState("");
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
        <label>
          <Palette size={15} /> 主色板
        </label>
        <AssetPalette asset={asset} />
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
      className="modal-backdrop"
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

function ExtensionPanel({ busy, result, install, close }) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
    >
      <div className="app-dialog extension-dialog">
        <div className="dialog-head">
          <h2>安装 Nest 网页采集器</h2>
          <button aria-label="关闭" onClick={close} disabled={busy}>
            <X size={18} />
          </button>
        </div>
        <p>选择浏览器后，Nest 会自动准备扩展、打开扩展管理页并复制扩展目录。</p>
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
              <small>安装到 Edge 浏览器</small>
            </span>
            <ChevronDown size={18} />
          </button>
        </div>
        {busy && <div className="extension-status">正在准备扩展…</div>}
        {result?.ok && (
          <div className="extension-result success">
            <strong>扩展已准备好</strong>
            <span>1. 在浏览器中打开“开发者模式”</span>
            <span>
              2. 点击“加载已解压的扩展程序”，目录已复制并在资源管理器中打开
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
            {!progress && info.notes && <pre>{info.notes}</pre>}
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

function AssetContextMenu({ menu, folders, actions, close }) {
  const [moving, setMoving] = useState(false);
  const run = (fn) => {
    close();
    fn();
  };
  const rows = [
    [FolderOpen, "打开", actions.open],
    [Eye, "快速预览", actions.preview],
    [Tag, "添加标签", actions.tag],
    [StickyNote, "添加注释", actions.note],
  ];
  return (
    <div
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
      <button onClick={() => setMoving((x) => !x)}>
        <Folder size={16} />
        <span>移动到文件夹</span>
        <b>›</b>
      </button>
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
      <button onClick={() => run(actions.duplicate)}>
        <Copy size={16} />
        <span>复制素材</span>
      </button>
      <button onClick={() => run(actions.rename)}>
        <Pencil size={16} />
        <span>重命名</span>
      </button>
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
      <button className="menu-danger" onClick={() => run(actions.delete)}>
        <Trash2 size={16} />
        <span>删除</span>
      </button>
    </div>
  );
}

function FolderContextMenu({ menu, actions, close }) {
  const run = (fn) => {
    close();
    fn();
  };
  return (
    <div
      className="asset-menu folder-menu"
      style={{
        left: Math.min(menu.x, window.innerWidth - 230),
        top: Math.min(menu.y, window.innerHeight - 190),
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button onClick={() => run(actions.open)}>
        <FolderOpen size={16} />
        <span>打开文件夹</span>
      </button>
      <button onClick={() => run(actions.add)}>
        <Plus size={16} />
        <span>新建子文件夹</span>
      </button>
      <div className="menu-separator" />
      <button onClick={() => run(actions.rename)}>
        <Pencil size={16} />
        <span>重命名</span>
      </button>
      <button className="menu-danger" onClick={() => run(actions.delete)}>
        <Trash2 size={16} />
        <span>删除文件夹</span>
      </button>
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
  return (
    <div
      className="preview-overlay"
      onWheel={(e) => {
        if (!image) return;
        e.preventDefault();
        setZoom((z) =>
          Math.min(4, Math.max(0.25, z + (e.deltaY < 0 ? 0.25 : -0.25))),
        );
      }}
    >
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
        <button title="关闭 (Esc)" onClick={close}>
          <X size={20} />
        </button>
      </div>
      <button
        className="preview-arrow left"
        title="上一个 (←)"
        onClick={previous}
      >
        ‹
      </button>
      <div className={`preview-stage ${checker ? "checker" : ""}`}>
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
        const response = await fetch(src, { signal: controller.signal });
        const bytes = await response.arrayBuffer();
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        context = new AudioCtx();
        const buffer = await context.decodeAudioData(bytes.slice(0));
        if (controller.signal.aborted) return;
        const samples = buffer.getChannelData(0),
          canvas = canvasRef.current;
        if (!canvas) return;
        const width = large ? 720 : 300,
          height = large ? 150 : 92,
          dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        const ctx = canvas.getContext("2d");
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);
        const columns = large ? 180 : 88,
          step = Math.max(1, Math.floor(samples.length / columns)),
          barWidth = width / columns;
        ctx.fillStyle = large ? "#77a9f5" : "#9299a2";
        for (let i = 0; i < columns; i++) {
          let peak = 0;
          const start = i * step,
            end = Math.min(samples.length, start + step);
          for (let j = start; j < end; j += Math.max(1, Math.floor(step / 80)))
            peak = Math.max(peak, Math.abs(samples[j]));
          const h = Math.max(2, peak * (height - 8));
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
function useAudioPreviewState() {
  const [state, setState] = useState(audioPreviewManager.getState());
  useEffect(
    () => audioPreviewManager.subscribe((next) => setState({ ...next })),
    [],
  );
  return state;
}
function AudioMedia({ asset, preview = false, style }) {
  const state = useAudioPreviewState(),
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
  useEffect(() => {
    if (preview) audioPreviewManager.prepareFull(asset);
    return () => {
      if (preview && audioPreviewManager.getState().id === asset.id)
        audioPreviewManager.stop();
    };
  }, [preview, asset.id, asset.url]);
  const seek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect(),
      ratio = (e.clientX - rect.left) / rect.width;
    if (preview) audioPreviewManager.seek(asset, ratio);
    else audioPreviewManager.playAt(asset, ratio);
  };
  return (
    <div
      className={`audio-media ${preview ? "preview" : ""} ${playing ? "is-playing" : ""}`}
      style={style}
      onMouseEnter={
        !preview ? () => audioPreviewManager.hover(asset) : undefined
      }
      onMouseLeave={
        !preview ? () => audioPreviewManager.leave(asset.id) : undefined
      }
    >
      <div className="audio-wave-card" onClick={seek}>
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
            <span>悬停试听</span>
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
      style={style}
      onLoad={(e) =>
        onSize?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)
      }
    />
  );
}

createRoot(document.getElementById("root")).render(<App />);
