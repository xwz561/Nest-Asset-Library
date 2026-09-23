import React, { useEffect, useRef, useState } from 'react';
import './lan-chat.css';
const empty = { messages: [], users: [], read: {} };
const localOnlyAddress = value => /^https?:\/\/(?:127(?:\.\d{1,3}){3}|localhost)(?::\d+)?\/?$/i.test(String(value || '').trim());
const savedChatAddress = () => {
  const saved = localStorage.getItem('chat-url') || '';
  return localOnlyAddress(saved) ? '' : saved;
};
export function LanChat({ selectedIds }) {
  const api = window.nestDesktop?.chat;
  const [open, setOpen] = useState(false), [state, setState] = useState(empty), [room, setRoom] = useState('public');
  const [url, setUrl] = useState(savedChatAddress);
  const [name, setName] = useState(localStorage.getItem('chat-name') || ''), [text, setText] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [connectionError, setConnectionError] = useState(''), [busy, setBusy] = useState(false), [hosting, setHosting] = useState(null), [preview, setPreview] = useState(''), [fileDragActive, setFileDragActive] = useState(false);
  const bottom = useRef(null), pending = useRef(false), messageKey = useRef(null);
  const roomOf = m => m.to === 'public' ? 'public' : m.from === state.id ? m.to : m.from;
  const unread = r => state.messages.filter(m => m.from !== state.id && roomOf(m) === r && m.seq > (state.read?.[r] || 0)).length;
  const total = state.messages.filter(m => m.from !== state.id && m.seq > (state.read?.[roomOf(m)] || 0)).length;
  async function poll() { if (!api || pending.current) return; pending.current = true; try { const next = await api.poll(); if (next.error) { if (next.connected === false) setState(next); if (!next.error.includes('上一项')) setConnectionError(next.error); } else { setState(next); setConnectionError(''); } } finally { pending.current = false; } }
  useEffect(() => { messageKey.current = null; }, [room]);
  useEffect(() => { if (!api) return; api.status().then(s => { if (!s.error) setState(s); }); const timer = setInterval(poll, 2500); return () => clearInterval(timer); }, []);
  useEffect(() => { if (open && state.connected && document.hasFocus() && unread(room)) api.read({ room }).then(s => { if (!s.error) setState(s); }); }, [open, room, state.cursor]);
  useEffect(() => { const focus = () => { if (open && state.connected) api.read({ room }).then(s => { if (!s.error) setState(s); }); }; window.addEventListener('focus', focus); return () => window.removeEventListener('focus', focus); }, [open, room, state.connected]);
  useEffect(() => { if (open) bottom.current?.scrollIntoView({ block: 'nearest' }); }, [state.messages.length, open, room]);
  async function act(fn) { setBusy(true); setError(''); setNotice(''); try { const result = await fn(); if (result?.error) throw new Error(result.error); return result; } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function send() { if (!text.trim()) return; const value = text; messageKey.current ||= crypto.randomUUID(); const result = await act(() => api.send({ to: room, text: value, requestId: messageKey.current })); if (result) { setText(''); messageKey.current = null; await poll(); } }
  const joinChat = () => {
    if (!hosting && localOnlyAddress(url)) {
      setError('127.0.0.1 只能连接本机。请填写开服电脑显示的局域网地址，例如 http://192.168.1.20:43127');
      return;
    }
    return act(async () => {
      const next = await api.join({ url, name });
      if (next.error) return next;
      localStorage.setItem('chat-url', url);
      localStorage.setItem('chat-name', name);
      setState(next);
      await poll();
      return next;
    });
  };
  const startHost = () => act(async () => {
    const result = await api.host();
    if (!result.error) {
      setHosting(result);
      const address = result.addresses?.[0] || '';
      if (address) setUrl(address);
    }
    return result;
  });
  const dropFiles = async event => {
    event.preventDefault();
    setFileDragActive(false);
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length) return;
    const result = await act(() => api.drop(files, { to: room }));
    if (result) await poll();
  };
  if (!api) return null;
  return <>
    <button className="top-pill" onClick={() => setOpen(!open)} title="办公室局域网聊天">聊天{total > 0 && <b className="lan-badge">{total > 99 ? '99+' : total}</b>}</button>
    {open && <section className="lan-chat" aria-label="办公室聊天">
      <div className="lan-heading"><strong>办公室聊天</strong><span>{connectionError ? '连接中断' : state.connected ? '已连接' : '未连接'}</span><button onClick={() => setOpen(false)} aria-label="关闭聊天">×</button></div>
      {!state.connected ? <div className="lan-join">
        <label>服务地址<input value={url} onChange={e => setUrl(e.target.value)} placeholder="http://192.168.1.20:43127" /></label>
        <label>你的昵称<input maxLength={32} value={name} onChange={e => setName(e.target.value)} /></label>
        <button disabled={busy || !name.trim()} onClick={joinChat}>加入聊天</button>
        <button disabled={busy} onClick={startHost}>在这台电脑启动聊天服务</button>
        <p>同事填写开服电脑显示的局域网地址。`127.0.0.1` 只能本机使用；服务电脑需保持开机。</p>
      </div> : <>
        <div className="lan-connection"><span>{state.name} · {state.url}</span><button disabled={busy} onClick={() => act(async () => { const next = await api.leave(); if (!next.error) setState(next); return next; })}>断开</button></div>
        <div className="lan-body"><nav aria-label="聊天会话">
          <button className={room === 'public' ? 'active' : ''} onClick={() => setRoom('public')}>公共群 {unread('public') || ''}</button>
          {state.users.filter(u => u.id !== state.id).map(u => <button key={u.id} className={room === u.id ? 'active' : ''} onClick={() => setRoom(u.id)}><span>{u.online ? '🟢' : '⚪'} {u.name}</span><b>{unread(u.id) || ''}</b></button>)}
          {!state.users.some(u => u.id !== state.id) && <small>还没有同事加入</small>}
        </nav><div className={`lan-conversation ${fileDragActive ? 'file-drop-active' : ''}`} onDragOver={event => { event.preventDefault(); if (!busy) setFileDragActive(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFileDragActive(false); }} onDrop={dropFiles}><strong>{room === 'public' ? '公共群' : (state.users.find(u => u.id === room)?.name || '私聊')}</strong>
          {fileDragActive && <div className="lan-file-drop-hint">松开鼠标发送原文件（单个最多 10 GB）</div>}
          <div className="lan-messages" role="log">{state.messages.filter(m => roomOf(m) === room).map(m => <article key={m.id} className={m.from === state.id ? 'mine' : ''}>
            <small>{state.users.find(u => u.id === m.from)?.name || '同事'} · {new Date(m.time).toLocaleString()}</small>
            <div className="lan-message-bubble">{m.text && <p>{m.text}</p>}
            {m.file && <div className="lan-attachment"><span>{m.file.name} · {(m.file.size / 1024 / 1024).toFixed(2)} MB</span>
              {/\.(png|jpe?g|gif|webp)$/i.test(m.file.name) && <button disabled={busy} onClick={() => act(async () => { const result = await api.download({ id: m.file.id, preview: true }); if (result.dataUrl) setPreview(result.dataUrl); return result; })}>查看图片</button>}
              <button disabled={busy} onClick={() => act(() => api.download({ id: m.file.id })).then(result => { if (result?.filePath) setNotice(`已保存到：${result.filePath}`); })}>保存附件</button></div>}
            </div>
          </article>)}<div ref={bottom} /></div>
          <textarea aria-label="聊天消息" maxLength={8000} value={text} onChange={e => { setText(e.target.value); messageKey.current = null; }} placeholder="输入消息，Ctrl+Enter 发送" onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter' && !busy) send(); }} />
          <div className="lan-actions"><button disabled={busy} onClick={() => act(async () => { const r = await api.files({ to: room }); await poll(); return r; })}>图片 / 文件</button><button disabled={busy || !selectedIds.length} onClick={() => act(async () => { const r = await api.assets({ to: room, ids: selectedIds }); await poll(); return r; })}>发送所选素材 ({selectedIds.length})</button><button disabled={busy || !text.trim()} onClick={send}>发送</button></div>
        </div></div>
      </>}
      {hosting && <div className="lan-host">服务已启动。同事连接：<b>{hosting.addresses.join(' 或 ') || '未检测到局域网 IPv4 地址'}</b><button disabled={busy} onClick={() => act(async () => { const r = await api.stop(); if (!r.error) setHosting(null); return r; })}>停止服务</button></div>}
      {(error || connectionError) && <p className="lan-error" role="alert">{error || `${connectionError}。可断开后重新加入；本机记录已保留。`}</p>}
      {notice && <p className="lan-notice" role="status">{notice}</p>}
      {busy && <small className="lan-progress">处理中…</small>}
      {preview && <div className="lan-preview" onClick={() => setPreview('')}><button aria-label="关闭图片">关闭图片</button><img src={preview} alt="聊天图片" /></div>}
    </section>}
  </>;
}
