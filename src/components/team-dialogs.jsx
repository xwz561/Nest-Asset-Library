import { useState, useEffect } from "react";
import { Button } from "../ready-ui.jsx";
import { X, Trash2, Plus } from "lucide-react";
import { previewBatchName, roleName } from "../lib/app-config.js";

export function BatchRenameDialog({ assets, folders, close, apply }) {
  const [template, setTemplate] = useState("{name}_{index}"), [busy, setBusy] = useState(false);
  const insert = token => setTemplate(current => `${current}${token}`);
  const submit = async event => { event.preventDefault(); if (busy || !assets.length) return; setBusy(true); if (!(await apply(template))) setBusy(false); };
  return <div className="modal-backdrop batch-rename-backdrop" onMouseDown={event => event.target === event.currentTarget && close()}>
    <form className="app-dialog batch-rename-dialog" onSubmit={submit} onKeyDown={event => event.key === "Escape" && close()}>
      <div className="dialog-head"><div><h2>批量重命名</h2><small>将重命名素材标题和本地原文件，共 {assets.length} 项</small></div><Button type="button" aria-label="关闭" onClick={close}><X size={18}/></Button></div>
      <label className="batch-template-field"><span>命名模板</span><input autoFocus value={template} maxLength={180} onChange={event => setTemplate(event.target.value)} /></label>
      <div className="batch-tokens">{[["{name}","原名称"],["{index}","序号"],["{folder}","文件夹"],["{tag}","首个标签"]].map(([token,label])=><Button type="button" key={token} onClick={()=>insert(token)}><code>{token}</code><span>{label}</span></Button>)}</div>
      <section className="batch-rename-preview"><header><b>实时预览</b><small>最多显示前 8 项</small></header>{assets.slice(0,8).map((asset,index)=><div key={asset.id}><span title={asset.name}>{asset.name}</span><i>→</i><b title={previewBatchName(template,asset,index,folders)}>{previewBatchName(template,asset,index,folders)}</b></div>)}</section>
      <div className="dialog-actions"><Button type="button" onClick={close}>取消</Button><Button className="primary" disabled={busy || !template.trim()} type="submit">{busy ? "正在重命名…" : `应用到 ${assets.length} 项`}</Button></div>
    </form>
  </div>;
}

export function TeamPanel({ library, close, changed }) {
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
      <div className="team-head"><div><strong>成员与权限</strong><small>共享资源库的本地协作身份与操作范围</small></div><Button onClick={close} aria-label="关闭"><X size={18}/></Button></div>
      <div className="team-notice">角色用于多人协作时防止误操作。真正的读写权限由 NAS 共享文件夹决定，请在 NAS 上给同事设置对应的访问权限。{!canManage && info && " 只有管理员可以修改成员和权限。"}</div>
      <section className="team-current"><span style={{background: info?.profile?.color || "#4f9cf9"}}>{(info?.profile?.name || "我").slice(0,1)}</span><div><b>{info?.profile?.name || "我"}</b><small>当前设备身份 · {roleName(info?.role)}</small></div></section>
      <section className="team-members">
        <header><b>资源库成员</b><small>{info?.members?.length || 0} 人</small></header>
        {(info?.members || []).map(member => <div className="team-member" key={member.id}>
          <i style={{background: member.color}}>{member.name.slice(0,1)}</i><span><b>{member.name}</b><small>{member.id === info.ownerId ? "资源库所有者" : member.invited ? "已邀请 · 同事用这个名字加入后自动生效" : "协作成员"}{member.id === info.profile?.id ? " · 这是你" : ""}</small></span>
          <select value={member.id === info.ownerId ? "owner" : member.role} disabled={!canManage || member.id === info.ownerId} onChange={(event) => run(window.nestDesktop.updateMember(member.id,{role:event.target.value}))}>
            {member.id === info.ownerId && <option value="owner">所有者</option>}<option value="admin">管理员</option><option value="editor">编辑者</option><option value="viewer">查看者</option>
          </select>
          <Button className="team-remove" disabled={!canManage || member.id === info.ownerId || member.id === info.profile?.id} onClick={() => { if (window.confirm(`移除“${member.name}”？对方之后只能查看这个资源库，不会再被自动加入。`)) run(window.nestDesktop.removeMember(member.id)); }}><Trash2 size={15}/></Button>
        </div>)}
      </section>
      {canManage && <div className="team-default-role"><span><b>新成员默认角色</b><small>同事第一次打开这个资源库时自动获得，之后可以逐个调整</small></span><select value={info?.defaultRole || "editor"} onChange={(event) => run(window.nestDesktop.setDefaultRole(event.target.value))}><option value="editor">编辑者</option><option value="viewer">查看者</option></select></div>}
      {canManage && <form className="team-add" onSubmit={(event) => {event.preventDefault();if(!name.trim())return;run(window.nestDesktop.addMember({name,role})).then(()=>setName(""));}}>
        <input value={name} onChange={event=>setName(event.target.value)} placeholder="预先添加同事（填对方在软件里用的名字）" maxLength={40}/><select value={role} onChange={event=>setRole(event.target.value)}><option value="viewer">查看者</option><option value="editor">编辑者</option><option value="admin">管理员</option></select><Button type="submit"><Plus size={15}/>添加</Button>
      </form>}
      <div className="team-matrix"><b>权限说明</b><span><em>查看者</em>浏览、搜索与预览</span><span><em>编辑者</em>导入、整理、标签和删除素材</span><span><em>管理员</em>以上全部，并可管理成员</span></div>
      {status && <p className="team-error">{status}</p>}
    </div>
  </div>;
}
