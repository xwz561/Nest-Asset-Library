import React from "react";
import { ChevronRight } from "lucide-react";
import { FolderMark } from "./menus.jsx";
import { INTERNAL_DRAG } from "../lib/app-config.js";

// 文件夹卡片横着（贴在窗口顶部或底部）时的样子：像 Mac 访达的分栏视图，
// 一级文件夹一栏，点哪个就在右边展开它的下一级，同时打开这个文件夹。
// 右键菜单、把素材拖到文件夹上移动，和竖着的文件夹树一样。
export function FolderColumns({ folders, activeFolder, counts, canEdit, onOpen, onContextMenu, onDropAssets }) {
  const byId = React.useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
  const childrenOf = React.useMemo(() => {
    const map = new Map();
    for (const folder of folders) {
      const key = folder.parentId || null;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(folder);
    }
    return map;
  }, [folders]);
  const [selection, setSelection] = React.useState(activeFolder);
  const [dropId, setDropId] = React.useState(null);
  const scrollerRef = React.useRef(null);

  // 在别处（素材区、文件夹树）换了文件夹，分栏跟着展开到那里
  React.useEffect(() => setSelection(activeFolder), [activeFolder]);

  // 选中文件夹的路径：从一级文件夹到它自己
  const path = React.useMemo(() => {
    const ids = [];
    for (let folder = byId.get(selection); folder && ids.length < 64; folder = byId.get(folder.parentId)) ids.unshift(folder.id);
    return ids;
  }, [selection, byId]);

  const columns = [null, ...path]
    .map((parentId) => ({ parentId, items: childrenOf.get(parentId) || [] }))
    .filter((column) => column.items.length);

  // 展开新的一栏后滚到最右边，能看到刚展开的内容
  React.useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTo({ left: scroller.scrollWidth, behavior: "smooth" });
  }, [path.length]);

  return (
    <div className="folder-columns" ref={scrollerRef} role="tree" aria-label="文件夹（分栏）">
      {columns.map((column, index) => (
        <div className="folder-column" key={column.parentId ?? "root"} role="group">
          {column.items.map((folder) => {
            const selected = path[index] === folder.id;
            const active = activeFolder === folder.id;
            const hasChildren = (childrenOf.get(folder.id) || []).length > 0;
            return (
              <button
                type="button"
                key={folder.id}
                className={`folder-column-item ${selected ? "selected" : ""} ${active ? "active" : ""} ${dropId === folder.id ? "drop-target" : ""}`}
                role="treeitem"
                aria-selected={active}
                aria-expanded={hasChildren ? selected : undefined}
                title={folder.name}
                onClick={() => {
                  setSelection(folder.id);
                  onOpen(folder);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onContextMenu(event, folder);
                }}
                onDragOver={(event) => {
                  if (!canEdit || !event.dataTransfer.types.includes(INTERNAL_DRAG)) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropId(folder.id);
                }}
                onDragLeave={() => setDropId((current) => (current === folder.id ? null : current))}
                onDrop={(event) => {
                  setDropId(null);
                  if (canEdit) onDropAssets(event, folder.id);
                }}
              >
                <FolderMark folder={folder} expanded={selected && hasChildren} />
                <span className="folder-column-name">{folder.name}</span>
                <small>{counts.get(folder.id) || 0}</small>
                {hasChildren && <ChevronRight className="folder-column-chevron" size={13} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
