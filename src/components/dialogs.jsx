import { useState, useRef, useEffect } from "react";
import { Button } from "../ready-ui.jsx";
import { X, ChevronDown, Trash2, Puzzle, Download, Heart, Infinity as InfinityIcon } from "lucide-react";
import { FOLDER_ICONS, FOLDER_COLORS, fmt, APP_VERSION, EXTENSION_VERSION, CURRENT_RELEASE_NOTES } from "../lib/app-config.js";
import appIcon from "../../build/icon.png";
import { ThemeSettings } from "../theme-settings.jsx";
import communitySupportAvatar from "../assets/community-support-avatar.png";
import communitySupportPaymentQr from "../assets/community-support-payment-qr.png";

export function AppDialog({ state, resolve }) {
  const isFolder = state.kind === "folder";
  const [value, setValue] = useState(state.defaultValue || ""),
    [parentId, setParentId] = useState(state.parentId || ""),
    [icon, setIcon] = useState("folder"),
    [color, setColor] = useState("#45c28b");
  const cancelValue = state.kind === "prompt" || isFolder ? null : false;
  const submit = (e) => {
    e.preventDefault();
    resolve(
      isFolder
        ? { name: value.trim(), parentId: parentId || null, icon, color }
        : state.kind === "prompt"
          ? value
          : true,
    );
  };
  return (
    <div
      className="modal-backdrop app-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) resolve(cancelValue);
      }}
    >
      <form
        className={`app-dialog ${isFolder ? "folder-dialog" : ""}`}
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === "Escape") resolve(cancelValue);
        }}
      >
        <div className="dialog-head">
          <h2>{state.title}</h2>
          <Button
            type="button"
            aria-label="关闭"
            onClick={() => resolve(cancelValue)}
          >
            <X size={18} />
          </Button>
        </div>
        {state.detail && <p>{state.detail}</p>}
        {(state.kind === "prompt" || isFolder) && (
          <div className="dialog-field">
            <label>{isFolder ? "文件夹名称" : "名称"}</label>
            <div className="counted-input">
              <input
                autoFocus
                maxLength={isFolder ? 50 : 200}
                value={value}
                placeholder={
                  state.placeholder || (isFolder ? "输入文件夹名称" : "请输入")
                }
                onChange={(e) => setValue(e.target.value)}
              />
              {isFolder && <span>{value.length}/50</span>}
            </div>
          </div>
        )}
        {isFolder && (
          <>
            <div className="dialog-field">
              <label>父级位置</label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">资源库根目录</option>
                {state.folders.map((f) => (
                  <option value={f.id} key={f.id}>
                    {"— ".repeat(f.depth)}
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="dialog-field">
              <label>文件夹图标</label>
              <div className="icon-picker">
                {FOLDER_ICONS.map(([key, Icon]) => (
                  <Button
                    type="button"
                    className={icon === key ? "chosen" : ""}
                    key={key}
                    onClick={() => setIcon(key)}
                  >
                    <Icon size={20} />
                  </Button>
                ))}
              </div>
            </div>
            <div className="dialog-field">
              <label>文件夹颜色</label>
              <div className="color-picker">
                {FOLDER_COLORS.map((c) => (
                  <Button
                    type="button"
                    aria-label={`选择颜色 ${c}`}
                    className={color === c ? "chosen" : ""}
                    style={{ background: c }}
                    key={c}
                    onClick={() => setColor(c)}
                  >
                    {color === c && "✓"}
                  </Button>
                ))}
              </div>
            </div>
          </>
        )}
        <div className="dialog-actions">
          <Button type="button" onClick={() => resolve(cancelValue)}>
            取消
          </Button>
          <Button
            className="primary"
            type="submit"
            disabled={(state.kind === "prompt" || isFolder) && !value.trim()}
          >
            {isFolder ? "创建" : state.kind === "confirm" ? "确认" : "保存"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function ExtensionPanel({ busy, result, install, uninstall, plugins, mcpConfig, openPluginsFolder, togglePlugin, close }) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
    >
      <div className="app-dialog extension-dialog">
        <div className="dialog-head">
          <h2>扩展、插件与 MCP</h2>
          <Button aria-label="关闭" onClick={close} disabled={busy}>
            <X size={18} />
          </Button>
        </div>
        <p>网页采集器用于浏览器导入；本地插件默认关闭并按清单授权；MCP 默认只读。</p>
        <h3 className="extension-section-title">网页采集器{EXTENSION_VERSION && <small className="extension-version"> v{EXTENSION_VERSION}</small>}</h3>
        {EXTENSION_VERSION && <small className="extension-version-hint">安装包里带的是 v{EXTENSION_VERSION}。素材库更新后点一次下面的“安装”，再在浏览器扩展页点“重新加载”，就换成新版。</small>}
        <div className="browser-choices">
          <Button disabled={busy} onClick={() => install("chrome")}>
            <b className="browser-logo chrome-logo">●</b>
            <span>
              <strong>Google Chrome</strong>
              <small>安装到谷歌浏览器</small>
            </span>
            <ChevronDown size={18} />
          </Button>
          <Button disabled={busy} onClick={() => install("edge")}>
            <b className="browser-logo edge-logo">e</b>
            <span>
              <strong>Microsoft Edge</strong>
              <small>准备后自动打开 edge://extensions</small>
            </span>
            <ChevronDown size={18} />
          </Button>
        </div>
        <Button className="extension-uninstall" disabled={busy} onClick={() => uninstall("edge")}>
          <Trash2 size={15} /> 卸载 Edge 扩展
        </Button>
        <small className="extension-uninstall-hint">将打开 Edge 扩展页；请在“小旺仔网页采集器”卡片点击“移除”确认。浏览器不允许软件静默卸载扩展。</small>
        {busy && <div className="extension-status">正在准备扩展…</div>}
        {result?.ok && result.mode === "uninstall" && (
          <div className="extension-result success">
            <strong>已打开 Edge 扩展卸载页</strong>
            <span>在“小旺仔网页采集器”卡片点击“移除”，再确认即可完成卸载。</span>
          </div>
        )}
        {result?.ok && result.mode !== "uninstall" && (
          <div className="extension-result success">
            <strong>扩展已准备好{EXTENSION_VERSION ? `（v${EXTENSION_VERSION}）` : ""}</strong>
            <span>本地扩展目录和 Edge 扩展页均已自动打开；1. 在浏览器中打开“开发者模式”</span>
            <span>
              2. 点击“加载已解压的扩展程序”，再选择下方已复制到剪贴板的目录
            </span>
            <code>{result.path}</code>
          </div>
        )}
        {result && !result.ok && (
          <div className="extension-result error">
            <strong>准备失败</strong>
            <span>{result.error}</span>
            {result.path && <code>{result.path}</code>}
          </div>
        )}
        <h3 className="extension-section-title">本地插件</h3>
        <div className="plugin-list">
          {plugins?.map(plugin => <div className={plugin.valid ? "plugin-row" : "plugin-row invalid"} key={plugin.id || plugin.directory}>
            <Puzzle size={17}/><span><strong>{plugin.name || plugin.directory}</strong><small>{plugin.valid ? `${plugin.version} · ${(plugin.permissions || []).join(" / ") || "无权限"}` : plugin.error}</small></span>
            <Button disabled={!plugin.valid} onClick={() => togglePlugin(plugin.id, !plugin.enabled)}>{plugin.enabled ? "停用" : "启用"}</Button>
          </div>)}
          {!plugins?.length && <div className="extension-status">尚未安装本地插件。插件必须包含 manifest.json，且默认禁用。</div>}
          <Button className="secondary-wide" onClick={openPluginsFolder}>打开插件目录</Button>
        </div>
        <h3 className="extension-section-title">MCP 接入</h3>
        <div className="extension-result">
          <strong>本地 stdio MCP（默认只读）</strong>
          {mcpConfig?.error ? <span>{mcpConfig.error}</span> : <><span>可搜索素材并读取真实文件夹。</span><code>{JSON.stringify(mcpConfig)}</code><Button className="secondary-wide" onClick={() => navigator.clipboard.writeText(JSON.stringify(mcpConfig, null, 2))}>复制 MCP 配置</Button></>}
        </div>
        <div className="dialog-actions">
          <Button onClick={close} disabled={busy}>
            {result?.ok ? "完成" : "取消"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AboutDialog({ close, version }) {
  return (
    <div className="modal-backdrop app-about-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <section className="app-dialog app-about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <Button className="app-about-close" type="button" aria-label="关闭关于窗口" onClick={close}><X size={17} /></Button>
        <img src={appIcon} alt="" />
        <h2 id="about-title">小旺仔素材库</h2>
        <p>本地素材整理与 AI Flow 协作工具</p>
        <small>版本 {version}</small>
        <Button className="primary" onClick={close}>关闭</Button>
      </section>
    </div>
  );
}

export function ThemePanel(props) {return <ThemeSettings {...props}/>;}

export function UpdatePanel({
  info,
  progress,
  file,
  error,
  close,
  download,
  install,
}) {
  const downloading = progress && progress.percent < 100 && !file;
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !downloading) close();
      }}
    >
      <div className="app-dialog update-dialog">
        <div className="dialog-head">
          <h2>{info.available ? "发现新版本" : "已经是最新版"}</h2>
          <Button aria-label="关闭" disabled={downloading} onClick={close}>
            <X size={18} />
          </Button>
        </div>
        <div className="update-versions">
          <span>
            当前版本 <b>v{info.current}</b>
          </span>
          <i>→</i>
          <span>
            最新版本 <b>v{info.latest}</b>
          </span>
        </div>
        {info.available ? (
          <>
            <p>
              {info.downloadName
                ? `已识别为${info.installKind}：${info.downloadName}`
                : "当前版本暂未提供适合此设备的安装包。"}
            </p>
            {progress && (
              <div className="update-progress">
                <div>
                  <i style={{ width: `${progress.percent || 0}%` }} />
                </div>
                <span>
                  {file
                    ? "下载并校验完成"
                    : `正在下载 ${Math.round(progress.percent || 0)}%`}
                </span>
                <small>
                  {file && progress.verified
                    ? "SHA256 已验证 · 点击后由独立 updater 备份并替换旧版本"
                    : progress.total
                      ? `${fmt(progress.received)} / ${fmt(progress.total)}`
                      : "正在连接下载服务器…"}
                </small>
              </div>
            )}
            {error && <p className="update-error">{error}</p>}
            {!progress && <ReleaseNotes remoteNotes={info.notes} />}
            <div className="dialog-actions">
              <Button onClick={close} disabled={downloading}>
                稍后提醒
              </Button>
              {file ? (
                <Button className="primary" onClick={install}>
                  <Download size={16} /> 立即更新并重启
                </Button>
              ) : (
                <Button
                  className="primary"
                  onClick={download}
                  disabled={downloading || !info.downloadName}
                >
                  <Download size={16} /> {downloading ? "正在下载" : "立即更新"}
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <p>当前安装的版本已经是 GitHub 上发布的最新版本。</p>
            <ReleaseNotes />
            <div className="dialog-actions">
              <Button className="primary" onClick={close}>
                知道了
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ReleaseNotes({ remoteNotes = "" }) {
  return (
    <section className="release-notes" aria-label={`版本 ${APP_VERSION} 更新内容`}>
      <header>
        <div>
          <span>v{APP_VERSION} 正式版</span>
          <h3>本次更新</h3>
        </div>
        <small>新增、优化与修复</small>
      </header>
      <div className="release-note-grid">
        {CURRENT_RELEASE_NOTES.map((note) => (
          <article key={note.title}>
            <em>{note.type}</em>
            <h4>{note.title}</h4>
            <ul>
              {note.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </article>
        ))}
      </div>
      {remoteNotes && (
        <details className="release-remote-notes">
          <summary>GitHub 发布说明</summary>
          <pre>{remoteNotes}</pre>
        </details>
      )}
    </section>
  );
}

export function SupportPanel({ close }) {
  return (
    <div
      className="support-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        className="support-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-dialog-title"
      >
        <Button className="support-close" type="button" aria-label="关闭" onClick={close}>
          <X size={18} />
        </Button>
        <div className="support-emblem" aria-hidden="true">
          <img src={communitySupportAvatar} alt="" />
        </div>
        <span className="support-version">社区支持</span>
        <h2 id="support-dialog-title">愿这个小项目，陪你走得更远</h2>
        <p className="support-intro">
          如果它曾替你省下一点时间，陪你把一个想法变成现实，
          欢迎留下建议和反馈。每一次使用、每一条声音，都会帮助小旺仔素材库继续变得更好。
        </p>
        <section className="support-card">
          <div className="support-payment-qr">
            <img src={communitySupportPaymentQr} alt="支付宝收款码" />
          </div>
          <div className="support-card-copy">
            <strong>支付宝扫码支持</strong>
            <p>
              感谢你的支持。也欢迎继续通过软件内的 Bug 反馈与功能建议，直接告诉我们你最需要什么。
            </p>
            <span><Heart size={13} /> 每一条反馈都会被认真阅读</span>
          </div>
        </section>
      </section>
    </div>
  );
}

export function TetrisAccessDialog({ password, error, changePassword, close, unlock }) {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      className="modal-backdrop tetris-access-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <form
        className="app-dialog tetris-access-dialog"
        aria-labelledby="tetris-access-title"
        onSubmit={(event) => {
          event.preventDefault();
          unlock();
        }}
      >
        <div className="tetris-access-icon"><InfinityIcon size={24} /></div>
        <h2 id="tetris-access-title">无穷大</h2>
        <p>密码请找小旺仔要。</p>
        <label htmlFor="tetris-access-password">访问密码</label>
        <input
          ref={inputRef}
          id="tetris-access-password"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={password}
          onChange={(event) => changePassword(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "tetris-access-error" : undefined}
        />
        {error && <small id="tetris-access-error" role="alert">{error}</small>}
        <div className="dialog-actions">
          <Button type="button" onClick={close}>取消</Button>
          <Button type="submit" className="primary">确认</Button>
        </div>
      </form>
    </div>
  );
}
