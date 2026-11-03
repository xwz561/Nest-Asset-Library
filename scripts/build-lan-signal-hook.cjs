const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
if (process.platform !== 'win32') {
  console.error('全桌面信号手势仅在 Windows 上受支持');
  process.exit(1);
}
const result = spawnSync(process.execPath, [path.join(root, 'native', 'lan-signal-hook', 'run.mjs'), 'build'], { cwd: root, stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
