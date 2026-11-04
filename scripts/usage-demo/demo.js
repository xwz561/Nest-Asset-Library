// "演示方法"MG 动画：一个按时间算画面的小舞台。renderAt(秒) 把所有元素摆到那一刻的样子，
// 不依赖上一帧，所以录制脚本可以逐帧跳着录。章节时间和说明文字来自 src/tutorial-steps.js。
import { USAGE_DEMO_CHAPTERS, USAGE_DEMO_DURATION } from "../../src/tutorial-steps.js";

const T = Object.fromEntries(USAGE_DEMO_CHAPTERS.map((c) => [c.id, c.start]));
const COLORS = { accent: "#ff8a4c", accent2: "#ffb27f", blue: "#6fa8f5", blueStrong: "#3b78d8", text: "#1f2333", muted: "#8a90a3", line: "#e3e6ee", tint: "#f1f3f8", bg: "#f2f3f7", pink: "#ff7ab8", violet: "#8d6bff" };

// ---------- 小工具 -------------------------------------------------------------
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const prog = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const lerp = (a, b, p) => a + (b - a) * p;
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const back = (p) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
const win = (t, a, b, fade = 0.35) => Math.min(prog(t, a, a + fade), 1 - prog(t, b - fade, b)); // 在 [a,b] 里显示，前后淡入淡出
const stage = document.getElementById("stage");
const make = (cls, parent = stage, html = "") => { const el = document.createElement("div"); el.className = `abs ${cls}`; el.innerHTML = html; parent.appendChild(el); return el; };
const css = (el, s) => { for (const k in s) el.style[k] = s[k]; };
const px = (v) => `${Math.round(v * 10) / 10}px`;
const ICONS = {
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.7"/><path d="M20.5 16l-5-5-8 8.5"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="M16 10.5l5-3v9l-5-3z"/></svg>',
  audio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3.5H7.5a2 2 0 00-2 2v13a2 2 0 002 2h9a2 2 0 002-2V8z"/><path d="M14 3.5V8h4.5M9 13h6M9 16.5h6"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z"/></svg>',
  wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 6.5a4 4 0 00-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 005.3-5.3l-2.5 2.5-2.5-.5-.5-2.5z"/></svg>',
  signal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="1.8"/><path d="M8.5 15.5a5 5 0 010-7M15.5 8.5a5 5 0 010 7M5.6 18.4a9 9 0 010-12.8M18.4 5.6a9 9 0 010 12.8"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  layout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="7" height="9" rx="1.6"/><rect x="13" y="4" width="7" height="5" rx="1.6"/><rect x="13" y="11" width="7" height="9" rx="1.6"/><rect x="4" y="15" width="7" height="5" rx="1.6"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3.5 7.5a2 2 0 012-2h4l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2h-13a2 2 0 01-2-2z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.2-4.2"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>',
};
const icon = (name, size = 18, color = "currentColor") => `<span style="display:inline-grid;width:${size}px;height:${size}px;color:${color}">${ICONS[name]}</span>`;

// ---------- 背景 ---------------------------------------------------------------
const bg = make("", stage);
css(bg, { width: "1280px", height: "720px", background: "linear-gradient(135deg, #fbf3ec 0%, #eef1f8 55%, #e9eefb 100%)" });
const blobs = [
  { c: "rgba(255, 138, 76, .20)", x: 140, y: 120, r: 260 },
  { c: "rgba(111, 168, 245, .22)", x: 1120, y: 560, r: 300 },
  { c: "rgba(141, 107, 255, .14)", x: 980, y: 90, r: 220 },
].map((b) => { const el = make("", stage); css(el, { width: px(b.r * 2), height: px(b.r * 2), borderRadius: "50%", background: `radial-gradient(circle, ${b.c}, transparent 70%)` }); return { el, ...b }; });

// ---------- 应用窗口（坐标都以窗口左上角为原点）------------------------------------
const WIN = { x: 120, y: 64, w: 1040, h: 570 };
const winEl = make("card", stage);
css(winEl, { width: px(WIN.w), height: px(WIN.h), background: COLORS.bg, borderRadius: "24px", overflow: "hidden", transformOrigin: "0 0", boxShadow: "0 30px 70px rgba(31, 35, 51, .16), 0 4px 14px rgba(31, 35, 51, .06)" });
const lights = make("", winEl, ["#ff5f57", "#febc2e", "#28c840"].map((c) => `<i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c};margin-right:6px"></i>`).join(""));
css(lights, { left: "20px", top: "22px", zIndex: 5 });

// 图标栏
const rail = make("card", winEl);
css(rail, { left: "12px", top: "12px", width: "52px", height: "546px", borderRadius: "16px" });
const railIcons = ["grid", "image", "video", "audio", "doc", "heart"].map((name, i) => {
  const el = make("", rail, icon(name, 18));
  css(el, { left: "9px", top: px(46 + i * 44), width: "34px", height: "34px", display: "grid", placeItems: "center", borderRadius: "11px", background: COLORS.tint, color: COLORS.muted });
  return el;
});
const editToggle = make("", rail, icon("layout", 18));
css(editToggle, { left: "9px", top: "458px", width: "34px", height: "34px", display: "grid", placeItems: "center", borderRadius: "11px", background: COLORS.tint, color: COLORS.muted });
const trash = make("", rail, icon("trash", 18));
css(trash, { left: "9px", top: "500px", width: "34px", height: "34px", display: "grid", placeItems: "center", borderRadius: "11px", background: COLORS.tint, color: COLORS.muted });

// 侧栏面板
const side = make("card", winEl);
css(side, { left: "74px", top: "12px", width: "214px", height: "546px" });
const brand = make("", side, '<b style="font-size:14px">小旺仔素材库</b>');
css(brand, { left: "16px", top: "16px" });
const importCard = make("tint", side, `
  <div style="font-size:12px;font-weight:700;color:${COLORS.text}">添加到素材库</div>
  <div style="font-size:10px;color:${COLORS.muted};margin-top:2px">文件或完整目录结构</div>`);
