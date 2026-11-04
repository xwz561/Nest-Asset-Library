import { Clock, ArrowDownAZ, ArrowUpAZ, Columns3, Folder, Tag, Image as ImageIcon, Video, FileText, Star, Heart, Briefcase, Camera, Music, Box, Brush, Bell } from "lucide-react";
import { describeFile } from "../file-manager-adapter.cjs";

export const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "3.0.4";

// 随安装包附带的网页采集器版本（来自 browser-extension/manifest.json）
export const EXTENSION_VERSION =
  typeof __EXTENSION_VERSION__ !== "undefined" ? __EXTENSION_VERSION__ : "";

export const TEXT_EDITABLE_EXTENSIONS = new Set(["txt", "md", "markdown", "fountain"]);

export const isTxtAsset = (asset) => /\.txt$/i.test(String(asset?.originalName || asset?.file || ""));

export const EXTERNAL_EDITABLE_EXTENSIONS = new Set(["docx", "pptx", "xlsx", "xmind"]);

export const assetExtension = (asset) => String(asset?.file || asset?.originalName || "").split(".").pop()?.toLowerCase() || "";

export const isTextEditableAsset = (asset) => TEXT_EDITABLE_EXTENSIONS.has(assetExtension(asset));

export const isExternalEditableAsset = (asset) => EXTERNAL_EDITABLE_EXTENSIONS.has(assetExtension(asset));

export const CURRENT_RELEASE_NOTES = [
  {
    type: "新增",
    title: "全新界面",
    items: ["左侧图标栏、圆角卡片和柔和投影的新界面，所有主题都用这一套，切换主题只换颜色。", "新增默认配色“柔光橙”，可在 设置 → 主题与配色 切换。", "Windows 窗口右上角的最小化、最大化、关闭按钮重新绘制。"],
  },
  {
    type: "新增",
    title: "侧栏卡片自由摆放",
    items: ["打开图标栏底部的“编辑布局”开关后，资源库、导入、文件夹、标签、磁盘卡片可以拖到窗口任意位置，右下角能拉大小。", "改好点“保存”；“一键重置”把卡片全部放回侧栏，也可以在 设置 → 通用 恢复默认布局。"],
  },
  {
    type: "新增",
    title: "演示方法与素材标记",
    items: ["顶栏「演示方法」打开操作演示视频，旁边列出新手教程的每一步，点哪一步就跳到视频对应位置。", "素材可以标颜色（右键菜单或详情面板），卡片边缘显示这个颜色；卡片名字下面显示备注。", "文件夹详情点素材区空白处即可收起。"],
  },
  {
    type: "新增",
    title: "后台更新与局域网好友",
    items: ["后台自动检查并下载新版，各电脑可在更新设置关闭；当前用户 Windows 安装版在托盘退出或下次启动时安装。", "点击在线电脑可私聊、传文件和修改头像，素材右键可直接发送给好友。", "收到文件自动放入接收文件中的发送者文件夹并加入素材列表；未打开素材库时先缓存，选库后手动导入。"],
  },
  {
    type: "新增",
    title: "友商工具集",
    items: ["工具集现在包含深度视频转换器和 macOS 指针管家；红果桌面版和 Mineradio 已移除。", "深度视频转换器启动时自动识别随包 ONNX 模型，也可手动更换。"],
  },
  {
    type: "优化",
    title: "AI Flow 视频延长",
    items: ["网页采集器升级到 1.16.1：更新素材库后，在「扩展」面板点一次“安装”，再在浏览器扩展页点“重新加载”。", "网页采集器里的延长工作台和延长素材库重新设计，颜色跟随 AI Flow 页面配色。", "修复视频预览黑屏、AI Flow 原生素材缩略图发黑、标题和按钮被挤成竖排的问题；秒数可以直接点 −/+ 调整；延长参考素材显示成缩略图格子（图片缩略图、视频第一帧、@编号和文件名）。"],
  },
  {
    type: "优化",
    title: "AI Flow 文件夹同步",
    items: ["连接文件夹中的导入、移动和上传会进入同步队列。", "自动刷新开启后会更新连接素材的显示状态。"],
  },
  {
    type: "优化",
    title: "聊天与文件传输",
    items: ["支持发送任意文件，单个附件上限提升至 10 GB。", "新加入成员可读取历史消息，接收文件保留原始下载名称。"],
  },
  {
    type: "优化",
    title: "素材与参考画布",
    items: ["Markdown 可作为素材导入并按标题、列表、表格和代码块阅读。", "无限参考板底部素材栏可调整高度，并可从中拖入素材。"],
  },
  {
    type: "修复",
    title: "界面与资源库稳定性",
    items: ["移除不再使用的“合集”，简化素材库侧栏与插件权限。", "旧资源库会自动清理历史合集数据，不影响素材和真实文件夹。"],
  },
];

export const NAME_COLLATOR = new Intl.Collator("zh-CN");

