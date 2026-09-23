import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  FolderPlus,
  GripHorizontal,
  LayoutGrid,
  Lock,
  LockOpen,
  Map as MapIcon,
  Maximize2,
  Minus,
  MousePointer2,
  EyeOff,
  Plus,
  Redo2,
  RotateCcw,
  StickyNote,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

const ASSET_DRAG_MIME = "application/x-nest-asset-ids";
const PICKER_PAGE_SIZE = 120;
const GROUP_COLORS = ["#2f7dff", "#25b899", "#bd7aff", "#e4973d", "#dc6275", "#54a7d6"];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const cloneBoard = (board) => board ? {
  ...board,
  camera: { ...(board.camera || { x: 0, y: 0, zoom: 1 }) },
  groups: (board.groups || []).map((group) => ({ ...group })),
  items: (board.items || []).map((item) => ({ ...item })),
  connections: (board.connections || []).map((connection) => ({ ...connection })),
} : null;
const boardItemId = (prefix = "node") => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function BoardMedia({ asset }) {
  if (asset.type?.startsWith("video")) return <video src={asset.url} muted loop playsInline preload="metadata" />;
  if (asset.type?.startsWith("audio")) return <div className="reference-board-file"><span>♪</span><small>音频素材</small></div>;
  if (asset.type?.startsWith("text") || asset.type === "application/pdf" || asset.documentFormat === "DOCX") {
    return <div className="reference-board-file"><FileText size={30}/><small>{asset.documentFormat || "文档"}</small></div>;
  }
  return <img src={asset.url || undefined} alt={asset.name || ""} draggable={false} loading="lazy" />;
}

function dragAssetIds(event, assetsById) {
  try {
    const values = JSON.parse(event.dataTransfer.getData(ASSET_DRAG_MIME) || "[]");
    return [...new Set((Array.isArray(values) ? values : []).map(String))].filter((id) => assetsById.has(id));
  } catch {
    return [];
  }
}

function hasAssetDrag(event) {
  return Array.from(event.dataTransfer?.types || []).includes(ASSET_DRAG_MIME);
}

