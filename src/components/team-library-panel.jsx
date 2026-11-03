import React, { useCallback, useEffect, useRef, useState } from "react";
import { Archive, AudioLines, Download, File, Folder, FolderPlus, Image, LayoutGrid, List, LoaderCircle, LogOut, Plus, RefreshCw, Search, Trash2, Upload, Users, Video, X } from "lucide-react";
import { Button } from "../ready-ui.jsx";
import { createThumbnailQueue, generateThumbnail, thumbnailKind } from "../team-thumbnails.js";
import "./team-library-panel.css";

const desktop = () => window.nestDesktop?.teamLibrary;
const folderApi = () => window.nestDesktop?.teamFolder;

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024, unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2)} ${units[unit]}`;
}

function assetIcon(asset) {
  const type = String(asset.type || "");
  if (type.startsWith("image/")) return Image;
  if (type.startsWith("video/")) return Video;
  if (type.startsWith("audio/")) return AudioLines;
  return File;
}

// 素材缩略图：已有就直接显示；没有时在滚动到可见范围后请求生成（上传给服务端，所有成员共用）
function TeamThumb({ asset, libraryId, onNeed }) {
  const ref = useRef(null), [broken, setBroken] = useState(false), Icon = assetIcon(asset);
  useEffect(() => { setBroken(false); }, [asset.id, asset.thumbnailVersion]);
  useEffect(() => {
    if (asset.hasThumbnail || !thumbnailKind(asset) || !ref.current || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { onNeed(asset); observer.disconnect(); } }, { rootMargin: "160px" });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [asset.id, asset.hasThumbnail, asset.type, asset.size, onNeed]);
  return <span ref={ref} className="team-thumb">
    {asset.hasThumbnail && !broken
      ? <img src={`teamasset://${libraryId}/${asset.id}?thumb=${asset.thumbnailVersion || 1}`} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} />
      : <Icon size={22} />}
  </span>;
}

function TeamAssetPreview({ asset, libraryId, close, download }) {
  if (!asset) return null;
  const source = `teamasset://${libraryId}/${asset.id}`;
  const type = String(asset.type || "");
  return <div className="team-library-preview-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section className="team-library-preview" role="dialog" aria-modal="true" aria-label={`预览 ${asset.name}`}>
      <header><strong title={asset.name}>{asset.name}</strong><div><Button onClick={() => download(asset)} title="下载素材"><Download size={16} /></Button><Button onClick={close} title="关闭预览"><X size={18} /></Button></div></header>
      <main>{type.startsWith("image/") ? <img src={source} alt={asset.name} />
        : type.startsWith("video/") ? <video src={source} controls playsInline />
          : type.startsWith("audio/") ? <audio src={source} controls />
            : <p>此格式可下载到本机后打开。</p>}</main>
      <footer>{formatBytes(asset.size)} · {type || "未知格式"}</footer>
    </section>
  </div>;
}

