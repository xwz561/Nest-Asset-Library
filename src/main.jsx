import { APP_VERSION, TETRIS_ACCESS_CODE, INTERNAL_DRAG, FOLDER_DRAG, isTxtAsset, isTextEditableAsset, clampSidebarWidth, SIDEBAR_WIDTH_KEY, VIEW_MODES, VIEW_MODE_KEY, ROOT_FOLDER_DROP, SORT_OPTIONS, isExternalEditableAsset } from "./lib/app-config.js";
import { saveAsset, clearPending, writePending, removeAsset } from "./lib/browser-library.js";
import { LibrarySwitcherMenu, FolderMark, SortMenu, FilterPopover, FolderContextMenu, BlankContextMenu, AssetContextMenu } from "./components/menus.jsx";
import { SidebarFooter } from "./components/sidebar-footer.jsx";
import { SoftCard } from "./components/soft-card.jsx";
import { ErrorBoundary } from "./components/error-boundary.jsx";
import { FolderColumns } from "./components/folder-columns.jsx";
import { Media, Detail, Preview } from "./components/media.jsx";
import { AIAssistant, AISettings, AIFlowImportDialog } from "./components/lazy-panels.jsx";
import { AppDialog, TetrisAccessDialog, ExtensionPanel, AboutDialog, UpdatePanel, SupportPanel } from "./components/dialogs.jsx";
import { FriendToolsDialog } from "./components/friend-tools-dialog.jsx";
import { SoftEmptyIllustration } from "./components/soft-empty-illustration.jsx";
import { WindowControls } from "./components/window-controls.jsx";
import { TeamPanel, BatchRenameDialog } from "./components/team-dialogs.jsx";
import { ForwardDialog } from "./components/forward-dialog.jsx";
import { LibraryFinderDialog } from "./components/library-finder-dialog.jsx";
import TeamLibraryPanel from "./components/team-library-panel.jsx";
import { useLibrary } from "./hooks/useLibrary.js";
import { usePreview } from "./hooks/usePreview.js";
import { useImport } from "./hooks/useImport.js";
import { useAIFlow } from "./hooks/useAIFlow.js";
import { useLibraryView } from "./hooks/useLibraryView.js";
import { usePanelState } from "./hooks/usePanelState.js";
import { useMessage } from "./hooks/useMessage.js";
import { useLanFriends } from "./hooks/useLanFriends.js";
import { useAutoUpdates } from "./hooks/useAutoUpdates.js";
import { useCardLayout } from "./hooks/useCardLayout.js";
import { dockInsets as computeDockInsets } from "./card-layout.js";

import {bindThumbnailWheel, resizeThumbnail} from './thumbnail-wheel.js';
import {Button, ReadyUI} from './ready-ui.jsx';
import {FlatTree, FlatTreeItem} from '@fluentui/react-components';

import { folderPositions } from "./file-manager-adapter.cjs";

import { LanChat } from './lan-chat.jsx';
import { loadToolbarLayout, normalizeToolbarLayout, TOOLBAR_LAYOUT_KEY } from "./toolbar-layout.js";
import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";

import { formatImportResultMessage } from "./import-summary.js";
import { Archive, Box, Bug, CalendarDays, Check, CircleHelp, ChevronDown, CirclePlay, Clock, ExternalLink, FileText, Filter, Folder, FolderOpen, FolderPlus, Grid2X2, Heart, Image as ImageIcon, Import, Infinity as InfinityIcon, LayoutDashboard, LayoutGrid, List, Menu, MoreHorizontal, Music, PanelLeftClose, PanelLeftOpen, Pencil, Play, Plus, Puzzle, Radio, RotateCcw, RotateCw, Search, Settings, Sparkles, Star, StickyNote, Tag, Trash2, Users, Video, Wrench, X, Zap } from "lucide-react";
import "./styles.css";
import "./eagle-ui.css";
import "./ai-assistant.css";
import "./ai-settings-page.css";
import "./ui-redesign-overrides.css";
import "./ready-ui.css";
import "./onboarding-tour.css";
import "./typography.css";
import "./reference-board-redesign.css";
import ReferenceBoard from "./reference-board.jsx";
import appIcon from "../build/icon.png";

import { OnboardingTour } from "./onboarding-tour.jsx";
import { UsageDemoDialog } from "./components/usage-demo-dialog.jsx";
import { assetColor } from "./asset-colors.js";

import "./pet-settings.css";
import "./mineradio-theme.css";
import "./interaction-motion.css";
import "./friend-tools.css";
import "./lan-friends.css";
import "./automatic-update.css";
import "./ui-refresh.css";
import "./motion-polish.css";
import "./window-controls.css";
import "./soft-ui.css";
import "./soft-ui-panels.css";
import { waitForViewportShift } from "./lib/viewport-settle.js";
import { withViewTransition } from "./view-transition.js";

import { buildFolderRows, collapseFolderSubtree, defaultExpandedFolderIds, expandableFolderIds, expandFolderAncestors, formatFolderBytes, summarizeFolderAssets, toggleExpandedFolder, toggleExpandedFolderScope } from "./folder-tree.js";

import { THEME_EVENT, readableText, themeStyle } from "./theme-utils.js";
import { audioPreviewManager } from "./audio-preview-manager.js";
import { buildTagTree } from "./tag-tree.js";

if (window.nestDesktop?.platform)
  document.documentElement.dataset.platform = window.nestDesktop.platform;

