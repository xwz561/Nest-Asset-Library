import { useState, useEffect } from "react";
import appIcon from "../../build/icon.png";
import { Button } from "../ready-ui.jsx";
import { Search, X, Check, Sparkles, Trash2 } from "lucide-react";
import { APP_VERSION, fmtCapacity } from "../lib/app-config.js";
import { PetSettings } from "../pet-settings.jsx";
import { ThemePanel, ReleaseNotes } from "./dialogs.jsx";
import { AutomaticUpdateSettings } from './automatic-update-settings.jsx';
import { BUILTIN_TOOLBAR_BUTTONS, DEFAULT_TOOLBAR_LAYOUT, normalizeToolbarLayout } from "../toolbar-layout.js";
import { LAYOUT_CARDS } from "../card-layout.js";

function ToolbarLayoutSettings({ layout, onChange }) {
  const [dragging, setDragging] = useState("");
  const ordered = normalizeToolbarLayout(layout);
  const available = BUILTIN_TOOLBAR_BUTTONS.filter(({ id }) => !ordered.includes(id));
  const reorder = targetId => {
    if (!dragging || dragging === targetId) return;
    const next = ordered.filter(id => id !== dragging);
    const index = next.indexOf(targetId);
    next.splice(index < 0 ? next.length : index, 0, dragging);
    onChange(next);
    setDragging("");
  };
  const buttonLabel = id => BUILTIN_TOOLBAR_BUTTONS.find(item => item.id === id)?.label || id;
  return <section className="settings-generic toolbar-layout-settings">
    <h2>工具栏按钮</h2>
    <p className="settings-hint">拖动已显示按钮调整顺序；移除的按钮可在下方重新添加。素材卡片、对话框中的保存、删除等上下文操作保留在原位置。</p>
    <div className="toolbar-layout-columns">
      <section className="toolbar-layout-list">
        <h3>工具栏中</h3>
        {ordered.length ? ordered.map(id => <div key={id} className="toolbar-layout-item" draggable onDragStart={event => { setDragging(id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", id); }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); reorder(id); }} onDragEnd={() => setDragging("")}>
          <span className="toolbar-layout-grip" aria-hidden="true">⠿</span><b>{buttonLabel(id)}</b>
          <Button type="button" aria-label={`移除${buttonLabel(id)}`} onClick={() => onChange(ordered.filter(item => item !== id))}>移除</Button>
        </div>) : <p className="settings-hint">工具栏为空，可以从右侧添加按钮。</p>}
      </section>
      <section className="toolbar-layout-list">
        <h3>可添加</h3>
        {available.length ? available.map(({ id, label }) => <div key={id} className="toolbar-layout-item">
          <b>{label}</b><Button type="button" onClick={() => onChange([...ordered, id])}>添加</Button>
        </div>) : <p className="settings-hint">所有内置功能按钮都已在工具栏中。</p>}
      </section>
    </div>
    <div className="settings-actions"><Button onClick={() => onChange(DEFAULT_TOOLBAR_LAYOUT)}>恢复默认排列</Button></div>
  </section>;
}

export function AISettings({ initialTab = "通用", close, library, diskInfo, resolvedThemeMode = "dark", checkUpdate, updateInfo, updateChecking, deleteCurrentLibrary, autoUpdate = {}, toolbarLayout, onToolbarLayoutChange, floatingCardCount = 0, onResetCardLayout }) {
  const [tab, setTab] = useState(initialTab),
    [settingsSearch, setSettingsSearch] = useState(""),
    [value, setValue] = useState(null),
    [active, setActive] = useState("openai"),
    [key, setKey] = useState(""),
    [status, setStatus] = useState(""),
    [saving, setSaving] = useState(false),
    [usage, setUsage] = useState(null);
  const SETTING_TABS = [
    ["通用", "⚙", "基本信息 启动 界面 布局 卡片 拖动 恢复默认"],
    ["主题与配色", "◈", "颜色 主题 模式 外观 预设"],
    ["宠物", "♧", "桌宠 女仆鲸 大小 抛掷 动画"],
    ["快捷键", "⌨", "键盘 操作 快捷"],
    ["工具栏", "⠿", "按钮 工具栏 排序 添加 移除 布局"],
    ["素材库", "▤", "资源库 删除 管理"],
    ["存储", "▣", "路径 空间 备份 磁盘"],
    ["AI 与模型", "✦", "助手 服务 模型 API 分类"],
    ["更新", "↻", "版本 更新 说明"],
  ];
  const visibleSettingTabs = SETTING_TABS.filter(([name, , keywords]) =>
    `${name} ${keywords}`.toLocaleLowerCase().includes(settingsSearch.trim().toLocaleLowerCase()),
  );
  useEffect(() => {
    window.nestDesktop.ai.settings().then((settings) => {
      setValue(settings);
      setActive(settings.defaultProviderId);
    });
    window.nestDesktop.ai.usage().then(setUsage);
  }, []);
  useEffect(() => {
    const onKeyDown = event => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);
  const backdropMouseDown = event => { if (event.target === event.currentTarget) close(); };
  if (!value && tab === "AI 与模型")
    return (
      <div className="ai-settings-backdrop" onMouseDown={backdropMouseDown}>
        <div className={"ai-settings-page theme-" + resolvedThemeMode} role="dialog" aria-modal="true" aria-label="偏好设置">
          <p className="settings-loading"><span />正在读取 AI 设置…</p>
        </div>
      </div>
    );
  const provider =
      value?.providers?.find((item) => item.id === active) || value?.providers?.[0],
    patchProvider = (changes) =>
      provider && setValue((current) => ({
        ...current,
        providers: current.providers.map((item) =>
          item.id === provider.id ? { ...item, ...changes } : item,
        ),
      }));
  const save = async () => {
    setSaving(true);
    const providers = value.providers.map((item) =>
      item.id === provider.id && key.trim()
        ? { ...item, apiKey: key.trim() }
        : item,
    );
    const response = await window.nestDesktop.ai.saveSettings({
      ...value,
      providers,
    });
    setSaving(false);
    if (response?.error) {
      setStatus(response.error);
      return;
    }
    setKey("");
    setValue(response.settings);
    setStatus("设置已安全保存");
  };
  const test = async () => {
    setStatus("正在测试连接…");
    if (key.trim()) await save();
    const response = await window.nestDesktop.ai.testProvider(provider.id);
    setStatus(
      response?.ok
        ? `连接成功 · ${response.model}`
        : response?.error || "连接失败",
    );
  };
  const toggles = [
    ["enabled", "启用 AI 助手", "在右侧边栏启用 AI 助手功能"],
    [
      "readFolderContext",
      "自动读取当前文件夹上下文",
      "进入文件夹会自动读取上下文信息",
    ],
    [
      "readSelectedAssets",
      "自动读取当前选中素材",
      "选中素材后自动读取素材信息用于分析",
    ],
    ["allowLowRisk", "允许 AI 执行低风险操作", "标签、备注等操作仍可撤销"],
  ];
  return (
    <div className="ai-settings-backdrop" onMouseDown={backdropMouseDown}>
      <div className={"ai-settings-page theme-" + resolvedThemeMode + (tab !== "AI 与模型" ? " no-side" : "")} role="dialog" aria-modal="true" aria-label="偏好设置">
      <header className="ai-settings-top">
        <div className="ai-settings-brand">
          <span>
            <img src={appIcon} alt="小旺仔素材库图标" />
          </span>
          <b>小旺仔素材库</b>
          <em>专业版</em>
        </div>
        <div className="ai-settings-crumb">
          <Button onClick={close}>‹</Button>
          <span>偏好设置</span>
          <b>›</b>
          <strong>{tab}</strong>
        </div>
        <label className="ai-settings-search">
          <Search size={16} />
          <input value={settingsSearch} onChange={event => setSettingsSearch(event.target.value)} placeholder="搜索设置" aria-label="搜索设置" />
          {settingsSearch && <Button type="button" aria-label="清除设置搜索" onClick={() => setSettingsSearch("")}><X size={14} /></Button>}
        </label>
        <span className="settings-version-badge">v{APP_VERSION}</span>
        <Button onClick={close}>
          <X size={19} />
        </Button>
      </header>
      <aside className="ai-settings-nav">
        <h2>设置</h2>
        {visibleSettingTabs.map(([name, icon]) => (
          <Button
            key={name}
            className={tab === name ? "active" : ""}
            onClick={() => setTab(name)}
          >
            <i>{icon}</i>
            {name}
          </Button>
        ))}
        {!visibleSettingTabs.length && <p className="settings-no-results">没有匹配的设置</p>}
        <footer>
          版本 {APP_VERSION}
          <br />
          <small>小旺仔素材库</small>
        </footer>
      </aside>
      <main className="ai-settings-main">
        {tab === "AI 与模型" ? (
          <>
            <h2>默认 AI 服务与模型</h2>
        <section className="ai-model-card">
          <div className="ai-model-row">
            <label>
              默认 AI 服务
              <select
                value={value.defaultProviderId}
                onChange={(event) => {
                  setValue({ ...value, defaultProviderId: event.target.value });
                  setActive(event.target.value);
                }}
              >
                {value.providers.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              默认模型
              <input
                value={provider.model}
                onChange={(event) =>
                  patchProvider({ model: event.target.value })
                }
              />
            </label>
            <label>
              Vision 模型
              <input
                value={provider.visionModel || ""}
                onChange={(event) =>
                  patchProvider({ visionModel: event.target.value })
                }
              />
            </label>
          </div>
          <div className="ai-model-config">
            <div>
              <label>
                API Key
                <input
                  type="password"
                  autoComplete="off"
                  value={key}
                  placeholder={
                    provider.hasApiKey
                      ? "已安全保存 · 留空不修改"
                      : "输入 API Key"
                  }
                  onChange={(event) => setKey(event.target.value)}
                />
              </label>
              <label>
                Base URL
                <input
                  value={provider.baseUrl}
                  onChange={(event) =>
                    patchProvider({ baseUrl: event.target.value })
                  }
                />
              </label>
            </div>
            <div>
              <label>
                Timeout（秒）
                <input
                  type="number"
                  min="1"
                  max="300"
                  value={Math.round(provider.timeout / 1000)}
                  onChange={(event) =>
                    patchProvider({
                      timeout: Number(event.target.value) * 1000,
                    })
                  }
                />
              </label>
              <label>
                Temperature <b>{Number(provider.temperature).toFixed(2)}</b>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.05"
                  value={provider.temperature}
                  onChange={(event) =>
                    patchProvider({ temperature: Number(event.target.value) })
                  }
                />
              </label>
            </div>
          </div>
          <div className="ai-model-actions">
            <Button onClick={test}>◉ 测试连接</Button>
            <Button className="primary" disabled={saving} onClick={save}>
              <Check size={15} />
              {saving ? "保存中…" : "保存设置"}
            </Button>
          </div>
        </section>
        <h2>可用 AI 服务</h2>
        <section className="ai-provider-strip">
          {value.providers.map((item) => (
            <Button
              key={item.id}
              className={active === item.id ? "active" : ""}
              onClick={() => setActive(item.id)}
            >
              <span>
                <Sparkles size={18} />
              </span>
              <div>
                <b>{item.name}</b>
                <small>
                  {item.baseUrl.replace(/^https?:\/\//, "").split("/")[0]}
                </small>
              </div>
              <em>{item.hasApiKey ? "已连接" : "未连接"}</em>
            </Button>
          ))}
        </section>
        <div className="ai-settings-lower">
          <section>
            <h2>AI 行为</h2>
            {toggles.map(([keyName, title, detail]) => (
              <label className="ai-switch-row" key={keyName}>
                <span>
                  <b>{title}</b>
                  <small>{detail}</small>
                </span>
                <input
                  type="checkbox"
                  checked={value[keyName]}
                  onChange={(event) =>
                    setValue({ ...value, [keyName]: event.target.checked })
                  }
                />
                <i />
              </label>
            ))}
          </section>
          <section>
            <h2>智能分类设置</h2>
            <label className="ai-confidence">
              <span>
                最低置信度阈值{" "}
                <b>{Math.round(value.confidenceThreshold * 100)}%</b>
              </span>
              <input
                type="range"
                min="0.5"
                max="1"
                step="0.01"
                value={value.confidenceThreshold}
                onChange={(event) =>
                  setValue({
                    ...value,
                    confidenceThreshold: Number(event.target.value),
                  })
                }
              />
              <small>低于阈值的结果将标记，供人工确认</small>
            </label>
            <label>
              低置信度处理方式
              <select
                value={value.lowConfidenceAction || "review"}
                onChange={(event) =>
                  setValue({
                    ...value,
                    lowConfidenceAction: event.target.value,
                  })
                }
              >
                <option value="review">仅标记为低置信，不自动应用</option>
                <option value="ignore">忽略低置信度建议</option>
              </select>
            </label>
          </section>
        </div>
        <h2>使用统计</h2>
        <section className="ai-usage-grid">
          <div>
            <i>◇</i>
            <span>
              请求次数<b>{usage?.requests || 0} 次</b>
            </span>
          </div>
          <div>
            <i>▧</i>
            <span>
              Tokens 使用量<b>{usage?.totalTokens || 0}</b>
            </span>
          </div>
          <div>
            <i>◎</i>
            <span>
              本地分析<b>不计云端额度</b>
            </span>
          </div>
        </section>
        {status && <p className="ai-page-status">{status}</p>}
          </>
        ) : (
          <>
            {tab === "通用" && (
              <section className="settings-generic settings-general">
                <div className="settings-general-group">
                  <h2>关于本软件</h2>
                  <div className="settings-kv">
                    <div><span>应用版本</span><b>v{APP_VERSION}</b></div>
                    <div><span>资源库</span><b>{library?.name || "未打开"}</b></div>
                    <div><span>素材数量</span><b>{library?.assets?.length ?? 0} 个</b></div>
                    <div><span>库路径</span><b className="mono">{library?.path || "—"}</b></div>
                    <div><span>界面语言</span><b>简体中文</b></div>
                  </div>
                </div>
                <div className="settings-general-group card-layout-settings">
                  <h2>界面布局</h2>
                  <p className="settings-hint">打开图标栏底部的「编辑布局」开关后，{LAYOUT_CARDS.map(({ label }) => label).join("、")}都可以拖到窗口任意位置，右下角能拉大小；拖到左右边缘变竖排、拖到顶部或底部变横排，贴边的卡片会让素材区让位；卡片之间互相挤开、不会重叠；双击放回原处，侧栏里的小卡片也能拖回侧栏面板。编辑时打开「疯狂模式」，卡片还能拖出窗口放到桌面上。改好点「保存」。平时卡片是锁定的。位置只记在这台电脑上。</p>
                  <div className="settings-kv">
                    <div><span>浮动中的卡片</span><b>{floatingCardCount ? `${floatingCardCount} 张` : "没有，都在侧栏里"}</b></div>
                  </div>
                  <div className="settings-actions">
                    <Button disabled={!floatingCardCount || !onResetCardLayout} onClick={onResetCardLayout}>恢复默认布局</Button>
                  </div>
                </div>
              </section>
            )}
            {tab === "宠物" && <PetSettings />}
            {tab === "主题与配色" && (
              <ThemePanel inline={tab === "主题与配色"} close={close} />
            )}
            {tab === "快捷键" && (
              <section className="settings-generic">
                <h2>快捷键</h2>
                <div className="settings-kv">
                  {[["Ctrl / ⌘ + O", "打开资源库"], ["Ctrl / ⌘ + F", "聚焦素材搜索"], ["Ctrl / ⌘ + Shift + N", "新建文件夹"], ["Ctrl / ⌘ + ,", "打开偏好设置"], ["Ctrl / ⌘ + A", "全选当前视图素材"], ["Ctrl / ⌘ + C", "复制选中文件"], ["空格", "试听 / 暂停音频"], ["Esc", "关闭面板与浮层"], ["← / →", "预览切换上一个 / 下一个"], ["R", "预览旋转 90°"], ["0", "预览复位缩放"], ["双击", "快速预览素材"]].map(([k, d]) => (
                    <div key={k}><span>{d}</span><b className="mono">{k}</b></div>
                  ))}
                </div>
              </section>
            )}
            {tab === "工具栏" && <ToolbarLayoutSettings layout={toolbarLayout} onChange={onToolbarLayoutChange} />}
            {tab === "存储" && (
              <section className="settings-generic">
                <h2>存储位置</h2>
                <div className="settings-kv">
                  <div><span>库路径</span><b className="mono">{library?.path || "—"}</b></div>
                  <div><span>磁盘空间</span><b>{diskInfo ? `剩余 ${fmtCapacity(diskInfo.free)} / 共 ${fmtCapacity(diskInfo.total)}` : "读取中…"}</b></div>
                  <div><span>素材文件</span><b>库目录 assets/ 文件夹</b></div>
                  <div><span>每日备份</span><b>库目录 .nest-backups/ 文件夹</b></div>
                </div>
              </section>
            )}
            {tab === "素材库" && (
              <section className="settings-generic library-management-settings">
                <h2>素材库管理</h2>
                <p className="settings-hint">管理当前打开的本地素材库。删除操作只影响本地目录，不会删除 AI Flow 服务器素材。</p>
                <div className="settings-kv">
                  <div><span>当前素材库</span><b>{library?.name || "未打开"}</b></div>
                  <div><span>素材数量</span><b>{library?.assets?.length ?? 0} 个</b></div>
                  <div><span>库路径</span><b className="mono">{library?.path || "—"}</b></div>
                </div>
                <div className="settings-actions danger-actions">
                  <Button className="danger" disabled={!library} onClick={deleteCurrentLibrary}>
                    <Trash2 size={15} /> 删除当前素材库
                  </Button>
                </div>
                <p className="settings-hint">删除前会请求确认。成功后目录会移入 Windows 回收站，可在回收站恢复。</p>
              </section>
            )}
            {tab === "更新" && (
              <section className="settings-generic">
                <h2>软件更新</h2>
                <AutomaticUpdateSettings state={autoUpdate} />
                <div className="settings-kv">
                  <div><span>当前版本</span><b>v{APP_VERSION}</b></div>
                  <div><span>最新版本</span><b>{updateInfo?.latest ? `v${updateInfo.latest}` : "—"}</b></div>
                </div>
                <div className="settings-actions">
                  <Button className="primary" disabled={updateChecking} onClick={checkUpdate}>
                    {updateChecking ? "检查中…" : "检查更新"}
                  </Button>
                </div>
                {updateInfo?.available && !autoUpdate.ready && <p className="settings-hint">发现新版本 v{updateInfo.latest}，开启自动更新后会在后台下载；也可手动下载安装。</p>}
                <ReleaseNotes />
              </section>
            )}
          </>
        )}
      </main>
      {tab === "AI 与模型" && (
        <aside className="ai-settings-side">
          <h2>小旺仔助手设置</h2>
        <section className="ai-assistant-profile">
          <div className="ai-profile-head">
            <span>
              <Sparkles size={24} />
            </span>
            <div>
              <b>
                {value.assistantName || "小旺仔助手"}
              </b>
              <small>你的素材小管家，帮你找、看、理、懂素材</small>
            </div>
            <i>{value.enabled ? "● 已启用" : "○ 已停用"}</i>
          </div>
          <label>
            显示名称
            <input
              value={value.assistantName || ""}
              onChange={(event) =>
                setValue({ ...value, assistantName: event.target.value })
              }
            />
          </label>
          <label>
            助手提示语（可选）
            <textarea
              maxLength="200"
              value={value.systemPrompt || ""}
              onChange={(event) =>
                setValue({ ...value, systemPrompt: event.target.value })
              }
            />
            <small>{(value.systemPrompt || "").length} / 200</small>
          </label>
        </section>
        <section>
          <h2>模型能力预览</h2>
          <div className="ai-capabilities">
            {[
              "文本理解",
              "图像理解 (Vision)",
              "智能分类",
              "素材问答",
              "批量分析",
              "操作建议",
            ].map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>
        </aside>
      )}
      </div>
    </div>
  );
}
