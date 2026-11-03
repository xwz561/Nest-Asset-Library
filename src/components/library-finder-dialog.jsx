import { useState, useEffect, useRef } from "react";
import { Button } from "../ready-ui.jsx";
import { X, Folder, Search } from "lucide-react";

// 在某个目录（如 NAS 上的素材文件夹）里查找素材库，可直接打开或加入“最近素材库”。查找本身只读。
export function LibraryFinderDialog({ close, openFound, added }) {
  const api = window.nestDesktop?.libraryFinder;
  const [roots, setRoots] = useState([]), [root, setRoot] = useState(""), [scanning, setScanning] = useState(false);
  const [results, setResults] = useState([]), [progress, setProgress] = useState(null), [summary, setSummary] = useState(null), [notice, setNotice] = useState("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; api?.cancel?.(); }; }, []);
  useEffect(() => {
    Promise.resolve(api?.suggest?.()).then(value => { if (alive.current && value?.roots) setRoots(value.roots); }).catch(() => {});
    const offFound = api?.onFound?.(library => setResults(list => list.some(item => item.path === library.path) ? list : [...list, library]));
    const offProgress = api?.onProgress?.(value => setProgress(value));
    return () => { offFound?.(); offProgress?.(); };
  }, []);
  const scan = async path => {
    if (scanning || !path) return;
    setRoot(path); setResults([]); setSummary(null); setNotice(""); setScanning(true); setProgress(null);
    const value = await api.scan({ root: path });
    if (!alive.current) return;
    setScanning(false); setSummary(value || { error: "查找失败" });
  };
  const scanLocal = async () => {
    if (scanning) return;
    setRoot("本机磁盘"); setResults([]); setSummary(null); setNotice(""); setScanning(true); setProgress(null);
    const value = await api.scanLocal();
    if (!alive.current) return;
    setScanning(false); setSummary(value || { error: "查找失败" });
  };
  const pick = async () => { const value = await api.pick(); if (value?.path) { setRoots(list => list.some(item => item.path === value.path) ? list : [...list, { path: value.path, label: value.path }]); scan(value.path); } };
  const addOne = async library => {
    const value = await api.add([library.path]);
    if (value?.added) { setResults(list => list.map(item => item.path === library.path ? { ...item, known: true } : item)); added?.(value.libraries); }
    else if (value?.skipped) setNotice(`最近列表最多 ${value.max} 个，先在列表里移除不用的再加入`);
  };
  const addAll = async () => {
    const todo = results.filter(item => !item.known);
    if (!todo.length) return;
    const value = await api.add(todo.map(item => item.path));
    if (value) {
      const known = new Set((value.libraries || []).map(item => item.path.toLowerCase()));
      setResults(list => list.map(item => known.has(item.path.toLowerCase()) ? { ...item, known: true } : item));
      added?.(value.libraries);
      setNotice(value.skipped ? `已加入 ${value.added} 个；最近列表最多 ${value.max} 个，还有 ${value.skipped} 个没加入` : `已加入 ${value.added} 个`);
    }
  };
  const status = scanning ? `正在查找…已看 ${progress?.scannedDirs || 0} 个文件夹，找到 ${results.length} 个` : summary?.error ? summary.error : summary ? `${summary.cancelled ? "已停止" : "查找完成"}：看了 ${summary.scannedDirs} 个文件夹，找到 ${results.length} 个素材库${summary.truncated ? "（目录太多，只查了一部分，可换更小的目录再查）" : ""}${summary.unreadable ? `，${summary.unreadable} 个文件夹无法读取` : ""}` : "";
  return <div className="modal-backdrop finder-backdrop" onMouseDown={event => event.target === event.currentTarget && !scanning && close()}>
    <div className="app-dialog finder-dialog" role="dialog" aria-label="查找素材库" onKeyDown={event => event.key === "Escape" && !scanning && close()}>
      <div className="dialog-head"><div><h2>查找素材库</h2><small>在一个目录（比如 NAS 上的素材文件夹）里找出所有素材库。只读查找，不会改动任何文件。</small></div><Button type="button" aria-label="关闭" onClick={close}><X size={16} /></Button></div>
      <div className="finder-roots">
        {api?.scanLocal && <Button className={`finder-local ${root === "本机磁盘" ? "chosen" : ""}`} disabled={scanning} title="查找本机所有磁盘（不含网络盘/NAS 映射盘），只读" onClick={scanLocal}><Search size={14} /><span>重新查找本机素材库</span></Button>}
        {roots.map(item => <Button key={item.path} className={root === item.path ? "chosen" : ""} disabled={scanning} title={item.path} onClick={() => scan(item.path)}><Folder size={14} /><span>{item.label}</span></Button>)}
        <Button disabled={scanning} onClick={pick}><Search size={14} /><span>选择其它目录…</span></Button>
      </div>
      {root && <p className="finder-root" title={root}>{scanning && progress?.root && root === "本机磁盘" ? `正在查找：${progress.root}` : root === "本机磁盘" ? "本机固定磁盘 + 用户目录（不含网络盘）" : root}</p>}
      {status && <p className={summary?.error ? "finder-status finder-error" : "finder-status"}>{status}</p>}
      <div className="finder-list" aria-label="找到的素材库">
        {results.map(item => <div className="finder-row" key={item.path}>
          <span className="finder-icon"><Folder size={17} /></span>
          <span className="finder-copy"><strong>{item.name}{item.current && <em>当前</em>}</strong><small title={item.path}>{item.path}</small><small>{item.assets == null ? "素材数未知" : `${item.assets} 个素材`}{item.folders ? ` · ${item.folders} 个文件夹` : ""}{item.team ? " · 多人共享" : ""}</small></span>
          {!item.current && <Button disabled={scanning} onClick={() => openFound(item)}>打开</Button>}
          {!item.current && <Button disabled={item.known} onClick={() => addOne(item)}>{item.known ? "已在列表" : "加入列表"}</Button>}
        </div>)}
        {!results.length && !scanning && root && summary && !summary.error && <div className="finder-empty">这个目录下没找到素材库。素材库是包含 .nest-library.json 的文件夹。</div>}
        {!root && <div className="finder-empty">选一个目录开始查找。推荐的目录来自你最近打开过的素材库所在位置。</div>}
      </div>
      {notice && <p className="finder-status">{notice}</p>}
      <div className="dialog-actions">
        {scanning ? <Button type="button" onClick={() => api.cancel()}>停止查找</Button> : <Button type="button" onClick={close}>关闭</Button>}
        {results.some(item => !item.known && !item.current) && <Button className="primary" type="button" disabled={scanning} onClick={addAll}>全部加入列表</Button>}
      </div>
    </div>
  </div>;
}