css(importCard, { left: "12px", top: "48px", width: "190px", height: "134px", borderRadius: "14px", padding: "12px", boxSizing: "border-box" });
const importBtn = make("", importCard, `${icon("play", 13, "#fff")}<b style="margin-left:8px">导入素材</b>`);
css(importBtn, { left: "12px", top: "50px", width: "166px", height: "32px", display: "flex", alignItems: "center", paddingLeft: "12px", boxSizing: "border-box", borderRadius: "10px", color: "#fff", fontSize: "12px", background: `linear-gradient(135deg, ${COLORS.accent2}, ${COLORS.accent})`, boxShadow: "0 5px 12px rgba(255, 138, 76, .3)" });
const importBtn2 = make("", importCard, `${icon("folder", 13, COLORS.muted)}<span style="margin-left:8px">导入文件夹</span>`);
css(importBtn2, { left: "12px", top: "90px", width: "166px", height: "30px", display: "flex", alignItems: "center", paddingLeft: "12px", boxSizing: "border-box", borderRadius: "10px", background: "#fff", fontSize: "12px", boxShadow: "0 2px 6px rgba(31,35,51,.06)" });
const foldersSec = make("", side);
css(foldersSec, { left: "8px", top: "196px", width: "198px", height: "170px", borderRadius: "14px" });
const foldersTitle = make("", foldersSec, '<b style="font-size:12px">文件夹</b>');
css(foldersTitle, { left: "10px", top: "8px" });
const plusBtn = make("", foldersSec, "+");
css(plusBtn, { left: "170px", top: "4px", width: "22px", height: "22px", display: "grid", placeItems: "center", borderRadius: "8px", background: COLORS.tint, color: COLORS.muted, fontSize: "14px" });
const FOLDERS = [["灵感收集", 3], ["品牌项目", 5], ["角色设定", 8], ["雨夜分镜", 0]];
const folderRows = FOLDERS.map(([name], i) => {
  const el = make("", foldersSec, `${icon("folder", 14, COLORS.muted)}<span style="margin-left:8px;flex:1">${name}</span><small class="count" style="color:${COLORS.muted}"></small>`);
  css(el, { left: "4px", top: px(34 + i * 30), width: "190px", height: "26px", display: "flex", alignItems: "center", padding: "0 10px", boxSizing: "border-box", borderRadius: "8px", fontSize: "12px" });
  return el;
});
const tagsSec = make("", side, `<b style="font-size:12px">标签</b>
  <div style="margin-top:10px;display:grid;gap:8px;font-size:12px">${[["参考", COLORS.pink], ["雨夜", COLORS.blue], ["人物", "#41c79a"]].map(([n, c]) => `<div><i style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${c};margin-right:8px"></i>${n}</div>`).join("")}</div>`);
css(tagsSec, { left: "18px", top: "388px" });
const disk = make("tint", side, `<b style="font-size:11px">本地磁盘 (D:)</b><div style="margin-top:6px;height:5px;border-radius:9px;background:#e1e5ee"><div style="width:62%;height:100%;border-radius:9px;background:linear-gradient(90deg,#41c7e8,#8d6bff)"></div></div>`);
css(disk, { left: "12px", top: "488px", width: "190px", height: "44px", borderRadius: "12px", padding: "8px 12px", boxSizing: "border-box" });

// 顶栏
const header = make("card", winEl);
css(header, { left: "300px", top: "12px", width: "728px", height: "60px" });
const crumbs = make("", header, "");
css(crumbs, { left: "18px", top: "21px", fontSize: "13px" });
const search = make("tint", header, `${icon("search", 14, COLORS.muted)}<span class="q" style="margin-left:8px;color:${COLORS.text}"></span><span class="ph" style="margin-left:8px;color:${COLORS.muted}">搜索素材</span><i class="caret" style="display:inline-block;width:1.5px;height:14px;background:${COLORS.accent};margin-left:2px"></i>`);
css(search, { left: "330px", top: "13px", width: "190px", height: "34px", display: "flex", alignItems: "center", padding: "0 12px", boxSizing: "border-box", borderRadius: "12px", fontSize: "12px" });
const pill = (inner, left, extra = {}) => { const el = make("", header, inner); css(el, { left: px(left), top: "13px", width: "34px", height: "34px", display: "grid", placeItems: "center", borderRadius: "11px", background: COLORS.tint, color: COLORS.muted, ...extra }); return el; };
const toolsPill = pill(icon("wrench", 16), 536);
const signalPill = pill(icon("signal", 16), 578);
const demoPill = pill(`${icon("play", 13, "#fff")}<b style="margin-left:5px;font-size:11px;color:#fff">演示方法</b>`, 620, { width: "92px", display: "flex", justifyContent: "center", alignItems: "center", background: `linear-gradient(135deg, ${COLORS.pink}, ${COLORS.violet})`, boxShadow: "0 5px 12px rgba(141,107,255,.28)" });

// 工具栏
const toolbar = make("card", winEl);
css(toolbar, { left: "300px", top: "84px", width: "728px", height: "46px", borderRadius: "16px" });
const toolbarTitle = make("", toolbar, "");
css(toolbarTitle, { left: "18px", top: "13px", fontSize: "14px", fontWeight: 700 });
const toolBtn = (label, left) => { const el = make("tint", toolbar, label); css(el, { left: px(left), top: "8px", height: "30px", padding: "0 12px", display: "flex", alignItems: "center", borderRadius: "10px", fontSize: "12px", color: "#4a5068" }); return el; };
toolBtn("排序", 470);
toolBtn("筛选", 530);
const viewBtn = toolBtn("", 590);

// 素材网格
const gridBox = make("", winEl);
css(gridBox, { left: "300px", top: "142px", width: "728px", height: "416px", overflow: "hidden" });
const ASSETS = [
  { name: "雨夜街景.jpg", kind: "image", g: ["#5c6bc0", "#26c6da"] },
  { name: "片头动画.mp4", kind: "video", g: ["#ff8a65", "#f06292"] },
  { name: "环境音.wav", kind: "audio", g: ["#4db6ac", "#81c784"] },
  { name: "分镜脚本.docx", kind: "doc", g: ["#ffb74d", "#ffd54f"] },
  { name: "雨夜角色.png", kind: "image", g: ["#7e57c2", "#5c6bc0"] },
  { name: "城市航拍.mp4", kind: "video", g: ["#29b6f6", "#66bb6a"] },
  { name: "配乐.mp3", kind: "audio", g: ["#ec407a", "#ab47bc"] },
  { name: "海报设计.png", kind: "image", g: ["#ff7043", "#ffca28"] },
];
const glyph = (kind) => (kind === "audio"
  ? `<div style="display:flex;gap:3px;align-items:center;height:30px">${[10, 22, 14, 28, 18, 24, 12, 20, 8].map((h) => `<i style="width:4px;height:${h}px;border-radius:2px;background:rgba(255,255,255,.85)"></i>`).join("")}</div>`
  : kind === "doc"
    ? `<div style="display:grid;gap:5px;width:56px">${[1, .8, 1, .6].map((w) => `<i style="height:4px;width:${w * 100}%;border-radius:2px;background:rgba(255,255,255,.85)"></i>`).join("")}</div>`
    : icon(kind === "video" ? "play" : "image", 30, "rgba(255,255,255,.9)"));
const cards = ASSETS.map((a) => {
  const el = make("card", gridBox);
  css(el, { borderRadius: "16px", overflow: "hidden" });
  const thumb = make("", el, glyph(a.kind));
  css(thumb, { display: "grid", placeItems: "center", overflow: "hidden", background: `linear-gradient(135deg, ${a.g[0]}, ${a.g[1]})`, borderRadius: "11px" });
  const label = make("ellipsis", el, a.name);
  css(label, { fontSize: "12px", fontWeight: 600 });
  return { el, thumb, label, ...a };
});

// 覆盖层：工具集弹层、详情面板、预览、编辑条、文件夹分栏、提示
const toolsPop = make("card", winEl, `<b style="font-size:13px">友商工具集</b><div class="tiles" style="display:flex;gap:10px;margin-top:12px"></div>`);
css(toolsPop, { left: "640px", top: "80px", width: "372px", height: "128px", padding: "14px", boxSizing: "border-box", zIndex: 20, transformOrigin: "70% 0" });
const TOOLS = [["深度视频转换", "#6fa8f5"], ["macOS 指针管家", "#ff8a4c"]];
const toolTiles = TOOLS.map(([name, c]) => { const el = document.createElement("div"); el.innerHTML = `<i style="display:block;width:30px;height:30px;border-radius:10px;background:${c};margin-bottom:8px"></i>${name}`; css(el, { width: "106px", height: "70px", padding: "10px", boxSizing: "border-box", borderRadius: "12px", background: COLORS.tint, fontSize: "11px", fontWeight: 600 }); toolsPop.querySelector(".tiles").appendChild(el); return el; });
const detail = make("card", winEl);
css(detail, { top: "12px", width: "238px", height: "546px", zIndex: 15, padding: "16px", boxSizing: "border-box" });
const detailThumb = make("", detail, glyph("video"));
css(detailThumb, { left: "16px", top: "16px", width: "206px", height: "126px", display: "grid", placeItems: "center", borderRadius: "14px", background: `linear-gradient(135deg, ${ASSETS[1].g[0]}, ${ASSETS[1].g[1]})` });
const detailName = make("", detail, `<b style="font-size:14px">片头动画.mp4</b><div style="font-size:11px;color:${COLORS.muted};margin-top:4px">视频 · 1920×1080 · 12.4 MB</div>`);
css(detailName, { left: "16px", top: "156px" });
const heartBtn = make("", detail, icon("heart", 18));
css(heartBtn, { left: "186px", top: "154px", width: "34px", height: "34px", display: "grid", placeItems: "center", borderRadius: "11px", background: COLORS.tint, color: COLORS.muted });
const detailTags = make("", detail, "");
css(detailTags, { left: "16px", top: "214px", display: "flex", gap: "6px", flexWrap: "wrap", width: "206px" });
const detailNotes = make("", detail, `<b style="font-size:12px">备注</b>${[1, .9, .7].map((w) => `<i style="display:block;height:6px;width:${w * 100}%;border-radius:3px;background:${COLORS.tint};margin-top:10px"></i>`).join("")}`);
css(detailNotes, { left: "16px", top: "268px", width: "206px" });
const preview = make("", winEl);
css(preview, { left: "0", top: "0", width: px(WIN.w), height: px(WIN.h), zIndex: 30, background: "rgba(20, 22, 32, .78)" });
const previewImg = make("", preview, glyph("image"));
css(previewImg, { display: "grid", placeItems: "center", borderRadius: "18px", background: `linear-gradient(135deg, ${ASSETS[7].g[0]}, ${ASSETS[7].g[1]})`, boxShadow: "0 30px 60px rgba(0,0,0,.4)" });
const editBar = make("card", winEl, `<span style="color:${COLORS.muted};font-size:12px;margin-right:10px">拖动卡片换位置</span>`);
css(editBar, { top: "500px", height: "44px", display: "flex", alignItems: "center", gap: "8px", padding: "0 6px 0 16px", borderRadius: "99px", zIndex: 25, boxShadow: "0 18px 40px rgba(31,35,51,.18)" });
const crazyChip = document.createElement("span"); crazyChip.innerHTML = `${icon("zap", 12)}<span style="margin-left:4px">疯狂模式</span>`;
const editChip = (label, primary) => { const el = document.createElement("span"); el.textContent = label; css(el, { height: "32px", padding: "0 14px", display: "inline-flex", alignItems: "center", borderRadius: "99px", fontSize: "12px", fontWeight: 650, background: primary ? `linear-gradient(135deg, ${COLORS.accent2}, ${COLORS.accent})` : COLORS.tint, color: primary ? "#fff" : "#4a5068" }); return el; };
css(crazyChip, { height: "32px", padding: "0 14px", display: "inline-flex", alignItems: "center", borderRadius: "99px", fontSize: "12px", fontWeight: 650 });
editBar.appendChild(crazyChip); editBar.appendChild(editChip("一键重置")); editBar.appendChild(editChip("取消")); const saveChip = editChip("保存", true); editBar.appendChild(saveChip);
const columns = make("card", stage);
css(columns, { zIndex: 45, overflow: "hidden", boxSizing: "border-box", display: "none", transformOrigin: "0 0" });
const COLS = [["AX29"], ["EP29", "EP30", "EP31"], ["分镜", "角色设定", "环境", "道具"], ["莱恩", "苏珊", "塞巴斯蒂安"]];
const colEls = COLS.map((items, c) => { const el = make("", columns, items.map((n, i) => `<div data-i="${i}" style="height:26px;display:flex;align-items:center;gap:8px;padding:0 8px;border-radius:7px;font-size:12px;font-weight:600">${icon("folder", 13, COLORS.muted)}<span style="flex:1">${n}</span>${c < 3 ? "<span style='color:#b0b5c3'>›</span>" : ""}</div>`).join("")); css(el, { top: "34px", width: "170px", height: "96px", padding: "4px", boxSizing: "border-box", borderRight: `1px solid ${COLORS.line}` }); return el; });
const colTitle = make("", columns, '<b style="font-size:12px">文件夹</b>');
css(colTitle, { left: "14px", top: "10px" });
const deskCard = make("card", stage, `<div style="height:30px;display:flex;align-items:center;gap:8px;padding:0 8px 0 12px;border-bottom:1px solid ${COLORS.line};font-size:12px"><i style="width:18px;height:4px;border-radius:9px;background:${COLORS.blue}"></i><b style="flex:1">导入</b><span style="height:22px;padding:0 9px;border-radius:99px;background:${COLORS.tint};display:inline-flex;align-items:center;font-size:11px;color:#4a5068">↶ 放回</span></div>`);
css(deskCard, { width: "200px", height: "172px", zIndex: 40, borderRadius: "14px", overflow: "hidden", boxShadow: "0 24px 50px rgba(31,35,51,.22)" });
const ghost = make("card", stage);
css(ghost, { zIndex: 50, borderRadius: "12px", overflow: "hidden" });
const toast = make("card", stage, "");
css(toast, { zIndex: 60, height: "40px", display: "flex", alignItems: "center", padding: "0 18px", borderRadius: "99px", fontSize: "13px", fontWeight: 650 });
const keyChip = make("card", stage, '<b style="font-size:13px">Alt</b>');
css(keyChip, { zIndex: 61, width: "44px", height: "30px", display: "grid", placeItems: "center", borderRadius: "9px", boxShadow: "0 3px 0 #d5d9e4, 0 10px 20px rgba(31,35,51,.12)" });
const mate = make("card", stage, `<div style="display:flex;align-items:center;gap:10px"><i style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#6fa8f5,#8d6bff);display:inline-block"></i><div><b style="font-size:13px">同事的电脑</b><div style="font-size:11px;color:${COLORS.muted}">局域网 · 在线</div></div></div><div class="msg" style="margin-top:12px;font-size:13px;font-weight:650"></div>`);
css(mate, { zIndex: 35, width: "190px", height: "100px", padding: "14px", boxSizing: "border-box" });
const trail = document.createElementNS("http://www.w3.org/2000/svg", "svg");
trail.setAttribute("width", "1280"); trail.setAttribute("height", "720"); trail.style.position = "absolute"; trail.style.left = "0"; trail.style.top = "0"; trail.style.zIndex = "55"; trail.style.pointerEvents = "none";
trail.innerHTML = `<path class="tr" fill="none" stroke="${COLORS.accent}" stroke-width="5" stroke-linecap="round" stroke-dasharray="2 10"/><g class="bubble"><circle r="20" fill="#fff"/><path d="M0 7s-8-5-8-10.5a4.3 4.3 0 018-2.4 4.3 4.3 0 018 2.4C8 2 0 7 0 7z" fill="${COLORS.pink}"/></g>`;
stage.appendChild(trail);
const ripples = [0, 1].map(() => { const el = make("", stage); css(el, { zIndex: 98, width: "40px", height: "40px", marginLeft: "-20px", marginTop: "-20px", borderRadius: "50%", border: `2.5px solid ${COLORS.accent}` }); return el; });
const cursor = make("", stage, '<svg width="28" height="28" viewBox="0 0 28 28"><path d="M5 3l16 10.5-7.2 1.3 4.3 8.2-3.4 1.7-4.2-8.3L5 21.5z" fill="#1f2333" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>');
css(cursor, { zIndex: 99, filter: "drop-shadow(0 3px 5px rgba(0,0,0,.25))" });
const highlight = make("", stage);
css(highlight, { zIndex: 70, borderRadius: "16px", border: `3px solid ${COLORS.violet}`, boxShadow: "0 0 0 6px rgba(141,107,255,.18)" });

// 片头片尾、章节标题、字幕、进度条
const title = make("", stage, `<div style="display:flex;align-items:center;gap:18px"><img src="../../build/icon.png" style="width:84px;height:84px;border-radius:24px;box-shadow:0 14px 30px rgba(31,35,51,.18)"><div><div style="font-size:44px;font-weight:800;letter-spacing:1px">小旺仔素材库</div><div class="sub" style="font-size:20px;color:${COLORS.muted};margin-top:6px">一分钟看懂怎么用</div></div></div>`);
css(title, { zIndex: 80 });
const chip = make("card", stage, `<span class="num" style="display:inline-grid;place-items:center;width:30px;height:30px;border-radius:10px;background:linear-gradient(135deg,${COLORS.accent2},${COLORS.accent});color:#fff;font-size:13px;font-weight:800"></span><b class="tt" style="font-size:17px;margin-left:12px"></b>`);
css(chip, { left: "120px", top: "16px", height: "42px", display: "flex", alignItems: "center", padding: "0 16px 0 6px", borderRadius: "14px", zIndex: 80 });
const subtitle = make("", stage, "");
css(subtitle, { left: "120px", top: "650px", width: "1040px", textAlign: "center", fontSize: "18px", fontWeight: 600, color: "#3a3f52", zIndex: 80 });
const bar = make("", stage, USAGE_DEMO_CHAPTERS.map(() => `<i style="flex:1;height:4px;border-radius:9px;background:rgba(31,35,51,.1);overflow:hidden"><i style="display:block;height:100%;width:0;background:${COLORS.accent}"></i></i>`).join(""));
css(bar, { left: "120px", top: "694px", width: "1040px", display: "flex", gap: "6px", zIndex: 80 });

// ---------- 时间线 -------------------------------------------------------------
// 窗口整体的位移和缩放（局域网、疯狂模式两段给右边腾地方）
const WIN_MOVES = [
  { at: T.intro, to: { x: 0, y: 30, s: 0.9, o: 0 } },
  { at: T.intro + 1.6, to: { x: 0, y: 0, s: 1, o: 1 }, dur: 1.2 },
  { at: T["lan-signals"] + 0.2, to: { x: -86, y: 24, s: 0.82, o: 1 }, dur: 0.8 },
  { at: T.categories - 0.8, to: { x: 0, y: 0, s: 1, o: 1 }, dur: 0.8 },
  { at: T.crazy, to: { x: -96, y: 24, s: 0.8, o: 1 }, dur: 0.8 },
  { at: T.outro + 0.2, to: { x: 0, y: 0, s: 1, o: 1 }, dur: 0.9 },
];
function winState(t) {
  let state = { ...WIN_MOVES[0].to };
  for (let i = 1; i < WIN_MOVES.length; i++) {
    const m = WIN_MOVES[i];
    const p = easeInOut(prog(t, m.at, m.at + m.dur));
    if (t < m.at) break;
    const from = state;
    state = { x: lerp(from.x, m.to.x, p), y: lerp(from.y, m.to.y, p), s: lerp(from.s, m.to.s, p), o: lerp(from.o, m.to.o, p) };
  }
  return state;
}
const toStage = (x, y, w) => ({ x: WIN.x + w.x + (WIN.w * (1 - w.s)) / 2 + x * w.s, y: WIN.y + w.y + (WIN.h * (1 - w.s)) / 2 + y * w.s });

// 鼠标：[秒, x, y, 坐标系]（"w" = 窗口里，"s" = 舞台 / 桌面）
const A = (i) => T[i];
const CURSOR = [
  [0, 760, 560, "w"],
  [A("import") + 0.4, 760, 420, "w"], [A("import") + 1.2, 168, 126, "w"], [A("import") + 3.6, 168, 126, "w"], [A("import") + 4.6, 560, 360, "w"],
  [A("friend-tools") + 0.2, 560, 330, "w"], [A("friend-tools") + 1.4, 853, 43, "w"], [A("friend-tools") + 2.4, 853, 43, "w"], [A("friend-tools") + 3.0, 712, 160, "w"], [A("friend-tools") + 4.4, 712, 160, "w"], [A("friend-tools") + 5.4, 640, 330, "w"],
  [A("lan-signals") + 1.0, 600, 300, "w"], [A("lan-signals") + 1.8, 620, 280, "w"], [A("lan-signals") + 4.0, 1150, 250, "s"], [A("lan-signals") + 5.6, 1150, 250, "s"],
  [A("categories") + 0.4, 520, 300, "w"], [A("categories") + 1.4, 38, 109, "w"], [A("categories") + 3.6, 38, 109, "w"], [A("categories") + 4.2, 38, 65, "w"], [A("categories") + 5.4, 300, 330, "w"],
  [A("folders") + 0.9, 255, 223, "w"], [A("folders") + 1.6, 255, 223, "w"], [A("folders") + 2.5, 385, 210, "w"], [A("folders") + 3.0, 385, 210, "w"], [A("folders") + 4.6, 140, 320, "w"], [A("folders") + 5.0, 140, 320, "w"], [A("folders") + 5.4, 570, 380, "w"], [A("folders") + 5.7, 570, 380, "w"], [A("folders") + 7.0, 140, 320, "w"], [A("folders") + 7.6, 300, 360, "w"],
  [A("search") + 0.8, 760, 42, "w"], [A("search") + 4.2, 760, 42, "w"], [A("search") + 4.6, 806, 42, "w"], [A("search") + 5.6, 600, 330, "w"],
  [A("organize") + 0.8, 922, 107, "w"], [A("organize") + 5.4, 922, 107, "w"], [A("organize") + 6.4, 640, 330, "w"],
  [A("assets") + 0.7, 570, 230, "w"], [A("assets") + 1.6, 990, 182, "w"], [A("assets") + 2.6, 900, 240, "w"], [A("assets") + 3.4, 520, 360, "w"], [A("assets") + 4.6, 520, 360, "w"], [A("assets") + 6.6, 520, 360, "w"], [A("assets") + 7.4, 600, 420, "w"],
  [A("layout") + 0.8, 38, 487, "w"], [A("layout") + 1.8, 120, 220, "w"], [A("layout") + 2.2, 120, 220, "w"], [A("layout") + 4.2, 470, 452, "w"], [A("layout") + 4.6, 470, 452, "w"], [A("layout") + 5.6, 330, 498, "w"], [A("layout") + 6.4, 330, 498, "w"], [A("layout") + 7.4, 774, 522, "w"], [A("layout") + 8.6, 774, 522, "w"], [A("layout") + 9.4, 640, 330, "w"],
  [A("crazy") + 1.0, 492, 522, "w"], [A("crazy") + 1.6, 492, 522, "w"], [A("crazy") + 2.4, 160, 72, "w"], [A("crazy") + 2.8, 160, 72, "w"], [A("crazy") + 4.6, 1110, 200, "s"], [A("crazy") + 5.3, 1176, 175, "s"], [A("crazy") + 5.7, 1176, 175, "s"], [A("crazy") + 6.6, 640, 360, "w"],
  [A("outro") + 0.8, 990, 60, "w"], [A("outro") + 3.6, 990, 60, "w"], [USAGE_DEMO_DURATION, 990, 60, "w"],
];
const CLICKS = [A("import") + 1.5, A("friend-tools") + 1.6, A("friend-tools") + 3.4, A("categories") + 1.6, A("categories") + 4.4, A("folders") + 1.8, A("search") + 1.0, A("search") + 4.8, A("organize") + 1.0, A("organize") + 2.8, A("organize") + 4.8, A("assets") + 0.9, A("assets") + 1.8, A("assets") + 2.8, A("assets") + 3.6, A("assets") + 3.8, A("layout") + 1.0, A("layout") + 6.6, A("layout") + 8.8, A("crazy") + 1.8, A("crazy") + 5.5];
// 拖动段：[开始, 结束]（按住时鼠标略缩小）
const DRAGS = [[A("lan-signals") + 1.8, A("lan-signals") + 4.0], [A("folders") + 3.0, A("folders") + 4.6], [A("folders") + 5.7, A("folders") + 7.0], [A("layout") + 2.2, A("layout") + 4.2], [A("crazy") + 2.8, A("crazy") + 4.6]];

function cursorAt(t, w) {
  let i = CURSOR.findIndex((k) => k[0] > t);
  if (i === -1) i = CURSOR.length - 1;
  const a = CURSOR[Math.max(0, i - 1)], b = CURSOR[i];
  const p = easeInOut(prog(t, a[0], b[0] === a[0] ? a[0] + 1 : b[0]));
  const pa = a[3] === "w" ? toStage(a[1], a[2], w) : { x: a[1], y: a[2] };
  const pb = b[3] === "w" ? toStage(b[1], b[2], w) : { x: b[1], y: b[2] };
  return { x: lerp(pa.x, pb.x, p), y: lerp(pa.y, pb.y, p) };
}

// 网格状态：[秒, 视图, 过滤]
const GRID = [
  { at: 0, mode: "std", filter: "all" },
  { at: A("categories") + 1.8, mode: "std", filter: "image" },
  { at: A("categories") + 4.6, mode: "std", filter: "all" },
  { at: A("search") + 2.4, mode: "std", filter: "雨夜" },
  { at: A("search") + 5.0, mode: "std", filter: "all" },
  { at: A("organize") + 1.2, mode: "compact", filter: "all" },
  { at: A("organize") + 3.0, mode: "list", filter: "all" },
  { at: A("organize") + 5.0, mode: "std", filter: "all" },
];
const visibleBy = (filter, a) => filter === "all" || (filter === "image" ? a.kind === "image" : a.name.includes(filter));
function layoutFor(mode, filter, gridH) {
  const order = ASSETS.map((a, i) => i).filter((i) => visibleBy(filter, ASSETS[i]));
  const slotOf = (i) => { const k = order.indexOf(i); return k === -1 ? ASSETS.length + i : k; };
  return ASSETS.map((a, i) => {
    const k = order.indexOf(i) === -1 ? i : slotOf(i);
    if (mode === "list") return { x: 0, y: k * 50, w: 728, h: 44, v: order.includes(i) ? 1 : 0, list: 1 };
    const cols = mode === "compact" ? 5 : 4, w = mode === "compact" ? 134 : 170, h = mode === "compact" ? 122 : Math.min(150, (gridH - 16) / 2), gap = mode === "compact" ? 14 : 16;
    return { x: (k % cols) * (w + gap), y: Math.floor(k / cols) * (h + gap), w, h, v: order.includes(i) ? 1 : 0, list: 0 };
  });
}

// ---------- 每一帧 -------------------------------------------------------------
function chapterAt(t) { let c = USAGE_DEMO_CHAPTERS[0]; for (const ch of USAGE_DEMO_CHAPTERS) if (t >= ch.start) c = ch; return c; }

export function renderAt(t) {
  const w = winState(t);
  // 背景
  blobs.forEach((b, i) => css(b.el, { transform: `translate(${px(b.x - b.r + Math.sin(t * 0.35 + i * 2) * 26)}, ${px(b.y - b.r + Math.cos(t * 0.3 + i) * 18)})` }));
  const sx = WIN.x + w.x + (WIN.w * (1 - w.s)) / 2, sy = WIN.y + w.y + (WIN.h * (1 - w.s)) / 2;
  css(winEl, { transform: `translate(${px(sx)}, ${px(sy)}) scale(${w.s})`, opacity: w.o });

  // 片头标题
  const introOut = prog(t, A("intro") + 3.6, A("intro") + 4.6);
  const titleIn = easeOut(prog(t, 0.2, 1.4));
  const outroIn = easeOut(prog(t, A("outro") + 3.4, A("outro") + 4.4));
  const titleShow = Math.max(titleIn * (1 - introOut), outroIn);
  css(title, { left: "50%", top: px(lerp(330, 300, titleIn)), transform: `translate(-50%, -50%) scale(${lerp(0.94, 1, titleShow)})`, opacity: titleShow });
  title.querySelector(".sub").textContent = t > A("outro") ? "随时点「演示方法」再看一遍" : "一分钟看懂怎么用";
  const blurNow = titleShow > 0.01 ? `blur(${px(titleShow * 6)})` : "none";
  css(winEl, { filter: blurNow });
  css(columns, { filter: blurNow });

  // 章节标题和字幕
  const ch = chapterAt(t), idx = USAGE_DEMO_CHAPTERS.indexOf(ch);
  const chIn = easeOut(prog(t, ch.start + 0.1, ch.start + 0.6));
  chip.querySelector(".num").textContent = String(idx).padStart(2, "0");
  chip.querySelector(".tt").textContent = ch.title;
  css(chip, { opacity: ch.id === "intro" ? 0 : chIn, transform: `translateY(${px((1 - chIn) * -10)})` });
  subtitle.textContent = ch.body;
  css(subtitle, { opacity: ch.id === "intro" ? prog(t, 2.2, 2.8) : chIn * (1 - outroIn), transform: `translateY(${px((1 - chIn) * 8)})` });
  [...bar.children].forEach((seg, i) => {
    const c = USAGE_DEMO_CHAPTERS[i], next = USAGE_DEMO_CHAPTERS[i + 1]?.start ?? USAGE_DEMO_DURATION;
    seg.firstChild.style.width = `${prog(t, c.start, next) * 100}%`;
  });

  // 图标栏选中、编辑开关
  const catImage = t >= A("categories") + 1.6 && t < A("categories") + 4.4;
  railIcons.forEach((el, i) => {
    const active = i === (catImage ? 1 : 0);
    css(el, { background: active ? `linear-gradient(140deg, #9cc3f8, ${COLORS.blue})` : COLORS.tint, color: active ? "#fff" : COLORS.muted, boxShadow: active ? "0 5px 12px rgba(111,168,245,.35)" : "none" });
  });
  const editing = (t >= A("layout") + 1.0 && t < A("layout") + 8.8) || (t >= A("crazy") + 0.8 && t < A("crazy") + 6.6);
  css(editToggle, { background: editing ? `linear-gradient(140deg, #9cc3f8, ${COLORS.blue})` : COLORS.tint, color: editing ? "#fff" : COLORS.muted });
  const dash = editing ? `1.5px dashed rgba(111,168,245,.8)` : "0px solid transparent";
  [importCard, foldersSec, header, toolbar, rail].forEach((el) => css(el, { outline: dash, outlineOffset: "-3px" }));
  css(importBtn, { transform: `scale(${1 - 0.06 * win(t, A("import") + 1.4, A("import") + 1.8, 0.15)})` });

  // 顶栏：路径、搜索文字
  const q = t < A("search") + 1.4 || t >= A("search") + 4.9 ? "" : t < A("search") + 1.9 ? "雨" : "雨夜";
  search.querySelector(".q").textContent = q;
  search.querySelector(".ph").style.display = q ? "none" : "inline";
  search.querySelector(".caret").style.opacity = t > A("search") + 1.0 && t < A("search") + 4.9 && Math.floor(t * 2.5) % 2 === 0 ? 1 : 0;
  css(search, { boxShadow: t > A("search") + 1.0 && t < A("search") + 4.9 ? `0 0 0 2px rgba(255,138,76,.35)` : "none", background: t > A("search") + 1.0 && t < A("search") + 4.9 ? "#fff" : COLORS.tint });
  const filterNow = GRID.filter((g) => g.at <= t).pop();
  crumbs.innerHTML = `<span class="muted">资源库</span> <span style="color:#c3c7d2">›</span> <b>${filterNow.filter === "image" ? "图片" : "全部素材"}</b>`;
  toolbarTitle.innerHTML = `${filterNow.filter === "image" ? "图片" : q ? `搜索“${q}”` : "全部素材"} <span style="font-size:11px;color:${COLORS.muted};font-weight:500;margin-left:6px">${ASSETS.filter((a) => visibleBy(filterNow.filter, a)).length} 个素材</span>`;
  viewBtn.textContent = { std: "▦ 标准", compact: "▤ 紧凑", list: "☰ 列表" }[filterNow.mode];
  css(toolsPill, { background: win(t, A("friend-tools") + 1.6, A("friend-tools") + 5.0) > 0.5 ? "#ffe9dc" : COLORS.tint, color: win(t, A("friend-tools") + 1.6, A("friend-tools") + 5.0) > 0.5 ? COLORS.accent : COLORS.muted });

  // 布局段：文件夹卡片拖到底部，变成分栏，素材区让位
  const lift = easeInOut(prog(t, A("layout") + 2.2, A("layout") + 4.2));
  const morph = easeInOut(prog(t, A("layout") + 4.0, A("layout") + 4.8));
  const docked = t >= A("layout") + 4.0;
  const dockH = docked ? lerp(0, 150, morph) : 0;
  css(foldersSec, { opacity: t >= A("layout") + 2.2 ? 0 : 1 });
  const gridH = 416 - dockH;
  css(gridBox, { height: px(gridH) });
  css(side, { height: px(546 - dockH) });
  css(rail, { height: px(546 - dockH) });
  css(tagsSec, { top: px(lerp(388, 220, prog(t, A("layout") + 2.4, A("layout") + 3.0))) });
  css(disk, { top: px(488 - dockH) });
  if (t >= A("layout") + 2.2) {
    const c = cursorAt(t, w);
    const from = { x: c.x - 40, y: c.y - 20, w: 198 * w.s, h: 170 * w.s };
    const strip = toStage(12, 570 - 12 - 138, w);
    const to = { x: strip.x, y: strip.y, w: 1016 * w.s, h: 138 * w.s };
    const p = docked ? morph : 0;
    css(columns, { display: "block", transform: `translate(${px(lerp(from.x, to.x, p))}, ${px(lerp(from.y, to.y, p))}) scale(${w.s})`, width: px(lerp(from.w, to.w, p) / w.s), height: px(lerp(from.h, to.h, p) / w.s), boxShadow: !docked || morph < 1 ? "0 24px 50px rgba(31,35,51,.22)" : "0 10px 28px rgba(31, 35, 51, .07)" });
    const shown = t < A("layout") + 6.8 ? 3 : 4;
    colEls.forEach((el, i) => {
      css(el, { left: px(12 + i * 176), opacity: (docked ? prog(t, A("layout") + 4.6, A("layout") + 5.0) : 0) * (i < shown ? 1 : 0), transform: i === 3 ? `translateX(${px((1 - prog(t, A("layout") + 6.8, A("layout") + 7.2)) * -12)})` : "none" });
      [...el.children].forEach((row, r) => { const sel = (i === 0 && r === 0) || (i === 1 && r === 0) || (i === 2 && r === 1 && t >= A("layout") + 6.6); row.style.background = sel ? (i === 2 ? "#e6f0fd" : "#eceef4") : "transparent"; row.style.color = sel && i === 2 ? COLORS.blueStrong : COLORS.text; });
    });
  } else {
    css(columns, { display: "none" });
  }

  // 网格卡片
  const gIdx = GRID.reduce((k, g, i) => (g.at <= t ? i : k), 0);
  const cur = GRID[gIdx], prev = GRID[Math.max(0, gIdx - 1)];
  const gp = easeInOut(prog(t, cur.at, cur.at + 0.6));
  const LA = layoutFor(prev.mode, prev.filter, gridH), LB = layoutFor(cur.mode, cur.filter, gridH);
  cards.forEach((c, i) => {
    const a = LA[i], b = LB[i];
    const appear = back(prog(t, A("import") + 2.4 + i * 0.28, A("import") + 2.9 + i * 0.28));
    const v = lerp(a.v, b.v, gp) * clamp(appear, 0, 1);
    const L = lerp(a.list, b.list, gp);
    const x = lerp(a.x, b.x, gp), y = lerp(a.y, b.y, gp), cw = lerp(a.w, b.w, gp), chh = lerp(a.h, b.h, gp);
    const sel = (i === 1 && t >= A("assets") + 0.9 && t < A("assets") + 7.6) || (i === 7 && t >= A("assets") + 3.6 && t < A("assets") + 3.9);
    const dragged = (i === 0 && t >= A("folders") + 3.0 && t < A("folders") + 4.7) || (i === 4 && t >= A("folders") + 5.7 && t < A("folders") + 7.1);
    const matched = cur.filter === "雨夜" && gp > 0.5 && c.name.includes("雨夜");
    css(c.el, { transform: `translate(${px(x)}, ${px(y)}) scale(${0.6 + 0.4 * v})`, width: px(cw), height: px(chh), opacity: v * (dragged ? 0.35 : 1), boxShadow: sel ? `0 0 0 3px ${COLORS.blue}, 0 10px 28px rgba(31,35,51,.1)` : matched ? `0 0 0 3px ${COLORS.accent}` : "" });
    const pad = lerp(10, 6, L);
    const tw = lerp(cw - 20, 32, L), th = lerp(chh - 46, 32, L);
    css(c.thumb, { left: px(pad), top: px(pad), width: px(tw), height: px(Math.max(20, th)) });
    css(c.label, { left: px(lerp(12, 50, L)), top: px(lerp(chh - 28, 14, L)), width: px(lerp(cw - 24, 400, L)) });
  });

  // 拖动中的卡片缩影（文件夹段）
  const drag1 = t >= A("folders") + 3.0 && t < A("folders") + 4.9, drag2 = t >= A("folders") + 5.7 && t < A("folders") + 7.3;
  if (drag1 || drag2) {
    const c = cursorAt(t, w), a = ASSETS[drag1 ? 0 : 4];
    const drop = prog(t, drag1 ? A("folders") + 4.6 : A("folders") + 7.0, drag1 ? A("folders") + 4.9 : A("folders") + 7.3);
    css(ghost, { display: "block", left: "0", top: "0", width: "96px", height: "70px", transform: `translate(${px(c.x + 6)}, ${px(c.y + 6)}) scale(${1 - drop * 0.8})`, opacity: 1 - drop, background: `linear-gradient(135deg, ${a.g[0]}, ${a.g[1]})`, boxShadow: "0 16px 30px rgba(31,35,51,.25)" });
  } else css(ghost, { display: "none" });

  // 文件夹行：新建"雨夜分镜"、拖进去后数量变化、落点高亮
  folderRows.forEach((row, i) => {
    const appear = i < 3 ? 1 : easeOut(prog(t, A("folders") + 2.0, A("folders") + 2.5));
    const hot = i === 3 && ((t > A("folders") + 4.2 && t < A("folders") + 4.9) || (t > A("folders") + 6.6 && t < A("folders") + 7.3));
    const count = i < 3 ? FOLDERS[i][1] : t >= A("folders") + 7.1 ? 2 : t >= A("folders") + 4.8 ? 1 : 0;
    row.querySelector(".count").textContent = `(${count})`;
    css(row, { opacity: appear, transform: `translateX(${px((1 - appear) * -14)})`, background: hot ? "#ffe9dc" : i === 3 && appear > 0.9 && t < A("folders") + 3.0 ? COLORS.tint : "transparent", color: hot ? COLORS.accent : COLORS.text });
  });

  // 提示泡泡：导入完成、启动工具、布局已保存
  const toastText = t >= A("import") + 5.0 && t < A("import") + 7.6 ? "已导入 8 个素材" : t >= A("layout") + 8.9 && t < A("layout") + 10 ? "布局已保存" : t >= A("friend-tools") + 3.4 && t < A("friend-tools") + 4.9 ? "正在启动深度视频转换器…" : "";
  const toastShow = toastText ? Math.min(1, win(t, ...(toastText.startsWith("已导入") ? [A("import") + 5.0, A("import") + 7.6] : toastText.startsWith("布局") ? [A("layout") + 8.9, A("layout") + 10] : [A("friend-tools") + 3.4, A("friend-tools") + 4.9]), 0.3)) : 0;
  toast.innerHTML = `<span style="display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#41c79a;color:#fff;font-size:12px;margin-right:8px">✓</span>${toastText}`;
  const tp = toStage(520, 26, w);
  css(toast, { left: "0", top: "0", transform: `translate(calc(${px(tp.x)} - 50%), ${px(tp.y + (1 - toastShow) * -8)})`, opacity: toastShow });

  // 友商工具集弹层
  const popShow = win(t, A("friend-tools") + 1.7, A("friend-tools") + 5.0, 0.35);
  css(toolsPop, { opacity: popShow, transform: `scale(${0.9 + 0.1 * easeOut(popShow)})` });
  toolTiles.forEach((tile, i) => css(tile, { boxShadow: i === 0 && t > A("friend-tools") + 3.3 && t < A("friend-tools") + 4.8 ? `0 0 0 2px ${COLORS.pink}` : "none", transform: i === 0 ? `scale(${1 + 0.06 * win(t, A("friend-tools") + 3.3, A("friend-tools") + 3.8, 0.2)})` : "none" }));

  // 局域网信号：Alt + 拖动画出轨迹，爱心飞到同事的电脑
  const lanShow = win(t, A("lan-signals") + 0.6, A("categories") - 0.6, 0.5);
  css(mate, { left: "0", top: "0", transform: `translate(${px(1050 - (1 - easeOut(lanShow)) * -60)}, 180px)`, opacity: lanShow });
  const got = t > A("lan-signals") + 4.3;
  mate.querySelector(".msg").innerHTML = got ? `收到一个 <span style="color:${COLORS.pink}">♥</span>` : "";
  css(mate, { boxShadow: got && t < A("lan-signals") + 5.4 ? `0 0 0 3px ${COLORS.pink}, 0 10px 28px rgba(31,35,51,.1)` : "" });
  const keyShow = win(t, A("lan-signals") + 1.5, A("lan-signals") + 4.3, 0.25);
  const kc = cursorAt(t, w);
  css(keyChip, { left: "0", top: "0", transform: `translate(${px(kc.x - 56)}, ${px(kc.y + 14)})`, opacity: keyShow });
  const path = trail.querySelector(".tr"), bubble = trail.querySelector(".bubble");
  if (t > A("lan-signals") + 1.8 && t < A("lan-signals") + 5.6) {
    const pts = [];
    for (let s = A("lan-signals") + 1.8; s <= Math.min(t, A("lan-signals") + 4.0); s += 0.05) { const p = cursorAt(s, winState(s)); pts.push(`${pts.length ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`); }
    path.setAttribute("d", pts.join(" "));
    path.style.opacity = String(1 - prog(t, A("lan-signals") + 4.6, A("lan-signals") + 5.6));
    const bp = prog(t, A("lan-signals") + 3.6, A("lan-signals") + 4.3), end = cursorAt(A("lan-signals") + 4.0, winState(A("lan-signals") + 4.0));
    bubble.setAttribute("transform", `translate(${lerp(end.x - 120, end.x, bp)} ${lerp(end.y - 60, end.y - 20, bp) - Math.sin(bp * Math.PI) * 40}) scale(${0.6 + bp * 0.6})`);
    bubble.style.opacity = String(bp > 0 ? 1 - prog(t, A("lan-signals") + 4.4, A("lan-signals") + 4.8) : 0);
  } else { path.setAttribute("d", ""); bubble.style.opacity = "0"; }

  // 素材详情面板、收藏、标签、预览
  const detailShow = easeInOut(win(t, A("assets") + 1.0, A("assets") + 7.4, 0.5));
  css(detail, { left: px(WIN.w - 12 - 238 * detailShow), opacity: detailShow > 0.02 ? 1 : 0 });
  const loved = t >= A("assets") + 1.9;
  css(heartBtn, { background: loved ? "#ffe3ea" : COLORS.tint, color: loved ? "#ff4f79" : COLORS.muted, transform: `scale(${1 + 0.25 * win(t, A("assets") + 1.85, A("assets") + 2.3, 0.2)})` });
  heartBtn.querySelector("path").setAttribute("fill", loved ? "#ff4f79" : "none");
  const tag2 = easeOut(prog(t, A("assets") + 2.9, A("assets") + 3.2));
  detailTags.innerHTML = `<span style="padding:4px 10px;border-radius:99px;background:#e6f0fd;color:${COLORS.blueStrong};font-size:11px;font-weight:650">雨夜</span>${tag2 > 0 ? `<span style="padding:4px 10px;border-radius:99px;background:#ffe9dc;color:${COLORS.accent};font-size:11px;font-weight:650;display:inline-block;transform:scale(${tag2})">片头</span>` : ""}<span style="padding:4px 10px;border-radius:99px;background:${COLORS.tint};color:${COLORS.muted};font-size:11px">+ 标签</span>`;
  const pv = easeInOut(win(t, A("assets") + 3.9, A("assets") + 6.8, 0.45));
  css(preview, { opacity: pv, display: pv > 0.01 ? "block" : "none" });
  css(previewImg, { left: px(lerp(458, 260, pv)), top: px(lerp(330, 70, pv)), width: px(lerp(170, 520, pv)), height: px(lerp(104, 390, pv)) });

  // 编辑条（布局段、疯狂模式段）
  const barShow = Math.max(win(t, A("layout") + 1.1, A("layout") + 8.9, 0.35), win(t, A("crazy") + 0.8, A("crazy") + 6.6, 0.35));
  const crazyOn = t >= A("crazy") + 1.8 && t < A("crazy") + 6.6;
  css(editBar, { left: px(WIN.w / 2), transform: `translate(-50%, ${px((1 - barShow) * 12)})`, opacity: barShow, top: px(570 - 12 - 44 - (t >= A("layout") + 4.0 && t < A("crazy") ? 150 : 0) - 6) });
  css(crazyChip, { background: crazyOn ? `linear-gradient(135deg, ${COLORS.pink}, ${COLORS.violet})` : COLORS.tint, color: crazyOn ? "#fff" : "#4a5068" });
  css(saveChip, { transform: `scale(${1 - 0.08 * win(t, A("layout") + 8.7, A("layout") + 9.0, 0.12)})` });

  // 疯狂模式：导入卡片拖出窗口，变成桌面上的小窗口
  const tear = t >= A("crazy") + 2.8 && t < A("crazy") + 6.4;
  const home = easeInOut(prog(t, A("crazy") + 5.6, A("crazy") + 6.3));
  css(importCard, { opacity: tear ? prog(t, A("crazy") + 6.0, A("crazy") + 6.4) : 1 });
  if (tear) {
    const c = cursorAt(t, w);
    const settle = easeOut(prog(t, A("crazy") + 4.6, A("crazy") + 5.2));
    const outside = c.x > sx + WIN.w * w.s - 10;
    const dropX = 1010, dropY = 160;
    const slot = toStage(86 - 5, 60 - 34, w);
    const x = lerp(lerp(c.x - 60, dropX, settle), slot.x, home), y = lerp(lerp(c.y - 30, dropY, settle), slot.y, home);
    const base = settle > 0 ? 1 : outside ? 0.6 : 0.9;
    css(deskCard, { display: "block", transformOrigin: "0 0", transform: `translate(${px(x)}, ${px(y)}) scale(${lerp(lerp(0.9, 1, settle), w.s, home)})`, opacity: base * (1 - prog(t, A("crazy") + 6.0, A("crazy") + 6.4)) });
    const backBtn = deskCard.querySelector("span"), pressed = win(t, A("crazy") + 5.4, A("crazy") + 5.8, 0.15);
    css(backBtn, { background: pressed > 0.5 ? "#ffe9dc" : COLORS.tint, color: pressed > 0.5 ? COLORS.accent : "#4a5068" });
    if (!deskCard.querySelector(".body")) { const body = importCard.cloneNode(true); body.className = "abs body"; css(body, { left: "5px", top: "34px", opacity: "1", outline: "none", background: "transparent", width: "190px", height: "134px" }); deskCard.appendChild(body); }
  } else css(deskCard, { display: "none" });

  // 结尾：圈出"演示方法"按钮
  const ring = win(t, A("outro") + 0.6, A("outro") + 3.6, 0.4);
  const rp = toStage(300 + 620 - 6, 12 + 13 - 6, w);
  css(highlight, { left: "0", top: "0", width: px((92 + 12) * w.s), height: px((34 + 12) * w.s), transform: `translate(${px(rp.x)}, ${px(rp.y)}) scale(${1 + 0.06 * Math.sin(t * 6)})`, opacity: ring });
  css(demoPill, { transform: `scale(${1 + 0.08 * ring * (0.5 + 0.5 * Math.sin(t * 6))})` });

  // 鼠标和点击波纹
  const c = cursorAt(t, w);
  const pressing = DRAGS.some(([a, b]) => t >= a && t <= b) || CLICKS.some((k) => t >= k && t < k + 0.16);
  const cursorShow = Math.min(prog(t, 2.6, 3.2), 1 - prog(t, A("outro") + 3.4, A("outro") + 4.0));
  css(cursor, { transform: `translate(${px(c.x - 5)}, ${px(c.y - 3)}) scale(${pressing ? 0.86 : 1})`, opacity: cursorShow });
  const recent = CLICKS.filter((k) => t >= k && t < k + 0.6).slice(-2);
  ripples.forEach((r, i) => {
    const k = recent[i];
    if (k === undefined) { r.style.opacity = "0"; return; }
    const p = prog(t, k, k + 0.6), at = cursorAt(k, winState(k));
    css(r, { transform: `translate(${px(at.x)}, ${px(at.y)}) scale(${0.4 + p * 1.2})`, opacity: String((1 - p) * cursorShow) });
  });
}

window.renderAt = renderAt;
window.USAGE_DEMO_DURATION = USAGE_DEMO_DURATION;
// 录制脚本等字体和图标加载完再开始
window.demoReady = (async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
  renderAt(0);
  return USAGE_DEMO_DURATION;
})();
// 直接在浏览器里打开时自动播放（?t=秒 可以停在某一刻看）
if (!navigator.userAgent.includes("NestUsageDemoRecorder")) {
  const fixed = new URLSearchParams(location.search).get("t");
  if (fixed !== null) renderAt(Number(fixed));
  else { const start = performance.now(); const loop = () => { renderAt(((performance.now() - start) / 1000) % USAGE_DEMO_DURATION); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
}
