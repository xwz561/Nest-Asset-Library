import { SORT_OPTIONS, FILTER_TYPES, FILTER_FORMATS, folderIcon, FOLDER_ICONS, FOLDER_COLORS } from "../lib/app-config.js";
import { Button, ReadyUI } from "../ready-ui.jsx";
import { Check, FolderOpen, Plus, RotateCw, Link2, Search, X, Folder, MoreHorizontal, Eye, Tag, StickyNote, Archive, Copy, Pencil, Import, ClipboardCopy, Download, Trash2, ChevronDown, List, LayoutGrid, Send, Share2, Palette } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { LIBRARY_MENU_ACTIONS } from "../app-menu.js";
import { createPortal } from "react-dom";
import { folderExpansionState } from "../folder-tree.js";
import { AssetColorPicker } from "./asset-color-picker.jsx";

export function SortMenu({ value, choose }) {
  return (
    <div className="toolbar-popover sort-popover">
      <small>排序方式</small>
      {SORT_OPTIONS.map(([key, label, Icon]) => (
        <Button
          key={key}
          className={value === key ? "selected" : ""}
          onClick={() => choose(key)}
        >
          <Icon size={16} />
          <span>{label}</span>
          {value === key && <Check size={16} />}
        </Button>
      ))}
    </div>
  );
}

export function FilterPopover({ types, formats, setTypes, setFormats, close }) {
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
        <Button
          onClick={() => {
            setTypes([]);
            setFormats([]);
          }}
        >
          清除全部
        </Button>
      </div>
      <small>类型</small>
      <div className="filter-chips">
        {FILTER_TYPES.map(([key, label]) => (
          <Button
            key={key}
            className={types.includes(key) ? "selected" : ""}
            onClick={() => toggle(types, setTypes, key)}
          >
            {label}
          </Button>
        ))}
      </div>
      <small>格式</small>
      <div className="filter-chips formats">
        {FILTER_FORMATS.map((value) => (
          <Button
            key={value}
            className={formats.includes(value) ? "selected" : ""}
            onClick={() => toggle(formats, setFormats, value)}
          >
            {value}
          </Button>
        ))}
      </div>
      <div className="filter-actions">
        <Button
          onClick={() => {
            setTypes([]);
            setFormats([]);
          }}
        >
          重置
        </Button>
        <Button className="primary" onClick={close}>
          应用筛选 ({types.length + formats.length})
        </Button>
      </div>
    </div>
  );
}

export function FolderMark({ folder, expanded = false }) {
  const Icon = expanded && (!folder.icon || folder.icon === "folder")
    ? FolderOpen
    : folderIcon(folder.icon);
  return (
    <Icon
      className="folder-glyph"
      size={14}
      style={{ color: folder.color || "#9ba4ae" }}
    />
  );
}

export function LibrarySwitcherMenu({ panelRef, position, themeVariables, libraries, currentLibrary, busy, onSwitch, onForget, onCreate, onOpen, onFind, onClearCache, onMerge, onDelete, onDismiss }) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase();
  const visibleLibraries = (libraries || []).filter(item => !query || `${item.name} ${item.path}`.toLocaleLowerCase().includes(query));
  const actionHandlers = {
    "create-library": onCreate,
    "open-library": onOpen,
    "find-library": onFind,
    "clear-cache": onClearCache,
    "merge-library": onMerge,
  };
  const actionIcons = {
    "create-library": Plus,
    "open-library": FolderOpen,
    "find-library": Search,
    "clear-cache": RotateCw,
    "merge-library": Link2,
  };
  return (
    <div
      ref={panelRef}
      className="app-menu library-switcher-menu"
      role="menu"
      aria-label="资源库切换"
      style={{ ...themeVariables, ...position }}
      onClick={event => event.stopPropagation()}
    >
      <label className="app-menu-search">
        <Search size={15} />
        <input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索…" aria-label="搜索资源库" />
        <Button className="library-switcher-close" aria-label="关闭资源库面板" onClick={onDismiss}><X size={15} /></Button>
      </label>
      <div className="library-switcher-list" aria-label="最近资源库">
        {visibleLibraries.map(item => (
          <div className={`library-switcher-row ${item.current ? "current" : ""}`} key={item.id}>
            <span className="library-switcher-drag" aria-hidden="true">⠿</span>
            <Button className="library-switcher-main" role="menuitem" aria-current={item.current ? "true" : undefined} disabled={busy} onClick={() => { if (!item.current) onSwitch(item.id); }}>
              <span className="library-switcher-icon"><Folder size={17} /></span>
              <span className="library-switcher-copy"><strong>{item.name}</strong><small>{item.path}</small></span>
              {item.current && <Check className="library-switcher-check" size={16} aria-label="当前资源库" />}
            </Button>
            <Button className="library-switcher-more" aria-label={item.current ? `删除当前资源库 ${item.name}` : `从最近列表移除 ${item.name}`} title={item.current ? "删除当前资源库" : "从最近列表移除"} disabled={busy} onClick={() => item.current ? onDelete() : onForget(item.id)}><MoreHorizontal size={17} /></Button>
          </div>
        ))}
        {!visibleLibraries.length && <div className="library-switcher-empty">{query ? "没有匹配的资源库" : currentLibrary ? "正在读取资源库列表…" : "尚未打开资源库"}</div>}
      </div>
      <div className="app-menu-divider" />
      <div className="library-switcher-actions">
        {LIBRARY_MENU_ACTIONS.map(item => {
          const Icon = actionIcons[item.id];
          const disabled = busy || (item.id === "find-library" && !onFind) || ((item.id === "merge-library" || item.id === "clear-cache") && !currentLibrary);
          return <Button key={item.id} className="library-switcher-action" role="menuitem" disabled={disabled} onClick={actionHandlers[item.id]}><Icon size={16}/><span>{item.label}</span></Button>;
        })}
      </div>
    </div>
  );
}

