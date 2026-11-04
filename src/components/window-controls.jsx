import { useEffect, useState } from "react";

// Windows 的关闭 / 最小化 / 最大化（还原）按钮：页面自己画，样子和位置都照 macOS——
// 左上角红、黄、绿三个小圆点，顺序是关闭、最小化、最大化，鼠标移上去显示图标。
// macOS 用系统的红绿灯按钮，不渲染这个组件。

const Icon = ({ children }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const WINDOW_ICONS = {
  minimize: <Icon><path d="M2.25 6.25h7.5" /></Icon>,
  maximize: <Icon><rect x="2.25" y="2.25" width="7.5" height="7.5" rx="1.6" /></Icon>,
  restore: (
    <Icon>
      <rect x="2.25" y="3.85" width="5.9" height="5.9" rx="1.4" />
      <path d="M4.3 2.25h3.9c.9 0 1.55.65 1.55 1.55V7.7" />
    </Icon>
  ),
  close: <Icon><path d="M2.75 2.75l6.5 6.5M9.25 2.75l-6.5 6.5" /></Icon>,
};

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => window.nestDesktop?.onWindowState?.((state) => setMaximized(Boolean(state.maximized || state.fullScreen))), []);
  const control = async (action) => {
    const result = await window.nestDesktop?.windowControl?.(action);
    if (result && typeof result.maximized === "boolean") setMaximized(result.maximized);
  };
  return (
    <div className="window-controls" role="group" aria-label="窗口控制">
      <button type="button" className="window-control close" title="关闭" aria-label="关闭" onClick={() => control("close")}>
        {WINDOW_ICONS.close}
      </button>
      <button type="button" className="window-control minimize" title="最小化" aria-label="最小化" onClick={() => control("minimize")}>
        {WINDOW_ICONS.minimize}
      </button>
      <button type="button" className="window-control maximize" title={maximized ? "还原" : "最大化"} aria-label={maximized ? "还原" : "最大化"} onClick={() => control("maximize")}>
        {maximized ? WINDOW_ICONS.restore : WINDOW_ICONS.maximize}
      </button>
    </div>
  );
}
