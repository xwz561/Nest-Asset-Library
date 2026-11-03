import { useEffect } from "react";
import { Wrench, X, Pipette, ExternalLink, Play, Video, Plus, Music } from "lucide-react";
import { Button } from "../ready-ui.jsx";

// 指针管家、红果、深度视频转换器都只有 Windows 版（.exe）；Mineradio 在 Mac 上用它的官方 Mac 版。
export function FriendToolsDialog({ platform, close, busy, error, launchCursorPicker, launchHongguo, launchDepthVideoConverter, launchMineradio }) {
  const windowsOnly = platform !== undefined && platform !== "win32";
  const onlyOnWindows = windowsOnly ? "仅 Windows 可用" : null;
  useEffect(() => {
    const onKeyDown = event => {
      if (event.key === "Escape" && !busy) close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, close]);
  return (
    <div className="modal-backdrop friend-tools-backdrop" onMouseDown={event => event.target === event.currentTarget && !busy && close()}>
      <section className="app-dialog friend-tools-dialog" role="dialog" aria-modal="true" aria-labelledby="friend-tools-title">
        <header className="friend-tools-heading">
          <div>
            <span className="friend-tools-heading-icon"><Wrench size={18}/></span>
            <div><h2 id="friend-tools-title">友商工具集</h2><small>{windowsOnly ? "Mac 上目前只能使用 Mineradio，其余工具仅 Windows 可用" : "点击卡片打开工具；未安装的工具可从这里安装"}</small></div>
          </div>
          <Button type="button" aria-label="关闭友商工具集" disabled={busy} onClick={close}><X size={18}/></Button>
        </header>
        <div className="friend-tools-grid" aria-label="小工具列表">
          <Button type="button" className="friend-tool-slot friend-tool-card" disabled={busy || windowsOnly} title={onlyOnWindows || undefined} onClick={launchCursorPicker}>
            <span className="friend-tool-icon"><Pipette size={22}/></span>
            <strong>{busy ? "正在启动…" : "macOS指针管家"}</strong>
            <small>{onlyOnWindows || "由刘聪大师制作"}</small>
            <ExternalLink className="friend-tool-open-icon" size={14}/>
          </Button>
          <Button type="button" className="friend-tool-slot friend-tool-card" disabled={busy || windowsOnly} title={onlyOnWindows || undefined} onClick={launchHongguo}>
            <span className="friend-tool-icon"><Play size={21}/></span>
            <strong>{busy ? "正在打开…" : "红果桌面版"}</strong>
            <small>{onlyOnWindows || "渠道有数维护 · 安装后可启动"}</small>
            <ExternalLink className="friend-tool-open-icon" size={14}/>
          </Button>
          <Button type="button" className="friend-tool-slot friend-tool-card" disabled={busy || windowsOnly} title={onlyOnWindows || undefined} onClick={launchDepthVideoConverter}>
            <span className="friend-tool-icon"><Video size={21}/></span>
            <strong>{busy ? "正在打开…" : "深度视频转换器"}</strong>
            <small>{onlyOnWindows || "自动识别 Depth Anything V2 模型"}</small>
            <ExternalLink className="friend-tool-open-icon" size={14}/>
          </Button>
          <Button type="button" className="friend-tool-slot friend-tool-card" disabled={busy} onClick={launchMineradio}>
            <span className="friend-tool-icon"><Music size={21}/></span>
            <strong>{busy ? "正在打开…" : "Mineradio"}</strong>
            <small>{platform === "darwin" ? "音乐播放器 · Mac 版：已安装直接打开，未安装去下载" : "音乐播放器 · 点击即用，无需安装"}</small>
            <ExternalLink className="friend-tool-open-icon" size={14}/>
          </Button>
          {Array.from({length: 12}, (_, index) => (
            <div className="friend-tool-slot friend-tool-empty" aria-label={`小工具空位 ${index + 1}`} key={`empty-${index}`}>
              <span className="friend-tool-icon"><Plus size={19}/></span>
              <strong>空位</strong>
              <small>待添加小工具</small>
            </div>
          ))}
        </div>
        {error && <p className="friend-tools-error" role="alert">{error}</p>}
      </section>
    </div>
  );
}
