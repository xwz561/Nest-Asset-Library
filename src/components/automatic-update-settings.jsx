import { useState } from 'react';

export function AutomaticUpdateSettings({ state }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const labels = { idle: '等待检查', checking: '正在后台检查更新', downloading: '正在后台下载更新', ready: state.silentInstall ? '已下载，将在退出程序或下次启动时安装' : '已下载，需要手动安装', installing: '正在安装更新', error: '更新暂未完成' };
  return <div className="automatic-update-settings">
    <label className="automatic-update-row"><input type="checkbox" role="switch" aria-label="开启自动更新" checked={state.enabled !== false} disabled={busy} onChange={async event => {
      setBusy(true); setError(''); try { const result = await window.nestDesktop.setAutoUpdateEnabled(event.target.checked); if (result?.error) setError(result.error); } catch (err) { setError(err.message); } finally { setBusy(false); }
    }} /><span><strong>后台自动更新</strong><small>发现新版后自动下载。当前用户 Windows 安装版在托盘退出或下次启动时安装；关闭主窗口仍保持后台运行。</small></span></label>
    <p className="settings-hint" role="status">{labels[state.phase] || '等待检查'}{state.progress && state.phase === 'downloading' ? ` · ${Math.floor(state.progress.percent || 0)}%` : ''}{state.pendingVersion ? ` · v${state.pendingVersion}` : ''}</p>
    {state.reason && <p className="settings-hint">{state.reason}，更新仍可在后台下载。</p>}
    {(error || state.error) && <p className="automatic-update-error" role="alert">{error || state.error}</p>}
  </div>;
}
