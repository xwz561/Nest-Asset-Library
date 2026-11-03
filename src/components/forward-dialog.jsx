import { useState, useEffect } from "react";
import { Button } from "../ready-ui.jsx";
import { X, Library } from "lucide-react";

// 把当前选中的素材/文件夹复制到“最近打开的另一个素材库”。只复制，不动当前库。
export function ForwardDialog({ libraries, assetCount, folderCount, assetIds, folderIds, close, done }) {
  const [targetId, setTargetId] = useState(libraries[0]?.id || "");
  const [info, setInfo] = useState(null), [folderId, setFolderId] = useState("");
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(null), [result, setResult] = useState(null);
  useEffect(() => {
    let alive = true;
    setInfo(null); setFolderId("");
    if (!targetId) return undefined;
    Promise.resolve(window.nestDesktop?.libraryForward?.info(targetId)).then(value => { if (alive) setInfo(value || { error: "读取目标素材库失败" }); }).catch(error => { if (alive) setInfo({ error: error.message }); });
    return () => { alive = false; };
  }, [targetId]);
  useEffect(() => window.nestDesktop?.libraryForward?.onProgress?.(value => setProgress(value)), []);
  const submit = async event => {
    event.preventDefault();
    if (busy || !targetId || !info || info.error || !info.canEdit) return;
    setBusy(true); setProgress(null);
    const value = await window.nestDesktop.libraryForward.run({ targetId, assetIds, folderIds, targetFolderId: folderId || null });
    setBusy(false); setResult(value || { error: "转发失败" });
    if (value && !value.error) done?.(value);
  };
  const what = [assetCount ? `${assetCount} 个素材` : "", folderCount ? `${folderCount} 个文件夹` : ""].filter(Boolean).join("、");
  const percent = progress?.total ? Math.min(100, Math.round(progress.processed / progress.total * 100)) : 0;
  return <div className="modal-backdrop forward-backdrop" onMouseDown={event => event.target === event.currentTarget && !busy && close()}>
    <form className="app-dialog forward-dialog" onSubmit={submit} onKeyDown={event => event.key === "Escape" && !busy && close()}>
      <div className="dialog-head"><div><h2>转发到其他素材库</h2><small>把 {what} 复制过去（文件夹结构、标签、备注一起带上；当前素材库不会改动）</small></div><Button type="button" aria-label="关闭" disabled={busy} onClick={close}><X size={16} /></Button></div>
      {!libraries.length ? <p className="forward-empty">还没有其他素材库。先用左上角的素材库菜单打开或新建一个，它就会出现在这里。</p> : <>
        <div className="forward-list" role="radiogroup" aria-label="目标素材库">
          {libraries.map(lib => <label key={lib.id} className={targetId === lib.id ? "chosen" : ""}>
            <input type="radio" name="forward-target" checked={targetId === lib.id} disabled={busy} onChange={() => { setTargetId(lib.id); setResult(null); }} />
            <Library size={16} /><span><b>{lib.name}</b><small title={lib.path}>{lib.path}</small></span>
          </label>)}
        </div>
        {info?.error && <p className="forward-warn">{info.error}</p>}
        {info && !info.error && !info.canEdit && <p className="forward-warn">你在「{info.name}」里只有查看权限，不能往里面添加素材。</p>}
        {info && !info.error && info.canEdit && <label className="forward-folder"><span>放到目标库的哪个文件夹</span>
          <select value={folderId} disabled={busy} onChange={event => setFolderId(event.target.value)}>
            <option value="">素材库根目录</option>
            {info.folders.map(folder => <option key={folder.id} value={folder.id}>{folder.path}</option>)}
          </select>
        </label>}
      </>}
      {busy && <div className="forward-progress"><i style={{ width: `${percent}%` }} /><span>{progress?.phase === "complete" ? "正在收尾…" : `正在复制 ${progress?.processed || 0} / ${progress?.total || "…"}`}</span></div>}
      {result && (result.error ? <p className="forward-warn">{result.error}</p> : <div className="forward-result">
        <b>已复制 {result.copied} 个素材到「{result.targetName}」</b>
        {result.duplicates > 0 && <small>{result.duplicates} 个已存在，已跳过</small>}
        {result.errors?.length > 0 && <small className="forward-warn">{result.errors.length} 个失败：{result.errors.slice(0, 3).map(item => item.name || item.error || item).join("；")}{result.errors.length > 3 ? "…" : ""}</small>}
      </div>)}
      <div className="dialog-actions"><Button type="button" disabled={busy} onClick={close}>{result && !result.error ? "完成" : "取消"}</Button>{!(result && !result.error) && <Button className="primary" type="submit" disabled={busy || !libraries.length || !info || Boolean(info.error) || !info.canEdit}>{busy ? "正在转发…" : "开始转发"}</Button>}</div>
    </form>
  </div>;
}
