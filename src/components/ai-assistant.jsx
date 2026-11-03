import { useState, useRef, useEffect } from "react";
import { Eye, Tag, FolderOpen, Search, Image as ImageIcon, Pencil, Info, Sparkles, SlidersHorizontal, X, Folder } from "lucide-react";
import { Button } from "../ready-ui.jsx";

export function AIAssistant({
  library,
  folder,
  selectedIds,
  query,
  filter,
  close,
  settings,
  applyLibrary,
  showResults,
}) {
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(null),
    [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [prompt, setPrompt] = useState(""),
    [messages, setMessages] = useState([]),
    [plan, setPlan] = useState(null),
    [audit, setAudit] = useState([]);
  const chatEndRef = useRef(null);
  const context = { folderId: folder?.id || null, selectedIds, query, filter };
  const refreshAudit = () => window.nestDesktop.ai.audit().then(setAudit);
  useEffect(() => {
    refreshAudit();
  }, []);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);
  const planFrom = (operation, data) => {
    const items = data?.items || [];
    if (operation === "tags")
      return {
        kind: "AI 标签",
        actions: items.map((item) => ({
          tool: "add_tags",
          assetId: item.assetId,
          tags: item.tags || [],
          reason: item.reason,
        })),
      };
    if (operation === "classify")
      return {
        kind: "AI 智能分类",
        actions: items.flatMap((item) => [
          ...(item.targetFolderId
            ? [
                {
                  tool: "move_asset",
                  assetId: item.assetId,
                  targetFolderId: item.targetFolderId,
                  confidence: item.confidence,
                  reason: item.reason,
                },
              ]
            : []),
          ...(item.tags?.length
            ? [{ tool: "add_tags", assetId: item.assetId, tags: item.tags }]
            : []),
        ]),
      };
    if (operation === "rename")
      return {
        kind: "AI 重命名",
        actions: items.map((item) => ({
          tool: "rename_asset",
          assetId: item.assetId,
          newName: item.newName,
          reason: item.reason,
        })),
      };
    return null;
  };
  const resultText = (value) => {
    if (!value) return "没有收到可显示的回复。";
    if (value.message || value.summary) return value.message || value.summary;
    return JSON.stringify(value, null, 2);
  };
  const run = async (operation, chatPrompt = null) => {
    const submittedPrompt = chatPrompt?.trim() || "";
    if (chatPrompt !== null && !submittedPrompt) return;
    if (chatPrompt !== null) {
      setMessages((items) => [...items, { role: "user", content: submittedPrompt }]);
      setPrompt("");
    }
    setBusy(true);
    setError("");
    setResult(null);
    setPlan(null);
    try {
      const started = await window.nestDesktop.ai.startTask(operation, {
        context,
        prompt: chatPrompt !== null ? submittedPrompt : prompt,
        assetId: selectedIds[0],
      });
      if (started?.error) throw new Error(started.error);
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 220));
        const task = await window.nestDesktop.ai.getTask(started.id);
        setProgress(task);
        if (task?.status === "completed") {
          const completedResult = task.result.result;
          if (chatPrompt !== null) {
            setMessages((items) => [
              ...items,
              { role: "assistant", content: resultText(completedResult) },
            ]);
          } else {
            setResult(completedResult);
            setPlan(planFrom(operation, completedResult));
          }
          if (["search", "similar", "duplicates"].includes(operation))
            showResults(task.result.result.assetIds || []);
          break;
        }
        if (["failed", "cancelled"].includes(task?.status))
          throw new Error(task.error || "AI 任务已取消");
      }
    } catch (reason) {
      setError(reason.message);
      if (chatPrompt !== null)
        setMessages((items) => [
          ...items,
          { role: "error", content: reason.message },
        ]);
    } finally {
      setBusy(false);
    }
  };
  const execute = async () => {
    if (!plan?.actions?.length) return;
    setBusy(true);
    const response = await window.nestDesktop.ai.executePlan(plan, true);
    setBusy(false);
    if (response?.error) {
      setError(response.error);
      return;
    }
    if (response?.library) applyLibrary(response.library);
    setPlan(null);
    setResult({ message: "操作已安全执行，可在操作记录中撤销。" });
    refreshAudit();
  };
  const undo = async (id) => {
    const response = await window.nestDesktop.ai.undo(id);
    if (response?.library) applyLibrary(response.library);
    if (response?.error) setError(response.error);
    refreshAudit();
  };
  const actions = [
    [
      "analyze",
      "分析素材",
      "分析内容、色彩、构图等",
      Eye,
      busy || selectedIds.length !== 1,
    ],
    ["tags", "AI 标签", "智能生成标签建议", Tag, busy || !selectedIds.length],
    [
      "classify",
      "智能分类",
      "自动分析并分类素材",
      FolderOpen,
      busy || !selectedIds.length,
    ],
    [
      "similar",
      "查找相似",
      "寻找相似素材",
      Search,
      busy || selectedIds.length !== 1,
    ],
    ["duplicates", "检测重复", "查找重复或相似文件", ImageIcon, busy],
    [
      "rename",
      "AI 重命名",
      "智能生成文件名",
      Pencil,
      busy || !selectedIds.length,
    ],
    ["chat", "生成描述", "生成素材描述信息", Info, busy || !selectedIds.length],
    ["search", "整理建议", "根据当前目录提供建议", Sparkles, busy],
  ];
  const suggestions = [
    "这张图片的主要内容是什么？",
    "适合添加哪些标签？",
    "还有哪些类似的书房场景？",
    "这批素材如何整理更合理？",
  ];
  return (
    <aside className="detail ai-assistant">
      <div className="inspector-tabs">
        <Button
          disabled={!selectedIds.length}
          title={selectedIds.length ? "切换到素材详情" : "请先选择一个素材"}
          onClick={() => {
            if (selectedIds.length) close();
          }}
        >
          详情
        </Button>
        <Button className="active">
          <Sparkles size={14} /> AI 助手
        </Button>
      </div>
      <div className="ai-head">
        <div>
          <strong>
            <Sparkles size={17} /> AI 助手
          </strong>
        </div>
        <Button title="AI 与模型设置" onClick={settings}>
          <SlidersHorizontal size={17} />
        </Button>
        <Button aria-label="关闭 AI 助手" onClick={close}>
          <X size={18} />
        </Button>
      </div>
      <div className="ai-scroll">
        <section className="ai-context">
          <small>当前上下文</small>
          <b>
            <Folder size={16} /> {library?.name || "资源库"}
            {folder ? ` / ${folder.name}` : ""}
          </b>
          <span>
            <ImageIcon size={16} />{" "}
            {selectedIds.length
              ? `已选择 ${selectedIds.length} 个素材`
              : "未选择素材"}{" "}
            · {filter}
          </span>
        </section>
        <div className="ai-section-title">快捷功能</div>
        <section className="ai-quick">
          {actions.map(([key, title, detail, Icon, disabled]) => (
            <Button key={key} disabled={disabled} onClick={() => run(key)}>
              <i>
                <Icon />
              </i>
              <span>
                <b>{title}</b>
                <small>{detail}</small>
              </span>
            </Button>
          ))}
        </section>
        {busy && (
          <section className="ai-progress">
            <div>
              <i
                style={{
                  width: `${progress?.total ? (progress.completed / progress.total) * 100 : 8}%`,
                }}
              />
            </div>
            <span>AI 正在分析 · {progress?.status || "queued"}</span>
            {["queued", "running"].includes(progress?.status) && (
              <Button
                onClick={() =>
                  progress?.id && window.nestDesktop.ai.pauseTask(progress.id)
                }
              >
                暂停
              </Button>
            )}
            {progress?.status === "paused" && (
              <Button
                onClick={() =>
                  progress?.id && window.nestDesktop.ai.resumeTask(progress.id)
                }
              >
                继续
              </Button>
            )}
            <Button
              onClick={() =>
                progress?.id && window.nestDesktop.ai.cancelTask(progress.id)
              }
            >
              取消
            </Button>
          </section>
        )}
        {error && <p className="ai-error">{error}</p>}
        {result && (
          <section className="ai-result">
            <div className="ai-result-title">
              <Sparkles size={15} />
              <strong>AI 结果</strong>
            </div>
            {result.message || result.summary ? (
              <p>
                {result.message || result.summary}
                {result.assetIds?.length
                  ? `，涉及 ${result.assetIds.length} 个素材`
                  : ""}
              </p>
            ) : (
              <pre>{JSON.stringify(result, null, 2)}</pre>
            )}
            {plan?.actions?.length > 0 && (
              <div className="ai-plan">
                <b>AI 操作计划 · {plan.actions.length} 项</b>
                <p>不会删除或覆盖原文件。执行前已通过权限与路径校验。</p>
                <Button disabled={busy} onClick={execute}>
                  确认执行
                </Button>
              </div>
            )}
          </section>
        )}
        <div className="ai-section-title">对话助手</div>
        <section className="ai-conversation" aria-label="AI 对话记录">
          {messages.length ? (
            messages.map((message, index) => (
              <article className={`ai-message ${message.role}`} key={`${message.role}-${index}`}>
                <small>{message.role === "user" ? "我" : message.role === "error" ? "发送失败" : "AI 助手"}</small>
                <p>{message.content}</p>
              </article>
            ))
          ) : (
            <div className="ai-conversation-empty">
              <Sparkles size={18} />
              <span>选择下面的问题，或直接输入你想了解的素材内容。</span>
            </div>
          )}
          {busy && messages.at(-1)?.role === "user" && (
            <article className="ai-message assistant pending">
              <small>AI 助手</small>
              <p>正在思考…</p>
            </article>
          )}
          <div ref={chatEndRef} />
        </section>
        <div className="ai-suggestions">
          {suggestions.map((text) => (
            <Button key={text} onClick={() => setPrompt(text)}>
              {text}
            </Button>
          ))}
        </div>
        <section className="ai-chat">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!busy && prompt.trim()) run("chat", prompt);
              }
            }}
            placeholder="问问你的素材库…"
          />
          <Button
            disabled={busy || !prompt.trim()}
            title="发送"
            onClick={() => run("chat", prompt)}
          >
            <Sparkles size={18} />
          </Button>
        </section>
        <p className="ai-disclaimer">AI 生成的内容可能不准确，仅供参考</p>
        <p className="ai-privacy">
          相似与重复检测完全在本地执行。云端模型不会收到本地文件路径。
        </p>
        <section className="ai-history">
          <strong>AI 操作记录</strong>
          {audit.length ? (
            audit.slice(0, 8).map((item) => (
              <div key={item.id}>
                <span>
                  <b>{item.kind}</b>
                  <small>
                    {new Date(item.createdAt).toLocaleString()} ·{" "}
                    {item.actions?.length || 0} 项
                  </small>
                </span>
                <Button
                  disabled={item.status === "undone"}
                  onClick={() => undo(item.id)}
                >
                  {item.status === "undone" ? "已撤销" : "撤销"}
                </Button>
              </div>
            ))
          ) : (
            <p>还没有 AI 文件操作。</p>
          )}
        </section>
      </div>
    </aside>
  );
}
