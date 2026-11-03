const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const calendarSource = path.resolve(projectRoot, '..', 'managed-project');
const output = path.join(projectRoot, 'public', 'calendar');
const prefix = 'LaoHuangLiApp.wwwroot.';

fs.mkdirSync(output, { recursive: true });
if (!fs.existsSync(calendarSource)) {
  if (fs.existsSync(path.join(output, 'index.html'))) {
    console.warn(`未找到源码目录，保留已随源码保存的老黄历资源：${calendarSource}`);
    process.exit(0);
  }
  throw new Error(`老黄历源码目录不存在：${calendarSource}`);
}

const assets = fs.readdirSync(calendarSource, { withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.startsWith(prefix) && !entry.name.includes('debug-calendar-jump'));

if (!assets.some(entry => entry.name === `${prefix}index.html`)) {
  throw new Error(`老黄历源码缺少 index.html：${calendarSource}`);
}

for (const entry of assets) {
  const targetName = entry.name.slice(prefix.length);
  let contents = fs.readFileSync(path.join(calendarSource, entry.name));
  if (targetName === 'index.html') {
    const html = contents.toString('utf8');
    const closeButton = `onclick="if(window.chrome) window.chrome.webview.postMessage({type: 'close'})"`;
    if (!html.includes(closeButton)) {
      throw new Error('老黄历关闭按钮与日历窗口宿主接口不匹配，停止打包');
    }
    let packagedHtml = html.replace(closeButton, 'onclick="window.nestCalendarHost?.close()"');
    packagedHtml = packagedHtml.replace(/\s*<script type="module" src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js\/[\s\S]*?<\/script>/, '');
    packagedHtml = packagedHtml.replace(/\s*<script>\(function\(\)\{function c\(\)\{var b=a\.contentDocument[\s\S]*?<\/script>(?=<\/body>)/, '');
    const dragStyle = `\n      html, body, .app { -webkit-app-region: drag; }\n      #book-space, #book-space *, .dock-panel, .dock-panel *, .export-overlay, .export-overlay * { -webkit-app-region: no-drag; }\n    `;
    if (!packagedHtml.includes('</style>')) throw new Error('老黄历页面缺少样式区，无法建立无边框拖动区域');
    packagedHtml = packagedHtml.replace('</style>', `${dragStyle}</style>`);
    contents = Buffer.from(packagedHtml, 'utf8');
  }
  fs.writeFileSync(path.join(output, targetName), contents);
}

console.log(`Prepared ${assets.length} 老黄历资源文件 from ${calendarSource}`);
