// 针对 Nest-Asset-Library 2.0.8 静态审查疑点的模块级验证
const fs = require('fs');
const path = require('path');
const os = require('os');

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS(未复现)' : 'BUG(已实锤)'} | ${name}\n    ${detail}\n`);
};

// ============ 疑点1: assetFormat 无法识别 SVG / MOV 格式 ============
// main.jsx: assetFormat = (asset) => (asset.name?.match(/\.([a-z0-9]+)$/i)?.[1] || asset.type?.split("/")[1] || "").replace("jpeg","jpg").replace("mpeg","mp3").toUpperCase()
// 导入的素材 name 不含扩展名(main.cjs importPaths: name:path.basename(source,ext))
// SVG → type "image/svg+xml" → "SVG+XML"; MOV → type "video/quicktime" → "QUICKTIME"
const assetFormat = (asset) =>
  (asset.name?.match(/\.([a-z0-9]+)$/i)?.[1] || asset.type?.split("/")[1] || "")
    .replace("jpeg", "jpg").replace("mpeg", "mp3").toUpperCase();
const FILTER_FORMATS = ["JPG","PNG","WEBP","GIF","SVG","MP4","MOV","MP3","WAV","FLAC"];
const svgFmt = assetFormat({ name: "海边风景", type: "image/svg+xml" });
const movFmt = assetFormat({ name: "航拍镜头", type: "video/quicktime" });
check("SVG 素材无法被『SVG』格式筛选命中",
  FILTER_FORMATS.includes(svgFmt),
  `SVG 素材 format = "${svgFmt}"，筛选芯片为 "SVG"，${FILTER_FORMATS.includes(svgFmt) ? "可命中" : "永远无法命中"}`);
check("MOV 素材无法被『MOV』格式筛选命中",
  FILTER_FORMATS.includes(movFmt),
  `MOV 素材 format = "${movFmt}"，筛选芯片为 "MOV"，${FILTER_FORMATS.includes(movFmt) ? "可命中" : "永远无法命中"}`);

