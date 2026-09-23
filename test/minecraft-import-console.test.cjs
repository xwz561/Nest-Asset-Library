const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'src', 'main.jsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

test('the import console has a scoped Minecraft-style button system without a new UI dependency', () => {
  assert.match(renderer, /className=\{`import-actions \$\{importing \? "busy" : ""\}/);
  assert.match(renderer, /aria-busy=\{importing\}/);
  assert.match(renderer, /className="import-action primary"/);
  assert.match(renderer, /className="import-action folder"/);
  assert.match(renderer, /className="import-action aiflow"/);
  assert.match(renderer, /onClick=\{desktop \? nativeImport : \(\) => input\.current\.click\(\)\}/);
  assert.match(renderer, /onClick=\{nativeImportFolder\}/);
  assert.match(renderer, /onClick=\{\(\) => setAiFlowImportPanel\(true\)\}/);

  assert.match(styles, /\.import-actions\{[^}]*border:2px solid #081713[^}]*border-radius:0/);
  assert.match(styles, /\.import-actions \.import-action\{[^}]*border-bottom:4px solid #071013[^}]*border-radius:0/);
  assert.match(styles, /\.import-actions \.import-action\.primary\{/);
  assert.match(styles, /\.import-actions \.import-action\.folder\{/);
  assert.match(styles, /\.import-actions \.import-action\.aiflow\{/);
  assert.match(styles, /\.import-actions \.import-action:hover:not\(:disabled\)/);
  assert.match(styles, /\.import-actions \.import-action:active:not\(:disabled\)\{[^}]*translateY\(2px\)/);
  assert.match(styles, /\.import-actions \.import-action:disabled\{/);
  assert.match(styles, /\.import-actions\.busy:after\{[^}]*height:3px/);
  assert.doesNotMatch(packageJson, /minecraft-react-ui/);
});

test('block-inspired import icons keep their semantic mapping and original callbacks', () => {
  assert.match(
    renderer,
    /function PixelImportIcon\(\{ size = 16 \}\)[\s\S]*?pixel-icon--grass[\s\S]*?shapeRendering="crispEdges"/,
  );
  assert.match(
    renderer,
    /function PixelChestIcon\(\{ size = 20 \}\)[\s\S]*?pixel-icon--chest[\s\S]*?viewBox="0 0 20 20"[\s\S]*?shapeRendering="crispEdges"/,
  );
  assert.match(
    renderer,
    /function PixelPortalIcon\(\{ size = 16 \}\)[\s\S]*?pixel-icon--portal[\s\S]*?shapeRendering="crispEdges"/,
  );
  assert.match(
    renderer,
    /className="import-action primary"[\s\S]*?onClick=\{desktop \? nativeImport : \(\) => input\.current\.click\(\)\}[\s\S]*?<PixelImportIcon size=\{16\} \/>/,
  );
  assert.match(
    renderer,
    /className="import-action folder"[\s\S]*?onClick=\{nativeImportFolder\}[\s\S]*?<PixelChestIcon size=\{20\} \/>/,
  );
  assert.match(
    renderer,
    /className="import-action aiflow"[\s\S]*?onClick=\{\(\) => setAiFlowImportPanel\(true\)\}[\s\S]*?<PixelPortalIcon size=\{16\} \/>/,
  );
  assert.match(
    styles,
    /\.import-actions \.pixel-icon\{[^}]*image-rendering:pixelated[^}]*shape-rendering:crispEdges/,
  );
  assert.match(styles, /\.import-actions \.import-action \.pixel-icon--chest\{[^}]*width:20px[^}]*height:20px/);
});

test('sidebar category filters use compact pixel sprites without changing filter behavior', () => {
  assert.match(
    renderer,
    /function PixelNavIcon\(\{ kind, size = 17 \}\)[\s\S]*?pixel-nav-icon--\$\{kind\}[\s\S]*?shapeRendering="crispEdges"/,
  );
  assert.match(
    renderer,
    /const nav = \[[\s\S]*?\["全部素材", "all"\],[\s\S]*?\["未分类", "unclassified"\],[\s\S]*?\["收藏夹", "favorite"\],[\s\S]*?\["最近", "recent"\],[\s\S]*?\["图片", "image"\],[\s\S]*?\["视频", "video"\],[\s\S]*?\["音频", "audio"\],[\s\S]*?\["剧本", "script"\]/,
  );
  assert.match(renderer, /<nav className="asset-filter-nav">[\s\S]*?nav\.map\(\(\[n, icon\]\) => \(/);
  assert.match(renderer, /<PixelNavIcon kind=\{icon\} size=\{17\} \/>/);
  assert.match(
    renderer,
    /setFilter\(n\);[\s\S]*?setCurrentTag\(null\);[\s\S]*?if \(n === "全部素材"\) setQuery\(""\);[\s\S]*?setActiveFolder\(null\);[\s\S]*?setSelected\(null\);[\s\S]*?setSelectedIds\(\[\]\);/,
  );
  assert.match(
    styles,
    /\.asset-filter-nav \.pixel-nav-icon\{[^}]*width:17px[^}]*height:17px[^}]*image-rendering:pixelated[^}]*shape-rendering:crispEdges/,
  );
});