export const seed = [
  {
    id: "seed-1",
    name: "Sea glass study",
    type: "image/svg+xml",
    size: 18430,
    width: 900,
    height: 1200,
    tags: ["灵感", "摄影"],
    favorite: true,
    createdAt: Date.now() - 5000,
    url: "./samples/sea.svg",
  },
  {
    id: "seed-2",
    name: "Soft architecture",
    type: "image/svg+xml",
    size: 21800,
    width: 1200,
    height: 820,
    tags: ["建筑", "留白"],
    createdAt: Date.now() - 4000,
    url: "./samples/arch.svg",
  },
  {
    id: "seed-3",
    name: "Orange chair",
    type: "image/svg+xml",
    size: 9200,
    width: 900,
    height: 1120,
    tags: ["家具", "配色"],
    createdAt: Date.now() - 3000,
    url: "./samples/chair.svg",
  },
  {
    id: "seed-4",
    name: "Editorial objects",
    type: "image/svg+xml",
    size: 11000,
    width: 1200,
    height: 800,
    tags: ["静物", "编辑"],
    createdAt: Date.now() - 2000,
    url: "./samples/objects.svg",
  },
  {
    id: "seed-5",
    name: "Quiet landscape",
    type: "image/svg+xml",
    size: 24400,
    width: 1200,
    height: 900,
    tags: ["自然", "摄影"],
    createdAt: Date.now() - 1000,
    url: "./samples/landscape.svg",
  },
];

export const INTERNAL_DRAG = "application/x-nest-asset-ids";

export const FOLDER_DRAG = "application/x-nest-folder-id";

export const ROOT_FOLDER_DROP = "__folder_root__";

export const SIDEBAR_WIDTH_KEY = "nest-sidebar-width-eagle";

export const VIEW_MODE_KEY = "nest-view-mode";

export const VIEW_MODES = ["standard", "compact", "list"];

export const SORT_OPTIONS = [
  ["recent", "最近添加", Clock],
  ["oldest", "最早添加", Clock],
  ["nameAsc", "名称 A–Z", ArrowDownAZ],
  ["nameDesc", "名称 Z–A", ArrowUpAZ],
  ["sizeDesc", "大小：大到小", Columns3],
  ["sizeAsc", "大小：小到大", Columns3],
];

export const FILTER_TYPES = [
  ["image", "图片"],
  ["video", "视频"],
  ["audio", "音频"],
  ["text", "剧本"],
  ["application", "文档"],
];

export const FILTER_FORMATS = [
  "JPG",
  "PNG",
  "WEBP",
  "GIF",
  "SVG",
  "MP4",
  "MOV",
  "MP3",
  "WAV",
  "FLAC",
  "PDF",
  "DOCX",
  "TXT",
  "MD",
  "FOUNTAIN",
];

export const MIME_FORMAT = {
  jpeg: "JPG",
  "svg+xml": "SVG",
  quicktime: "MOV",
  mpeg: "MP3",
  mp4: "MP4",
  "x-m4v": "M4V",
  "x-ms-wma": "WMA",
};

export const assetFormat = (asset) => {
  if (asset.documentFormat) return asset.documentFormat;
  const fromName = describeFile(asset).format;
  if (fromName) return (MIME_FORMAT[fromName.toLowerCase()] || fromName).toUpperCase();
  const subtype = (asset.type?.split("/")[1] || "").toLowerCase();
  return (MIME_FORMAT[subtype] || subtype).toUpperCase();
};

export const clampSidebarWidth = (value) =>
  Math.min(440, Math.max(190, Number(value) || 326));

export const TETRIS_ACCESS_CODE = "963";

export const fmt = (n) =>
  n > 1e6
    ? `${(n / 1e6).toFixed(1)} MB`
    : n < 1000
      ? "< 1 KB"
      : `${Math.round(n / 1000)} KB`;

export const fmtCapacity = (n) => {
  const value = Number(n) || 0,
    tb = value / 1024 ** 4;
  return tb >= 1
    ? `${tb.toFixed(tb >= 10 ? 1 : 2)} TB`
    : `${(value / 1024 ** 3).toFixed(1)} GB`;
};

export const FOLDER_ICONS = [
  ["folder", Folder],
  ["tag", Tag],
  ["image", ImageIcon],
  ["video", Video],
  ["file", FileText],
  ["star", Star],
  ["heart", Heart],
  ["briefcase", Briefcase],
  ["camera", Camera],
  ["music", Music],
  ["box", Box],
  ["brush", Brush],
  ["bell", Bell],
];

export const FOLDER_COLORS = [
  "#f35f64",
  "#ff9f2f",
  "#f6c744",
  "#45c28b",
  "#44b9d8",
  "#438df5",
  "#8267ec",
  "#dc7fbd",
  "#8f98a3",
];

export const folderIcon = (key) =>
  FOLDER_ICONS.find(([name]) => name === key)?.[1] || Folder;

export const roleName = (role) => ({ owner: "所有者", admin: "管理员", editor: "编辑者", viewer: "查看者" })[role] || "未加入";

export const previewBatchName = (template, asset, index, folders) => {
  const folder = folders.find(item => item.id === asset.folderId);
  const values = { name: asset.name || "未命名素材", index: String(index + 1).padStart(Math.max(2, String(index + 1).length), "0"), folder: folder?.name || "未分类", tag: asset.tags?.[0] || "无标签" };
  return (String(template || "").trim() || "{name}_{index}").replace(/\{(name|index|folder|tag)\}/g, (_, key) => values[key]).replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").replace(/[. ]+$/g, "").trim().slice(0, 180) || "未命名素材";
};
