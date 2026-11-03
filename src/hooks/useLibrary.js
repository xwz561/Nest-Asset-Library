import { useState, useRef, useEffect } from "react";
import { clampSidebarWidth, SIDEBAR_WIDTH_KEY, VIEW_MODES, VIEW_MODE_KEY, seed } from "../lib/app-config.js";
import { defaultExpandedFolderIds } from "../folder-tree.js";
import { getAssets, readPending, saveAsset, clearPending } from "../lib/browser-library.js";

export function useLibrary({ desktop, showMessage }) {
  const [assets, setAssets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [currentTag, setCurrentTag] = useState(null);
  const [filter, setFilter] = useState("最近");
  const [drag, setDrag] = useState(false);
  const [ready, setReady] = useState(false);
  const [library, setLibrary] = useState(null);
  const [activeFolder, setActiveFolder] = useState(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState(() => new Set());
  const [sidebarWidth, setSidebarWidth] = useState(() =>
      clampSidebarWidth(localStorage.getItem(SIDEBAR_WIDTH_KEY)),
    );
  const [sortOrder, setSortOrder] = useState("recent");
  const [viewMode, setViewMode] = useState(() =>
      VIEW_MODES.includes(localStorage.getItem(VIEW_MODE_KEY))
        ? localStorage.getItem(VIEW_MODE_KEY)
        : "standard",
    );
  const [selectedIds, setSelectedIds] = useState([]);
  const [marquee, setMarquee] = useState(null);
  const [dropFolderId, setDropFolderId] = useState(undefined);
  const [virtualRange, setVirtualRange] = useState({ start: 0, end: 200, before: 0, after: 0 });
  const [libraryChoosing, setLibraryChoosing] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState(null);
  const [activeReferenceBoardId, setActiveReferenceBoardId] = useState(null);
  const [diskInfo, setDiskInfo] = useState(null);
  const [expandedTags, setExpandedTags] = useState(() => new Set());
  const [dropTag, setDropTag] = useState(null);
  const assetsRef = useRef([]);
useEffect(() => {
    if (desktop) {
      window.nestDesktop
        .currentLibrary()
        .then((lib) => {
          if (lib) {
            setLibrary(lib);
            setExpandedFolderIds(defaultExpandedFolderIds(lib.folders));
            assetsRef.current = lib.assets;
            setAssets(lib.assets);
          }
        })
        .catch((error) => showMessage(`打开资源库失败：${error.message}`))
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
          showMessage(`无法拖出素材：${error}`, 5000);
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
  return { assets, setAssets, selected, setSelected, query, setQuery, currentTag, setCurrentTag, filter, setFilter, drag, setDrag, ready, setReady, library, setLibrary, activeFolder, setActiveFolder, expandedFolderIds, setExpandedFolderIds, sidebarWidth, setSidebarWidth, sortOrder, setSortOrder, viewMode, setViewMode, selectedIds, setSelectedIds, marquee, setMarquee, dropFolderId, setDropFolderId, virtualRange, setVirtualRange, libraryChoosing, setLibraryChoosing, renamingFolder, setRenamingFolder, activeReferenceBoardId, setActiveReferenceBoardId, diskInfo, setDiskInfo, expandedTags, setExpandedTags, dropTag, setDropTag, assetsRef };
}
