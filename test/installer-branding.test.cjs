const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('current release uses one branded icon and the Chinese installer wizard', () => {
  const build = packageJson.build;
  const nsis = build.nsis;
  const packageLock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assert.equal(packageJson.version, packageLock.version);
  assert.equal(packageJson.version, packageLock.packages[''].version);
  assert.equal(build.productName, '小旺仔素材库');
  assert.equal(build.artifactName, '${productName}-${version}-Setup.${ext}');
  assert.equal(build.electronDist, undefined, 'electron-builder must fetch Electron for each target architecture');
  assert.equal(build.win.icon, 'build/icon.ico');
  assert.equal(nsis.installerIcon, 'build/icon.ico');
  assert.equal(nsis.uninstallerIcon, 'build/icon.ico');
  assert.equal(nsis.shortcutName, '小旺仔素材库');
  assert.equal(nsis.installerSidebar, 'build/installerSidebar.bmp');
  assert.equal(nsis.language, '2052');
  assert.deepEqual(nsis.installerLanguages, ['zh_CN']);

  const exeIcon = fs.readFileSync(path.join(root, 'build/icon.ico'));
  const shortcutIcon = fs.readFileSync(path.join(root, 'build/desktop-shortcut-icon.ico'));
  assert.equal(
    crypto.createHash('sha256').update(shortcutIcon).digest('hex'),
    crypto.createHash('sha256').update(exeIcon).digest('hex'),
  );
  assert.equal(exeIcon.readUInt16LE(0), 0);
  assert.equal(exeIcon.readUInt16LE(2), 1);
  assert.ok(exeIcon.readUInt16LE(4) >= 1);

  const sidebar = fs.readFileSync(path.join(root, 'build/installerSidebar.bmp'));
  assert.equal(sidebar.subarray(0, 2).toString('ascii'), 'BM');
  assert.equal(sidebar.readInt32LE(18), 164);
  assert.equal(sidebar.readInt32LE(22), 314);
  const installerInclude = fs.readFileSync(path.join(root, 'build/desktop-shortcut-icon.nsh'), 'utf8');
  assert.match(installerInclude, /customWelcomePage/);
  assert.match(installerInclude, /把素材整理得清清楚楚/);
  assert.match(installerInclude, /\$\{VERSION\}/);
  assert.match(installerInclude, /configure-lan-firewall\.ps1/);
});