export default function ReferenceBoard({
  boards,
  assets,
  folders = [],
  preferredFolderId = null,
  canEdit,
  activeBoardId,
  setActiveBoardId,
  createBoard,
  updateBoard,
  deleteBoard,
  close,
  openAsset,
}) {
  const board = boards.find((item) => item.id === activeBoardId) || boards[0] || null;
  const [draft, setDraft] = useState(() => cloneBoard(board));
  const [pickerOpen, setPickerOpen] = useState(true);
  const [assetDockHeight, setAssetDockHeight] = useState(178);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerLimit, setPickerLimit] = useState(PICKER_PAGE_SIZE);
  const [pickerFolderId, setPickerFolderId] = useState(preferredFolderId || "");
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState(() => new Set());
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkSourceId, setLinkSourceId] = useState(null);
  const [canvasDropActive, setCanvasDropActive] = useState(false);
  const [marquee, setMarquee] = useState(null);
  const [newBoardName, setNewBoardName] = useState("新参考板");
  const canvasRef = useRef(null);
  const assetDockRef = useRef(null);
  const pickerSearchRef = useRef(null);
  const interaction = useRef(null);
  const assetDockResize = useRef(null);
  const latestDraft = useRef(draft);
  const currentItemsRef = useRef([]);
  const saveTimer = useRef(null);
  const inertiaFrame = useRef(0);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [miniVisible, setMiniVisible] = useState(true);
  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const foldersById = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);

  useEffect(() => {
    const next = cloneBoard(board);
    latestDraft.current = next;
    setDraft(next);
    setSelectedNodeId(null);
    setSelectedNodeIds(new Set());
    setSelectedGroupId(null);
    setLinkMode(false);
    setLinkSourceId(null);
    history.current.undo = [];
    history.current.redo = [];
    setCanUndo(false);
    setCanRedo(false);
  }, [board?.id, board?.updatedAt]);

  useEffect(() => {
    setPickerFolderId(preferredFolderId || "");
  }, [board?.id, preferredFolderId]);

  useEffect(() => () => {
    clearTimeout(saveTimer.current);
    cancelAnimationFrame(inertiaFrame.current);
    document.body.classList.remove("reference-board-interacting", "reference-board-selecting");
  }, []);

  useEffect(() => {
    const resize = (event) => {
      const action = assetDockResize.current;
      if (!action) return;
      const maxHeight = Math.max(128, action.canvasRect.height - 24);
      setAssetDockHeight(clamp(action.height + action.startY - event.clientY, 128, maxHeight));
    };
    const finish = () => {
      if (!assetDockResize.current) return;
      assetDockResize.current = null;
      document.body.classList.remove("reference-board-interacting");
    };
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, []);

  const scheduleSave = (next) => {
    if (!next || !canEdit) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void updateBoard(next.id, {
        name: next.name,
        camera: next.camera,
        groups: next.groups,
        items: next.items,
        connections: next.connections,
      });
    }, 260);
  };
  const updateDraft = (recipe, persist = true) => {
    setDraft((current) => {
      if (!current) return current;
      const next = recipe(current);
      latestDraft.current = next;
      if (persist) scheduleSave(next);
      return next;
    });
  };
  const history = useRef({ undo: [], redo: [] });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const syncHistoryButtons = () => {
    setCanUndo(history.current.undo.length > 0);
    setCanRedo(history.current.redo.length > 0);
  };
  const pushHistory = () => {
    if (!canEdit || !latestDraft.current) return;
    history.current.undo.push(cloneBoard(latestDraft.current));
    if (history.current.undo.length > 120) history.current.undo.shift();
    history.current.redo.length = 0;
    syncHistoryButtons();
  };
  const commitDraft = (recipe) => {
    if (!canEdit || !latestDraft.current) { updateDraft(recipe); return; }
    pushHistory();
    updateDraft(recipe);
  };
  const restoreDraft = (snapshot) => {
    setDraft((current) => {
      const next = cloneBoard(snapshot);
      if (current) next.camera = current.camera;
      latestDraft.current = next;
      scheduleSave(next);
      return next;
    });
  };
  const undo = () => {
    if (!canEdit || !history.current.undo.length) return;
    const snapshot = history.current.undo.pop();
    history.current.redo.push(cloneBoard(latestDraft.current));
    syncHistoryButtons();
    restoreDraft(snapshot);
  };
  const redo = () => {
    if (!canEdit || !history.current.redo.length) return;
    const snapshot = history.current.redo.pop();
    history.current.undo.push(cloneBoard(latestDraft.current));
    syncHistoryButtons();
    restoreDraft(snapshot);
  };
  const currentItems = draft?.items || [];
  currentItemsRef.current = currentItems;
  const currentGroups = draft?.groups || [];
  const currentConnections = draft?.connections || [];
  const groupColorById = useMemo(() => new Map(currentGroups.map((group) => [group.id, group.color])), [currentGroups]);
  const miniGeo = useMemo(() => {
    if (!currentItems.length && !currentGroups.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const item of currentItems) {
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + item.width);
      maxY = Math.max(maxY, item.y + clamp(item.width * 0.54, 135, 230));
    }
    for (const group of currentGroups) {
      minX = Math.min(minX, group.x);
      minY = Math.min(minY, group.y);
      maxX = Math.max(maxX, group.x + group.width);
      maxY = Math.max(maxY, group.y + group.height);
    }
    const pad = 80;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;
    const contentW = Math.max(1, maxX - minX);
    const contentH = Math.max(1, maxY - minY);
    const miniW = 200;
    const miniH = 150;
    const scale = Math.min(miniW / contentW, miniH / contentH);
    return {
      minX,
      minY,
      scale,
      offsetX: (miniW - contentW * scale) / 2,
      offsetY: (miniH - contentH * scale) / 2,
      miniW,
      miniH,
    };
  }, [currentItems, currentGroups]);
  const selectedNode = currentItems.find((item) => item.id === selectedNodeId) || null;
  const currentItemsById = useMemo(() => new Map(currentItems.map((item) => [item.id, item])), [currentItems]);
  const groupItemCounts = useMemo(() => {
    const counts = new Map();
    currentItems.forEach((item) => counts.set(item.groupId, (counts.get(item.groupId) || 0) + 1));
    return counts;
  }, [currentItems]);
  const matchingAssets = useMemo(() => {
    const needle = pickerQuery.trim().toLowerCase();
    return assets.filter((asset) => {
      const inFolder = !pickerFolderId || (pickerFolderId === "__unfiled__" ? !asset.folderId : asset.folderId === pickerFolderId);
      return inFolder && (!needle || `${asset.name} ${(asset.tags || []).join(" ")}`.toLowerCase().includes(needle));
    });
  }, [assets, pickerFolderId, pickerQuery]);
  const visibleAssets = useMemo(() => matchingAssets.slice(0, pickerLimit), [matchingAssets, pickerLimit]);

  useEffect(() => {
    setPickerLimit(PICKER_PAGE_SIZE);
  }, [pickerFolderId, pickerQuery]);

  useEffect(() => {
    const handleShortcut = (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "Escape") {
        setLinkMode(false);
        setLinkSourceId(null);
        setSelectedNodeId(null);
        setSelectedNodeIds(new Set());
        setSelectedGroupId(null);
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectedNodeIds(new Set(currentItemsRef.current.map((item) => item.id)));
        setSelectedNodeId(currentItemsRef.current.at(-1)?.id || null);
        setSelectedGroupId(null);
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setPickerOpen(true);
        requestAnimationFrame(() => pickerSearchRef.current?.focus());
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setCanvasSize({ width: rect.width, height: rect.height });
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [board?.id]);

  const stopInertia = () => {
    cancelAnimationFrame(inertiaFrame.current);
    inertiaFrame.current = 0;
  };
  const startInertia = (velocityX, velocityY) => {
    if (!canEdit || Math.hypot(velocityX, velocityY) < 0.05) {
      scheduleSave(latestDraft.current);
      return;
    }
    stopInertia();
    let vx = velocityX;
    let vy = velocityY;
    let previous = performance.now();
    const tick = (now) => {
      const elapsed = Math.min(34, Math.max(1, now - previous));
      previous = now;
      const friction = Math.pow(0.915, elapsed / 16.67);
      vx *= friction;
      vy *= friction;
      updateDraft((current) => ({
        ...current,
        camera: { ...current.camera, x: current.camera.x + vx * elapsed, y: current.camera.y + vy * elapsed },
      }), false);
      if (Math.hypot(vx, vy) < 0.018) {
        inertiaFrame.current = 0;
        scheduleSave(latestDraft.current);
        return;
      }
      inertiaFrame.current = requestAnimationFrame(tick);
    };
    inertiaFrame.current = requestAnimationFrame(tick);
  };
  const finishInteraction = () => {
    const action = interaction.current;
    if (!action) return;
    interaction.current = null;
    document.body.classList.remove("reference-board-interacting", "reference-board-selecting");
    if (action.kind === "marquee") {
      const bounds = action.bounds;
      if (bounds) {
        const camera = action.camera;
        const ids = currentItems.filter((item) => {
          const point = nodePoint(item);
          const x = action.canvasRect.left + action.canvasRect.width / 2 + camera.x + point.x * camera.zoom;
          const y = action.canvasRect.top + action.canvasRect.height / 2 + camera.y + point.y * camera.zoom;
          return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
        }).map((item) => item.id);
        setSelectedNodeIds(new Set(ids));
        setSelectedNodeId(ids.at(-1) || null);
      }
      setMarquee(null);
    } else if (action.kind === "pan") startInertia(action.velocityX || 0, action.velocityY || 0);
    else scheduleSave(latestDraft.current);
  };

  useEffect(() => {
    const move = (event) => {
      const action = interaction.current;
      if (!action) return;
      if (action.kind === "pan") {
        const dx = event.clientX - action.startClientX;
        const dy = event.clientY - action.startClientY;
        const now = performance.now();
        const elapsed = Math.max(1, now - action.lastTime);
        action.velocityX = clamp((event.clientX - action.lastClientX) / elapsed, -3.2, 3.2);
        action.velocityY = clamp((event.clientY - action.lastClientY) / elapsed, -3.2, 3.2);
        action.lastClientX = event.clientX;
        action.lastClientY = event.clientY;
        action.lastTime = now;
        updateDraft((current) => ({ ...current, camera: { ...action.camera, x: action.camera.x + dx, y: action.camera.y + dy } }), false);
      } else if (action.kind === "marquee") {
        const left = Math.min(action.startClientX, event.clientX);
        const top = Math.min(action.startClientY, event.clientY);
        const width = Math.abs(event.clientX - action.startClientX);
        const height = Math.abs(event.clientY - action.startClientY);
        action.bounds = { left, top, right: left + width, bottom: top + height };
        setMarquee({ left, top, width, height });
      } else if (action.kind === "node") {
        const zoom = latestDraft.current?.camera?.zoom || 1;
        const dx = (event.clientX - action.startClientX) / zoom;
        const dy = (event.clientY - action.startClientY) / zoom;
        if (!action.committed) {
          pushHistory();
          action.committed = true;
          const nextZ = Math.max(0, ...currentItemsRef.current.map((node) => Number(node.zIndex) || 0)) + 1;
          updateDraft((current) => ({
            ...current,
            items: current.items.map((node) => node.id === action.nodeId ? { ...node, zIndex: nextZ, x: action.x + dx, y: action.y + dy } : node),
          }), false);
        } else {
          updateDraft((current) => ({
            ...current,
            items: current.items.map((item) => item.id === action.nodeId ? { ...item, x: action.x + dx, y: action.y + dy } : item),
          }), false);
        }
      } else if (action.kind === "group") {
        const zoom = latestDraft.current?.camera?.zoom || 1;
        const dx = (event.clientX - action.startClientX) / zoom;
        const dy = (event.clientY - action.startClientY) / zoom;
        if (!action.committed) { pushHistory(); action.committed = true; }
        updateDraft((current) => ({
          ...current,
          groups: current.groups.map((group) => group.id === action.groupId ? { ...group, x: action.x + dx, y: action.y + dy } : group),
          items: current.items.map((item) => item.groupId === action.groupId
            ? { ...item, x: action.nodePositions.get(item.id).x + dx, y: action.nodePositions.get(item.id).y + dy }
            : item),
        }), false);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finishInteraction);
    window.addEventListener("pointercancel", finishInteraction);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finishInteraction);
      window.removeEventListener("pointercancel", finishInteraction);
    };
  });

  const startPan = (event) => {
    if (!draft || event.button !== 1 || event.target !== event.currentTarget) return;
    event.preventDefault();
    stopInertia();
    interaction.current = {
      kind: "pan",
      startClientX: event.clientX,
      startClientY: event.clientY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      lastTime: performance.now(),
      velocityX: 0,
      velocityY: 0,
      camera: { ...draft.camera },
    };
    document.body.classList.add("reference-board-interacting");
  };
  const startMarquee = (event) => {
    if (!draft || event.button !== 0 || event.target !== event.currentTarget) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    interaction.current = {
      kind: "marquee",
      startClientX: event.clientX,
      startClientY: event.clientY,
      canvasRect: rect,
      camera: { ...draft.camera },
      bounds: { left: event.clientX, top: event.clientY, right: event.clientX, bottom: event.clientY },
    };
    setMarquee({ left: event.clientX, top: event.clientY, width: 0, height: 0 });
    document.body.classList.add("reference-board-interacting reference-board-selecting");
  };
  const startCanvasPointer = (event) => {
    if (event.button === 1) startPan(event);
    else if (event.button === 0) startMarquee(event);
  };
  const startNodeDrag = (event, item) => {
    if (event.button !== 0) return;
    if (linkMode) {
      event.preventDefault();
      event.stopPropagation();
      if (!linkSourceId) {
        setLinkSourceId(item.id);
        setSelectedNodeId(item.id);
        setSelectedNodeIds(new Set([item.id]));
        return;
      }
      if (linkSourceId === item.id) {
        setLinkSourceId(null);
        return;
      }
      commitDraft((current) => {
        const exists = current.connections.some((connection) =>
          (connection.fromId === linkSourceId && connection.toId === item.id)
          || (connection.fromId === item.id && connection.toId === linkSourceId));
        return exists ? current : {
          ...current,
          connections: [...current.connections, { id: boardItemId("connection"), fromId: linkSourceId, toId: item.id }],
        };
      });
      setSelectedNodeId(item.id);
      setSelectedNodeIds(new Set([item.id]));
      setLinkSourceId(null);
      setLinkMode(false);
      return;
    }
    if (!canEdit || item.locked || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    stopInertia();
    setSelectedNodeId(item.id);
    setSelectedNodeIds((current) => {
      if (!event.shiftKey) return new Set([item.id]);
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
    setSelectedGroupId(null);
    interaction.current = { kind: "node", nodeId: item.id, startClientX: event.clientX, startClientY: event.clientY, x: item.x, y: item.y, committed: false };
    document.body.classList.add("reference-board-interacting");
  };
  const startGroupDrag = (event, group) => {
    if (!canEdit || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    stopInertia();
    setSelectedGroupId(group.id);
    setSelectedNodeId(null);
    setSelectedNodeIds(new Set());
    interaction.current = {
      kind: "group",
      groupId: group.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      x: group.x,
      y: group.y,
      nodePositions: new Map(currentItems.filter((item) => item.groupId === group.id).map((item) => [item.id, { x: item.x, y: item.y }])),
    };
    document.body.classList.add("reference-board-interacting");
  };
  const zoomAt = (event) => {
    if (!draft) return;
    event.preventDefault();
    stopInertia();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const oldZoom = draft.camera.zoom;
    const nextZoom = clamp(oldZoom * Math.exp(-event.deltaY * 0.0012), 0.2, 3);
    const cursorX = event.clientX - rect.left - rect.width / 2;
    const cursorY = event.clientY - rect.top - rect.height / 2;
    updateDraft((current) => ({
      ...current,
      camera: {
        x: cursorX - ((cursorX - current.camera.x) * nextZoom) / current.camera.zoom,
        y: cursorY - ((cursorY - current.camera.y) * nextZoom) / current.camera.zoom,
        zoom: nextZoom,
      },
    }));
  };
  const canvasPoint = (event) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const camera = latestDraft.current?.camera;
    if (!rect || !camera) return { x: 0, y: 0 };
    return {
      x: (event.clientX - rect.left - rect.width / 2 - camera.x) / camera.zoom,
      y: (event.clientY - rect.top - rect.height / 2 - camera.y) / camera.zoom,
    };
  };
  const startAssetDockResize = (event) => {
    if (event.button !== 0) return;
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const dockRect = assetDockRef.current?.getBoundingClientRect();
    if (!canvasRect || !dockRect) return;
    event.preventDefault();
    event.stopPropagation();
    assetDockResize.current = {
      startX: event.clientX,
      startY: event.clientY,
      height: dockRect.height,
      canvasRect,
    };
    document.body.classList.add("reference-board-interacting");
  };
  const addAssetsAt = (assetIds, point = null) => {
    if (!draft || !canEdit) return;
    const knownIds = [...new Set(assetIds.map(String))].filter((id) => assetsById.has(id)).slice(0, Math.max(0, 1000 - currentItems.length));
    if (!knownIds.length) return;
    const center = point || { x: -draft.camera.x / draft.camera.zoom, y: -draft.camera.y / draft.camera.zoom };
    const highestZ = Math.max(0, ...currentItems.map((item) => Number(item.zIndex) || 0));
    const nodes = knownIds.map((assetId, index) => ({
      id: boardItemId(),
      assetId,
      x: center.x + (index % 4) * 38 - 70,
      y: center.y + Math.floor(index / 4) * 34 - 60,
      width: 260,
      rotation: 0,
      zIndex: highestZ + index + 1,
      note: "",
      locked: false,
      groupId: "",
    }));
    commitDraft((current) => ({ ...current, items: [...current.items, ...nodes] }));
    setSelectedNodeId(nodes[nodes.length - 1].id);
    setSelectedNodeIds(new Set(nodes.map((node) => node.id)));
    setSelectedGroupId(null);
  };
  const removeNode = (nodeId) => {
    commitDraft((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== nodeId),
      connections: current.connections.filter((connection) => connection.fromId !== nodeId && connection.toId !== nodeId),
    }));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    setSelectedNodeIds((current) => {
      const next = new Set(current);
      next.delete(nodeId);
      return next;
    });
  };
  const makeGroup = () => {
    if (!draft || !canEdit) return;
    const id = boardItemId("group");
    const targets = currentItems.filter((item) => selectedNodeIds.has(item.id));
    const target = targets[0] || selectedNode;
    const center = target ? { x: target.x, y: target.y } : { x: -draft.camera.x / draft.camera.zoom, y: -draft.camera.y / draft.camera.zoom };
    const left = targets.length ? Math.min(...targets.map((item) => item.x)) : center.x;
    const top = targets.length ? Math.min(...targets.map((item) => item.y)) : center.y;
    const right = targets.length ? Math.max(...targets.map((item) => item.x + item.width)) : center.x + (target?.width || 260);
    const bottom = targets.length ? Math.max(...targets.map((item) => item.y + clamp(item.width * 0.54, 135, 230))) : center.y + 180;
    const group = {
      id,
      name: `新分组 ${currentGroups.length + 1}`,
      x: left - 36,
      y: top - 54,
      width: Math.max(360, right - left + 72),
      height: Math.max(190, bottom - top + 78),
      color: GROUP_COLORS[currentGroups.length % GROUP_COLORS.length],
      zIndex: 0,
    };
    commitDraft((current) => ({
      ...current,
      groups: [...current.groups, group],
      items: targets.length ? current.items.map((item) => selectedNodeIds.has(item.id) ? { ...item, groupId: id } : item) : current.items,
    }));
    setSelectedNodeId(null);
    setSelectedNodeIds(new Set());
    setSelectedGroupId(id);
  };
  const removeGroup = (groupId) => {
    commitDraft((current) => ({
      ...current,
      groups: current.groups.filter((group) => group.id !== groupId),
      items: current.items.map((item) => item.groupId === groupId ? { ...item, groupId: "" } : item),
    }));
    setSelectedGroupId(null);
  };
  const layoutBuckets = (current, buckets) => {
    let cursorX = -720;
    let cursorY = -440;
    let rowHeight = 0;
    const placed = new Map();
    const groups = [];
    for (const bucket of buckets) {
      const bucketItems = [...bucket.items].sort((left, right) => String(assetsById.get(left.assetId)?.name || "").localeCompare(String(assetsById.get(right.assetId)?.name || ""), "zh-CN"));
      const columns = Math.min(5, Math.max(1, Math.ceil(Math.sqrt(Math.max(1, bucketItems.length)))));
      const width = Math.max(340, columns * 276 + 64);
      const height = Math.max(190, Math.ceil(Math.max(1, bucketItems.length) / columns) * 235 + (bucket.group ? 74 : 28));
      if (cursorX > -720 && cursorX + width > 980) {
        cursorX = -720;
        cursorY += rowHeight + 70;
        rowHeight = 0;
      }
      const offsetY = bucket.group ? 54 : 18;
      bucketItems.forEach((item, index) => {
        placed.set(item.id, {
          x: cursorX + 32 + (index % columns) * 276,
          y: cursorY + offsetY + Math.floor(index / columns) * 235,
        });
      });
      if (bucket.group) groups.push({ ...bucket.group, x: cursorX, y: cursorY, width, height });
      cursorX += width + 70;
      rowHeight = Math.max(rowHeight, height);
    }
    return {
      groups,
      items: current.items.map((item) => placed.has(item.id) ? { ...item, ...placed.get(item.id) } : item),
    };
  };
  const autoArrange = () => {
    if (!canEdit || !currentItems.length) return;
    commitDraft((current) => {
      const buckets = current.groups.map((group) => ({ group, items: current.items.filter((item) => item.groupId === group.id) }));
      const loose = current.items.filter((item) => !item.groupId || !current.groups.some((group) => group.id === item.groupId));
      if (loose.length) buckets.push({ group: null, items: loose });
      return { ...current, ...layoutBuckets(current, buckets) };
    });
  };
  const groupByFolder = () => {
    if (!canEdit || !currentItems.length) return;
    commitDraft((current) => {
      const buckets = new Map();
      for (const item of current.items) {
        const asset = assetsById.get(item.assetId);
        const folderId = asset?.folderId || "__unfiled__";
        if (!buckets.has(folderId)) buckets.set(folderId, { folderId, items: [] });
        buckets.get(folderId).items.push(item);
      }
      const grouped = [...buckets.values()].sort((left, right) => {
        const leftName = left.folderId === "__unfiled__" ? "未分类" : foldersById.get(left.folderId)?.name || "未分类";
        const rightName = right.folderId === "__unfiled__" ? "未分类" : foldersById.get(right.folderId)?.name || "未分类";
        return leftName.localeCompare(rightName, "zh-CN");
      }).map((bucket, index) => ({
        group: {
          id: boardItemId("folder-group"),
          name: bucket.folderId === "__unfiled__" ? "未分类" : foldersById.get(bucket.folderId)?.name || "未分类",
          color: GROUP_COLORS[index % GROUP_COLORS.length],
          zIndex: 0,
        },
        items: bucket.items,
      }));
      const layout = layoutBuckets(current, grouped);
      const groupByItem = new Map();
      for (const bucket of grouped) for (const item of bucket.items) groupByItem.set(item.id, bucket.group.id);
      return {
        ...current,
        groups: layout.groups,
        items: layout.items.map((item) => ({ ...item, groupId: groupByItem.get(item.id) || "" })),
      };
    });
    setSelectedNodeId(null);
    setSelectedNodeIds(new Set());
    setSelectedGroupId(null);
  };
  const create = async () => {
    const result = await createBoard({ name: newBoardName.trim() || "新参考板" });
    if (result?.board?.id) setActiveBoardId(result.board.id);
  };
  const removeBoard = async () => {
    if (!draft || !canEdit || !window.confirm(`删除参考板“${draft.name}”？素材原文件不会被删除。`)) return;
    const result = await deleteBoard(draft.id);
    if (!result?.error) setActiveBoardId(boards.find((item) => item.id !== draft.id)?.id || null);
  };
  const nodePoint = (node) => ({
    x: node.x + node.width / 2,
    y: node.y + clamp(node.width * 0.54, 135, 230),
  });
  const fitCanvas = () => {
    if (!draft || !currentItems.length) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(...currentItems.map((item) => item.x));
    const top = Math.min(...currentItems.map((item) => item.y));
    const right = Math.max(...currentItems.map((item) => item.x + item.width));
    const bottom = Math.max(...currentItems.map((item) => item.y + clamp(item.width * 0.54, 135, 230)));
    const padding = 140;
    const dockClearance = pickerOpen ? assetDockHeight + 24 : 0;
    const usableHeight = Math.max(1, rect.height - dockClearance);
    const zoom = clamp(Math.min((rect.width - padding) / Math.max(1, right - left), (usableHeight - padding) / Math.max(1, bottom - top)), 0.2, 3);
    updateDraft((current) => ({
      ...current,
      camera: { x: -((left + right) / 2) * zoom, y: -((top + bottom) / 2) * zoom - dockClearance / 2, zoom },
    }));
  };
  const miniRef = useRef(null);
  const miniAnim = useRef(0);
  const centerOnMini = (clientX, clientY) => {
    if (!miniGeo || !miniRef.current) return;
    if (miniAnim.current) {
      cancelAnimationFrame(miniAnim.current);
      miniAnim.current = 0;
    }
    const rect = miniRef.current.getBoundingClientRect();
    const worldX = miniGeo.minX + (clientX - rect.left - miniGeo.offsetX) / miniGeo.scale;
    const worldY = miniGeo.minY + (clientY - rect.top - miniGeo.offsetY) / miniGeo.scale;
    updateDraft((current) => ({ ...current, camera: { ...current.camera, x: -worldX * current.camera.zoom, y: -worldY * current.camera.zoom } }));
  };
  const animateCameraTo = (targetX, targetY, targetZoom) => {
    if (miniAnim.current) cancelAnimationFrame(miniAnim.current);
    const start = { x: draft.camera.x, y: draft.camera.y, zoom: draft.camera.zoom };
    const target = { x: targetX, y: targetY, zoom: targetZoom ?? start.zoom };
    const duration = 220;
    const ease = (p) => 1 - Math.pow(1 - p, 3);
    const t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const k = ease(p);
      updateDraft((current) => ({
        ...current,
        camera: {
          x: start.x + (target.x - start.x) * k,
          y: start.y + (target.y - start.y) * k,
          zoom: start.zoom + (target.zoom - start.zoom) * k,
        },
      }));
      miniAnim.current = p < 1 ? requestAnimationFrame(step) : 0;
    };
    miniAnim.current = requestAnimationFrame(step);
  };
  const flyToMini = (clientX, clientY) => {
    if (!miniGeo || !miniRef.current) return;
    const rect = miniRef.current.getBoundingClientRect();
    const worldX = miniGeo.minX + (clientX - rect.left - miniGeo.offsetX) / miniGeo.scale;
    const worldY = miniGeo.minY + (clientY - rect.top - miniGeo.offsetY) / miniGeo.scale;
    animateCameraTo(-worldX * draft.camera.zoom, -worldY * draft.camera.zoom, draft.camera.zoom);
  };
  const onMiniPointerDown = (event) => {
    event.preventDefault();
    miniRef.current?.setPointerCapture(event.pointerId);
    flyToMini(event.clientX, event.clientY);
  };
  const onMiniPointerMove = (event) => {
    if (event.buttons !== 1) return;
    centerOnMini(event.clientX, event.clientY);
  };
  const onMiniPointerUp = (event) => {
    miniRef.current?.releasePointerCapture(event.pointerId);
  };

  if (!board || !draft) {
    return <section className="reference-board-module reference-board-empty" aria-label="无限参考板">
      <StickyNote size={38}/>
      <h2>建立第一块无限参考板</h2>
      <p>把素材以引用方式放到自由画布中。素材原文件、现有文件夹和 AI Flow 均不会被改动。</p>
      <div>
        <input value={newBoardName} maxLength="80" disabled={!canEdit} onChange={(event) => setNewBoardName(event.target.value)} aria-label="参考板名称" />
        <button type="button" className="reference-board-primary" disabled={!canEdit} onClick={create}><Plus size={15}/> 新建参考板</button>
      </div>
    </section>;
  }

  const miniViewport = miniGeo && canvasSize.width ? (() => {
    const z = draft.camera.zoom;
    const left = (-canvasSize.width / 2 - draft.camera.x) / z;
    const top = (-canvasSize.height / 2 - draft.camera.y) / z;
    return {
      left: (left - miniGeo.minX) * miniGeo.scale + miniGeo.offsetX,
      top: (top - miniGeo.minY) * miniGeo.scale + miniGeo.offsetY,
      width: (canvasSize.width / z) * miniGeo.scale,
      height: (canvasSize.height / z) * miniGeo.scale,
    };
  })() : null;

  const miniPanelVisible = miniVisible && !!miniGeo;

  return <section className="reference-board-module" aria-label="无限参考板">
    <div className="reference-board-topbar">
      <select value={board.id} onChange={(event) => setActiveBoardId(event.target.value)} aria-label="选择参考板">
        {boards.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <input className="reference-board-name" value={draft.name} maxLength="80" disabled={!canEdit} onChange={(event) => updateDraft((current) => ({ ...current, name: event.target.value }), false)} onBlur={() => scheduleSave(latestDraft.current)} aria-label="参考板名称" />
      <span>{currentItems.length} 个引用节点 · {currentGroups.length} 个分组 · {currentConnections.length} 条连线</span>
      <div className="reference-board-top-actions">
        <button type="button" title="撤销 (Ctrl+Z)" onClick={undo} disabled={!canEdit || !canUndo}><Undo2 size={15}/> 撤销</button>
        <button type="button" title="重做 (Ctrl+Y)" onClick={redo} disabled={!canEdit || !canRedo}><Redo2 size={15}/> 重做</button>
        <button type="button" onClick={() => setPickerOpen((open) => !open)} disabled={!canEdit} title="显示或隐藏下方素材文件夹栏"><LayoutGrid size={15}/> 素材栏</button>
        <button type="button" title="将节点整齐排列，保留现有分组" onClick={autoArrange} disabled={!canEdit || !currentItems.length}><LayoutGrid size={15}/> 一键整理</button>
        <button type="button" title="按素材所在文件夹创建分组并自动排列" onClick={groupByFolder} disabled={!canEdit || !currentItems.length}><FolderPlus size={15}/> 按文件夹分组</button>
        <button type="button" title="先点击素材，再点此按钮即可建立分组；未选中素材则新建空分组" onClick={makeGroup} disabled={!canEdit}><Plus size={15}/> 新建分组</button>
        <button type="button" className={linkMode ? "active" : ""} title="依次点击两个素材节点即可连接；连线会跟随节点移动" onClick={() => {
          setLinkMode((active) => !active);
          setLinkSourceId(linkMode ? null : selectedNodeId);
        }} disabled={!canEdit || currentItems.length < 2}>{linkMode ? (linkSourceId ? "选择终点" : "选择起点") : "连接节点"}</button>
        <button type="button" title="缩放并定位到全部参考节点" onClick={fitCanvas} disabled={!currentItems.length}><Maximize2 size={15}/> 适应画布</button>
        <button type="button" title="清除当前参考板的全部连线" className="danger" onClick={() => {
          if (currentConnections.length && window.confirm(`清除当前参考板的 ${currentConnections.length} 条连线？节点和素材不会删除。`)) commitDraft((current) => ({ ...current, connections: [] }));
        }} disabled={!canEdit || !currentConnections.length}>清除连线</button>
        <button type="button" title="复位画布视角" onClick={() => updateDraft((current) => ({ ...current, camera: { x: 0, y: 0, zoom: 1 } }))}><RotateCcw size={15}/></button>
        <button type="button" title="删除当前参考板" className="danger" disabled={!canEdit} onClick={removeBoard}><Trash2 size={15}/></button>
        <button type="button" title="返回素材库" onClick={close}><X size={16}/></button>
      </div>
    </div>
    <div className="reference-board-workspace">
      <div
        className={`reference-board-canvas ${canvasDropActive ? "drop-target" : ""} ${pickerOpen ? "has-material-dock" : ""}`}
        ref={canvasRef}
        style={pickerOpen ? { "--material-dock-clearance": `${assetDockHeight + 24}px` } : undefined}
        onPointerDown={startCanvasPointer}
        onWheel={zoomAt}
        onDragOver={(event) => {
          if (!canEdit || !hasAssetDrag(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setCanvasDropActive(true);
        }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setCanvasDropActive(false); }}
        onDrop={(event) => {
          if (!hasAssetDrag(event)) return;
          event.preventDefault();
          setCanvasDropActive(false);
          addAssetsAt(dragAssetIds(event, assetsById), canvasPoint(event));
        }}
      >
        <div className="reference-board-origin" style={{ transform: `translate(${draft.camera.x}px, ${draft.camera.y}px) scale(${draft.camera.zoom})` }}>
          <svg className="reference-board-connection-layer" aria-hidden="true">
            {currentConnections.map((connection) => {
              const source = currentItemsById.get(connection.fromId);
              const target = currentItemsById.get(connection.toId);
              if (!source || !target) return null;
              const from = nodePoint(source);
              const to = nodePoint(target);
              return <g key={connection.id}><line x1={from.x} y1={from.y} x2={to.x} y2={to.y}/><circle cx={from.x} cy={from.y} r="5"/><circle cx={to.x} cy={to.y} r="5"/></g>;
            })}
          </svg>
          {currentGroups.map((group) => <section
            className={`reference-board-group ${selectedGroupId === group.id ? "selected" : ""}`}
            key={group.id}
            style={{ width: group.width, height: group.height, zIndex: group.zIndex, transform: `translate(${group.x}px, ${group.y}px)`, "--group-color": group.color }}
          >
            <button type="button" className="reference-board-group-head" onPointerDown={(event) => startGroupDrag(event, group)} onClick={() => { setSelectedGroupId(group.id); setSelectedNodeId(null); }}>
              <span>{group.name}</span><small>{groupItemCounts.get(group.id) || 0} 项</small>
            </button>
          </section>)}
          {currentItems.map((item) => {
            const asset = assetsById.get(item.assetId);
            if (!asset) return null;
            return <article
              className={`reference-board-node ${selectedNodeIds.has(item.id) ? "selected" : ""} ${linkSourceId === item.id ? "link-source" : ""} ${item.locked ? "locked" : ""}`}
              key={item.id}
              style={{ width: item.width, transform: `translate(${item.x}px, ${item.y}px) rotate(${item.rotation}deg)`, zIndex: item.zIndex }}
              onPointerDown={(event) => startNodeDrag(event, item)}
              onDoubleClick={(event) => { event.stopPropagation(); openAsset(asset); }}
            >
              <div className="reference-board-node-media"><BoardMedia asset={asset}/></div>
              <div className="reference-board-node-foot"><span title={asset.name}>{asset.name}</span><small>{asset.type?.split("/")[0] || "素材"}</small></div>
              <div className="reference-board-node-actions">
                <button type="button" title={item.locked ? "解除锁定" : "锁定位置"} onPointerDown={(event) => event.stopPropagation()} onClick={() => commitDraft((current) => ({ ...current, items: current.items.map((node) => node.id === item.id ? { ...node, locked: !node.locked } : node) }))}>{item.locked ? <Lock size={13}/> : <LockOpen size={13}/>}</button>
                <button type="button" title="从参考板移除" onPointerDown={(event) => event.stopPropagation()} onClick={() => removeNode(item.id)} disabled={!canEdit}><X size={14}/></button>
              </div>
            </article>;
          })}
        </div>
        {marquee && <div className="reference-board-marquee" style={{ left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height }}/>} 
        {!currentItems.length && <div className="reference-board-canvas-empty"><MousePointer2 size={28}/><strong>画布已准备好</strong><span>从下方素材文件夹栏直接拖入素材，或点击素材卡片加入画布。</span></div>}
        <div className="reference-board-zoom"><Minus size={13}/><span>{Math.round(draft.camera.zoom * 100)}%</span><Maximize2 size={13}/></div>
        {miniPanelVisible && <div className="reference-board-minimap" ref={miniRef} onPointerDown={onMiniPointerDown} onPointerMove={onMiniPointerMove} onPointerUp={onMiniPointerUp} title="点击或拖动以快速定位画布">
          <svg className="reference-board-minimap-links" aria-hidden="true">
            {currentConnections.map((connection) => {
              const source = currentItemsById.get(connection.fromId);
              const target = currentItemsById.get(connection.toId);
              if (!source || !target) return null;
              const from = nodePoint(source);
              const to = nodePoint(target);
              return <line
                key={connection.id}
                x1={(from.x - miniGeo.minX) * miniGeo.scale + miniGeo.offsetX}
                y1={(from.y - miniGeo.minY) * miniGeo.scale + miniGeo.offsetY}
                x2={(to.x - miniGeo.minX) * miniGeo.scale + miniGeo.offsetX}
                y2={(to.y - miniGeo.minY) * miniGeo.scale + miniGeo.offsetY}
              />;
            })}
          </svg>
          <div className="reference-board-minimap-nodes">
            {currentGroups.map((group) => <div
              key={group.id}
              className="reference-board-minimap-group"
              style={{ left: (group.x - miniGeo.minX) * miniGeo.scale + miniGeo.offsetX, top: (group.y - miniGeo.minY) * miniGeo.scale + miniGeo.offsetY, width: group.width * miniGeo.scale, height: group.height * miniGeo.scale, background: group.color }}
            />)}
            {currentItems.map((item) => {
              const groupColor = item.groupId ? groupColorById.get(item.groupId) : null;
              return <div
                key={item.id}
                className="reference-board-minimap-node"
                style={{ left: (item.x - miniGeo.minX) * miniGeo.scale + miniGeo.offsetX, top: (item.y - miniGeo.minY) * miniGeo.scale + miniGeo.offsetY, width: Math.max(2, item.width * miniGeo.scale), height: Math.max(2, clamp(item.width * 0.54, 135, 230) * miniGeo.scale), background: groupColor || "rgba(222,227,237,0.88)" }}
              />;
            })}
          </div>
          {miniViewport && <div className="reference-board-minimap-viewport" style={{ left: miniViewport.left, top: miniViewport.top, width: miniViewport.width, height: miniViewport.height }} />}
          <button type="button" className="reference-board-minimap-hide" title="隐藏小地图" onPointerDown={(event) => event.stopPropagation()} onClick={() => setMiniVisible(false)}><EyeOff size={14}/></button>
        </div>}
        {!miniPanelVisible && <button type="button" className="reference-board-minimap-show" title="显示小地图" onClick={() => setMiniVisible(true)}><MapIcon size={16}/></button>}
        <div className="reference-board-hint">空白处拖动后会惯性滑行 · 滚轮缩放 · Shift+单击多选 · Ctrl+Z 撤销 · Ctrl+Y 重做 · Ctrl+F 搜索素材 · Esc 取消选择</div>
      </div>
      {pickerOpen && <aside
        ref={assetDockRef}
        className="reference-board-picker reference-board-asset-dock"
        style={{ height: assetDockHeight }}
        aria-label="素材文件夹栏"
      >
        <div className="reference-board-dock-resize-handle" role="separator" aria-orientation="horizontal" aria-label="上下拖动调整素材栏高度" title="上下拖动调整素材栏高度" onPointerDown={startAssetDockResize}><GripHorizontal size={15}/></div>
        <div className="reference-board-dock-head">
          <strong>素材文件夹</strong>
          <select value={pickerFolderId} onChange={(event) => setPickerFolderId(event.target.value)} aria-label="选择素材文件夹">
            <option value="">全部文件夹</option>
            <option value="__unfiled__">未分类</option>
            {folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}
          </select>
          <input ref={pickerSearchRef} value={pickerQuery} placeholder="搜索当前素材" onChange={(event) => setPickerQuery(event.target.value)} aria-label="搜索素材" />
          <small>拖到画布即可引用，不复制原文件</small>
          <button type="button" title="将当前文件夹结果加入画布" disabled={!canEdit || !visibleAssets.length} onClick={() => addAssetsAt(visibleAssets.map((asset) => asset.id))}><Plus size={15}/></button>
          <button type="button" title="隐藏素材栏" onClick={() => setPickerOpen(false)}><X size={16}/></button>
        </div>
        <div className="reference-board-picker-list">
          {visibleAssets.map((asset) => <div className="reference-board-picker-row" draggable={canEdit} key={asset.id} onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "copy";
            event.dataTransfer.setData(ASSET_DRAG_MIME, JSON.stringify([asset.id]));
            event.dataTransfer.setData("text/plain", asset.name || "素材");
          }}>
            <button type="button" onClick={() => addAssetsAt([asset.id])}>
              <span className="reference-board-picker-thumb"><BoardMedia asset={asset}/></span>
              <span><b>{asset.name}</b><small>{(asset.tags || []).slice(0, 2).join(" · ") || asset.type}</small></span>
              <Plus size={15}/>
            </button>
          </div>)}
          {visibleAssets.length < matchingAssets.length && <button type="button" className="reference-board-picker-load-more" onClick={() => setPickerLimit((limit) => Math.min(matchingAssets.length, limit + PICKER_PAGE_SIZE))}>显示更多素材（剩余 {matchingAssets.length - visibleAssets.length} 项）</button>}
          {!visibleAssets.length && <p>这个文件夹没有匹配素材</p>}
        </div>
      </aside>}
    </div>
  </section>;
}
