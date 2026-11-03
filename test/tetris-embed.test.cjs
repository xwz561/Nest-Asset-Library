const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'src', 'main.jsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
const gameRoot = path.join(root, 'public', 'tetris');

test('the material library embeds a local, MIT-licensed Tetris game', () => {
  assert.match(renderer, /activeModule === "tetris"/);
  assert.match(renderer, /<TetrisModule/);
  assert.match(renderer, /const TETRIS_ACCESS_CODE = "963"/);
  assert.match(renderer, /setTetrisPasswordOpen\(true\)/);
  assert.match(renderer, /function TetrisAccessDialog/);
  assert.match(renderer, /inputMode="numeric"/);
  assert.match(renderer, /src="\.\/tetris\/index\.html"/);
  assert.match(renderer, /Infinity as InfinityIcon/);
  assert.match(renderer, /title="无穷大"/);
  assert.match(renderer, /<InfinityIcon size=\{15\} \/>/);
  const accessDialog = renderer.match(/function TetrisAccessDialog[\s\S]*?\n}\n\nfunction DocumentMedia/)?.[0] || '';
  assert.match(accessDialog, /<InfinityIcon size=\{24\} \/>/);
  assert.match(accessDialog, /密码请找小旺仔要。/);
  assert.doesNotMatch(accessDialog, /俄罗斯方块|游戏|Puzzle/);
  assert.match(styles, /\.app\.tetris-mode/);
  assert.match(styles, /\.tetris-module/);

  for (const file of ['index.html', 'stats.js', 'texture.jpg', 'LICENSE', 'README.md']) {
    assert.equal(fs.existsSync(path.join(gameRoot, file)), true, `${file} should ship with the application`);
  }
  assert.match(fs.readFileSync(path.join(gameRoot, 'LICENSE'), 'utf8'), /Permission is hereby granted, free of charge/);
  assert.match(fs.readFileSync(path.join(gameRoot, 'index.html'), 'utf8'), /按空格键开始游戏/);
});
