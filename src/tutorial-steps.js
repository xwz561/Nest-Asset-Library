// 新手教程和"演示方法"视频共用的说明文字。
// - TUTORIAL_STEPS：第一次打开时的新手教程，每一步指向界面上的一个元素（target）。
// - USAGE_DEMO_CHAPTERS：演示视频的章节，start 是在视频里的秒数；演示窗口右边按章节列出这些说明，点哪章跳到哪。
//   scripts/usage-demo/demo.js 也读这里的时间来排动画，改时间后要重新运行 npm run render:usage-demo。

export const TUTORIAL_STEPS = [
  { id: "import", target: "[data-tour='import']", title: "导入素材", body: "从这里添加图片、视频、音频和文档。导入文件夹可以保留素材的目录结构。" },
  { id: "friend-tools", target: "[data-tour='friend-tools']", title: "打开友商工具集", body: "点击顶部这个按钮打开友商工具集，再点击工具卡片即可启动对应的小工具。" },
  { id: "lan-signals", target: "[data-tour='lan-signals']", title: "局域网信号与表情", body: "同一局域网的电脑打开素材库后会自动加入房间。按住 Alt 或 Ctrl 并拖动鼠标，可在桌面任意软件上发送信号或表情。" },
  { id: "categories", target: "[data-tour='categories']", title: "按类型浏览", body: "用左侧图标栏快速查看全部素材、收藏、最近添加的内容，或只看图片、视频、音频和剧本。" },
  { id: "folders", target: "[data-tour='folders']", title: "用文件夹整理", body: "在这里查看和切换文件夹，也可以新建文件夹；素材卡片可以拖到目标文件夹里。" },
  { id: "search", target: "[data-tour='search']", title: "搜索素材", body: "输入名称或关键词快速查找素材。搜索会和当前分类、文件夹一起生效。" },
  { id: "organize", target: "[data-tour='organize']", title: "整理显示方式", body: "在右上方可以全选、调整排序、筛选类型，并切换标准、紧凑或列表视图。" },
  { id: "assets", target: "[data-tour='assets']", title: "打开和管理素材", body: "单击素材查看详情，双击打开预览；可以收藏、添加标签和备注，也能拖动素材进行整理。" },
  { id: "demo", target: "[data-tour='demo']", title: "看演示视频", body: "顶栏的「演示方法」按钮随时打开操作演示视频，这里的每一步说明也都写在视频旁边。" },
];

const step = (id) => TUTORIAL_STEPS.find((item) => item.id === id);

export const USAGE_DEMO_CHAPTERS = [
  { id: "intro", start: 0, title: "欢迎使用", body: "小旺仔素材库把图片、视频、音频和文档放在一起，用文件夹和标签整理，随时搜索、预览。" },
  { id: "import", start: 5, title: step("import").title, body: step("import").body },
  { id: "friend-tools", start: 13, title: step("friend-tools").title, body: step("friend-tools").body },
  { id: "lan-signals", start: 19, title: step("lan-signals").title, body: step("lan-signals").body },
  { id: "categories", start: 26, title: step("categories").title, body: step("categories").body },
  { id: "folders", start: 32, title: step("folders").title, body: step("folders").body },
  { id: "search", start: 40, title: step("search").title, body: step("search").body },
  { id: "organize", start: 46, title: step("organize").title, body: step("organize").body },
  { id: "assets", start: 53, title: step("assets").title, body: step("assets").body },
  { id: "layout", start: 61, title: "编辑布局", body: "打开图标栏底部的「编辑布局」开关，卡片可以拖到任意位置，贴边会变横竖、让素材区让位，改好点「保存」。" },
  { id: "crazy", start: 71, title: "疯狂模式", body: "编辑布局时打开「疯狂模式」，把卡片拖出窗口就能放到桌面上，点「放回」收回。" },
  { id: "outro", start: 78, title: "随时再看", body: step("demo").body },
];

export const USAGE_DEMO_DURATION = 83;
