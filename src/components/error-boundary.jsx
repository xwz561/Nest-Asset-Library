import React from "react";

// 界面渲染出错时的兜底：以前没有任何兜底，一出错整个窗口就是黑的。
// 现在显示出错原因和"重新加载"按钮；桌面小窗口单独兜底，坏了也不连累主窗口。
// 常见的一种：软件开着时被重新构建，点开设置这类按需加载的页面会找不到旧文件。
// 出错时 App 已经卸载，body 上的新界面类名也没了，所以样式直接写在这里（颜色读主题变量，带兜底值）。
const screenStyle = { position: "fixed", inset: 0, display: "grid", placeItems: "center", padding: 24, background: "var(--bg-main, #15191c)", color: "var(--text-primary, #eef1f3)", fontFamily: "inherit", zIndex: 2147483000 };
const cardStyle = { width: "min(520px, 100%)", padding: "28px 28px 24px", borderRadius: 22, background: "var(--bg-card, #1f2426)", boxShadow: "0 24px 64px rgba(0, 0, 0, .35)" };
const buttonStyle = (primary) => ({ height: 36, padding: "0 18px", border: 0, borderRadius: 99, background: primary ? "var(--accent, #ff8a4c)" : "var(--hover-bg, #2a3033)", color: primary ? "#fff" : "var(--text-primary, #eef1f3)", fontWeight: 650, cursor: "pointer" });
const compactStyle = { display: "grid", gap: 8, padding: 16, color: "var(--text-primary, #eef1f3)", fontSize: 13 };

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[界面出错]", error, info?.componentStack || "");
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const message = String(error?.message || error || "未知错误");
    const stale = /dynamically imported module|Failed to fetch|Loading chunk|Importing a module script failed/i.test(message);
    if (this.props.compact) {
      return (
        <div className="soft-error-compact" role="alert" style={compactStyle}>
          <strong>这张卡片出错了</strong>
          <small style={{ color: "var(--text-secondary, #a0a8ad)", wordBreak: "break-all" }}>{message}</small>
          {this.props.onReset && <button type="button" style={buttonStyle(true)} onClick={this.props.onReset}>放回素材库</button>}
        </div>
      );
    }
    return (
      <div className="soft-error-screen" role="alert" style={screenStyle}>
        <div className="soft-error-card" style={cardStyle}>
          <h1 style={{ margin: "0 0 10px", fontSize: 20 }}>界面出错了</h1>
          <p style={{ margin: "0 0 14px", color: "var(--text-secondary, #a0a8ad)", lineHeight: 1.6 }}>{stale ? "软件文件刚刚更新过，当前窗口还在用旧文件。重新加载一下就好。" : "这次操作没能完成。可以重新加载窗口，资源库里的素材不会受影响。"}</p>
          <code style={{ display: "block", maxHeight: 120, overflow: "auto", padding: 10, borderRadius: 10, background: "var(--hover-bg, #2a3033)", fontSize: 12, wordBreak: "break-all" }}>{message}</code>
          <div className="soft-error-actions" style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button type="button" style={buttonStyle(true)} onClick={() => window.location.reload()}>重新加载</button>
            <button type="button" style={buttonStyle(false)} onClick={() => this.setState({ error: null })}>先试着继续</button>
          </div>
        </div>
      </div>
    );
  }
}
