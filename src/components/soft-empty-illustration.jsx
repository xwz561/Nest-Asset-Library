// 新界面的空状态插画：浅色底圆、文件夹配强调色标签，周围漂浮图片/音乐/视频小卡片。
// 颜色全部取自 soft-ui.css 的 --soft-* 变量（由当前主题推出），切换主题时跟着变。
const fill = (color) => ({ fill: color });
const stroke = (color) => ({ stroke: color });
const stop = (color) => ({ stopColor: color });

export function SoftEmptyIllustration({ className = "empty-folder-illustration" }) {
  return (
    <svg className={`${className} soft-empty-illustration`} viewBox="0 0 260 184" aria-hidden="true">
      <defs>
        <filter id="soft-empty-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" style={{ floodColor: "var(--soft-shadow-tone)" }} floodOpacity=".22" />
        </filter>
        <filter id="soft-empty-shadow-sm" x="-40%" y="-40%" width="180%" height="190%">
          <feDropShadow dx="0" dy="3" stdDeviation="3.5" style={{ floodColor: "var(--soft-shadow-tone)" }} floodOpacity=".25" />
        </filter>
        <linearGradient id="soft-empty-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={stop("var(--soft-blue-tint)")} />
          <stop offset="1" style={stop("var(--soft-accent-tint)")} />
        </linearGradient>
        <linearGradient id="soft-empty-tab" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={stop("var(--soft-accent-2)")} />
          <stop offset="1" style={stop("var(--soft-accent)")} />
        </linearGradient>
        <linearGradient id="soft-empty-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={stop("var(--soft-card)")} />
          <stop offset="1" style={stop("var(--soft-tint)")} />
        </linearGradient>
      </defs>

      {/* 背景圆和地面阴影 */}
      <circle cx="130" cy="92" r="78" fill="url(#soft-empty-bg)" />
      <ellipse cx="130" cy="168" rx="62" ry="6" style={fill("var(--soft-line)")} opacity=".7" />

      {/* 文件夹：橙色标签 + 后片 + 白色前片 */}
      <path d="M78 70V54c0-6 5-11 11-11h26c3 0 6 1 8 4l6 7h33c6 0 11 5 11 11v5Z" fill="url(#soft-empty-tab)" />
      <rect x="78" y="58" width="104" height="72" rx="12" style={fill("color-mix(in srgb, var(--soft-accent) 32%, var(--soft-card))")} />
      <g filter="url(#soft-empty-shadow)">
        <path d="M70 80c0-6 5-11 11-11h98c6 0 11 5 11 11l-5 63c-.5 6-5.5 10-11.5 10H86.5c-6 0-11-4-11.5-10Z" fill="url(#soft-empty-front)" />
      </g>
      <path d="M100 104h60" style={stroke("var(--soft-line)")} strokeWidth="5" strokeLinecap="round" />
      <path d="M108 118h44" style={stroke("color-mix(in srgb, var(--soft-line) 65%, var(--soft-card))")} strokeWidth="5" strokeLinecap="round" />

      {/* 漂浮的小卡片：图片 / 音乐 / 视频 */}
      <g filter="url(#soft-empty-shadow-sm)">
        <rect x="26" y="52" width="40" height="40" rx="11" style={fill("var(--soft-card)")} transform="rotate(-8 46 72)" />
        <rect x="198" y="34" width="38" height="38" rx="11" style={fill("var(--soft-card)")} transform="rotate(7 217 53)" />
        <rect x="204" y="112" width="36" height="36" rx="10" style={fill("var(--soft-card)")} transform="rotate(-6 222 130)" />
      </g>
      <g transform="rotate(-8 46 72)">
        <rect x="35" y="61" width="22" height="22" rx="5" style={fill("var(--soft-blue-tint)")} />
        <circle cx="41.5" cy="67.5" r="2.6" style={fill("var(--soft-blue)")} />
        <path d="M36 80l6-7 4 4 3-3 7 6Z" style={fill("var(--soft-blue)")} />
      </g>
      <g transform="rotate(7 217 53)" fill="none" style={stroke("var(--soft-accent)")} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M213 61V45l11-2v15" />
        <circle cx="210.5" cy="61" r="3" style={{ fill: "var(--soft-accent)", stroke: "none" }} />
        <circle cx="221.5" cy="58" r="3" style={{ fill: "var(--soft-accent)", stroke: "none" }} />
      </g>
      <g transform="rotate(-6 222 130)">
        <rect x="211" y="122" width="22" height="16" rx="4" style={fill("var(--soft-blue-tint)")} />
        <path d="M219 126v8l6-4Z" style={fill("var(--soft-blue)")} />
      </g>

      {/* 橙色加号按钮 */}
      <g filter="url(#soft-empty-shadow-sm)">
        <circle cx="168" cy="146" r="15" fill="url(#soft-empty-tab)" />
      </g>
      <path d="M168 139v14M161 146h14" style={stroke("var(--soft-on-accent)")} strokeWidth="2.8" strokeLinecap="round" />

      {/* 小星光和圆点 */}
      <path d="M58 30l2.2 5.3L65.5 37.5l-5.3 2.2L58 45l-2.2-5.3L50.5 37.5l5.3-2.2Z" style={fill("var(--soft-accent-2)")} />
      <path d="M188 92l1.6 3.8 3.9 1.6-3.9 1.6-1.6 3.8-1.6-3.8-3.9-1.6 3.9-1.6Z" style={fill("var(--soft-blue-2)")} />
      <circle cx="40" cy="124" r="4" style={fill("color-mix(in srgb, var(--soft-blue) 35%, var(--soft-card))")} />
      <circle cx="232" cy="96" r="3" style={fill("color-mix(in srgb, var(--soft-accent) 35%, var(--soft-card))")} />
      <circle cx="96" cy="26" r="2.6" style={fill("color-mix(in srgb, var(--soft-blue) 35%, var(--soft-card))")} />
    </svg>
  );
}
