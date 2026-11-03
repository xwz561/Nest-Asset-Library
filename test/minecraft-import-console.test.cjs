const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const renderer = require('./source-tree.cjs').readSource(path.join(root, 'src', 'main.jsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
const eagleStyles = fs.readFileSync(path.join(root, 'src', 'eagle-ui.css'), 'utf8');
const readyStyles = fs.readFileSync(path.join(root, 'src', 'ready-ui.css'), 'utf8');
const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

test('the Fluent import console preserves busy state and original import callbacks', () => {
  assert.match(renderer, /className=\{`import-actions \$\{importing \? "busy" : ""\}/);
  assert.match(renderer, /aria-busy=\{importing\}/);
  assert.match(renderer, /className="import-action primary"/);
  assert.match(renderer, /className="import-action folder"/);
  assert.match(renderer, /className="import-action aiflow"/);
  assert.match(renderer, /onClick=\{desktop \? nativeImport : \(\) => input\.current\.click\(\)\}/);
  assert.match(renderer, /onClick=\{nativeImportFolder\}/);
  assert.match(renderer, /onClick=\{\(\) => setAiFlowImportPanel\(true\)\}/);

  assert.match(readyStyles, /\.app\.ready-ui \.import-actions\{[^}]*border:1px solid[^}]*border-radius:8px/);
  assert.match(readyStyles, /\.import-action\{[^}]*box-shadow:none/);
  assert.match(renderer, /<Button\s+className="import-action primary"[^>]*disabled=\{importing \|\| !canEdit\}/);
  assert.match(packageJson, /"@fluentui\/react-components": "9\.74\.9"/);
});

test('Lucide import icons retain file, folder and AI Flow actions', () => {
  assert.match(renderer, /className="import-action primary"[\s\S]*?onClick=\{desktop \? nativeImport : \(\) => input\.current\.click\(\)\}[\s\S]*?<Import size=\{16\} \/>/);
  assert.match(renderer, /className="import-action folder"[\s\S]*?onClick=\{nativeImportFolder\}[\s\S]*?<Folder size=\{17\} \/>/);
  assert.match(renderer, /className="import-action aiflow"[\s\S]*?onClick=\{\(\) => setAiFlowImportPanel\(true\)\}[\s\S]*?<Sparkles size=\{16\} \/>/);
});

test('sidebar category filters use the graphite navigation icons without changing filter behavior', () => {
  assert.match(
    renderer,
    /const nav = \[[\s\S]*?\["全部素材", "all", LayoutGrid\],[\s\S]*?\["未分类", "unclassified", Box\],[\s\S]*?\["收藏夹", "favorite", Heart\],[\s\S]*?\["最近", "recent", Clock\],[\s\S]*?\["图片", "image", ImageIcon\],[\s\S]*?\["视频", "video", Video\],[\s\S]*?\["音频", "audio", Music\],[\s\S]*?\["剧本", "script", FileText\]/,
  );
  assert.match(renderer, /<nav className="asset-filter-nav">[\s\S]*?nav\.map\(\(\[n, icon, Icon\]\) => \(/);
  assert.match(renderer, /<Icon size=\{16\} strokeWidth=\{1\.7\} \/>/);
  assert.match(
    renderer,
    /setFilter\(n\);[\s\S]*?setCurrentTag\(null\);[\s\S]*?if \(n === "全部素材"\) setQuery\(""\);[\s\S]*?setActiveFolder\(null\);[\s\S]*?setSelected\(null\);[\s\S]*?setSelectedIds\(\[\]\);/,
  );
  assert.match(eagleStyles, /\.app\.eagle-ui nav button > svg \{ color: #d3d4d6; \}/);
});
