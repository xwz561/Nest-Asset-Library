import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "../ready-ui.jsx";
import { X, Video, HardDrive, ShieldCheck, LogIn, LogOut, RotateCw, Image as ImageIcon, Music, FileText, Import } from "lucide-react";

export function AIFlowImportDialog({ close, importing, importItems, folderName, hasTargetFolder, applyLibrary }) {
  const [source, setSource] = useState("server");
  const [settings, setSettings] = useState(null);
  const [token, setToken] = useState("");
  const [scan, setScan] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedEpisodeId, setSelectedEpisodeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const scanRequestRef = useRef(0);

  useEffect(() => {
    let alive = true;
    window.nestDesktop.aiFlow
      .settings()
      .then((result) => {
        if (!alive) return;
        if (result?.error) setStatus(result.error);
        else setSettings(result);
      })
      .catch((error) => alive && setStatus(`读取 AI Flow 设置失败：${error.message}`))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const updateSetting = (key, value) =>
    setSettings((current) => ({ ...current, [key]: value }));
  const clearScan = ({ clearProjects = false } = {}) => {
    scanRequestRef.current += 1;
    setScan(null);
    setSelected(new Set());
    if (clearProjects) {
      setProjects([]);
      setSelectedProjectId("");
      setSelectedEpisodeId("");
    }
  };
  const resetScan = (nextSource = source) => {
    setSource(nextSource);
    clearScan({ clearProjects: true });
    setStatus("");
  };
  const persist = async (overrides = {}) => {
    if (!settings) return null;
    const pending = { ...settings, ...overrides };
    setSaving(true);
    try {
      const input = {
        baseUrl: pending.baseUrl,
        localRoot: pending.localRoot,
        authMode: pending.authMode,
        ...(pending.authMode === "token" && token.trim() ? { token } : {}),
      };
      const result = await window.nestDesktop.aiFlow.saveSettings(input);
      if (result?.error) {
        setStatus(result.error);
        return null;
      }
      setSettings(result.settings);
      setToken("");
      return result.settings;
    } catch (error) {
      setStatus(`保存 AI Flow 设置失败：${error.message}`);
      return null;
    } finally {
      setSaving(false);
    }
  };
  const selectAuthMode = async (authMode) => {
    if (!settings || settings.authMode === authMode || loading || importing) return;
    const saved = await persist({ authMode });
    if (!saved) return;
    clearScan({ clearProjects: true });
    setStatus(authMode === "session" ? "请登录 AI Flow 账号后读取本人已完成视频" : "已切换为访问令牌方式");
  };
  const signIn = async () => {
    const saved = await persist({ authMode: "session" });
    if (!saved) return;
    setLoading(true);
    setStatus("正在打开 AI Flow 登录窗口…");
    try {
      const result = await window.nestDesktop.aiFlow.signIn();
      if (result?.error) {
        setStatus(result.error);
        return;
      }
      if (result?.settings) setSettings(result.settings);
      if (result?.cancelled) {
        setStatus("已取消 AI Flow 登录");
        return;
      }
      clearScan({ clearProjects: true });
      const account = result?.account;
      setStatus(account ? `已登录 ${account.displayName || account.username || "AI Flow 账号"}` : "AI Flow 登录成功");
    } catch (error) {
      setStatus(`登录 AI Flow 失败：${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  const signOut = async () => {
    if (!settings) return;
    setLoading(true);
    try {
      const result = await window.nestDesktop.aiFlow.signOut();
      if (result?.error) {
        setStatus(result.error);
        return;
      }
      if (result?.settings) setSettings(result.settings);
      if (result?.library) applyLibrary(result.library);
      clearScan({ clearProjects: true });
      const detachedCount = Number(result?.detached?.roots || 0) + Number(result?.detached?.folders || 0);
      setStatus(detachedCount ? `已退出 AI Flow 账号，并解除 ${detachedCount} 个文件夹连接` : "已退出 AI Flow 账号");
    } catch (error) {
      setStatus(`退出 AI Flow 失败：${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  const refresh = async (requestedEpisodeId = selectedEpisodeId) => {
    const episodeId = typeof requestedEpisodeId === "string" || typeof requestedEpisodeId === "number"
      ? String(requestedEpisodeId).trim()
      : String(selectedEpisodeId || "").trim();
    const requestId = ++scanRequestRef.current;
    const saved = await persist();
    if (!saved) return;
    if (requestId !== scanRequestRef.current) return;
    if (source === "server" && saved.authMode === "session" && !saved.sessionAuthenticated) {
      setStatus("请先登录 AI Flow 账号");
      return;
    }
    setLoading(true);
    setStatus("");
    try {
      const result = source === "server"
        ? episodeId
          ? await window.nestDesktop.aiFlow.listServerVideos({ episodeId })
          : await window.nestDesktop.aiFlow.listServerVideos()
        : await window.nestDesktop.aiFlow.listLocalAssets();
      if (requestId !== scanRequestRef.current) return;
      if (result?.error) {
        setStatus(result.error);
        return;
      }
      setScan(result);
      if (source === "server" && Array.isArray(result.projects))
        setProjects(result.projects);
      setSelected(new Set());
      const label = source === "server" ? "视频" : "素材";
      setStatus(result.videos?.length ? `已发现 ${result.videos.length} 个可导入${label}` : `没有发现可导入的${label}`);
    } catch (error) {
      if (requestId === scanRequestRef.current)
        setStatus(`读取 AI Flow ${source === "server" ? "视频" : "素材"}失败：${error.message}`);
    } finally {
      if (requestId === scanRequestRef.current) setLoading(false);
    }
  };
  const selectProject = (projectId) => {
    setSelectedProjectId(projectId);
    setSelectedEpisodeId("");
    clearScan();
    setStatus(
      projectId
        ? "请选择具体集数后自动读取；选择“全部集数”后可手动读取当前项目视频。"
        : "已切换为全部项目，请点击“读取已完成任务”。",
    );
  };
  const selectEpisode = (episodeId) => {
    setSelectedEpisodeId(episodeId);
    clearScan();
    if (!episodeId) {
      setStatus(
        selectedProjectId
          ? "已选择当前项目的全部集数，请点击“读取已完成任务”。"
          : "已选择全部项目、全部集数，请点击“读取已完成任务”。",
      );
      return;
    }
    setStatus("正在读取所选集数的已完成视频…");
    void refresh(episodeId);
  };
  const testConnection = async () => {
    const saved = await persist();
    if (!saved) return;
    if (saved.authMode === "session" && !saved.sessionAuthenticated) {
      setStatus("请先登录 AI Flow 账号");
      return;
    }
    setLoading(true);
    try {
      const result = await window.nestDesktop.aiFlow.testConnection();
      setStatus(result?.error || "AI Flow 连接正常");
    } catch (error) {
      setStatus(`连接 AI Flow 失败：${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  const clearToken = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const result = await window.nestDesktop.aiFlow.saveSettings({
        baseUrl: settings.baseUrl,
        localRoot: settings.localRoot,
        authMode: settings.authMode,
        clearToken: true,
      });
      if (result?.error) setStatus(result.error);
      else {
        setSettings(result.settings);
        setToken("");
        setStatus("已移除本机保存的 AI Flow 令牌");
      }
    } catch (error) {
      setStatus(`移除令牌失败：${error.message}`);
    } finally {
      setSaving(false);
    }
  };
  const toggle = (id) =>
    setSelected((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAll = () => {
    const ids = videos.map((item) => item.id);
    const allVisibleSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };
  const submit = async () => {
    if (!scan || !selected.size || importing) return;
    const result = await importItems(source, scan.scanId, [...selected]);
    if (result?.error) setStatus(result.error);
  };
  const formatBytes = (value) => {
    const bytes = Number(value) || 0;
    if (!bytes) return "大小未知";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const unit = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / 1024 ** unit).toFixed(unit ? 1 : 0)} ${units[unit]}`;
  };
  const formatDuration = (value) => {
    const seconds = Number(value) || 0;
    if (!seconds) return "时长未知";
    const minute = Math.floor(seconds / 60);
    return `${minute ? `${minute}:` : ""}${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  };
  const settingsReady = Boolean(settings);
  const selectedProject = useMemo(
    () => projects.find((project) => String(project.id) === String(selectedProjectId)),
    [projects, selectedProjectId],
  );
  const episodes = selectedProject?.episodes || [];
  const videos = useMemo(() => {
    const numberOrLast = (value) => {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric;
      const parsedDate = Date.parse(String(value || "").replace(" ", "T"));
      return Number.isFinite(parsedDate) ? parsedDate : Number.MAX_SAFE_INTEGER;
    };
    return (scan?.videos || [])
      .filter((video) =>
        source !== "server" || !selectedProjectId
          ? true
          : String(video.projectId || "") === String(selectedProjectId),
      )
      .filter((video) =>
        source !== "server" || !selectedEpisodeId
          ? true
          : String(video.episodeId || "") === String(selectedEpisodeId),
      )
      .slice()
      .sort((left, right) => {
        for (const key of ["storyOrder", "shotNumber", "versionNumber"]) {
          const delta = numberOrLast(left[key]) - numberOrLast(right[key]);
          if (delta) return delta;
        }
        return Number(right.completedAt || 0) - Number(left.completedAt || 0)
          || String(left.name || "").localeCompare(String(right.name || ""), "zh-CN");
      });
  }, [scan, source, selectedProjectId, selectedEpisodeId]);
  const allVisibleSelected = videos.length > 0 && videos.every((video) => selected.has(video.id));
  const projectNameFor = (video) =>
    video.projectName ||
    projects.find((project) => String(project.id) === String(video.projectId || ""))?.name ||
    "未归属项目";
  const episodeNameFor = (video) => {
    if (video.episodeName) return video.episodeName;
    const project = projects.find((item) => String(item.id) === String(video.projectId || ""));
    return project?.episodes?.find((episode) => String(episode.id) === String(video.episodeId || ""))?.name || "未归属集数";
  };
  const sequenceLabelFor = (video) => {
    const parts = [];
    if (video.storyOrder !== undefined && video.storyOrder !== null && video.storyOrder !== "")
      parts.push(`顺序 ${video.storyOrder}`);
    if (video.shotNumber !== undefined && video.shotNumber !== null && video.shotNumber !== "")
      parts.push(`镜头 ${video.shotNumber}`);
    if (video.versionNumber !== undefined && video.versionNumber !== null && video.versionNumber !== "")
      parts.push(`版本 ${video.versionNumber}`);
    return parts.join(" · ");
  };
  const accountLabel = settings?.account?.displayName || settings?.account?.username || "";
  return (
    <div
      className="modal-backdrop aiflow-import-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && !importing && close()}
    >
      <section className="app-dialog aiflow-import-dialog" role="dialog" aria-modal="true" aria-label="导入 AI Flow 素材">
        <div className="dialog-head">
          <div>
            <h2>导入 AI Flow 素材</h2>
            <small>{hasTargetFolder ? `只读取你勾选的 AI Flow 素材；导入后复制到「${folderName}」，不会移动、删除或反向写入 AI Flow 原文件。` : `当前为「${folderName}」。AI Flow 导入会沿用原有逻辑；浏览器扩展不会误导入根目录，请先在左侧选择文件夹。`}</small>
          </div>
          <Button type="button" aria-label="关闭" disabled={importing} onClick={close}><X size={18} /></Button>
        </div>
        <div className="aiflow-source-tabs" role="tablist" aria-label="AI Flow 来源">
          <Button type="button" className={source === "server" ? "active" : ""} onClick={() => resetScan("server")}>
            <Video size={15} /> AI Flow 服务
          </Button>
          <Button type="button" className={source === "local" ? "active" : ""} onClick={() => resetScan("local")}>
            <HardDrive size={15} /> 本机素材
          </Button>
        </div>
        {settingsReady ? (
          <div className="aiflow-settings-grid">
            {source === "server" && <>
              <label>
                <span>AI Flow 服务地址</span>
                <input value={settings.baseUrl || ""} onChange={(event) => updateSetting("baseUrl", event.target.value)} placeholder="https://your-ai-flow.example.com" disabled={loading || importing} />
              </label>
              <section className="aiflow-auth-panel" aria-label="AI Flow 账号授权">
                <div className="aiflow-auth-panel-head">
                  <span><ShieldCheck size={16} /> <b>账号登录</b><small>推荐 · 仅访问当前账号有权限的视频</small></span>
                  {settings.authMode === "session" && (settings.sessionAuthenticated ? <i className="connected">已登录 {accountLabel || "AI Flow"}</i> : <i>未登录</i>)}
                </div>
                <div className="aiflow-auth-mode" role="tablist" aria-label="AI Flow 认证方式">
                  <Button type="button" role="tab" aria-selected={settings.authMode === "session"} className={settings.authMode === "session" ? "active" : ""} disabled={loading || saving || importing} onClick={() => selectAuthMode("session")}>
                    <LogIn size={14} /> 账号登录
                  </Button>
                  <Button type="button" role="tab" aria-selected={settings.authMode === "token"} className={settings.authMode === "token" ? "active" : ""} disabled={loading || saving || importing} onClick={() => selectAuthMode("token")}>
                    高级：访问令牌
                  </Button>
                </div>
                {settings.authMode === "session" ? (
                  <div className="aiflow-login-state">
                    <p>{settings.sessionAuthenticated ? `当前已授权：${accountLabel || "AI Flow 账号"}（登录状态已保存在本机）` : "点击登录后，在独立的 AI Flow 窗口完成登录；登录状态会保存在本机，素材库不会保存你的密码。"}</p>
                    <div>
                      <Button type="button" className="primary" disabled={loading || saving || importing} onClick={signIn}><LogIn size={15} /> {settings.sessionAuthenticated ? "重新登录" : "登录 AI Flow"}</Button>
                      {settings.sessionAuthenticated && <Button type="button" disabled={loading || saving || importing} onClick={signOut}><LogOut size={15} /> 退出登录</Button>}
                    </div>
                  </div>
                ) : (
                  <label className="aiflow-token-field">
                    <span>访问令牌 {settings.hasToken ? <em>已安全保存</em> : <em>未设置</em>}</span>
                    <input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder={settings.hasToken ? "留空则继续使用已保存令牌" : "输入 AI Flow Bearer Token"} autoComplete="off" disabled={loading || importing} />
                    {settings.hasToken && <Button type="button" disabled={saving || loading || importing} onClick={clearToken}>移除令牌</Button>}
                  </label>
                )}
              </section>
            </>}
            {source === "local" && (
              <label>
                <span>AI Flow 本地素材目录</span>
                <input value={settings.localRoot || ""} onChange={(event) => updateSetting("localRoot", event.target.value)} placeholder="D:\\AI_Flow\\Assets save-dev\\ep01" disabled={loading || importing} />
              </label>
            )}
            <div className="aiflow-settings-actions">
              {source === "server" && <Button type="button" disabled={loading || saving || importing} onClick={testConnection}>测试连接</Button>}
              <Button type="button" className="primary" disabled={loading || saving || importing} onClick={() => refresh()}>
                <RotateCw size={15} /> {loading ? "处理中…" : source === "server" ? "读取已完成任务" : "扫描本机素材"}
              </Button>
            </div>
          </div>
        ) : <div className="aiflow-empty">正在读取 AI Flow 设置…</div>}
        {source === "server" && (
          <div className="aiflow-settings-grid" style={{ marginTop: 10, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
            <label>
              <span>项目</span>
              <select
                value={selectedProjectId}
                onChange={(event) => selectProject(event.target.value)}
                disabled={loading || saving || importing || !projects.length}
                style={{ width: "100%", height: 35, padding: "0 10px", border: "1px solid var(--ui-border)", borderRadius: 7, background: "var(--bg-card)", color: "var(--text-primary)" }}
              >
                <option value="">全部项目</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name || `项目 ${project.id}`}</option>)}
              </select>
            </label>
            <label>
              <span>集数</span>
              <select
                value={selectedEpisodeId}
                onChange={(event) => selectEpisode(event.target.value)}
                disabled={loading || saving || importing || !projects.length || (selectedProjectId && !episodes.length)}
                style={{ width: "100%", height: 35, padding: "0 10px", border: "1px solid var(--ui-border)", borderRadius: 7, background: "var(--bg-card)", color: "var(--text-primary)" }}
              >
                <option value="">全部集数</option>
                {episodes.map((episode) => <option key={episode.id} value={episode.id}>{episode.name || `第 ${episode.episodeNumber || episode.sortOrder || episode.id} 集`}</option>)}
              </select>
            </label>
            <small style={{ gridColumn: "1 / -1", color: "var(--text-secondary)", fontSize: 9 }}>
              {projects.length ? "选择具体集数后会自动读取该集全部已完成视频；列表按剧情顺序、镜头、版本排序。" : "先读取一次已完成任务，即可按项目和集数筛选。"}
            </small>
          </div>
        )}
        <div className="aiflow-video-toolbar">
          <div>
            <b>{source === "server" ? "已完成视频" : "本机 AI Flow 素材"}</b>
            <small>{scan?.truncated ? `仅显示前 ${videos.length} 项，请缩小本机输出目录后重试` : scan ? `${videos.length} 项` : "点击上方按钮读取"}</small>
          </div>
          <Button type="button" disabled={!videos.length || loading || importing} onClick={toggleAll}>{allVisibleSelected ? "清空选择" : "全选"}</Button>
        </div>
        <div className="aiflow-video-list" aria-busy={loading || importing}>
          {!loading && !videos.length && <div className="aiflow-empty">{status || (source === "server" ? (settings?.authMode === "session" ? "登录 AI Flow 账号后读取你有权限访问的已完成任务。" : "配置访问令牌后读取 AI Flow 已完成任务。") : "填写 AI Flow 的“我的素材”目录（例如 ep01），扫描本机图片、音频、视频和文档。")}</div>}
          {videos.map((video) => (
            <label className={`aiflow-video-row ${selected.has(video.id) ? "selected" : ""}`} key={video.id}>
              <input type="checkbox" checked={selected.has(video.id)} onChange={() => toggle(video.id)} disabled={importing} />
              {source === "server" || video.kind === "video" ? <Video size={18} /> : video.kind === "image" ? <ImageIcon size={18} /> : video.kind === "audio" ? <Music size={18} /> : <FileText size={18} />}
              <span>
                <b title={video.name}>{video.name}</b>
                <small title={source === "server" ? `${projectNameFor(video)} · ${episodeNameFor(video)} · ${video.prompt || ""}` : video.relativePath}>{source === "server" ? `${projectNameFor(video)} · ${episodeNameFor(video)}${video.model ? ` · ${video.model}` : ""}` : video.relativePath}</small>
              </span>
              <i>{source === "server" ? [sequenceLabelFor(video), formatDuration(video.duration), video.completedAt ? new Date(video.completedAt).toLocaleString() : ""].filter(Boolean).join(" · ") : `${formatBytes(video.size)} · ${video.modifiedAt ? new Date(video.modifiedAt).toLocaleString() : ""}`}</i>
            </label>
          ))}
        </div>
        {status && <p className={`aiflow-status ${/失败|错误|无效|不存在|权限/.test(status) ? "error" : ""}`}>{status}</p>}
        <div className="dialog-actions">
          <Button type="button" disabled={importing} onClick={close}>取消</Button>
          <Button className="primary" type="button" disabled={!scan || !selected.size || loading || importing} onClick={submit}>
            <Import size={15} /> {importing ? "正在导入…" : `导入 ${selected.size} 个${source === "server" ? "视频" : "素材"}`}
          </Button>
        </div>
      </section>
    </div>
  );
}
