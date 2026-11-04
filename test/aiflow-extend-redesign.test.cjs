const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// DEC-005：AI Flow「视频延长」两个浮窗重做——新界面造型、跟随页面配色，修掉截图里的显示问题。
const page = fs.readFileSync(path.join(__dirname, '..', 'browser-extension', 'aiflow-page.js'), 'utf8');
const between = (start, end) => page.slice(page.indexOf(start), page.indexOf(end, page.indexOf(start)));

test('两个浮窗和人物替换面板用 div，不用会被"页面配色"刷底色的 section/aside/header', () => {
  const workbench = between('function injectVideoExtendWorkbench()', 'function extractVideoExtendStoryboardNames');
  const library = between('function injectVideoExtendLibraryPanel()', 'function arrangeVideoExtendWindows()');
  const people = between('function openVideoExtendPeopleFindReplace', 'function startVideoExtendPeopleFindReplace');
  for (const section of [workbench, library, people]) {
    assert.match(section, /document\.createElement\('div'\)/);
    assert.doesNotMatch(section, /<(?:header|section|aside|h2|select data-nest-workbench)/);
  }
  assert.doesNotMatch(people, /style\.cssText/);
  assert.doesNotMatch(library, /style\.cssText/);
});

test('配色跟着 AI Flow「页面配色」走，样式全部以窗口 ID 开头并加 !important', () => {
  const style = between('function ensureVideoExtendWorkbenchStyle()', 'function isNativeVideoExtendModeOpen()');
  assert.match(style, /--nx-accent: var\(--nest-theme-accent, #2f7dff\)/);
  assert.match(style, /--nx-primary: var\(--nest-theme-primary, var\(--nx-accent\)\)/);
  assert.match(style, /:is\(\$\{W\}, \$\{L\}\) \.nx-title b \{[^}]*white-space: nowrap !important/);
  assert.match(style, /:is\(\$\{W\}, \$\{L\}, \$\{P\}\) \.nx-btn, \$\{R\} \{/);
  assert.match(style, /resize:both !important/);
  // class 名避开"页面配色"通用规则会匹配的关键词
  const classes = [...style.matchAll(/\.(nx-[a-z-]+)/g)].map((match) => match[1]);
  assert.ok(classes.length > 20);
  for (const name of classes) assert.doesNotMatch(name, /card|tab|panel|item|list|icon|header|select|active|option|content|box|bar|pill|tag|toggle|menu/, name);
});

test('视频预览：弹窗视频晚到会跟上，接不上时退到任务卡片的视频文件', () => {
  assert.match(page, /let lastVideoExtendTaskId = ''/);
  assert.match(page, /if \(taskId\) lastVideoExtendTaskId = taskId;/);
  const sources = between('function videoExtendPreviewSources(dialog)', 'function videoExtendSourceName');
  assert.match(sources, /text\.startsWith\('blob:'\) \? streams : direct/);
  assert.match(sources, /\[\.\.\.direct, \.\.\.fromTask, \.\.\.streams\]/);
  const workbench = between('function injectVideoExtendWorkbench()', 'function extractVideoExtendStoryboardNames');
  assert.match(workbench, /video\.addEventListener\('error', \(\) => \{ if \(video\.isConnected\) showPreview\(sources, poster, index \+ 1\); \}, \{ once: true \}\)/);
  assert.match(workbench, /const sync = \(\) => \{[\s\S]*renderPreview\(\);/);
});

test('AI Flow 原生素材副本：取最里层，补上懒加载图片、视频首帧和画布', () => {
  const picker = between('function mountNativeVideoExtendPicker', 'function removeVideoExtendReferenceToken');
  assert.match(picker, /\|\| depth\(right\) - depth\(left\)/);
  assert.match(picker, /copyNativePickerMedia\(nativePicker, copy\)/);
  assert.match(picker, /attributeFilter: \['src', 'poster', 'data-src'\]/);
  const media = between('function copyNativePickerMedia', 'function mountNativeVideoExtendPicker');
  assert.match(media, /node\.getAttribute\('data-src'\)/);
  // 真 AI Flow：缩略图就是原文件、视频不预加载；图片懒加载，视频滚到眼前才取第一帧，AI Flow 自带的小滚动框放开
  assert.match(media, /twin\.loading = 'lazy'/);
  assert.match(media, /twin\.dataset\.nestLazySrc = src\.includes\('#'\) \? src : `\$\{src\}#t=0\.1`/);
  assert.match(picker, /new IntersectionObserver\(/);
  assert.match(picker, /node\.style\.setProperty\('max-height', 'none', 'important'\)/);
  const workbench = between('function injectVideoExtendWorkbench()', 'function extractVideoExtendStoryboardNames');
  assert.match(workbench, /video\.addEventListener\('loadedmetadata', \(\) => \{\s*if \(workbench\.dataset\.nestMoved === 'true'\) return;\s*delete workbench\.dataset\.nestArranged;/);
  assert.match(media, /node\.toDataURL\('image\/png'\)/);
});

test('工作台：秒数 −/+、参考条内容不变不重画、两个窗口并排摆放', () => {
  const workbench = between('function injectVideoExtendWorkbench()', 'function extractVideoExtendStoryboardNames');
  assert.match(workbench, /data-nest-workbench-seconds-step="-1"/);
  assert.match(workbench, /secondsInput\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
  assert.match(workbench, /if \(nextChipsKey === chipsKey\) return;/);
  assert.match(workbench, /replace\(\/\[×✕✖\]\+\$\/, ''\)/);
  assert.match(workbench, /requestAnimationFrame\(arrangeVideoExtendWindows\)/);
  const arrange = between('function arrangeVideoExtendWindows()', 'function ensureVideoExtendWorkbenchStyle()');
  assert.match(arrange, /library\.dataset\.nestMoved !== 'true'/);
  assert.match(arrange, /workbench\.dataset\.nestArranged = 'true'/);
});