function App() {
  const desktop = Boolean(window.nestDesktop);
  const [minimalMode, setMinimalMode] = React.useState(() => {
    try {
      return window.localStorage.getItem("nest-minimal-mode-v1") === "true";
    } catch {
      return false;
    }
  });
  const [teamLibraryOpen, setTeamLibraryOpen] = React.useState(false);
  const [forwardPanel, setForwardPanel] = React.useState(null);
  const [finderOpen, setFinderOpen] = React.useState(false);
  const [lanSignalsOpen, setLanSignalsOpen] = React.useState(false);
  const [toolbarLayout, setToolbarLayout] = React.useState(loadToolbarLayout);
  const { message, showMessage, clearMessageAfter } = useMessage();
  const lanFriends = useLanFriends();
  const autoUpdate = useAutoUpdates();
  const { dialogState, setDialogState, theme, setTheme, sortPanel, setSortPanel, filterPanel, setFilterPanel, quickTypes, setQuickTypes, quickFormats, setQuickFormats, contextMenu, setContextMenu, appMenuOpen, setAppMenuOpen, recentLibraries, setRecentLibraries, appMenuPosition, setAppMenuPosition, settingsInitialTab, setSettingsInitialTab, aboutPanel, setAboutPanel, batchRenamePanel, setBatchRenamePanel, extensionPanel, setExtensionPanel, extensionResult, setExtensionResult, extensionBusy, setExtensionBusy, plugins, setPlugins, mcpConfig, setMcpConfig, updateInfo, setUpdateInfo, updatePanel, setUpdatePanel, updateChecking, setUpdateChecking, updateProgress, setUpdateProgress, updateFile, setUpdateFile, updateError, setUpdateError, supportPanel, setSupportPanel, onboardingOpen, setOnboardingOpen, friendToolsOpen, setFriendToolsOpen, friendToolBusy, setFriendToolBusy, friendToolError, setFriendToolError, aiPanel, setAiPanel, aiSettingsPanel, setAiSettingsPanel, aiResultIds, setAiResultIds, activeModule, setActiveModule, usageDemoOpen, setUsageDemoOpen, tetrisPasswordOpen, setTetrisPasswordOpen, tetrisPassword, setTetrisPassword, tetrisPasswordError, setTetrisPasswordError, teamPanel, setTeamPanel, inspectorFrame, setInspectorFrame } = usePanelState();
  const { assets, setAssets, selected, setSelected, query, setQuery, currentTag, setCurrentTag, filter, setFilter, drag, setDrag, ready, setReady, library, setLibrary, activeFolder, setActiveFolder, expandedFolderIds, setExpandedFolderIds, sidebarWidth, setSidebarWidth, sortOrder, setSortOrder, viewMode, setViewMode, selectedIds, setSelectedIds, marquee, setMarquee, dropFolderId, setDropFolderId, virtualRange, setVirtualRange, libraryChoosing, setLibraryChoosing, renamingFolder, setRenamingFolder, activeReferenceBoardId, setActiveReferenceBoardId, diskInfo, setDiskInfo, expandedTags, setExpandedTags, dropTag, setDropTag, assetsRef } = useLibrary({ desktop, showMessage });
  const { previewId, setPreviewId, zoom, setZoom, thumbnailSize, setThumbnailSize, rotation, setRotation, checker, setChecker } = usePreview();
  // 界面卡片可以拖到窗口任意位置（磁盘卡片只在打开了资源库的桌面版里有）
  const cardLayout = useCardLayout(["rail", "panel", "library", "import", "folders", "tags", ...(desktop && library ? ["disk"] : []), "header", "toolbar"]);
  // 图标栏占的宽度：只加在显示宽度上；拖动调整侧栏时要先减掉，否则保存下来的宽度会越拖越大
  const softRailWidth = 76;
  // 侧栏面板里的小卡片都拖走后，平时把空面板藏起来；编辑布局时留着当"拖回这里"的位置
  const sidePanelHidden = cardLayout.panelEmpty && !cardLayout.editing;
  const sidePanelDocked = !cardLayout.panelOut && !sidePanelHidden;
  // 左侧这一列的宽度：图标栏 76（含左边距），侧栏面板 sidebarWidth；图标栏浮走时只留 4px 余量
  const asideWidth = (cardLayout.railOut ? 0 : softRailWidth) + (sidePanelDocked ? sidebarWidth + (cardLayout.railOut ? 4 : 0) : 0);
  const layoutClasses = [
    cardLayout.railOut && "soft-rail-out",
    cardLayout.panelOut && "soft-panel-out",
    sidePanelHidden && "soft-panel-hidden",
    cardLayout.panelEmpty && "soft-panel-vacant",
    asideWidth !== sidebarWidth + softRailWidth && "soft-aside-slim",
    !asideWidth && "soft-aside-empty",
    (cardLayout.headerOut || cardLayout.toolbarOut) && "soft-main-free",
    cardLayout.headerOut && "soft-header-out",
    cardLayout.editing && "soft-layout-editing",
  ].filter(Boolean).join(" ");
  // 浮动卡片占住窗口四周（贴边的按贴的那条边，没贴边的按最近的边）：量出各占多宽，整个界面往里收，谁也不盖住谁
  const [dockInsets, setDockInsets] = React.useState(null);
  useLayoutEffect(() => {
    const docked = Object.entries(cardLayout.layout);
    if (!docked.length) {
      setDockInsets(null);
      return undefined;
    }
    const elements = docked.map(([id, card]) => ({ edge: card.e, el: document.querySelector(`[data-soft-card="${id}"]`) }));
    const measure = () => {
      const next = computeDockInsets(elements.map(({ edge, el }) => ({ edge, rect: el?.getBoundingClientRect() })), { width: window.innerWidth, height: window.innerHeight }, { width: asideWidth });
      setDockInsets((current) => (current && ["top", "right", "bottom", "left"].every((side) => current[side] === next[side]) ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const { el } of elements) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [cardLayout.layout, cardLayout.viewport, asideWidth]);
  const docked = Boolean(dockInsets && (dockInsets.top || dockInsets.right || dockInsets.bottom || dockInsets.left));
  // 扣掉贴边卡片后剩下的高度，用来收紧图标栏（和窗口变矮时一样）
  const layoutHeight = cardLayout.viewport.height - (dockInsets?.top || 0) - (dockInsets?.bottom || 0);
  const heightClass = docked && layoutHeight < 680 ? "soft-short soft-shorter" : docked && layoutHeight < 820 ? "soft-short" : "";

  useEffect(() => {
    if (!desktop || !window.nestDesktop?.onLanSignalsPanelState) return;
    return window.nestDesktop.onLanSignalsPanelState(setLanSignalsOpen);
  }, [desktop]);

  const onboardingSeenKey = "nest-onboarding-tour-v1";

  useEffect(() => {
    try {
      window.localStorage.setItem("nest-minimal-mode-v1", String(minimalMode));
    } catch {
      // The mode still works for this session if storage is unavailable.
    }
  }, [minimalMode]);

  const supportWelcomeKey = `nest-support-welcome-${APP_VERSION}`;

  const canEdit = !desktop || ["owner", "admin", "editor"].includes(library?.currentMember?.role);
  const allTags = useMemo(() => [...new Set([...(library?.tags || []), ...assets.flatMap(asset => asset.tags || [])])], [library?.tags, assets]);
  const tagRows = useMemo(() => buildTagTree(allTags, expandedTags), [allTags, expandedTags]);
  useEffect(() => {const change=event=>setTheme(event.detail);window.addEventListener(THEME_EVENT,change);return()=>window.removeEventListener(THEME_EVENT,change);}, []);
  const resolvedThemeMode = theme.mode;
  const renderedTheme = theme;
  // 新界面（左侧图标栏、问候卡片、圆角卡片，样式在 soft-ui.css）对所有主题生效；切换主题只换颜色，不换布局。
  const recycleBinLabel = window.nestDesktop?.platform === "darwin" ? "废纸篓" : "回收站";
  // 资源库切换菜单挂在 <body> 上，不在 .app 里；给 body 加个标记让 soft-ui.css 也能管到它（深色主题另加 soft-ui-dark）
  useEffect(() => {
    document.body.classList.add("soft-ui-body");
    document.body.classList.toggle("soft-ui-dark", resolvedThemeMode === "dark");
    return () => document.body.classList.remove("soft-ui-body", "soft-ui-dark");
  }, [resolvedThemeMode]);
  useEffect(() => {
    const root = document.documentElement;
    const previous = new Map();
    const variables = themeStyle(renderedTheme, resolvedThemeMode);
    Object.entries(variables).forEach(([key, value]) => {
      if (!key.startsWith("--")) return;
      previous.set(key, root.style.getPropertyValue(key));
      root.style.setProperty(key, value);
    });
    return () => previous.forEach((value, key) => {
      if (value) root.style.setProperty(key, value);
      else root.style.removeProperty(key);
    });
  }, [renderedTheme, resolvedThemeMode]);
  useEffect(() => {
    if (!desktop || !ready || localStorage.getItem(supportWelcomeKey)) return;
    setSupportPanel(true);
  }, [desktop, ready, supportWelcomeKey]);
  useEffect(() => {
    if (!desktop || !ready || !library || supportPanel) return;
    if (localStorage.getItem(onboardingSeenKey)) return;
    // Keep the existing first-run support panel from overlapping the tutorial.
    if (!localStorage.getItem(supportWelcomeKey)) return;
    setOnboardingOpen(true);
  }, [desktop, ready, library, supportPanel, onboardingSeenKey, supportWelcomeKey]);
  const startOnboarding = () => {
    setActiveModule("library");
    setOnboardingOpen(true);
  };
  const closeSupportPanel = () => {
    localStorage.setItem(supportWelcomeKey, "seen");
    setSupportPanel(false);
  };
  useEffect(() => {
    if (!window.nestDesktop?.setTitleBarColors) return;
    window.nestDesktop.setTitleBarColors({
      background: "#00000000",
      symbols: readableText(renderedTheme.colors.sidebar),
    });
  }, [renderedTheme.colors.sidebar]);
  const recycleBinName =
    window.nestDesktop?.platform === "darwin" ? "废纸篓" : "回收站";
  const input = useRef(),
    saveTimers = useRef(new Map()),
    pendingSaves = useRef(new Map()),
    desktopTimers = useRef(new Map()),
    desktopChanges = useRef(new Map()),
    marqueeStart = useRef(null),
    marqueeMoved = useRef(false),
    scrollIdleTimer = useRef(0),
    marqueeBase = useRef(new Set()),
    lastSelectedId = useRef(null),
    sidebarResizing = useRef(false),
    contextMenuRef = useRef(null),
    contextMenuFlyoutRef = useRef(null),
    appMenuRef = useRef(null),
    appMenuPanelRef = useRef(null),
    searchInputRef = useRef(null),
    externalDragActive = useRef(false),
    externalDragTimer = useRef(null),
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
  const resolveDialog = (value, event) => {
    withViewTransition(() => {
      dialogState?.resolve(value);
      setDialogState(null);
    }, { kind: "fade", point: event ? { x: event.clientX, y: event.clientY } : null });
  };

  useEffect(() => {
    if (!desktop || !window.nestDesktop?.reconcileRecycledAssets) return;
    let reconciling = false;
    const reconcile = async () => {
      if (reconciling) return;
      reconciling = true;
      try {
        const lib = await window.nestDesktop.reconcileRecycledAssets();
        if (lib && !lib.error) {
          setLibrary(lib);
          assetsRef.current = lib.assets;
          setAssets(lib.assets);
          if (lib.restoredCount) {
            showMessage(`已从回收站恢复 ${lib.restoredCount} 个素材`, 5000);
          }
        }
      } catch (error) {
        console.error("Unable to reconcile restored assets:", error);
      } finally {
        reconciling = false;
      }
    };
    window.addEventListener("focus", reconcile);
    return () => window.removeEventListener("focus", reconcile);
  }, [desktop]);
  useEffect(() => {
    if (autoUpdate.info) setUpdateInfo(autoUpdate.info);
    if (autoUpdate.ready) setUpdateFile(autoUpdate.filePath);
    if (autoUpdate.progress) setUpdateProgress(autoUpdate.progress);
    else if (autoUpdate.phase === 'idle' || autoUpdate.phase === 'error') setUpdateProgress(null);
    if (autoUpdate.ready && !autoUpdate.silentInstall && autoUpdate.pendingVersion !== lastNotifiedVersion.current) {
      lastNotifiedVersion.current = autoUpdate.pendingVersion;
      setUpdatePanel(true);
    }
  }, [autoUpdate]);
  useEffect(
    () =>
      desktop
        ? window.nestDesktop.onUpdateProgress?.(setUpdateProgress)
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
  const checkUpdate = async () => {
    setUpdateChecking(true);
    const result = await window.nestDesktop.checkUpdate();
    setUpdateChecking(false);
    if (result?.error) {
      showMessage(result.error, 4000);
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
        saveAsset({ ...asset, url: "" }).then(() => { if (pendingSaves.current.get(id) === asset) { pendingSaves.current.delete(id); clearPending(id); } }),
      );
    }
    saveTimers.current.clear();
    if (desktop) {
      for (const [id, changes] of desktopChanges.current) {
        clearTimeout(desktopTimers.current.get(id));
        writes.push(window.nestDesktop.updateAsset(id, changes).then(result => { if (!result?.error && desktopChanges.current.get(id) === changes) desktopChanges.current.delete(id); return result; }));
      }
      desktopTimers.current.clear();
    }
    return Promise.allSettled(writes);
  };
  const installUpdate = async () => {
    setUpdateError("正在保存数据并启动独立更新程序…");
    const saved = await flushSaves();
    if (saved.some(result => result.status === 'rejected' || result.value?.error)) { setUpdateError('部分素材修改未保存，请稍后再更新'); return; }
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
  useEffect(() => desktop ? window.nestDesktop.onPrepareUpdate?.(async () => {
    const results = await flushSaves();
    return !results.some(result => result.status === 'rejected' || result.value?.error);
  }) : undefined, [desktop]);
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
        setAppMenuOpen(false);
        setExtensionPanel(false);
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
    let closeTimer = null;
    const insideMenu = (target) => contextMenuRef.current?.contains(target) || contextMenuFlyoutRef.current?.contains(target);
    const close = (event) => {
      if (event && insideMenu(event.target)) return;
      setContextMenu(null);
    };
    const closeAfterPointerLeaves = (event) => {
      if (insideMenu(event.target)) {
        clearTimeout(closeTimer);
        closeTimer = null;
        return;
      }
      if (closeTimer) return;
      closeTimer = window.setTimeout(() => {
        setContextMenu(null);
        closeTimer = null;
      }, 260);
    };
    // Capture phase still sees the pointer when a surrounding React panel stops
    // propagation, which previously left folder menus stranded on screen.
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("pointermove", closeAfterPointerLeaves, true);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("pointermove", closeAfterPointerLeaves, true);
      window.removeEventListener("blur", close);
      clearTimeout(closeTimer);
    };
  }, [contextMenu]);
  useEffect(() => {
    if (!appMenuOpen) return;
    const close = (event) => {
      if (
        !appMenuRef.current?.contains(event.target) &&
        !appMenuPanelRef.current?.contains(event.target)
      ) setAppMenuOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      window.removeEventListener("blur", close);
    };
  }, [appMenuOpen]);
    const { activeFolderIds, selectedIdSet, aiResultIdSet, sortedAssets, normalizedQuery, shown } = useLibraryView({ activeFolder, library, selectedIds, aiResultIds, assets, sortOrder, query, currentTag, filter, quickTypes, quickFormats });

  const displayed = shown.slice(virtualRange.start, virtualRange.end);
  useLayoutEffect(() => {
    const main = mainScrollRef.current;
    if (!main || activeModule !== "library") return;
    const header = main.querySelector(":scope > header");
    const toolbar = main.querySelector(":scope > .toolbar");
    const measure = () => {
      const headerHeight = header?.getBoundingClientRect().height || 0;
      main.style.setProperty("--library-header-height", `${headerHeight}px`);
      main.style.setProperty("--reference-sticky-top",
        `${headerHeight + (toolbar?.getBoundingClientRect().height || 0)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (header) observer.observe(header);
    if (toolbar) observer.observe(toolbar);
    return () => observer.disconnect();
  }, [activeModule]);
  useEffect(() => bindThumbnailWheel(mainScrollRef.current, direction => {
    if (activeModule !== 'library' || viewMode === 'list') return;
    setThumbnailSize(size => resizeThumbnail(size ?? (viewMode === 'compact' ? 145 : 190), direction));
  }), [activeModule, viewMode]);
  useEffect(() => { updateVirtualRange(); }, [thumbnailSize]);
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

  // The native window resize reaches the page asynchronously. Pin the workspace
  // width first and release it only after the viewport has really changed, so the
  // asset grid reflows at most once instead of "wide, then narrow" (the visible jump).
  const inspectorAddedRef = useRef(0);
  useLayoutEffect(() => {
    const setInspectorOpen = window.nestDesktop?.setInspectorOpen;
    let disposed = false;
    if (!setInspectorOpen) {
      setInspectorFrame({ ready: inspectorOpen, overlayWidth: inspectorOpen ? 350 : 0, lockWidth: 0 });
      return () => { disposed = true; };
    }
    const main = document.querySelector(".app > main");
    const lockWidth = main ? Math.round(main.getBoundingClientRect().width) : 0;
    const startViewport = window.innerWidth;
    if (!inspectorOpen) {
      const shrinkBy = inspectorAddedRef.current;
      inspectorAddedRef.current = 0;
      setInspectorFrame({ ready: false, overlayWidth: 0, lockWidth: shrinkBy > 0 ? lockWidth : 0 });
      void Promise.resolve(setInspectorOpen(false, 350, { immediate: true }))
        .then(() => waitForViewportShift(startViewport, shrinkBy))
        .catch(() => {})
        .then(() => { if (!disposed) setInspectorFrame({ ready: false, overlayWidth: 0, lockWidth: 0 }); });
      return () => { disposed = true; };
    }
    setInspectorFrame({ ready: false, overlayWidth: 0, lockWidth });
    void Promise.resolve(setInspectorOpen(true, 350, { immediate: true }))
      .then(result => {
        const added = Math.max(0, Number(result?.added) || 0);
        inspectorAddedRef.current = added;
        return waitForViewportShift(startViewport, added);
      })
      .catch(() => {})
      .then(() => {
        // The native frame has already grown to the right. Keep this full width
        // reserved in the layout so the wider grid never runs underneath it.
        if (!disposed) setInspectorFrame({ ready: true, overlayWidth: 350, lockWidth: 0 });
      });
    return () => { disposed = true; };
  }, [inspectorOpen]);
  const openExtensionPanel = async () => {
    setExtensionResult(null);
    setPlugins(await window.nestDesktop.listPlugins());
    setMcpConfig(await window.nestDesktop.mcpConfig());
    setExtensionPanel(true);
  };
  const toggleAiPanel = async () => {
    if (aiPanel) {
      setAiPanel(false);
      return;
    }
    setAiPanel(true);
  };
  // 「演示方法」：在窗口里放操作演示视频，旁边列出新手教程的每一步（不全屏）
  const openUsageDemo = () => {
    setAiPanel(false);
    setUsageDemoOpen(true);
  };
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
  const currentFolderStats = useMemo(
    () => summarizeFolderAssets(currentFolder?.id, library?.folders || [], assets),
    [currentFolder?.id, library?.folders, assets],
  );
  // 文件夹详情：点素材区空白处收起，重新打开文件夹（或换文件夹）时再出现
  const [folderInspectorHidden, setFolderInspectorHidden] = React.useState(false);
  useEffect(() => { setFolderInspectorHidden(false); }, [activeFolder]);
  React.useLayoutEffect(() => {
    if (mainScrollRef.current) mainScrollRef.current.scrollTop = 0;
  }, [activeFolder]);
  const folderInspectorOpen = Boolean(!minimalMode && currentFolder && !selected && !aiPanel && activeModule === "library" && !folderInspectorHidden);
  const hiddenFilterActive = Boolean(aiResultIds || quickTypes.length || quickFormats.length);
  const emptyFolderView = activeModule === "library" && filter === "全部素材" && !query && !currentTag && !hiddenFilterActive && shown.length === 0 && contentFolders.length === 0;
  const treePositions = useMemo(() => folderPositions(orderedFolders), [orderedFolders]);
  const folderPreviewById = useMemo(() => new Map(), []);
  // 文件夹详情面板会改变 app 的网格列宽；View Transition 快照会被重排到新宽度，实机出现跳动，因此文件夹导航直接切换。
  const openFolder = (folder) => {
    setExpandedFolderIds(current => expandFolderAncestors(current, library?.folders || [], folder.id));
    setActiveModule("library");
    setFilter("全部素材");
    setAiResultIds(null);
    setQuery("");
    setCurrentTag(null);
    setActiveFolder(folder.id);
    setFolderInspectorHidden(false);
    setSelected(null);
    setSelectedIds([]);
  };
  const openLibraryRoot = () => {
    setActiveModule("library");
    setFilter("全部素材");
    setAiResultIds(null);
    setQuery("");
    setCurrentTag(null);
    setActiveFolder(null);
    setSelected(null);
    setSelectedIds([]);
  };
  const openFolderParent = () => {
    setActiveFolder(currentFolder?.parentId || null);
    setSelected(null);
    setSelectedIds([]);
  };
  const applyLibrary = (lib, { reset = false } = {}) => {
    if (!lib || lib.error) {
      if (lib?.error) showMessage(lib.error);
      return;
    }
    showMessage(lib.joinNotice || "", lib.joinNotice ? 8000 : undefined);
    setLibrary(lib);
    assetsRef.current = lib.assets;
    setAssets(lib.assets);
    if (reset) {
      setActiveFolder(null);
      setSelected(null);
      setExpandedFolderIds(defaultExpandedFolderIds(lib.folders));
    } else
      setSelected((current) =>
        current ? lib.assets.find((a) => a.id === current.id) || null : null,
      );
  };
  const createReferenceBoard = async (input = {}) => {
    if (!desktop || !canEdit) return { error: "请在桌面版打开资源库后创建参考板" };
    try {
      const result = await window.nestDesktop.createReferenceBoard(input);
      if (result?.error) showMessage(result.error);
      else if (result?.library) applyLibrary(result.library);
      return result;
    } catch (error) {
      const result = { error: `新建参考板失败：${error.message}` };
      showMessage(result.error);
      return result;
    }
  };
  const updateReferenceBoard = async (id, changes) => {
    if (!desktop || !canEdit) return { error: "当前用户没有编辑参考板的权限" };
    try {
      const result = await window.nestDesktop.updateReferenceBoard(id, changes);
      if (result?.error) showMessage(result.error);
      else if (result?.library) applyLibrary(result.library);
      return result;
    } catch (error) {
      const result = { error: `保存参考板失败：${error.message}` };
      showMessage(result.error);
      return result;
    }
  };
  const deleteReferenceBoard = async (id) => {
    if (!desktop || !canEdit) return { error: "当前用户没有编辑参考板的权限" };
    try {
      const result = await window.nestDesktop.deleteReferenceBoard(id);
      if (result?.error) showMessage(result.error);
      else if (result?.library) applyLibrary(result.library);
      return result;
    } catch (error) {
      const result = { error: `删除参考板失败：${error.message}` };
      showMessage(result.error);
      return result;
    }
  };
  const openReferenceBoard = (id = null, event) => withViewTransition(() => {
    setActiveReferenceBoardId(id || library?.referenceBoards?.[0]?.id || null);
    setActiveModule("reference-board");
    setAiPanel(false);
  }, { kind: "module", point: event ? { x: event.clientX, y: event.clientY } : null });
  const requestTetrisAccess = () => {
    setTetrisPassword("");
    setTetrisPasswordError("");
    setTetrisPasswordOpen(true);
  };
  const unlockTetris = (event) => {
    if (tetrisPassword !== TETRIS_ACCESS_CODE) {
      setTetrisPasswordError("密码不正确，请重新输入。");
      return;
    }
    withViewTransition(() => {
      setSelected(null);
      setAiPanel(false);
      setTetrisPasswordOpen(false);
      setTetrisPasswordError("");
      setActiveModule("tetris");
    }, { kind: "module", point: event ? { x: event.clientX, y: event.clientY } : null });
  };
    const { beginAIFlowExtensionUpload, beginAIFlowFolderExtensionUpload, aiFlowLiveRootForFolder, aiFlowLiveSyncEnabledForFolder, aiFlowFolderConnected, toggleAIFlowLiveSync, pendingAIFlowUploadsByAssetId, activeAIFlowSync } = useAIFlow({ desktop, canEdit, selectedIds, assetsRef, askConfirm, showMessage, clearMessageAfter, library, applyLibrary, currentFolder });

  // Every folder within an enabled paired root is visibly connected to AI Flow.

  const refreshRecentLibraries = async () => {
    if (!window.nestDesktop?.recentLibraries) return;
    const items = await window.nestDesktop.recentLibraries();
    if (Array.isArray(items)) setRecentLibraries(items);
  };
  const openForward = async ({ assetIds = [], folderIds = [] }) => {
    await refreshRecentLibraries().catch(() => {});
    setForwardPanel({ assetIds, folderIds });
  };
  const chooseLibrary = async (action) => {
    if (libraryChoosing) return;
    setAppMenuOpen(false);
    setLibraryChoosing(true);
    try {
      applyLibrary(await action(), { reset: true });
    } catch (error) {
      showMessage(`资源库操作失败：${error?.message || String(error)}`, 6000);
    } finally {
      setLibraryChoosing(false);
      void refreshRecentLibraries().catch((error) => {
        console.warn("刷新最近资源库失败：", error);
      });
    }
  };
  const createLibrary = () =>
    chooseLibrary(() => window.nestDesktop.createLibrary());
  const openLibrary = () =>
    chooseLibrary(() => window.nestDesktop.openLibrary());
  const switchRecentLibrary = (id) =>
    chooseLibrary(() => window.nestDesktop.switchRecentLibrary(id));
  const mergeOtherLibrary = async () => {
    if (libraryChoosing) return;
    setAppMenuOpen(false);
    setLibraryChoosing(true);
    try {
      const result = await window.nestDesktop.mergeLibrary();
      applyLibrary(result);
      if (result?.lastImport && !result.importCanceled) showMessage(formatImportResultMessage(result.lastImport));
    } finally {
      setLibraryChoosing(false);
    }
  };
  const forgetRecentLibrary = async (id) => {
    const result = await window.nestDesktop.forgetRecentLibrary(id);
    if (result?.error) showMessage(result.error);
    else if (Array.isArray(result)) setRecentLibraries(result);
  };
  const clearLibraryCache = async () => {
    setAppMenuOpen(false);
    const result = await window.nestDesktop.clearCacheAndReload();
    if (result?.error) showMessage(result.error);
  };
  const openSettingsPanel = (tab = "通用") => {
    setSettingsInitialTab(tab);
    setAiSettingsPanel(true);
    setAiPanel(false);
    setAppMenuOpen(false);
  };
  const saveToolbarLayout = value => {
    const next = normalizeToolbarLayout(value);
    try { window.localStorage.setItem(TOOLBAR_LAYOUT_KEY, JSON.stringify(next)); } catch {}
    setToolbarLayout(next);
  };
  const showLibraryInfo = async () => {
    if (!library) {
      showMessage("Nest 本地素材库");
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
    setAppMenuOpen(false);
    const name = library.name || "当前素材库";
    const assetCount = library.assets?.length || 0;
    const confirmed = await askConfirm(
      `删除素材库“${name}”？`,
      `这会将整个本地素材库目录移入 Windows 回收站（含 ${assetCount} 个素材、索引和备份）。AI Flow 服务器素材不会被删除。`,
    );
    if (!confirmed) return;
    const result = await window.nestDesktop.deleteLibrary(name);
    if (result?.error) {
      showMessage(result.error, 5000);
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
    const { importing, setImporting, importProgress, setImportProgress, importCancelRequested, setImportCancelRequested, aiFlowImportPanel, setAiFlowImportPanel, showImportResult, nativeImport, nativeImportFolder, importAIFlowItems, droppedImport, droppedWebImage, cancelImport } = useImport({ desktop, applyLibrary, showMessage, activeFolder, setDrag });
    React.useEffect(() => {
      // 开始导入/拖入素材时清掉 AI 搜索结果和类型筛选，否则新素材会被它们挡住而“不显示”
      if (importing) { setAiResultIds(null); setQuickTypes([]); setQuickFormats([]); }
    }, [importing]);

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
        showMessage(`文件夹“${options.name.trim()}”已创建`, 2500);
      }
    } catch (error) {
      showMessage(`新建文件夹失败：${error.message}`, 5000);
    }
  };
  const addFolder = () => addFolderAt(null);
  const addLibraryTag = async () => {
    const name = await askText("新建标签", "", "输入标签名称");
    if (!name?.trim()) return;
    try {
      applyLibrary(await window.nestDesktop.addTag(name.trim()));
    } catch (error) {
      showMessage(`新建标签失败：${error.message}`, 5000);
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
      showMessage("文件夹名称不能为空");
      requestAnimationFrame(() => folderRenameInputRef.current?.focus());
      return;
    }
    const current = library?.folders?.find(folder => folder.id === draft.id);
    if (!current || name === current.name) return cancelFolderRename();
    folderRenameSaving.current = true;
    try {
      const result = await window.nestDesktop.updateFolder(draft.id, { name });
      if (result?.error) {
        showMessage(result.error);
        requestAnimationFrame(() => folderRenameInputRef.current?.focus());
        return;
      }
      applyLibrary(result);
      setRenamingFolder(null);
      showMessage(`文件夹已重命名为“${name}”`, 2500);
    } catch (error) {
      showMessage(`重命名失败：${error.message}`);
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
        showMessage(
          `已删除 ${lib.lastDelete.removedFolders} 个文件夹和 ${lib.lastDelete.removedAssets} 个素材`,
        );
      } else if (lib?.lastDelete?.errors?.length)
        showMessage(
          `${lib.lastDelete.errors.length} 个文件无法移入${recycleBinName}，相关文件夹已保留`,
        );
      clearMessageAfter(5000);
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
    if (!Number.isInteger(rating) || rating < 0 || rating > 5) return showMessage("评分必须是 0 到 5 的整数");
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
      else if (value !== "") showMessage("文件夹编号无效");
    }
  };
  const batchRename = async (template) => {
    flushSaves();
    const result = await window.nestDesktop.batchRename(selectedIds, template);
    if (result?.error) {
      showMessage(result.error, 4000);
      return false;
    }
    applyLibrary(result);
    setSelectedIds([]);
    setBatchRenamePanel(false);
    showMessage("批量重命名完成", 2500);
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
        showMessage(`有 ${lib.lastDelete.errors.length} 个文件无法移入${recycleBinName}，记录已保留`, 5000);
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
    showMessage(result?.error ? result.error : "文件已复制，可粘贴到其他位置", 2500);
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
    showMessage(folderId ? "素材已移动到文件夹" : "素材已移动到未分类", 2500);
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
    showMessage(`已为 ${ids.length} 个素材添加标签“${tag}”`, 2500);
  };
  const toggleFolderExpanded = (id) =>
    setExpandedFolderIds(current => current.has(id)
      ? collapseFolderSubtree(current, library?.folders || [], id)
      : toggleExpandedFolder(current, id));
  const folderExpansionIds = (folder, scope) => {
    const folders = library?.folders || [];
    if (scope === "current")
      return expandableFolderIds(folders).includes(folder.id) ? [folder.id] : [];
    if (scope === "siblings")
      return expandableFolderIds(folders, { parentId: folder.parentId || null });
    return expandableFolderIds(folders);
  };
  const toggleFolderExpansionScope = (folder, scope) => {
    const ids = folderExpansionIds(folder, scope);
    setExpandedFolderIds((current) => toggleExpandedFolderScope(current, ids));
  };
  const updateFolderAppearance = async (folder, changes) => {
    if (!canEdit || !folder || !changes) return;
    try {
      const result = await window.nestDesktop.updateFolder(folder.id, changes);
      applyLibrary(result);
      if (!result?.error) {
        showMessage("文件夹外观已更新", 1800);
      }
    } catch (error) {
      showMessage(`更新文件夹外观失败：${error.message}`, 5000);
    }
  };
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
      showMessage(parentId ? "文件夹已移动到新父级" : "文件夹已移动到根目录", 2500);
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
      showMessage(result.error, 5000);
    } else if (result?.library) applyLibrary(result.library);
  };
  const openAssetAction = async (id, assetHint = null) => {
    const asset = assetHint || assets.find((item) => item.id === id);
    if (isTxtAsset(asset)) {
      const result = await window.nestDesktop.openTextEditor(id);
      if (result?.error) {
        showMessage(result.error, 5000);
      }
      return;
    }
    return openExternalAssetAction(id);
  };
  const openExternalAssetAction = async (id) => {
    const result = await window.nestDesktop.openAsset(id);
    if (result?.error) {
      showMessage(result.error, 5000);
    }
  };
  const createDocument = async (kind, folderId = activeFolder) => {
    if (!desktop || !canEdit) return;
    try {
      const result = await window.nestDesktop.createDocument(kind, folderId || null);
      if (result?.error) {
        showMessage(result.error, 5000);
        return;
      }
      if (result?.library) applyLibrary(result.library);
      if (result?.asset) {
        setSelected(result.asset);
        if (isTxtAsset(result.asset)) {
          await openAssetAction(result.asset.id, result.asset);
        } else if (isTextEditableAsset(result.asset)) {
          setPreviewId(result.asset.id);
          resetPreviewView();
        } else {
          await openAssetAction(result.asset.id);
        }
        showMessage(`${result.asset.name} 已创建`, 2500);
      }
    } catch (error) {
      showMessage(`新建文档失败：${error.message}`, 5000);
    }
  };
  const saveTextDocument = async (id, value) => {
    try {
      const result = await window.nestDesktop.saveTextDocument(id, value);
      if (result?.library) applyLibrary(result.library);
      if (result?.error) showMessage(result.error);
      else {
        showMessage("文档已保存", 2200);
      }
      return result;
    } catch (error) {
      const result = { error: `保存文档失败：${error.message}` };
      showMessage(result.error);
      return result;
    }
  };
  const exportAssetAction = async (id) => {
    const result = await window.nestDesktop.exportAsset(id);
    if (result?.error) showMessage(result.error);
    else if (result?.ok) showMessage("素材已导出");
    if (!result?.canceled) clearMessageAfter(3500);
  };
  const duplicateAssetAction = async (id) => {
    const result = await window.nestDesktop.duplicateAsset(id);
    applyLibrary(result);
    if (!result?.error) {
      showMessage("素材已复制", 2500);
    }
  };
  const previewIndex = shown.findIndex((a) => a.id === previewId),
    previewAsset = shown[previewIndex];
  const shouldShowBugFeedback = desktop && !message && !previewAsset && !dialogState && !aiFlowImportPanel && !extensionPanel && !aiSettingsPanel && !updatePanel && !supportPanel && !teamPanel && !batchRenamePanel && !teamLibraryOpen;
  const resetPreviewView = () => {
    setZoom(1);
    setRotation(0);
  };
  const movePreview = (delta) => {
    if (!shown.length) return;
    const target = shown[(previewIndex + delta + shown.length) % shown.length];
    if (isTxtAsset(target)) {
      setPreviewId(null);
      void openAssetAction(target.id);
    } else setPreviewId(target.id);
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
      event.target.closest("article, button, input, select, textarea, .video-card-controls")
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
    marqueeMoved.current = start.moved;
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
      setSidebarWidth(clampSidebarWidth(event.clientX - (cardLayout.railOut ? 4 : softRailWidth)));
  };
  const endSidebarResize = (event) => {
    if (!sidebarResizing.current) return;
    sidebarResizing.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    document.body.classList.remove("resizing-sidebar");
    const width = clampSidebarWidth(event.clientX - (cardLayout.railOut ? 4 : softRailWidth));
    setSidebarWidth(width);
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
  };
  const resetSidebarWidth = () => {
    setSidebarWidth(232);
    localStorage.setItem(SIDEBAR_WIDTH_KEY, "326");
  };
  const cycleViewMode = (event) => withViewTransition(() =>
    setViewMode((current) => {
      const next =
        VIEW_MODES[(VIEW_MODES.indexOf(current) + 1) % VIEW_MODES.length];
      localStorage.setItem(VIEW_MODE_KEY, next);
      return next;
    }), { kind: "fade", point: event ? { x: event.clientX, y: event.clientY } : null });
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
              showMessage(result.error, 5000);
              const current = await window.nestDesktop.currentLibrary();
              applyLibrary(current);
              return;
            }
            applyLibrary(result);
          } catch (error) {
            showMessage(`保存失败：${error.message}`, 5000);
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
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "o") {
          event.preventDefault();
          if (desktop) openLibrary();
          return;
        }
        if (key === "f" && !event.shiftKey) {
          event.preventDefault();
          setActiveModule("library");
          window.setTimeout(() => searchInputRef.current?.focus(), 0);
          return;
        }
        if (key === "n" && event.shiftKey && desktop) {
          event.preventDefault();
          addFolderAt(activeFolder);
          return;
        }
        if (key === "," && !event.shiftKey) {
          event.preventDefault();
          openSettingsPanel("通用");
          return;
        }
      }
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
  }, [shown, selectedIds, selected, previewId, desktop, activeFolder, openLibrary, addFolderAt, openSettingsPanel]);
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
  const selectNav = (n) => {
    const update = () => {
      setActiveModule("library");
      setAiResultIds(null);
      setFilter(n);
      setCurrentTag(null);
      if (n === "全部素材") setQuery("");
      setActiveFolder(null);
      setSelected(null);
      setSelectedIds([]);
    };
    // 从文件夹切到分类会关闭右侧文件夹详情并扩展主区，避免几何变化期间做快照动画。
    if (activeFolder) update();
    else withViewTransition(update, { kind: "fade" });
  };
  const nav = [
    ["全部素材", "all", LayoutGrid],
    ["未分类", "unclassified", Box],
    ["收藏夹", "favorite", Heart],
    ["最近", "recent", Clock],
    ["图片", "image", ImageIcon],
    ["视频", "video", Video],
    ["音频", "audio", Music],
    ["剧本", "script", FileText],
  ];
  const railCategoryGroupRef = useRef(null);
  const [railHighlight, setRailHighlight] = React.useState({ y: 0, height: 44, visible: false });
  useLayoutEffect(() => {
    const group = railCategoryGroupRef.current;
    if (!group) return undefined;
    const update = () => {
      const active = group.querySelector(".soft-rail-item.active");
      if (!active) {
        setRailHighlight(current => current.visible ? { ...current, visible: false } : current);
        return;
      }
      const groupRect = group.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const next = { y: activeRect.top - groupRect.top, height: activeRect.height, visible: true };
      setRailHighlight(current => current.visible === next.visible && Math.abs(current.y - next.y) < 0.5 && Math.abs(current.height - next.height) < 0.5 ? current : next);
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(group);
    return () => observer?.disconnect();
  }, [activeModule, filter, activeFolder, currentTag]);
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
  const toolbarButtonRenderers = {
    chat: () => <LanChat selectedIds={selectedIds.length ? selectedIds : (selected ? [selected.id] : [])} />,
    "friend-tools": () => desktop && <Button className="top-pill friend-tools-button" data-tour="friend-tools" title="友商工具集" aria-label="打开友商工具集" disabled={!["win32", "darwin"].includes(window.nestDesktop.platform)} onClick={() => { setFriendToolError(""); setFriendToolsOpen(true); }}><Wrench size={14} /><span>友商工具集</span></Button>,
    "lan-signals": () => desktop && <Button className={`top-pill lan-signals-button${lanSignalsOpen ? " on" : ""}`} data-tour="lan-signals" title="局域网信号和表情" aria-label="打开局域网信号" aria-pressed={lanSignalsOpen} onClick={async () => { const result = await window.nestDesktop.openLanSignals(); if (result?.error) showMessage(result.error); else setLanSignalsOpen(true); }}><Radio size={14} /><span>局域网信号</span>{lanFriends.some(peer => peer.unread) && <b className="lan-badge">{Math.min(99, lanFriends.reduce((total, peer) => total + (peer.unread || 0), 0))}</b>}</Button>,
    calendar: () => desktop && <Button className="top-pill calendar-header-button" title="打开老黄历" aria-label="打开老黄历" onClick={async () => { const result = await window.nestDesktop.openCalendar(); if (result?.error) showMessage(`打开日历失败：${result.error}`); }}><CalendarDays size={14} /><span>日历</span></Button>,
    director: () => <Button className="top-pill usage-demo-button" data-tour="demo" title="演示方法：操作演示视频和新手教程" aria-label="打开演示方法" onClick={openUsageDemo}><CirclePlay size={14} /><span>演示方法</span></Button>,
    tetris: () => <Button className={`top-pill tetris-header-button ${activeModule === "tetris" ? "on" : ""}`} title="无穷大" onClick={requestTetrisAccess}><InfinityIcon size={15} /><span>无穷大</span></Button>,
    ai: () => <Button className={`top-pill ai-header-button ${aiPanel ? "on" : ""}`} title="AI 助手" onClick={toggleAiPanel}><Sparkles size={14} /><span>AI助手</span></Button>,
    updates: () => <Button className={`top-pill update-button ${updateInfo?.available ? "has-update" : ""}`} title={updateInfo?.available ? `发现新版本 ${updateInfo.latest}` : "检查更新"} onClick={checkUpdate} disabled={updateChecking}><RotateCw size={14} /><span>{updateChecking ? "检查中" : "检查更新"}</span>{updateInfo?.available && <i />}</Button>,
    extensions: () => <Button className="top-pill" title="扩展、插件与 MCP" onClick={openExtensionPanel}><Puzzle size={14} /><span>扩展</span></Button>,
    settings: () => <Button className="top-pill" title="偏好设置" onClick={() => openSettingsPanel("主题与配色")}><Settings size={14} /><span>偏好设置</span></Button>,
    tutorial: () => <Button className="top-pill tutorial-button" title="新手教程" aria-label="重新打开新手教程" onClick={startOnboarding}><CircleHelp size={14} /><span>新手教程</span></Button>,
    "library-status": () => <Button className="top-pill library-status-pill" title="资源库健康与备份" onClick={showLibraryInfo}><Archive size={14} /><span>资源库状态检查</span></Button>,
  };
  // 疯狂模式放到桌面上的卡片小窗口，外层用和主窗口一样的界面类名和主题颜色
  cardLayout.shellRef.current = { className: `app eagle-ui ready-ui ui-refresh theme-${resolvedThemeMode} soft-ui`, style: themeStyle(renderedTheme, resolvedThemeMode) };
  return (
    <div
      className={`app eagle-ui ready-ui ui-refresh theme-${resolvedThemeMode} soft-ui ${minimalMode ? "minimal-mode" : ""} ${inspectorFrame.ready ? "detail-open" : ""} ${inspectorFrame.lockWidth ? "main-locked" : ""} ${folderInspectorOpen ? "folder-inspector-open" : ""} ${emptyFolderView ? "empty-folder-view" : ""} ${aiPanel ? "ai-panel-open" : ""} ${activeModule === "reference-board" ? "reference-board-mode" : ""} ${activeModule === "tetris" ? "tetris-mode" : ""} ${layoutClasses} ${docked ? "soft-docked" : ""} ${heightClass}`}
      style={{
        "--sidebar-width": `${asideWidth}px`,
        ...(docked ? { "--dock-top": `${dockInsets.top}px`, "--dock-right": `${dockInsets.right}px`, "--dock-bottom": `${dockInsets.bottom}px`, "--dock-left": `${dockInsets.left}px` } : {}),
        "--inspector-overlay-width": `${inspectorFrame.overlayWidth}px`,
        "--main-lock-width": inspectorFrame.lockWidth ? `${inspectorFrame.lockWidth}px` : "auto",
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
        <SoftCard id="rail" cards={cardLayout} self>
        <nav className="soft-rail" aria-label="主导航">
          <div className="soft-rail-logo"><img src={appIcon} alt="" /></div>
          <div className="soft-rail-group rail-selection-group" data-tour="categories" ref={railCategoryGroupRef}>
            <span className="rail-selection-highlight" aria-hidden="true" style={{ transform: `translateY(${railHighlight.y}px)`, height: `${railHighlight.height}px`, opacity: railHighlight.visible ? 1 : 0 }} />
            {nav.map(([n, , Icon]) => (
              <Button
                key={n}
                className={`soft-rail-item ${activeModule === "library" && filter === n && !activeFolder && !currentTag ? "active" : ""} ${n === "未分类" && dropFolderId === null ? "drop-target" : ""}`}
                title={n}
                aria-label={n}
                onDragOver={n === "未分类" ? (e) => { if (e.dataTransfer.types.includes(INTERNAL_DRAG)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; setDropFolderId(null); } } : undefined}
                onDragLeave={n === "未分类" ? () => setDropFolderId(undefined) : undefined}
                onDrop={n === "未分类" ? (e) => dropAssets(e, null) : undefined}
                onClick={() => selectNav(n)}
              >
                <Icon size={18} strokeWidth={1.8} />
              </Button>
            ))}
          </div>
          <div className="soft-rail-group">
            <Button className={`soft-rail-item ${activeModule === "reference-board" ? "active" : ""}`} title="无限参考板" aria-label="无限参考板" onClick={(event) => openReferenceBoard(null, event)}><StickyNote size={18} strokeWidth={1.8} /></Button>
            {desktop && <Button className={`soft-rail-item ${teamLibraryOpen ? "active" : ""}`} title="团队素材库" aria-label="团队素材库" onClick={() => setTeamLibraryOpen(true)}><FolderOpen size={18} strokeWidth={1.8} /></Button>}
            {desktop && <Button className={`soft-rail-item ${teamPanel ? "active" : ""}`} title="成员与权限" aria-label="成员与权限" disabled={!library} onClick={() => setTeamPanel(true)}><Users size={18} strokeWidth={1.8} /></Button>}
          </div>
          <div className="soft-rail-bottom">
            <Button
              className={`soft-rail-item soft-layout-toggle ${cardLayout.editing ? "active" : ""}`}
              role="switch"
              aria-checked={cardLayout.editing}
              title={cardLayout.editing ? "保存布局并退出编辑" : "编辑布局：打开后可以拖动卡片"}
              aria-label="编辑布局"
              onClick={cardLayout.editing ? cardLayout.save : cardLayout.startEditing}
            >
              <LayoutDashboard size={18} strokeWidth={1.8} />
              {cardLayout.editing && <span className="soft-layout-toggle-indicator" aria-hidden="true" />}
            </Button>
            <Button className="soft-rail-item" title={recycleBinLabel} aria-label={recycleBinLabel} onClick={async () => { const result = await window.nestDesktop?.openRecycleBin?.(); if (result?.error) showMessage(`无法打开${recycleBinLabel}：${result.error}`, 3500); }}><Trash2 size={18} strokeWidth={1.8} /></Button>
          </div>
        </nav>
        </SoftCard>
        <SoftCard id="panel" cards={cardLayout} self>
        <div className="soft-side-panel" ref={cardLayout.dockRef}>
        <div className="sidebar-fixed-controls">
        <SoftCard id="library" cards={cardLayout}>
        <div className="brand" ref={appMenuRef}>
          <div className="mark">
            <img src={appIcon} alt="" />
          </div>
          <span>小旺仔素材库</span>
          <Button
            disabled={libraryChoosing}
            aria-label="打开资源库切换面板"
            aria-haspopup="menu"
            aria-expanded={appMenuOpen}
            title="资源库"
            onClick={() => {
              const bounds = appMenuRef.current?.getBoundingClientRect();
              if (bounds) setAppMenuPosition({ left: Math.max(8, bounds.left), top: Math.max(8, bounds.bottom - 4) });
              if (!appMenuOpen) void refreshRecentLibraries();
              setAppMenuOpen((value) => !value);
            }}
          >
            <Menu size={19} />
          </Button>
          {appMenuOpen && createPortal(
            <LibrarySwitcherMenu
              panelRef={appMenuPanelRef}
              position={appMenuPosition}
              themeVariables={themeStyle(renderedTheme, resolvedThemeMode)}
              libraries={recentLibraries}
              currentLibrary={library}
              busy={libraryChoosing}
              onSwitch={switchRecentLibrary}
              onForget={forgetRecentLibrary}
              onCreate={createLibrary}
              onOpen={openLibrary}
              onFind={desktop && window.nestDesktop?.libraryFinder ? () => { setAppMenuOpen(false); setFinderOpen(true); } : null}
              onClearCache={clearLibraryCache}
              onMerge={mergeOtherLibrary}
              onDelete={deleteCurrentLibrary}
              onDismiss={() => setAppMenuOpen(false)}
            />,
            document.body,
          )}
        </div>
        </SoftCard>
        <SoftCard id="import" cards={cardLayout}>
        <section
          data-tour="import"
          className={`import-actions ${importing ? "busy" : ""} ${importProgress?.phase || ""}`}
          aria-busy={importing}
        >
          <div className="import-actions-head">
            <span>
              <Import size={16} />
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
            <Button
              className="import-action primary"
              disabled={importing || !canEdit}
              onClick={desktop ? nativeImport : () => input.current.click()}
            >
              <Import size={16} />
              <span>导入素材</span>
              <small>选择文件</small>
            </Button>
            {desktop && library && (
              <Button
                className="import-action folder"
                disabled={importing || !canEdit}
                onClick={nativeImportFolder}
              >
                <Folder size={17} />
                <span>导入文件夹</span>
                <small>保留子目录</small>
              </Button>
            )}
            {desktop && library && (
              <Button
                className="import-action aiflow"
                disabled={importing || !canEdit}
                onClick={() => setAiFlowImportPanel(true)}
              >
                <Sparkles size={16} />
                <span>导入 AI Flow 素材</span>
                <small>服务器已完成视频或本机“我的素材”</small>
              </Button>
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
            <Button
              className="import-cancel"
              disabled={importCancelRequested}
              onClick={cancelImport}
            >
              {importCancelRequested ? "正在取消…" : "取消本次导入"}
            </Button>
          )}
        </section>
        </SoftCard>
        {desktop && library && (
          <Button
            className="new-folder-primary"
            disabled={importing || !canEdit}
            onClick={addFolder}
          >
            <FolderPlus size={16} /> 新建文件夹
          </Button>
        )}
        <input
          ref={input}
          hidden
          multiple
          type="file"
          accept="image/*,video/*,audio/*,.pdf,.docx,.txt,.md,.markdown,.fountain"
          onChange={(e) => importFiles(e.target.files)}
        />
        </div>
        <div className="sidebar-scroll-content">
        {desktop && <><div className="nav-title"><span>团队协作</span></div><nav className="reference-board-nav"><Button className={teamLibraryOpen ? "active" : ""} onClick={() => setTeamLibraryOpen(true)} title="连接 NAS 上的公司共享素材库"><FolderOpen size={16} /><span>团队素材库</span></Button><Button className={teamPanel ? "active" : ""} disabled={!library} onClick={() => setTeamPanel(true)} title="查看成员、设置管理员和权限"><Users size={16} /><span>成员与权限</span></Button></nav></>}
        <nav className="asset-filter-nav">
          {nav.map(([n, icon, Icon]) => (
            <Button
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
              onClick={() => selectNav(n)}
              key={n}
            >
              <Icon size={16} strokeWidth={1.7} />
              <span>{n}</span>
              {n === "全部素材" && <b>{assets.length}</b>}
            </Button>
          ))}
        </nav>
        <div className="nav-title"><span>制作参考</span></div>
        <nav className="reference-board-nav">
          <Button
            className={activeModule === "reference-board" ? "active" : ""}
            onClick={() => openReferenceBoard()}
            title="打开 PureRef 风格的无限参考画布"
          >
            <StickyNote size={16} />
            <span>无限参考板</span>
            <b>{(library?.referenceBoards || []).length}</b>
          </Button>
        </nav>
        <SoftCard id="folders" cards={cardLayout}>
        <div
          data-tour="folders"
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
          <Button
            disabled={!canEdit}
            aria-label="新建文件夹"
            title="新建根文件夹"
            onClick={desktop ? addFolder : undefined}
          >
            <Plus size={15} />
          </Button>
        </div>
        {/* 文件夹卡片横着（贴顶部 / 底部）时换成访达那样的分栏，竖着时是文件夹树 */}
        {cardLayout.layout.folders?.o === "h" ? (
          <FolderColumns
            folders={allOrderedFolders}
            activeFolder={activeFolder}
            counts={folderAssetCounts}
            canEdit={canEdit}
            onOpen={openFolder}
            onContextMenu={(event, folder) => setContextMenu({ kind: "folder", x: event.clientX, y: event.clientY, folder })}
            onDropAssets={(event, folderId) => dropAssets(event, folderId)}
          />
        ) : (
        <FlatTree className="compact-folder-tree" aria-label="文件夹" openItems={Array.from(expandedFolderIds)} onOpenChange={(event, data) => setExpandedFolderIds(current => {
          let next = new Set(data.openItems);
          for (const id of current) if (!next.has(id)) next = collapseFolderSubtree(next, library?.folders || [], id);
          return next;
        })}>
          {desktop ? (
            orderedFolders.map((f) => (
              <FlatTreeItem
                value={f.id} parentValue={f.parentId || undefined} itemType={f.hasChildren ? "branch" : "leaf"} aria-level={f.depth + 1} aria-posinset={treePositions.get(f.id)?.position} aria-setsize={treePositions.get(f.id)?.size}
                onKeyDown={event => { if (event.target === event.currentTarget && event.key === "Enter") { event.preventDefault(); openFolder(f); } }}
                draggable={canEdit}
                data-depth={f.depth}
                data-last-sibling={f.isLastSibling ? "true" : "false"}
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
                title={`拖入“${f.name}”（保留最外层文件夹及全部子文件夹结构）`}
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
                {f.depth > 0 && (
                  <span className="folder-tree-guides" aria-hidden="true">
                    {f.ancestorContinuations.slice(0, -1).map((continues, level) =>
                      continues ? (
                        <i
                          className="folder-tree-ancestor"
                          key={level}
                          style={{ "--guide-offset": `${(level - f.depth) * 20 + 10}px` }}
                        />
                      ) : null
                    )}
                    <svg
                      className={`folder-tree-branch ${f.isLastSibling ? "last" : ""}`}
                      viewBox="0 0 10 30"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <path d={f.isLastSibling ? "M0 0V10Q0 15 5 15H10" : "M0 0V10Q0 15 5 15H10 M0 15V30"} />
                    </svg>
                  </span>
                )}
                <Button
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
                </Button>
                {renamingFolder?.id === f.id ? (
                  <div className="folder-main folder-main-editing" onClick={event => event.stopPropagation()}>
                    <FolderMark folder={f} expanded={expandedFolderIds.has(f.id)} />
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
                  <Button
                    className="folder-main"
                    onClick={(e) => {
                      e.stopPropagation();
                      openFolder(f);
                    }}
                  >
                  <FolderMark
                    folder={f}
                    expanded={expandedFolderIds.has(f.id)}
                  />
                  {aiFlowFolderConnected(f) && (
                    <i className="aiflow-live-bolt" title="AI Flow 实时连接中" aria-label="AI Flow 实时连接中">
                      <Zap size={12} fill="currentColor" />
                    </i>
                  )}
                   <span>
                     {f.name} <small>({folderAssetCounts.get(f.id) || 0})</small>
                   </span>
                  </Button>
                )}
                <Button
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
                </Button>
                <Button
                  className="folder-action danger"
                  disabled={!canEdit}
                  title="删除文件夹"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteFolder(f);
                  }}
                >
                  <X size={13} />
                </Button>
              </FlatTreeItem>
            ))
          ) : (
            <>
              <Button>
                <Folder size={17} />
                <span>灵感收集</span>
                <b>{assets.filter((a) => a.tags.includes("灵感")).length}</b>
              </Button>
              <Button>
                <Folder size={17} />
                <span>品牌项目</span>
              </Button>
            </>
          )}
        </FlatTree>
        )}
        </SoftCard>
        <SoftCard id="tags" cards={cardLayout}>
        <div className="nav-title">
          <span>标签</span>
          <Button
            disabled={!canEdit}
            aria-label="新建标签"
            title="新建标签"
            onClick={desktop ? addLibraryTag : undefined}
          >
            <Plus size={15} />
          </Button>
        </div>
        <div className="tag-list">
          {tagRows.map((tag, i) => (
            <div className={`tag-entry tag-tree-entry ${dropTag === tag.path ? "drop-target" : ""}`} style={{"--tag-depth":tag.depth}} key={tag.path}
              onDragOver={event => { if (event.dataTransfer.types.includes(INTERNAL_DRAG) && canEdit) { event.preventDefault(); event.dataTransfer.dropEffect="move"; setDropTag(tag.path); } }}
              onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropTag(null); }}
              onDrop={event => canEdit && dropAssetsOnTag(event, tag.path)}>
              <Button className="tag-toggle" disabled={!tag.hasChildren} onClick={() => setExpandedTags(current => { const next=new Set(current);next.has(tag.path)?next.delete(tag.path):next.add(tag.path);return next; })} aria-label={tag.hasChildren ? `${expandedTags.has(tag.path)?"收起":"展开"} ${tag.name}` : undefined}>
                {tag.hasChildren && <ChevronDown size={11}/>}
              </Button>
              <Button
                className={`tag-filter ${currentTag === tag.path ? "active" : ""}`}
                onClick={(event) => withViewTransition(() => {
                  setActiveModule("library");
                  setCurrentTag((current) => (current === tag.path ? null : tag.path));
                  setFilter("全部素材");
                  setActiveFolder(null);
                  setSelected(null);
                  setSelectedIds([]);
                }, { kind: "fade", point: { x: event.clientX, y: event.clientY } })}
              >
                <i className={`dot c${i % 4}`} />
                {tag.name}
              </Button>
              {desktop && tag.explicit && (
                <Button
                  className="tag-remove"
                  disabled={!canEdit}
                  aria-label={`删除标签 ${tag.path}`}
                  title="删除标签"
                  onClick={() => deleteLibraryTag(tag.path)}
                >
                  <X size={12} />
                </Button>
              )}
            </div>
          ))}
        </div>
        </SoftCard>
        </div>
        {desktop && library && (
          <SoftCard id="disk" cards={cardLayout}>
          <SidebarFooter
            info={diskInfo}
            recycleBinName={recycleBinName}
            openSupport={() => setSupportPanel(true)}
            openRecycle={async () => {
              const result = await window.nestDesktop.openRecycleBin();
              if (result?.error) {
                showMessage(`无法打开${recycleBinName}：${result.error}`, 3500);
              }
            }}
          />
          </SoftCard>
        )}
        </div>
        </SoftCard>
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
        style={{"--thumbnail-size": `${thumbnailSize ?? (viewMode === "compact" ? 145 : 190)}px`}}
        onScroll={(e) => {
          updateVirtualRange(e.currentTarget);
          // 滚动时暂停卡片的悬停效果：卡片从鼠标底下划过会不停触发上浮、阴影、按钮淡入，素材多时掉帧（LES-007）。
          // 直接改 DOM 的 class，不走 React 状态，免得每次滚动都重新渲染整个界面。
          const scroller = e.currentTarget;
          scroller.classList.add("is-scrolling");
          clearTimeout(scrollIdleTimer.current);
          scrollIdleTimer.current = setTimeout(() => scroller.classList.remove("is-scrolling"), 160);
        }}
        onClick={(event) => {
          // 点素材区空白处：收起文件夹详情（素材详情由框选逻辑取消选中）；框选拖动后的那次点击不算
          if (marqueeMoved.current) { marqueeMoved.current = false; return; }
          const target = event.target instanceof Element ? event.target : null;
          if (!target || (target !== event.currentTarget && !target.closest(".masonry, .empty-library-state"))) return;
          if (target.closest("article, button, input, textarea, select, a, label")) return;
          setFolderInspectorHidden(true);
        }}
        onContextMenu={(event) => {
          if (!desktop || !canEdit || activeModule !== "library") return;
          const target = event.target instanceof Element ? event.target : null;
          if (!target || (target !== event.currentTarget && !target.closest(".masonry, .empty-library-state"))) return;
          if (target.closest("article, button, input, textarea, select, a")) return;
          event.preventDefault();
          event.stopPropagation();
          setContextMenu({ kind: "blank", x: event.clientX, y: event.clientY, folderId: activeFolder || null });
        }}
      >
        <SoftCard id="header" cards={cardLayout} self>
        <header>
          <div className="breadcrumbs">
            {activeModule === "reference-board" ? (
              <><StickyNote size={15}/><strong>无限参考板</strong></>
            ) : (
              <>
                <Button className="breadcrumb-link" onClick={openLibraryRoot}>资源库</Button>
                {folderBreadcrumbs.map(folder => (
                  <React.Fragment key={folder.id}>
                    <b>›</b>
                    <Button className="breadcrumb-link" title={folder.name} onClick={(event) => openFolder(folder, event)}>{folder.name}</Button>
                  </React.Fragment>
                ))}
                {!activeFolder && <><b>›</b><strong>{filter}</strong></>}
              </>
            )}
          </div>
          {activeModule === "library" && <div className="search" data-tour="search">
            <Search size={18} />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(e) => {
                const nextQuery = e.target.value;
                withViewTransition(() => {
                  setQuery(nextQuery);
                  setAiResultIds(null);
                }, { kind: "fade", point: { x: e.clientX, y: e.clientY } });
              }}
              placeholder="搜索素材"
            />
            {(query || aiResultIds) && (
              <Button
                className="search-clear"
                aria-label="清除搜索"
                title="清除搜索"
                onClick={(event) => withViewTransition(() => {
                  setQuery("");
                  setAiResultIds(null);
                }, { kind: "fade", point: { x: event.clientX, y: event.clientY } })}
              >
                <X size={16} />
              </Button>
            )}
          </div>}
          <div className="top-action-strip" data-customizable-toolbar="true">
            {toolbarLayout.map(id => <React.Fragment key={id}>{toolbarButtonRenderers[id]?.()}</React.Fragment>)}
          </div>
          <Button
            className={`top-pill minimal-mode-toggle${minimalMode ? " on" : ""}`}
            title={minimalMode ? "退出极简模式" : "进入极简模式"}
            aria-label={minimalMode ? "退出极简模式" : "进入极简模式"}
            aria-pressed={minimalMode}
            onClick={() => setMinimalMode(value => !value)}
          >
            {minimalMode ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </Button>
        </header>
        </SoftCard>
        <div className="view-transition-content">
        {activeModule === "tetris" && (
          <TetrisModule
            close={() => {
              withViewTransition(() => {
                setSelected(null);
                setActiveModule("library");
              }, { kind: "module" });
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
            close={() => withViewTransition(() => setActiveModule("library"), { kind: "module" })}
            openAsset={(asset) => {
              withViewTransition(() => {
                setSelected(asset);
                setActiveModule("library");
              }, { kind: "module" });
            }}
          />
        )}
        <SoftCard id="toolbar" cards={cardLayout} self>
        <section
          className={`toolbar${sortPanel || filterPanel ? " popover-open" : ""}`}
          aria-hidden={minimalMode}
          inert={minimalMode}
        >
          <div
            className="toolbar-heading"
            key={`${activeFolder || "root"}:${activeFolder ? "" : filter}`}
          >
            <h1>{activeFolder ? currentFolder?.name : filter}</h1>
            <span>
              {contentFolders.length} 个文件夹 · {shown.length} 个素材
            </span>
            {activeAIFlowSync && (
              <span
                className={`aiflow-live-status ${activeAIFlowSync.enabled ? "enabled" : "disabled"}`}
                title="网页保持打开且已登录时，本地新增素材上传会立即唤醒 Edge；3 秒检查仅作断线兜底。网页素材每约 10 秒回拉。等待上传的素材会显示在卡片上。"
              >
                <RotateCw size={12} />
                AI Flow {activeAIFlowSync.enabled ? "实时同步已开启" : "实时同步已关闭"} · 新增即时上传 · 引用即时唤醒 · 3 秒兜底 · 回拉每 10 秒 · 待上传 {activeAIFlowSync.pending} 项
                {activeAIFlowSync.syncedAt ? ` · 目录对应于 ${new Date(activeAIFlowSync.syncedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : ""}
              </span>
            )}
          </div>
          <div className="view-actions" data-tour="organize">
            {activeFolder && (
              <Button
                onClick={openFolderParent}
              >
                <FolderOpen size={15} /> 返回上级
              </Button>
            )}
            <Button disabled={!canEdit} onClick={addFolder}>
              <Plus size={15} /> 新建根文件夹
            </Button>
            <Button
              className={allShownSelected ? "on" : ""}
              disabled={!shown.length}
              onClick={toggleSelectAll}
            >
              <LayoutGrid size={15} /> {allShownSelected ? "取消全选" : "全选"}
            </Button>
            <div className="popover-anchor">
              <Button
                className={sortPanel ? "on" : ""}
                onClick={() => {
                  setSortPanel((v) => !v);
                  setFilterPanel(false);
                }}
              >
                <ChevronDown size={15} />{" "}
                {SORT_OPTIONS.find((item) => item[0] === sortOrder)?.[1]}
              </Button>
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
              <Button
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
              </Button>
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
            <Button
              className="view-mode-button"
              title="切换视图"
              aria-label="切换视图"
              onClick={cycleViewMode}
            >
              <span className="view-mode-icon" key={viewMode}>
                {viewMode === "list" ? <List size={17} /> : viewMode === "compact" ? <Grid2X2 size={17} /> : <LayoutGrid size={17} />}
              </span>
              <span>
                {viewMode === "list"
                  ? "列表"
                  : viewMode === "compact"
                    ? "紧凑"
                    : "标准"}
              </span>
            </Button>
          </div>
        </section>
        </SoftCard>
        {contentFolders.length > 0 && (
          <section className="content-folders">
            {contentFolders.map((folder) => (
              <Button
                key={folder.id}
                className={dropFolderId === folder.id ? "drop-target" : ""}
                onClick={(event) => openFolder(folder, event)}
                onDoubleClick={(event) => openFolder(folder, event)}
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
              </Button>
            ))}
          </section>
        )}
        {shown.length ? (
          <section
            className="masonry"
            data-tour="assets"
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
                className={`${selected?.id === a.id ? "selected" : ""} ${selectedIdSet.has(a.id) ? "multi-selected" : ""} ${assetColor(a.labelColor) ? "has-color-mark" : ""}`}
                style={assetColor(a.labelColor) ? { "--asset-mark": assetColor(a.labelColor).value } : undefined}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelected(a);
                  setContextMenu({ x: e.clientX, y: e.clientY, asset: a });
                }}
                onDoubleClick={() => {
                  if (isExternalEditableAsset(a)) {
                    void openAssetAction(a.id);
                    return;
                  }
                  if (isTxtAsset(a)) {
                    void openAssetAction(a.id);
                    return;
                  }
                  setPreviewId(a.id);
                  resetPreviewView();
                }}
                onClick={(e) => clickAsset(e, a)}
              >
                <div
                  className="thumb"
                  title="拖动卡片可在软件内移动；按住 Alt 拖动可拖出软件"
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
                  <Button
                    className="select-dot"
                    aria-label="选择素材"
                    onClick={(e) => {
                      e.stopPropagation();
                      lastSelectedId.current = a.id;
                      toggleSelected(a.id);
                    }}
                  >
                    {selectedIdSet.has(a.id) ? "✓" : ""}
                  </Button>
                  <Button
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
                  </Button>
                  <div className="dimensions">
                    {a.width || "—"} × {a.height || "—"}
                  </div>
                </div>
                  <div className="meta" title="拖动名称可移动到内部文件夹">
                    <strong title={a.name}>{a.name}</strong>
                    {a.note?.trim() && <p className="asset-note" title={a.note.trim()}>{a.note.trim()}</p>}
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
                        <section className="empty-library-state" data-tour="assets" aria-label="空文件夹">
              <SoftEmptyIllustration />
              {query || currentTag || filter !== "全部素材" || hiddenFilterActive ? (
                <>
                  <h2>没有符合条件的素材</h2>
                  <p>{hiddenFilterActive && !query && !currentTag && filter === "全部素材" ? "当前有筛选条件（AI 搜索结果或类型/格式筛选）在隐藏素材。" : "尝试调整搜索内容或筛选条件。"}</p>
                  <div className="empty-library-actions">
                    <Button onClick={(event) => withViewTransition(() => { setQuery(""); setCurrentTag(null); setFilter("全部素材"); setAiResultIds(null); setQuickTypes([]); setQuickFormats([]); }, { kind: "fade", point: { x: event.clientX, y: event.clientY } })}>
                      清除所有筛选
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <h2>拖放文件到这里</h2>
                  <p>你可以一次拖拽多个文件到这里添加</p>
                  <div className="empty-library-actions">
                    <Button disabled={importing || !canEdit} onClick={desktop ? nativeImportFolder : () => input.current.click()}>
                      导入本地文件夹
                    </Button>
                    <Button disabled={!desktop} onClick={openExtensionPanel}>
                      安装浏览器扩展
                    </Button>
                  </div>
                </>
              )}
            </section>
          )
        )}
        </div>
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
      {folderInspectorOpen && currentFolder && (
        <aside className="folder-inspector" aria-label="文件夹详情">
          <div className="folder-inspector-name" title={currentFolder.name}>{currentFolder.name}</div>
          <div className="folder-inspector-description">
            {String(currentFolder.description || "").trim() || "描述"}
          </div>
          <section className="folder-inspector-section">
            <h2>基本信息</h2>
            <dl>
              <div><dt>文件数</dt><dd>{currentFolderStats.fileCount}</dd></div>
              <div><dt>占用空间</dt><dd>{formatFolderBytes(currentFolderStats.totalBytes)}</dd></div>
              <div><dt>添加日期</dt><dd>{currentFolder.createdAt ? new Date(currentFolder.createdAt).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}</dd></div>
            </dl>
          </section>
        </aside>
      )}      {inspectorFrame.ready && aiPanel && desktop && (
        <AIAssistant
          library={library}
          folder={currentFolder}
          selectedIds={
            selectedIds.length ? selectedIds : selected ? [selected.id] : []
          }
          query={query}
          filter={filter}
        close={toggleAiPanel}
          settings={() => openSettingsPanel("AI 与模型")}
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
                <Button
                  className="drop-import-cancel"
                  disabled={importCancelRequested}
                  onClick={cancelImport}
                >
                  {importCancelRequested ? "正在取消…" : "取消导入"}
                </Button>
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
          <Button disabled={!canEdit} onClick={() => batchUpdate({ favorite: true })}>
            <Heart size={15} /> 收藏
          </Button>
          <Button disabled={!canEdit} onClick={batchTag}>
            <Tag size={15} /> 标签
          </Button>
          <Button disabled={!canEdit} onClick={batchMove}>
            <Folder size={15} /> 移动
          </Button>
          <Button disabled={!canEdit} onClick={() => setBatchRenamePanel(true)}>
            <Pencil size={15} /> 重命名
          </Button>
          <Button disabled={!canEdit} onClick={batchRating}>
            <Star size={15} /> 评分
          </Button>
          <Button disabled={!canEdit} onClick={batchNote}>
            <StickyNote size={15} /> 备注
          </Button>
          <Button disabled={!canEdit} className="danger" onClick={batchDelete}>
            <Trash2 size={15} /> 删除
          </Button>
          <Button className="batch-bar-clear" aria-label="取消选择" onClick={() => setSelectedIds([])}>
            <X size={16} />
          </Button>
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
          canEdit={canEdit}
          saveText={saveTextDocument}
          openExternal={() => openExternalAssetAction(previewAsset.id)}
          exportAsset={(id) => exportAssetAction(id)}
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
            <Button
              autoFocus
              className="primary"
              disabled={libraryChoosing}
              onClick={createLibrary}
            >
              {libraryChoosing ? "正在选择…" : "创建资源库"}
            </Button>
            <Button disabled={libraryChoosing} onClick={openLibrary}>
              打开已有资源库
            </Button>
          </div>
        </div>
      )}
      {contextMenu?.kind === "folder" ? (
        <FolderContextMenu
          readOnly={!canEdit}
          menu={contextMenu}
          menuRef={contextMenuRef}
          flyoutRef={contextMenuFlyoutRef}
          close={() => setContextMenu(null)}
          actions={{
            open: () => {
              setAiResultIds(null);
              setFilter("全部素材");
              setActiveFolder(contextMenu.folder.id);
              setSelected(null);
            },
            add: () => addFolderAt(contextMenu.folder.id),
            uploadToAIFlow: desktop ? () => beginAIFlowFolderExtensionUpload(contextMenu.folder) : null,
            toggleLiveSync: desktop && aiFlowLiveRootForFolder(contextMenu.folder) ? () => toggleAIFlowLiveSync(contextMenu.folder) : null,
            rename: () => renameFolder(contextMenu.folder),
            appearance: (changes) => updateFolderAppearance(contextMenu.folder, changes),
            toggleCurrent: () => toggleFolderExpansionScope(contextMenu.folder, "current"),
            toggleSiblings: () => toggleFolderExpansionScope(contextMenu.folder, "siblings"),
            toggleAll: () => toggleFolderExpansionScope(contextMenu.folder, "all"),
            forward: desktop ? () => openForward({ folderIds: [contextMenu.folder.id] }) : null,
            delete: () => deleteFolder(contextMenu.folder),
          }}
          expansion={{
            currentIds: folderExpansionIds(contextMenu.folder, "current"),
            siblingIds: folderExpansionIds(contextMenu.folder, "siblings"),
            allIds: folderExpansionIds(contextMenu.folder, "all"),
            expandedFolderIds,
          }}
          liveSyncEnabled={aiFlowLiveSyncEnabledForFolder(contextMenu.folder)}
        />
      ) : contextMenu?.kind === "blank" ? (
        <BlankContextMenu
          menu={contextMenu}
          menuRef={contextMenuRef}
          close={() => setContextMenu(null)}
          create={(kind) => createDocument(kind, contextMenu.folderId)}
        />
      ) : (
        contextMenu && (
          <AssetContextMenu
            readOnly={!canEdit}
            menu={contextMenu}
            menuRef={contextMenuRef}
            submenuRef={contextMenuFlyoutRef}
            folders={allOrderedFolders}
            friends={lanFriends.filter(peer => peer.online)}
            close={() => setContextMenu(null)}
            actions={{
              open: () => openAssetAction(contextMenu.asset.id),
              preview: () => {
                if (isTxtAsset(contextMenu.asset)) {
                  void openAssetAction(contextMenu.asset.id);
                  return;
                }
                setPreviewId(contextMenu.asset.id);
                setZoom(1);
              },
              tag: () => contextTag(contextMenu.asset),
              note: () => contextNote(contextMenu.asset),
              // 右键的素材在多选里时，颜色一起标给所有选中的素材
              color: (labelColor) => {
                if (selectedIdSet.has(contextMenu.asset.id) && selectedIds.length > 1) void batchUpdate({ labelColor });
                else patch(contextMenu.asset.id, { labelColor });
              },
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
                showMessage(result?.error || "所在目录已复制", 2500);
              },
              copyPath: async () => {
                const result = await window.nestDesktop.copyAssetPath(
                  contextMenu.asset.id,
                );
                if (result?.error) showMessage(result.error);
                else {
                  if (result?.library) applyLibrary(result.library);
                  showMessage("文件路径已复制");
                }
                clearMessageAfter(2500);
              },
              uploadToAIFlow: desktop ? () => beginAIFlowExtensionUpload(contextMenu.asset) : null,
              sendToFriend: desktop ? async peerId => {
                const ids = selectedIds.includes(contextMenu.asset.id) ? selectedIds : [contextMenu.asset.id];
                showMessage(`正在发送 ${ids.length} 个素材…`);
                const result = await window.nestDesktop.peerChat.assets({ peerId, ids });
                showMessage(result?.error || `已发送 ${result?.sent || 0} 个素材`, 5000);
              } : null,
              forward: desktop ? () => openForward({ assetIds: selectedIds.includes(contextMenu.asset.id) ? selectedIds : [contextMenu.asset.id] }) : null,
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
            if (result?.error) showMessage(result.error);
            else setPlugins(result.plugins || []);
          }}
          close={() => setExtensionPanel(false)}
        />
      )}
      {friendToolsOpen && (
        <FriendToolsDialog
          platform={window.nestDesktop?.platform}
          close={() => { if (!friendToolBusy) setFriendToolsOpen(false); }}
          busy={friendToolBusy}
          error={friendToolError}
          launchCursorPicker={async () => {
            setFriendToolBusy(true);
            setFriendToolError("");
            try {
              const result = await window.nestDesktop.openCursorPicker();
              if (result?.error) setFriendToolError(result.error);
              else {
                setFriendToolsOpen(false);
                showMessage("已启动 macOS 指针管家", 2500);
              }
            } catch (error) {
              setFriendToolError(error.message || "启动失败");
            } finally {
              setFriendToolBusy(false);
            }
          }}
          launchDepthVideoConverter={async () => {
            setFriendToolBusy(true);
            setFriendToolError("");
            try {
              const result = await window.nestDesktop.openDepthVideoConverter();
              if (result?.error) setFriendToolError(result.error);
              else {
                setFriendToolsOpen(false);
                showMessage("已启动深度视频转换器，将自动识别随包模型", 4500);
              }
            } catch (error) {
              setFriendToolError(error.message || "深度视频转换器启动失败");
            } finally {
              setFriendToolBusy(false);
            }
          }}
        />
      )}
      {aiSettingsPanel && (
        <AISettings
          initialTab={settingsInitialTab}
          close={() => {
            setAiSettingsPanel(false);
          }}
          library={library}
          diskInfo={diskInfo}
          resolvedThemeMode={resolvedThemeMode}
          checkUpdate={checkUpdate}
          updateInfo={updateInfo}
          updateChecking={updateChecking}
          deleteCurrentLibrary={deleteCurrentLibrary}
          autoUpdate={autoUpdate}
          toolbarLayout={toolbarLayout}
          onToolbarLayoutChange={saveToolbarLayout}
          floatingCardCount={cardLayout.floatingCount}
          onResetCardLayout={cardLayout.resetAll}
        />
      )}
      {aboutPanel && <AboutDialog close={() => setAboutPanel(false)} version={APP_VERSION} />}
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
      {usageDemoOpen && (
        <UsageDemoDialog
          close={() => setUsageDemoOpen(false)}
          openTour={() => {
            setUsageDemoOpen(false);
            startOnboarding();
          }}
        />
      )}
      {onboardingOpen && (
        <OnboardingTour
          onClose={() => {
            localStorage.setItem(onboardingSeenKey, "seen");
            setOnboardingOpen(false);
          }}
        />
      )}
      {finderOpen && <LibraryFinderDialog
        close={() => setFinderOpen(false)}
        added={() => { void refreshRecentLibraries().catch(() => {}); }}
        openFound={async (item) => {
          setFinderOpen(false);
          await chooseLibrary(() => window.nestDesktop.libraryFinder.open(item.path));
        }}
      />}
      {forwardPanel && <ForwardDialog
        libraries={recentLibraries.filter(item => !item.current)}
        assetCount={forwardPanel.assetIds.length}
        folderCount={forwardPanel.folderIds.length}
        assetIds={forwardPanel.assetIds}
        folderIds={forwardPanel.folderIds}
        close={() => setForwardPanel(null)}
        done={(result) => showMessage(`已转发 ${result.copied} 个素材到「${result.targetName}」`, 4000)}
      />}
      {teamPanel && <TeamPanel library={library} close={() => setTeamPanel(false)} changed={(team) => setLibrary((current) => current ? {...current, team} : current)} />}
      <div className="soft-float-layer" ref={cardLayout.setLayer} />
      {cardLayout.editing && (
        <div className="soft-layout-bar" role="toolbar" aria-label="编辑布局">
          <span className="soft-layout-bar-hint">
            <LayoutDashboard size={15} />
            {cardLayout.dirty ? "有改动还没保存" : cardLayout.crazy ? "疯狂模式：把卡片拖出窗口就能放到桌面上" : "拖动卡片换位置 · 右下角拉大小 · 拖回侧栏放回"}
          </span>
          <Button
            className={`soft-layout-crazy ${cardLayout.crazy ? "on" : ""}`}
            role="switch"
            aria-checked={cardLayout.crazy}
            title={cardLayout.crazy ? "关掉疯狂模式（桌面上的卡片都回到素材库）" : "打开后可以把卡片拖出素材库窗口，放在桌面任意位置"}
            onClick={() => cardLayout.setCrazy(!cardLayout.crazy)}
          >
            <Zap size={14} /> 疯狂模式 <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
          </Button>
          <Button className="soft-layout-reset" onClick={cardLayout.resetDraft} title="卡片全部放回侧栏（保存后生效）"><RotateCcw size={14} /> 一键重置</Button>
          <Button className="soft-layout-cancel" onClick={cardLayout.cancel} title="放弃这次的改动">取消</Button>
          <Button className="soft-layout-save" onClick={cardLayout.save}><Check size={14} /> 保存</Button>
        </div>
      )}
      {desktop && window.nestDesktop?.platform === "win32" && <WindowControls />}
      {teamLibraryOpen && <TeamLibraryPanel close={() => setTeamLibraryOpen(false)} onLibraryOpened={(lib) => {
        applyLibrary(lib, { reset: true });
        setTeamLibraryOpen(false);
        void refreshRecentLibraries().catch(() => {});
      }} />}
      {batchRenamePanel && <BatchRenameDialog assets={selectedIds.map(id => assets.find(asset => asset.id === id)).filter(Boolean)} folders={library?.folders || []} close={() => setBatchRenamePanel(false)} apply={batchRename} />}
      {shouldShowBugFeedback && (
        <Button
          className="bug-feedback"
          title="在软件内打开腾讯文档 Bug 反馈表"
          onClick={async () => {
            const result = await window.nestDesktop?.openBugFeedback();
            if (result?.error) {
              showMessage(result.error, 4000);
            }
          }}
        >
          <Bug size={16} />
          <span>Bug 反馈</span>
        </Button>
      )}
    </div>
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
          <Button type="button" onClick={focusGame} title="将键盘操作交给游戏">
            <Play size={13} />
            <span>聚焦游戏</span>
          </Button>
          <Button type="button" onClick={close} title="返回素材库">
            <X size={14} />
            <span>返回素材库</span>
          </Button>
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

createRoot(document.getElementById("root")).render(<ErrorBoundary><ReadyUI><App /></ReadyUI></ErrorBoundary>);