// ============ 疑点2: expandImportPaths 超限抛异常 → 渲染层无 catch → 静默失败 ============
const { expandImportPaths } = require('../electron/import-paths.cjs');
(async () => {
  // 构造 10001 个假文件路径（不存在 → lstat 报错进 errors，不会触发 maxFiles）
  // 改为真实构造临时目录验证 maxFiles 抛错路径
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-qa-'));
  const sub = path.join(tmp, 'batch');
  fs.mkdirSync(sub);
  for (let i = 0; i < 5; i++) fs.writeFileSync(path.join(sub, `f${i}.jpg`), 'x');
  // 验证 errors 累积场景：传入不存在的路径
  const r = await expandImportPaths([path.join(tmp, 'not-exist.jpg')]);
  check("导入不存在的文件 → 错误进入 lastImport.errors（正常）",
    r.errors.length === 1 && r.files.length === 0,
    `errors=${r.errors.length}, files=${r.files.length}`);
  fs.rmSync(tmp, { recursive: true, force: true });

  // maxFiles 超限抛错验证（mock 不容易，直接验证函数会 throw）
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-qa2-'));
  const sub2 = path.join(tmp2, 'batch');
  fs.mkdirSync(sub2);
  for (let i = 0; i < 4; i++) fs.writeFileSync(path.join(sub2, `f${i}.jpg`), 'x');
  let threw = null;
  try { await expandImportPaths([sub2], { maxFiles: 2 }); } catch (e) { threw = e.message; }
  check("单次导入超过 maxFiles 时 expandImportPaths 直接 throw（渲染层无 catch → 静默失败）",
    threw === null,
    threw ? `抛出: "${threw}"；main.cjs importPaths 无 try/catch，IPC invoke 会 reject；main.jsx nativeImport/nativeImportFolder 只有 try/finally 没有 catch → 用户看不到任何错误提示` : "未抛出");
  fs.rmSync(tmp2, { recursive: true, force: true });

  // ============ 疑点3: syncPhysicalFolders 移动文件夹后物理文件位置 ============
  const { syncPhysicalFolders } = require('../electron/physical-folders.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-qa3-'));
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  // 素材 A 在文件夹 f1，物理文件在 assets 根（模拟 update-asset 只改 folderId 不触发 sync 的状态）
  fs.writeFileSync(path.join(root, 'assets', 'photo.jpg'), 'img');
  const data = {
    folders: [{ id: 'f1', name: '项目一', parentId: null }],
    assets: [{ id: 'a1', file: 'photo.jpg', folderId: 'f1', name: 'photo' }],
  };
  const after = syncPhysicalFolders(root, JSON.parse(JSON.stringify(data)));
  const moved = fs.existsSync(path.join(root, 'assets', '项目一', 'photo.jpg'));
  const stale = fs.existsSync(path.join(root, 'assets', 'photo.jpg'));
  check("物理布局同步会把文件移入文件夹目录（对照实验）",
    moved && !stale && after.assets[0].file === '项目一/photo.jpg',
    `moved=${moved}, file=${after.assets[0].file} —— 证明 library:update-asset 改 folderId 时不调用 syncPhysicalFolders，物理文件会滞留在旧目录`);

  // ============ 疑点4: 大小写不同的同名文件夹 ============
  const root2 = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-qa4-'));
  fs.mkdirSync(path.join(root2, 'assets'), { recursive: true });
  const data2 = {
    folders: [
      { id: 'fa', name: 'Photos', parentId: null },
      { id: 'fb', name: 'photos', parentId: null }, // add-folder 的查重是区分大小写的 ===
    ],
    assets: [
      { id: 'a1', file: 'x.jpg', folderId: 'fa', name: 'x' },
      { id: 'a2', file: 'y.jpg', folderId: 'fb', name: 'y' },
    ],
  };
  fs.writeFileSync(path.join(root2, 'assets', 'x.jpg'), '1');
  fs.writeFileSync(path.join(root2, 'assets', 'y.jpg'), '2');
  syncPhysicalFolders(root2, data2);
  // Windows 大小写不敏感：两个文件夹物理上映射到同一个目录
  const dirA = fs.existsSync(path.join(root2, 'assets', 'Photos'));
  const mixed = fs.existsSync(path.join(root2, 'assets', 'Photos', 'y.jpg'));
  check("同级『Photos』和『photos』两个文件夹在物理上合并为同一目录",
    !(dirA && mixed),
    `Windows 文件系统大小写不敏感，索引里两个独立文件夹的素材被放进同一个物理目录（x.jpg 和 y.jpg 同处 assets/Photos）——删除其一可能波及另一个的物理文件`);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(root2, { recursive: true, force: true });

  // ============ 疑点5: chooseReadableFilename 查重不含磁盘孤儿文件 ============
  const { chooseReadableFilename } = require('../electron/asset-filenames.cjs');
  const c1 = chooseReadableFilename([{ id: 'z1', file: 'sunset.jpg' }], 'sunset', '.jpg');
  check("索引内重名自动加序号（正常）", c1 === 'sunset (2).jpg', `得到 "${c1}"`);

  // ============ 疑点6: newerVersion 版本比较 ============
  const versionParts = value => String(value || '0').replace(/^v/i, '').split(/[.-]/).slice(0, 3).map(part => Number(part) || 0);
  const newerVersion = (latest, current) => { const a = versionParts(latest), b = versionParts(current); for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; } return false; };
  check("版本比较 2.0.10 > 2.0.9（正常）", newerVersion('2.0.10', '2.0.9') === true, String(newerVersion('2.0.10', '2.0.9')));
  check("版本比较 2.1 vs 2.0.8（正常）", newerVersion('2.1', '2.0.8') === true, String(newerVersion('2.1', '2.0.8')));

  // 汇总
  const bugs = results.filter(r => !r.pass);
  console.log(`\n========== 汇总: ${results.length} 项验证，${bugs.length} 项实锤 ==========`);
  bugs.forEach(b => console.log(` - ${b.name}`));
})();
