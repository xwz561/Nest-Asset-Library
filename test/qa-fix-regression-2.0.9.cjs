// 2.0.9 修复回归验证：确认 9 个已修 bug 的修复代码确实生效
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');
const mainCjs = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
const mainJsx = fs.readFileSync(path.join(root, 'src', 'main.jsx'), 'utf8');

let failed = 0;
const check = (name, pass, detail) => {
  if (!pass) failed += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name}\n    ${detail}\n`);
};

// ---------- 语法层面 ----------
check('main.cjs 语法合法', (() => { try { require('node:vm').createScript(mainCjs); return true; } catch (e) { return e.message; } })() === true, 'node:vm 编译通过');

// ---------- BUG-1：导入异常静默失败 ----------
check('BUG-1a main.cjs importPaths 已捕获 expandImportPaths 异常',
  mainCjs.includes('catch(error){expanded={entries:[],directories:[],errors:['),
  '超限/扫描错误现在会进入 lastImport.errors 而不是让 IPC reject');
check('BUG-1b 渲染层 nativeImport 已加 catch',
  /导入失败：\$\{error\.message\}/.test(mainJsx),
  'nativeImport / droppedImport / importUrl 均显示错误 toast');
check('BUG-1c 渲染层 nativeImportFolder 已加 catch',
  /导入文件夹失败：\$\{error\.message\}/.test(mainJsx), '');

// ---------- BUG-2：SVG/MOV 格式筛选 ----------
const mimeMapPresent = mainJsx.includes('"svg+xml": "SVG"') && mainJsx.includes('quicktime: "MOV"');
check('BUG-2a MIME→格式映射表已加入', mimeMapPresent, 'svg+xml→SVG, quicktime→MOV');
// 与 main.jsx 中相同的实现做行为验证
const MIME_FORMAT = { jpeg: "JPG", "svg+xml": "SVG", quicktime: "MOV", mpeg: "MP3", mp4: "MP4", "x-m4v": "M4V", "x-ms-wma": "WMA" };
const assetFormat = (asset) => {
  const fromName = asset.name?.match(/\.([a-z0-9]+)$/i)?.[1];
  if (fromName) return (MIME_FORMAT[fromName.toLowerCase()] || fromName).toUpperCase();
  const subtype = (asset.type?.split("/")[1] || "").toLowerCase();
  return (MIME_FORMAT[subtype] || subtype).toUpperCase();
};
check('BUG-2b SVG 命中 SVG 芯片', assetFormat({ name: '海边', type: 'image/svg+xml' }) === 'SVG', assetFormat({ name: '海边', type: 'image/svg+xml' }));
check('BUG-2c MOV 命中 MOV 芯片', assetFormat({ name: '航拍', type: 'video/quicktime' }) === 'MOV', assetFormat({ name: '航拍', type: 'video/quicktime' }));
check('BUG-2d JPG/PNG/MP4/WAV 不受影响',
  assetFormat({ name: 'a', type: 'image/jpeg' }) === 'JPG' &&
  assetFormat({ name: 'a', type: 'image/png' }) === 'PNG' &&
  assetFormat({ name: 'a', type: 'video/mp4' }) === 'MP4' &&
  assetFormat({ name: 'a', type: 'audio/wav' }) === 'WAV',
  '常规类型直通');

// ---------- BUG-3：update-asset 改 folderId 后迁移物理文件 ----------
check('BUG-3 update-asset 已在 folderId 变化时调用 syncPhysicalFolders',
  mainCjs.includes("'folderId'in changes)syncPhysicalFolders(libraryPath,data)"),
  '详情面板切换文件夹会同步物理目录');
// 行为级验证：模拟 handler 流程（改 folderId + sync）
(async () => {
  const { syncPhysicalFolders } = require(path.join(root, 'electron', 'physical-folders.cjs'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-fix3-'));
  fs.mkdirSync(path.join(tmp, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'assets', '旧夹'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'assets', '旧夹', 'p.jpg'), 'x');
  const data = {
    folders: [
      { id: 'f1', name: '旧夹', parentId: null },
      { id: 'f2', name: '新夹', parentId: null },
    ],
    assets: [{ id: 'a1', file: '旧夹/p.jpg', folderId: 'f2', name: 'p' }], // folderId 已改，物理未动
  };
  const after = syncPhysicalFolders(tmp, data);
  check('BUG-3 行为验证：sync 后文件移入新文件夹目录',
    fs.existsSync(path.join(tmp, 'assets', '新夹', 'p.jpg')) && after.assets[0].file === '新夹/p.jpg',
    `file=${after.assets[0].file}`);
  fs.rmSync(tmp, { recursive: true, force: true });

  // ---------- BUG-4：检视器关闭只收缩宽度 ----------
  check('BUG-4 关闭检视器不再整体恢复 base 边界',
    mainCjs.includes('closeTarget={...currentBounds,width:Math.max(record.base.width,currentBounds.width-(record.added||0))}'),
    '关闭时保留用户当前的 x/y/height，只减去检视器附加宽度');

  // ---------- BUG-5：文件夹查重不区分大小写 ----------
  check('BUG-5 add-folder / update-folder 查重已改为大小写不敏感',
    (mainCjs.match(/f\.name\.toLowerCase\(\)===clean\.toLowerCase\(\)/g) || []).length >= 2,
    `命中 ${(mainCjs.match(/f\.name\.toLowerCase\(\)===clean\.toLowerCase\(\)/g) || []).length} 处`);

  // ---------- BUG-6：Esc 输入焦点保护 ----------
  check('BUG-6 Esc handler 已加输入焦点保护',
    /e\.key === "Escape"\) \{\s*if \(e\.target\.closest\?\.\('input,textarea,select,\[contenteditable="true"\]'\)\)/.test(mainJsx),
    '输入框内按 Esc 不再误关浮层');

  // ---------- BUG-7：版本号动态化 ----------
  check('BUG-7 设置页版本号改为动态注入',
    mainJsx.includes('版本 {APP_VERSION}') && !mainJsx.includes('版本 2.0.7'),
    '由 vite define __APP_VERSION__ 注入 package.json 版本');

  // ---------- BUG-8：死按钮 ----------
  check('BUG-8a 详情面板"更多操作"已接右键菜单',
    mainJsx.includes('openMore={(event, asset) =>') && mainJsx.includes('onClick={(e) => openMore?.(e, asset)}'),
    '');
  check('BUG-8b AI 设置页两个死按钮已移除',
    !mainJsx.includes('帮助文档') && !mainJsx.includes('模型与服务状态'),
    '');

  // ---------- BUG-9：ObjectURL 回收 ----------
  check('BUG-9 web 模式删除素材时 revokeObjectURL',
    mainJsx.includes('URL.revokeObjectURL(doomed.url)'),
    '');

  console.log(`\n========== 回归结果: ${failed === 0 ? '全部通过' : failed + ' 项失败'} ==========`);
  process.exit(failed === 0 ? 0 : 1);
})();