export function BlankContextMenu({ menu, menuRef, close, create }) {
  const menuLeft = Math.max(8, Math.min(menu.x, window.innerWidth - 252));
  const menuTop = Math.max(8, Math.min(menu.y, window.innerHeight - 226));
  const items = [
    ["text", "T", "text", "文本文档"],
    ["word", "W", "word", "Word 文档"],
    ["powerpoint", "P", "powerpoint", "PowerPoint 文档"],
    ["excel", "X", "excel", "Excel 文档"],
    ["xmind", "X", "xmind", "XMind 文档"],
  ];
  const run = (kind) => {
    close();
    void create(kind);
  };
  return (
    <div
      ref={menuRef}
      className="asset-menu blank-document-menu"
      style={{ left: menuLeft, top: menuTop }}
      role="menu"
      aria-label="新建文档"
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="blank-document-menu-title">新建文档</div>
      {items.map(([kind, badge, tone, label]) => (
        <Button key={kind} role="menuitem" onClick={() => run(kind)}>
          <i className={`document-app-icon ${tone}`} aria-hidden="true">{badge}</i>
          <span>{label}</span>
        </Button>
      ))}
    </div>
  );
}

export function AssetContextMenu({ menu, menuRef, submenuRef, folders, friends = [], actions, close, readOnly }) {
  const [moving, setMoving] = useState(false);
  const [sending, setSending] = useState(false);
  const [moveAnchor, setMoveAnchor] = useState(null);
  const anchorMove = event => {const rect=event.currentTarget.getBoundingClientRect();setMoveAnchor(rect.top);};
  const menuLeft = Math.max(8, Math.min(menu.x, window.innerWidth - 250));
  const menuTop = Math.max(8, Math.min(menu.y, window.innerHeight - 600));
  const flyoutWidth = Math.min(236, window.innerWidth - 16);
  const flyoutLeft = menuLeft + 244 + flyoutWidth <= window.innerWidth - 8
    ? menuLeft + 244
    : Math.max(8, menuLeft - flyoutWidth - 6);
  const flyoutTop = Math.max(8, Math.min(moveAnchor ?? menuTop, window.innerHeight - Math.min(360, window.innerHeight * .7) - 8));
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
        left: menuLeft,
        top: menuTop,
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {rows.map(([Icon, label, fn]) => (
        <Button key={label} onClick={() => run(fn)}>
          <Icon size={16} />
          <span>{label}</span>
        </Button>
      ))}
      {!readOnly && actions.color && <div className="asset-menu-colors">
        <Palette size={16} />
        <span>颜色</span>
        <AssetColorPicker value={menu.asset.labelColor || ""} onChange={(labelColor) => run(() => actions.color(labelColor))} />
      </div>}
      <div className="menu-separator" />
      {actions.sendToFriend && <Button aria-haspopup="menu" aria-expanded={sending} onMouseEnter={event => { anchorMove(event); setMoving(false); setSending(true); }} onClick={event => { anchorMove(event); setMoving(false); setSending(value => !value); }}>
        <Send size={16} /><span>发送给好友</span><b>›</b>
      </Button>}
      {sending && createPortal(
        <ReadyUI><div ref={submenuRef} className="move-submenu move-submenu-floating ready-ui-menu lan-friend-submenu" role="menu" aria-label="发送给好友" style={{ left: flyoutLeft, top: flyoutTop, width: flyoutWidth }} onClick={event => event.stopPropagation()}>
          {friends.length ? friends.map(peer => <Button key={peer.id} disabled={!peer.canChat} aria-label={`发送给${peer.name}`} onClick={() => run(() => actions.sendToFriend(peer.id))} title={peer.canChat ? `发送原文件给 ${peer.name}` : '对方需要更新素材库'}>
            <span className="lan-menu-avatar">{peer.avatar ? <img src={peer.avatar} alt="" /> : (peer.name || '用').slice(0, 1).toUpperCase()}</span><span>{peer.name}</span>{!peer.canChat && <small>需更新</small>}
          </Button>) : <p className="lan-menu-empty">暂无在线好友。请让另一台电脑打开素材库，并连接同一局域网。</p>}
        </div></ReadyUI>, document.body,
      )}
      {!readOnly && <Button aria-haspopup="menu" aria-expanded={moving} onMouseEnter={event => {anchorMove(event);setSending(false);setMoving(true);}} onClick={event => {anchorMove(event);setSending(false);setMoving(x => !x);}}>
        <Folder size={16} />
        <span>移动到文件夹</span>
        <b>›</b>
      </Button>}
      {moving && createPortal(
        <ReadyUI><div ref={submenuRef} className="move-submenu move-submenu-floating ready-ui-menu" role="menu" aria-label="移动到文件夹" style={{ left: flyoutLeft, top: flyoutTop, width: flyoutWidth }} onClick={(event) => event.stopPropagation()}>
          <Button onClick={() => run(() => actions.move(null))}>
            <Archive size={15} />
            未分类
          </Button>
          {folders.map((f) => (
            <Button
              key={f.id}
              style={{ paddingLeft: 12 + f.depth * 12 }}
              onClick={() => run(() => actions.move(f.id))}
            >
              <FolderMark folder={f} />
              <span>{f.name}</span>
            </Button>
          ))}
        </div></ReadyUI>,
        document.body,
      )}
      {!readOnly && <Button onClick={() => run(actions.duplicate)}>
        <Copy size={16} />
        <span>复制素材</span>
      </Button>}
      {!readOnly && <Button onClick={() => run(actions.rename)}>
        <Pencil size={16} />
        <span>重命名</span>
      </Button>}
      {!readOnly && actions.uploadToAIFlow && <Button onClick={() => run(actions.uploadToAIFlow)}>
        <Import size={16} />
        <span>上传到 AI Flow</span>
      </Button>}
      <div className="menu-separator" />
      <Button onClick={() => run(actions.copyAsset)}>
        <ClipboardCopy size={16} />
        <span>复制文件</span>
      </Button>
      <Button onClick={() => run(actions.copyFolder)}>
        <Folder size={16} />
        <span>复制所在目录</span>
      </Button>
      <Button onClick={() => run(actions.copyPath)}>
        <ClipboardCopy size={16} />
        <span>复制完整路径</span>
      </Button>
      <Button onClick={() => run(actions.export)}>
        <Download size={16} />
        <span>导出原始文件</span>
      </Button>
      {actions.forward && <Button onClick={() => run(actions.forward)}>
        <Share2 size={16} />
        <span>转发到其他素材库…</span>
      </Button>}
      <Button onClick={() => run(actions.reveal)}>
        <FolderOpen size={16} />
        <span>在资源管理器中显示</span>
      </Button>
      <div className="menu-separator" />
      {!readOnly && <Button className="menu-danger" onClick={() => run(actions.delete)}>
        <Trash2 size={16} />
        <span>删除</span>
      </Button>}
    </div>
  );
}