export default function TeamLibraryPanel({ close, onLibraryOpened }) {
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [serverUrl, setServerUrl] = useState("https://");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [folders, setFolders] = useState([]);
  const [folderId, setFolderId] = useState(null);
  const [assets, setAssets] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [revision, setRevision] = useState("0");
  const [search, setSearch] = useState("");
  const [searched, setSearched] = useState("");
  const [uploading, setUploading] = useState(null);
  const [preview, setPreview] = useState(null);
  const [trash, setTrash] = useState(false);
  const [trashEntries, setTrashEntries] = useState([]);
  const [showMembers, setShowMembers] = useState(false);
  const [members, setMembers] = useState([]);
  const [memberForm, setMemberForm] = useState({ username: "", name: "", password: "", role: "editor" });
  const [folderDraft, setFolderDraft] = useState(null);
  const [movingFolder, setMovingFolder] = useState(null);
  const [moveFolderParent, setMoveFolderParent] = useState("");
  const [viewMode, setViewMode] = useState(() => { try { return localStorage.getItem("team-library-view") === "list" ? "list" : "grid"; } catch { return "grid"; } });
  // NAS 文件夹模式：选一个共享文件夹作为团队素材库，同事选同一个文件夹即自动加入
  const [showServerForm, setShowServerForm] = useState(false);
  const [folderPick, setFolderPick] = useState(null);
  const [memberName, setMemberName] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderError, setFolderError] = useState("");
  const libraryIdRef = useRef(null);
  const folderRef = useRef(folderId);
  const searchRef = useRef(searched);
  const revisionRef = useRef(revision);
  libraryIdRef.current = connection?.library?.id || null;
  folderRef.current = folderId;
  searchRef.current = searched;
  revisionRef.current = revision;

  const loadFolders = useCallback(async () => {
    const result = await desktop().folders();
    setFolders(result.folders || []);
    if (result.revision) { setRevision(result.revision); revisionRef.current = result.revision; }
  }, []);

  const loadAssets = useCallback(async (reset = true, targetFolderId = folderRef.current, term = searchRef.current) => {
    const request = { folderId: term ? "all" : (targetFolderId || "root"), limit: 100, q: term || undefined };
    if (!reset && cursor) request.cursor = cursor;
    const result = await desktop().assets(request);
    setAssets(current => reset ? (result.assets || []) : [...current, ...(result.assets || [])]);
    setCursor(result.nextCursor || null);
    if (result.revision) { setRevision(result.revision); revisionRef.current = result.revision; }
  }, [cursor]);

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [folderResult, assetResult] = await Promise.all([
        desktop().folders(), desktop().assets({ folderId: searchRef.current ? "all" : (folderRef.current || "root"), limit: 100, q: searchRef.current || undefined }),
      ]);
      setFolders(folderResult.folders || []);
      setAssets(assetResult.assets || []);
      setCursor(assetResult.nextCursor || null);
      const nextRevision = String(assetResult.revision || folderResult.revision || "0");
      setRevision(nextRevision); revisionRef.current = nextRevision;
    } catch (cause) {
      setError(cause.message || "读取团队素材库失败");
      setConnection(current => current ? { ...current, online: false, error: cause.message } : current);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let live = true;
    desktop()?.status().then(value => {
      if (!live) return;
      setConnection(value);
      setServerUrl(value?.serverUrl || "https://");
      if (value?.online) reload(); else setLoading(false);
    }).catch(cause => { if (live) { setError(cause.message); setLoading(false); } });
    return () => { live = false; };
  }, [reload]);

  // 缩略图生成队列：每次最多同时 2 个；生成后上传给服务端，再用返回的素材信息更新界面
  const thumbnailQueue = useRef(null);
  if (!thumbnailQueue.current) {
    thumbnailQueue.current = createThumbnailQueue(async asset => {
      const libraryId = libraryIdRef.current;
      if (!libraryId) return;
      const result = await generateThumbnail(asset, `teamasset://${libraryId}/${asset.id}`);
      if (!result || libraryIdRef.current !== libraryId) return;
      const updated = await desktop().putThumbnail(asset.id, await result.blob.arrayBuffer());
      if (updated?.asset) setAssets(current => current.map(item => item.id === updated.asset.id ? { ...item, ...updated.asset } : item));
    });
  }
  const requestThumbnail = useCallback(asset => { thumbnailQueue.current.add(asset); }, []);
  useEffect(() => { thumbnailQueue.current.clear(); }, [connection?.library?.id]);
  useEffect(() => { folderApi()?.profile().then(profile => { if (profile && !profile.isDefaultName) setMemberName(current => current || profile.name); }).catch(() => {}); }, []);
  const nameReady = memberName.trim() && memberName.trim() !== "我";
  const pickFolder = async () => {
    setFolderError("");
    if (!nameReady) { setFolderError("请先填写你的名字，同事会在成员列表里看到它。"); return; }
    setFolderBusy(true);
    try { const picked = await folderApi().pick(); if (picked) setFolderPick(picked); }
    catch (cause) { setFolderError(cause.message || "无法选择文件夹"); }
    finally { setFolderBusy(false); }
  };
  const connectFolder = async create => {
    setFolderError(""); setFolderBusy(true);
    try {
      const result = await folderApi().connect({ path: folderPick.path, name: memberName.trim(), create });
      if (!result || result.error) throw new Error(result?.error || "无法打开这个文件夹");
      onLibraryOpened?.(result);
    } catch (cause) { setFolderError(cause.message || "连接失败"); }
    finally { setFolderBusy(false); }
  };
  useEffect(() => { try { localStorage.setItem("team-library-view", viewMode); } catch {} }, [viewMode]);
  useEffect(() => { if (connection?.needsLogin && connection.username) setUsername(current => current || connection.username); }, [connection?.needsLogin, connection?.username]);

  useEffect(() => {
    const onKeyDown = event => {
      if (event.key !== "Escape") return;
      if (preview) setPreview(null); else close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, preview]);

  useEffect(() => {
    if (!connection?.online || trash || showMembers) return;
    let live = true;
    const poll = async () => {
      let after = revisionRef.current || String(connection.library?.revision || "0");
      while (live) {
        try {
          const result = await desktop().changes(after);
          if (!live) return;
          const next = String(result.revision || after);
          if (next !== after) {
            after = next; revisionRef.current = next; setRevision(next);
            const [folderResult, assetResult] = await Promise.all([
              desktop().folders(), desktop().assets({ folderId: searchRef.current ? "all" : (folderRef.current || "root"), limit: 100, q: searchRef.current || undefined }),
            ]);
            if (!live) return;
            setFolders(folderResult.folders || []); setAssets(assetResult.assets || []); setCursor(assetResult.nextCursor || null);
          }
        } catch (cause) {
          if (live) { setError(cause.message || "团队素材库连接中断"); setConnection(current => current ? { ...current, online: false, error: cause.message } : current); }
          return;
        }
      }
    };
    poll();
    return () => { live = false; };
  }, [connection?.online, connection?.library?.id, trash, showMembers]);

  useEffect(() => {
    if (!connection?.connected || connection.online) return;
    let live = true, delay = 2_000, timer;
    const reconnect = async () => {
      while (live) {
        await new Promise(resolve => { timer = window.setTimeout(resolve, delay); });
        if (!live) return;
        try {
          const status = await desktop()?.status();
          if (status?.online) {
            setConnection(status); setError("");
            await reload();
            return;
          }
          if (status?.needsLogin) { setConnection(status); return; }
        } catch {}
        delay = Math.min(delay * 2, 30_000);
      }
    };
    reconnect();
    return () => { live = false; window.clearTimeout(timer); };
  }, [connection?.connected, connection?.online, reload]);

  const handle = async operation => {
    setBusy(true); setError("");
    try { return await operation(); }
    catch (cause) { setError(cause.message || "操作失败"); return null; }
    finally { setBusy(false); }
  };

  const submitConnect = async event => {
    event.preventDefault();
    const result = await handle(() => desktop().connect({ baseUrl: serverUrl, username, password }));
    if (!result) return;
    setPassword(""); setConnection({ connected: true, online: true, username: result.username, library: result.library, libraries: result.libraries });
    setFolderId(null); setSearched(""); setSearch("");
    window.setTimeout(reload, 0);
  };

  const pickLibrary = async value => {
    const next = await handle(() => desktop().select(value));
    if (!next) return;
    setConnection(current => ({ ...current, library: next })); setFolderId(null); setTrash(false); setShowMembers(false);
    window.setTimeout(reload, 0);
  };

  const createFolder = async event => {
    event.preventDefault();
    const name = String(folderDraft || "").trim();
    if (!name) return;
    const result = await handle(() => desktop().createFolder({ name, parentId: folderId }));
    if (result) { setFolderDraft(null); await reload(); }
  };

  const renameFolder = async folder => {
    const name = window.prompt("文件夹名称", folder.name);
    if (name == null || !name.trim() || name.trim() === folder.name) return;
    await handle(() => desktop().updateFolder(folder.id, { name: name.trim(), parentId: folder.parentId }));
    await reload();
  };

  const deleteFolder = async folder => {
    if (!window.confirm(`将“${folder.name}”及其内容移入回收站？`)) return;
    if (await handle(() => desktop().deleteFolder(folder.id))) {
      const removed = new Set([folder.id]);
      for (let changed = true; changed;) {
        changed = false;
        for (const child of folders) if (removed.has(child.parentId) && !removed.has(child.id)) { removed.add(child.id); changed = true; }
      }
      if (removed.has(folderRef.current)) { folderRef.current = null; setFolderId(null); }
      await reload();
    }
  };

  const upload = async () => {
    const paths = await desktop().pickFiles();
    if (!paths.length) return;
    setError(""); setUploading({ name: "准备上传", sent: 0, total: 0, fileIndex: 0, fileCount: paths.length });
    try { await desktop().upload({ filePaths: paths, folderId }); await reload(); }
    catch (cause) { setError(cause.message || "上传失败"); }
    finally { setUploading(null); }
  };

  useEffect(() => desktop()?.onUploadProgress(value => setUploading(value)), []);

  const renameAsset = async asset => {
    const name = window.prompt("素材名称", asset.name);
    if (name == null || !name.trim() || name.trim() === asset.name) return;
    if (await handle(() => desktop().updateAsset(asset.id, { name: name.trim() }))) await reload();
  };

  const moveAsset = async (asset, value) => {
    const nextFolderId = value || null;
    if ((asset.folderId || null) === nextFolderId) return;
    if (await handle(() => desktop().updateAsset(asset.id, { folderId: nextFolderId }))) await reload();
  };

  const deleteAsset = async asset => {
    if (!window.confirm(`将“${asset.name}”移入回收站？`)) return;
    if (await handle(() => desktop().deleteAsset(asset.id))) { setPreview(null); await reload(); }
  };

  const openTrash = async () => {
    setTrash(true); setShowMembers(false);
    const result = await handle(() => desktop().trash());
    if (result) setTrashEntries(result.entries || []);
  };

  const restoreEntry = async entry => {
    if (await handle(() => desktop().restore(entry.kind, entry.id))) {
      const result = await desktop().trash(); setTrashEntries(result.entries || []); await reload();
    }
  };

  const isAdmin = connection?.library?.role === "admin";
  const purgeEntry = async entry => {
    if (!window.confirm(`永久删除“${entry.name}”${entry.kind === "folder" ? "及其中所有内容" : ""}？\n文件会同时从 NAS 上删除，无法恢复。`)) return;
    const result = await handle(() => desktop().purge(entry.kind, entry.id));
    if (result) { const next = await desktop().trash(); setTrashEntries(next.entries || []); }
  };
  const emptyTrash = async () => {
    if (!trashEntries.length || !window.confirm(`清空回收站？将永久删除 ${trashEntries.length} 个项目，文件会同时从 NAS 上删除，无法恢复。`)) return;
    const result = await handle(() => desktop().emptyTrash());
    if (result) { const next = await desktop().trash(); setTrashEntries(next.entries || []); }
  };

  const openMembers = async () => {
    setShowMembers(true); setTrash(false);
    const result = await handle(() => desktop().members());
    if (result) setMembers(result.members || []);
  };

  const addMember = async event => {
    event.preventDefault();
    const result = await handle(() => desktop().addMember(memberForm));
    if (!result) return;
    setMemberForm({ username: "", name: "", password: "", role: "editor" });
    const updated = await desktop().members(); setMembers(updated.members || []);
  };

  const removeMember = async member => {
    if (!window.confirm(`移除成员“${member.name}”？该成员将无法继续访问此素材库。`)) return;
    if (await handle(() => desktop().removeMember(member.id))) {
      const updated = await desktop().members(); setMembers(updated.members || []);
    }
  };

  const download = asset => handle(() => desktop().download({ id: asset.id, name: asset.name }));
  const folderById = new Map(folders.map(folder => [folder.id, folder]));
  const folderPath = folder => {
    const names = [folder.name]; let parent = folderById.get(folder.parentId), remaining = 100;
    while (parent && remaining-- > 0) { names.unshift(parent.name); parent = folderById.get(parent.parentId); }
    return names.join(" / ");
  };
  const folderRows = folders.map(folder => {
    let depth = 0, parent = folderById.get(folder.parentId), remaining = 100;
    while (parent && remaining-- > 0) { depth += 1; parent = folderById.get(parent.parentId); }
    return { folder, depth, path: folderPath(folder) };
  }).sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
  const canMoveFolderTo = (moving, candidate) => {
    if (!candidate) return true;
    if (candidate.id === moving?.id) return false;
    let current = candidate, remaining = 100;
    while (current && remaining-- > 0) {
      if (current.id === moving?.id) return false;
      current = folderById.get(current.parentId);
    }
    return true;
  };
  const applyFolderMove = async () => {
    if (!movingFolder) return;
    const updated = await handle(() => desktop().updateFolder(movingFolder.id, { parentId: moveFolderParent || null }));
    if (updated) { setMovingFolder(null); await reload(); }
  };
  const breadcrumbs = [];
  let ancestor = folderById.get(folderId);
  while (ancestor && breadcrumbs.length < 100) { breadcrumbs.unshift(ancestor); ancestor = folderById.get(ancestor.parentId); }
  const childFolders = folders.filter(folder => (folder.parentId || null) === folderId).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  const searchNow = async event => { event.preventDefault(); setSearched(search.trim()); await loadAssets(true, folderId, search.trim()); };

  return <div className="team-library-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section className="team-library-window" role="dialog" aria-modal="true" aria-label="NAS 团队素材库">
      <header className="team-library-header">
        <div className="team-library-title"><Folder size={19} /><div><strong>团队素材库</strong><span>{connection?.online ? `在线 · ${connection.username}` : connection?.connected ? "服务暂不可达" : "公司局域网共享"}</span></div></div>
        {connection?.online && <>
          {connection.libraries?.length > 1 && <select aria-label="选择团队素材库" value={connection.library.id} onChange={event => pickLibrary(event.target.value)}>{connection.libraries.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
          <span className="team-library-live"><i />实时同步</span>
          <Button title="刷新" onClick={reload} disabled={busy || loading}><RefreshCw size={16} /></Button>
          <Button title="回收站" className={trash ? "selected" : ""} onClick={openTrash}><Trash2 size={16} /></Button>
          {connection.library?.role === "admin" && <Button title="成员管理" className={showMembers ? "selected" : ""} onClick={openMembers}><Users size={16} /></Button>}
          <Button title="断开连接" onClick={() => handle(async () => { await desktop().disconnect(); setConnection({ connected: false }); setFolders([]); setAssets([]); })}><LogOut size={16} /></Button>
        </>}
        {connection?.connected && !connection.online && !connection.needsLogin && <Button onClick={() => handle(async () => {
          const status = await desktop().status();
          setConnection(status);
          if (!status.online) throw new Error(status.error || "团队素材库仍不可达");
          setError(""); await reload();
        })}>重试连接</Button>}
        <Button title="关闭" onClick={close}><X size={18} /></Button>
      </header>

      {!showServerForm && !connection?.connected && folderApi() ? <form className="team-library-connect" onSubmit={event => { event.preventDefault(); if (!folderPick) pickFolder(); }}>
        <div className="team-library-connect-icon"><Folder size={30} /></div>
        <h2>连接公司团队素材库</h2>
        <p>选择 NAS 上的素材库文件夹。第一个人选一个空文件夹会创建素材库，其他人选同一个文件夹就会自动加入，不需要账号和服务器。</p>
        <label>你的名字<input value={memberName} maxLength={40} onChange={event => setMemberName(event.target.value)} placeholder="同事会在成员列表里看到" /></label>
        {!folderPick ? <Button type="submit" disabled={folderBusy}>{folderBusy ? "请稍候…" : "选择 NAS 文件夹"}</Button>
          : <div className="team-library-folder-pick">
            <div className="team-library-folder-path" title={folderPick.path}><Folder size={15} /><span>{folderPick.path}</span></div>
            {folderPick.isLibrary
              ? <><p>这是素材库「{folderPick.name}」：{folderPick.assets} 个素材、{folderPick.members} 位成员。加入后默认可以上传和整理素材，管理员可以调整权限。</p>
                <Button type="button" className="team-library-primary" disabled={folderBusy || !nameReady} onClick={() => connectFolder(false)}>{folderBusy ? "正在加入…" : "加入这个素材库"}</Button></>
              : <><p>这个文件夹还不是素材库{folderPick.existingEntries ? `（里面已有 ${folderPick.existingEntries} 个文件或文件夹，不会被改动或删除）` : ""}。要在这里创建新的团队素材库吗？你会成为管理员。</p>
                <Button type="button" className="team-library-primary" disabled={folderBusy || !nameReady} onClick={() => connectFolder(true)}>{folderBusy ? "正在创建…" : "在这里创建素材库"}</Button></>}
            <Button type="button" disabled={folderBusy} onClick={() => { setFolderPick(null); setFolderError(""); }}>重新选择文件夹</Button>
          </div>}
        {folderError && <p className="team-library-error">{folderError}</p>}
        <button type="button" className="team-library-link" onClick={() => setShowServerForm(true)}>改用服务器连接（高级）</button>
      </form> : !connection?.connected || connection.needsLogin ? <form className="team-library-connect" onSubmit={submitConnect}>
        <div className="team-library-connect-icon"><Folder size={30} /></div>
        <h2>{connection?.needsLogin ? "登录已过期" : "连接公司团队素材库"}</h2>
        <p>{connection?.needsLogin ? "请重新输入密码。账号和服务器地址已为你填好；连续 14 天不使用才会过期，每天使用会自动续期。" : "填写管理员提供的 HTTPS 服务地址和个人账号。登录状态会加密保存在这台电脑上。"}</p>
        <label>服务器地址<input autoComplete="url" value={serverUrl} onChange={event => setServerUrl(event.target.value)} placeholder="https://素材库服务器:43180" /></label>
        <label>账号<input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} /></label>
        <label>密码<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
        {error && <p className="team-library-error">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? "正在连接…" : "连接素材库"}</Button>
        {!connection?.connected && folderApi() && <button type="button" className="team-library-link" onClick={() => setShowServerForm(false)}>返回选择 NAS 文件夹</button>}
      </form> : <>
        <div className="team-library-toolbar">
          {showMembers ? <><strong>成员管理</strong><span>{members.length} 位成员</span><Button onClick={() => setShowMembers(false)}>返回素材</Button></> : trash ? <><strong>回收站</strong><span>{isAdmin ? "删除的文件和文件夹可在此恢复；管理员可永久删除" : "删除的文件和文件夹可在此恢复，永久删除需要管理员"}</span>{isAdmin && trashEntries.length > 0 && <Button className="team-library-danger" onClick={emptyTrash} disabled={busy}><Trash2 size={15} />清空回收站</Button>}<Button onClick={() => { setTrash(false); reload(); }}>返回素材</Button></> : <>
            <div className="team-library-breadcrumbs">
              <Button className={!folderId ? "active" : ""} onClick={() => { setFolderId(null); loadAssets(true, null); }}>全部素材</Button>
              {breadcrumbs.map(folder => <React.Fragment key={folder.id}><b>›</b><Button className={folder.id === folderId ? "active" : ""} onClick={() => { setFolderId(folder.id); loadAssets(true, folder.id); }}>{folder.name}</Button></React.Fragment>)}
            </div>
            <form className="team-library-search" onSubmit={searchNow}><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索素材名称" /><Button type="submit">搜索</Button></form>
            <div className="team-library-view-toggle" role="group" aria-label="视图">
              <Button className={viewMode === "grid" ? "active" : ""} title="网格视图" aria-pressed={viewMode === "grid"} onClick={() => setViewMode("grid")}><LayoutGrid size={15} /></Button>
              <Button className={viewMode === "list" ? "active" : ""} title="列表视图" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")}><List size={15} /></Button>
            </div>
            <Button onClick={() => setFolderDraft("")}><FolderPlus size={15} />新建文件夹</Button>
            <Button onClick={upload} disabled={Boolean(uploading)}><Upload size={15} />上传素材</Button>
          </>}
        </div>

        {(error || (connection?.connected && !connection.online && connection.error)) && <div className="team-library-error-banner" role="alert">{error || connection.error}<Button onClick={() => setError("")}><X size={14} /></Button></div>}
        {uploading && <div className="team-library-upload-status"><LoaderCircle className="team-library-spin" size={15} />上传 {uploading.fileIndex || 1}/{uploading.fileCount || 1} · {uploading.name || "准备文件"} · {uploading.total ? `${formatBytes(uploading.sent)} / ${formatBytes(uploading.total)}` : "等待数据"}</div>}

        {showMembers ? <main className="team-library-members">
          <form onSubmit={addMember}>
            <h3>添加成员</h3><p>创建一个可登录团队素材库的账号。密码至少 10 个字符。</p>
            <label>账号<input required value={memberForm.username} onChange={event => setMemberForm(current => ({ ...current, username: event.target.value }))} /></label>
            <label>显示名称<input value={memberForm.name} onChange={event => setMemberForm(current => ({ ...current, name: event.target.value }))} /></label>
            <label>初始密码<input type="password" minLength={10} required value={memberForm.password} onChange={event => setMemberForm(current => ({ ...current, password: event.target.value }))} /></label>
            <label>权限<select value={memberForm.role} onChange={event => setMemberForm(current => ({ ...current, role: event.target.value }))}><option value="editor">编辑成员：上传和整理素材</option><option value="admin">管理员：另可管理成员</option></select></label>
            <Button type="submit" disabled={busy}><Plus size={15} />添加成员</Button>
          </form>
          <div className="team-library-member-list">{members.map(member => <article key={member.id}><div><strong>{member.name}</strong><span>{member.username}</span></div><em>{member.role === "admin" ? "管理员" : "编辑"}</em>{member.id !== connection.library?.ownerId && <Button title="移除成员" onClick={() => removeMember(member)}><Trash2 size={15} /></Button>}</article>)}</div>
        </main> : trash ? <main className="team-library-asset-list team-library-trash-list">
          {loading ? <p className="team-library-empty">正在读取回收站…</p> : trashEntries.length ? trashEntries.map(entry => <article key={`${entry.kind}-${entry.id}`}><div className="team-library-file-icon"><File size={18} /></div><div className="team-library-asset-name"><strong>{entry.name}</strong><span>{entry.kind === "folder" ? "文件夹" : formatBytes(entry.size)}</span></div><Button onClick={() => restoreEntry(entry)}>恢复</Button>{isAdmin && <Button className="team-library-danger" onClick={() => purgeEntry(entry)} disabled={busy}>永久删除</Button>}</article>) : <p className="team-library-empty">回收站为空</p>}
        </main> : <main className="team-library-content">
          <aside className="team-library-folder-tree">
            <Button className={!folderId ? "active" : ""} onClick={() => { setFolderId(null); loadAssets(true, null); }}><Folder size={15} />全部素材</Button>
            {folderRows.map(({ folder, depth }) => <Button key={folder.id} className={folder.id === folderId ? "active" : ""} style={{ "--team-folder-depth": Math.min(8, depth) }} onClick={() => { setFolderId(folder.id); loadAssets(true, folder.id); }} title={folder.name}><Folder size={14} /><span>{folder.name}</span><i className="team-library-folder-actions"><b onClick={event => { event.stopPropagation(); renameFolder(folder); }}>改名</b><b onClick={event => { event.stopPropagation(); setMovingFolder(folder); setMoveFolderParent(folder.parentId || ""); }}>移动</b><b onClick={event => { event.stopPropagation(); deleteFolder(folder); }}>删除</b></i></Button>)}
          </aside>
          <section className="team-library-assets-area">
            {folderDraft !== null && <form className="team-library-new-folder" onSubmit={createFolder}><input autoFocus value={folderDraft} onChange={event => setFolderDraft(event.target.value)} placeholder="文件夹名称" /><Button type="submit" disabled={busy}>创建</Button><Button type="button" onClick={() => setFolderDraft(null)}>取消</Button></form>}
            {movingFolder && <div className="team-library-new-folder"><strong>移动“{movingFolder.name}”到</strong><select value={moveFolderParent} onChange={event => setMoveFolderParent(event.target.value)}><option value="">根目录</option>{folderRows.filter(({ folder }) => canMoveFolderTo(movingFolder, folder)).map(({ folder, path }) => <option key={folder.id} value={folder.id}>{path}</option>)}</select><Button onClick={applyFolderMove} disabled={busy}>移动</Button><Button onClick={() => setMovingFolder(null)}>取消</Button></div>}
            {childFolders.length > 0 && <div className="team-library-subfolders">{childFolders.map(folder => <button key={folder.id} onClick={() => { setFolderId(folder.id); loadAssets(true, folder.id); }}><Folder size={17} /><span>{folder.name}</span></button>)}</div>}
            <div className={viewMode === "grid" ? "team-library-asset-grid" : "team-library-asset-list"}>
              {loading ? <p className="team-library-empty">正在读取素材…</p> : assets.length ? assets.map(asset => {
                const mover = <select value={asset.folderId || ""} aria-label={`移动 ${asset.name}`} onChange={event => moveAsset(asset, event.target.value)}><option value="">根目录</option>{folderRows.map(({ folder, path }) => <option key={folder.id} value={folder.id}>{path}</option>)}</select>;
                const actions = <><Button title="改名" onClick={() => renameAsset(asset)}>改名</Button><Button title="下载" onClick={() => download(asset)}><Download size={15} /></Button><Button title="移入回收站" onClick={() => deleteAsset(asset)}><Trash2 size={15} /></Button></>;
                const info = <><strong>{asset.name}</strong><span>{formatBytes(asset.size)} · {asset.type || "文件"}</span></>;
                return viewMode === "grid"
                  ? <article key={asset.id} className="team-library-card">
                    <button className="team-library-card-thumb" title="预览素材" onClick={() => setPreview(asset)}><TeamThumb asset={asset} libraryId={connection?.library?.id} onNeed={requestThumbnail} /></button>
                    <button className="team-library-card-name" title={asset.name} onClick={() => setPreview(asset)}>{info}</button>
                    <div className="team-library-card-actions">{mover}{actions}</div>
                  </article>
                  : <article key={asset.id}>
                    <button className="team-library-file-icon" title="预览素材" onClick={() => setPreview(asset)}><TeamThumb asset={asset} libraryId={connection?.library?.id} onNeed={requestThumbnail} /></button>
                    <button className="team-library-asset-name" title={asset.name} onClick={() => setPreview(asset)}>{info}</button>
                    {mover}{actions}
                  </article>;
              }) : <p className="team-library-empty">{searched ? "没有找到匹配的素材" : "当前文件夹为空。可以新建文件夹或上传素材。"}</p>}
              {cursor && <Button className="team-library-load-more" onClick={() => loadAssets(false)} disabled={busy}>加载更多</Button>}
            </div>
          </section>
        </main>}
        <footer className="team-library-footer"><span>变更序号 {revision}</span><span>NAS 原文件 · 服务端目录 · 实时同步</span></footer>
      </>}
    </section>
    {preview && <TeamAssetPreview asset={preview} libraryId={connection?.library?.id} close={() => setPreview(null)} download={download} />}
  </div>;
}