export function FolderContextMenu({ menu, menuRef, flyoutRef, actions, close, readOnly, liveSyncEnabled = false, expansion }) {
  const [iconsOpen, setIconsOpen] = useState(false);
  const [iconAnchorTop, setIconAnchorTop] = useState(null);
  const iconTriggerRef = useRef(null);
  const menuLeft = Math.max(8, Math.min(menu.x, window.innerWidth - 228));
  const menuTop = Math.max(8, Math.min(menu.y, window.innerHeight - 550));
  const pickerWidth = Math.min(286, window.innerWidth - 16);
  const pickerLeft = menuLeft + 220 + pickerWidth <= window.innerWidth - 8
    ? menuLeft + 220
    : Math.max(8, menuLeft - pickerWidth - 6);
  const pickerTop = Math.max(8, Math.min(iconAnchorTop ?? menuTop, window.innerHeight - 188));
  const currentExpanded = folderExpansionState(expansion?.expandedFolderIds, expansion?.currentIds);
  const siblingsExpanded = folderExpansionState(expansion?.expandedFolderIds, expansion?.siblingIds);
  const allExpanded = folderExpansionState(expansion?.expandedFolderIds, expansion?.allIds);
  const positionIconFlyout = (event) => setIconAnchorTop(event.currentTarget.getBoundingClientRect().top);
  useEffect(() => {
    if (!iconsOpen) return undefined;
    let closeTimer = null;
    const onPointerMove = (event) => {
      const target = event.target;
      const inside = iconTriggerRef.current?.contains(target) || flyoutRef.current?.contains(target);
      if (inside) {
        clearTimeout(closeTimer);
        closeTimer = null;
        return;
      }
      if (closeTimer) return;
      closeTimer = window.setTimeout(() => {
        setIconsOpen(false);
        closeTimer = null;
      }, 180);
    };
    document.addEventListener("pointermove", onPointerMove, true);
    return () => {
      document.removeEventListener("pointermove", onPointerMove, true);
      clearTimeout(closeTimer);
    };
  }, [iconsOpen, flyoutRef]);
  const run = (fn) => {
    close();
    fn();
  };
  return (
    <div
      ref={menuRef}
      className="asset-menu folder-menu"
      style={{
        left: menuLeft,
        top: menuTop,
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Button onClick={() => run(actions.open)}>
        <FolderOpen size={16} />
        <span>打开文件夹</span>
      </Button>
      {!readOnly && <Button onClick={() => run(actions.add)}>
        <Plus size={16} />
        <span>新建子文件夹</span>
      </Button>}
      {!readOnly && actions.uploadToAIFlow && <Button onClick={() => run(actions.uploadToAIFlow)}>
        <Import size={16} />
        <span>上传文件夹到 AI Flow</span>
      </Button>}
      {!readOnly && actions.toggleLiveSync && <Button onClick={() => run(actions.toggleLiveSync)}>
        <RotateCw size={16} />
        <span>{liveSyncEnabled ? "关闭 AI Flow 实时同步" : "开启 AI Flow 实时同步"}</span>
      </Button>}
      <div className="menu-separator" />
      <Button disabled={!expansion?.currentIds?.length} onClick={() => run(actions.toggleCurrent)}>
        <ChevronDown size={16} />
        <span>{currentExpanded ? "收起此文件夹" : "展开此文件夹"}</span>
      </Button>
      <Button disabled={!expansion?.siblingIds?.length} onClick={() => run(actions.toggleSiblings)}>
        <List size={16} />
        <span>{siblingsExpanded ? "收起同层文件夹" : "展开同层文件夹"}</span>
      </Button>
      <Button disabled={!expansion?.allIds?.length} onClick={() => run(actions.toggleAll)}>
        <LayoutGrid size={16} />
        <span>{allExpanded ? "收起所有文件夹" : "展开所有文件夹"}</span>
      </Button>
      <div className="menu-separator" />
      {!readOnly && <Button ref={iconTriggerRef} aria-haspopup="menu" aria-expanded={iconsOpen} onMouseEnter={(event) => { positionIconFlyout(event); setIconsOpen(true); }} onClick={(event) => { positionIconFlyout(event); setIconsOpen(value => !value); }}>
        <FolderMark folder={menu.folder} />
        <span>文件夹图标</span>
        <b>›</b>
      </Button>}
      {iconsOpen && createPortal(
        <ReadyUI><div ref={flyoutRef} className="folder-icon-flyout ready-ui-menu" role="menu" aria-label="选择文件夹图标" style={{ left: pickerLeft, top: pickerTop, width: pickerWidth }} onClick={(event) => event.stopPropagation()}>
          {FOLDER_ICONS.map(([key, Icon]) => (
            <Button key={key} className={menu.folder.icon === key ? "chosen" : ""} aria-label={`使用 ${key} 图标`} title={key} onClick={() => run(() => actions.appearance({ icon: key }))}>
              <Icon size={18} />
            </Button>
          ))}
        </div></ReadyUI>,
        document.body,
      )}
      {!readOnly && <div className="folder-menu-colors" role="group" aria-label="文件夹颜色">
        {FOLDER_COLORS.map((color) => (
          <Button key={color} className={String(menu.folder.color || "").toLowerCase() === color.toLowerCase() ? "chosen" : ""} aria-label={`使用颜色 ${color}`} title={color} style={{ "--folder-color": color }} onClick={() => run(() => actions.appearance({ color }))}>
            {String(menu.folder.color || "").toLowerCase() === color.toLowerCase() && <Check size={12} />}
          </Button>
        ))}
      </div>}
      {!readOnly && <div className="menu-separator" />}
      {actions.forward && <Button onClick={() => run(actions.forward)}>
        <Share2 size={16} />
        <span>转发到其他素材库…</span>
      </Button>}
      {!readOnly && <Button onClick={() => run(actions.rename)}>
        <Pencil size={16} />
        <span>重命名</span>
      </Button>}
      {!readOnly && <Button className="menu-danger" onClick={() => run(actions.delete)}>
        <Trash2 size={16} />
        <span>删除文件夹</span>
      </Button>}
    </div>
  );
}
