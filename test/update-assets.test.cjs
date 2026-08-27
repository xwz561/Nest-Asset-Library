const test = require('node:test');
const assert = require('node:assert/strict');
const { chooseUpdateAsset, isCompatibleUpdateFile } = require('../electron/update-assets.cjs');

const asset = name => ({ name, browser_download_url: `https://example.test/${name}` });

test('installed Windows builds never fall back to a portable executable', () => {
  const result = chooseUpdateAsset({
    platform: 'win32', arch: 'x64', portable: false,
    assets: [asset('App-2.0.4-Portable.exe')],
  });
  assert.equal(result.asset, null);
  assert.equal(result.installKind, 'Windows 安装版');
});

test('installed Windows builds select Setup regardless of release asset order', () => {
  const result = chooseUpdateAsset({
    platform: 'win32', arch: 'x64', portable: false,
    assets: [asset('App-2.0.4-Portable.exe'), asset('App-2.0.4-Setup.exe')],
  });
  assert.equal(result.asset.name, 'App-2.0.4-Setup.exe');
});

test('portable Windows builds select only Portable', () => {
  const result = chooseUpdateAsset({
    platform: 'win32', arch: 'x64', portable: true,
    assets: [asset('App-2.0.4-Setup.exe'), asset('App-2.0.4-Portable.exe')],
  });
  assert.equal(result.asset.name, 'App-2.0.4-Portable.exe');
});

test('update installer validates package channel', () => {
  assert.equal(isCompatibleUpdateFile({ platform: 'win32', portable: false, name: 'App-Setup.exe' }), true);
  assert.equal(isCompatibleUpdateFile({ platform: 'win32', portable: false, name: 'App-Portable.exe' }), false);
  assert.equal(isCompatibleUpdateFile({ platform: 'win32', portable: true, name: 'App-Portable.exe' }), true);
  assert.equal(isCompatibleUpdateFile({ platform: 'win32', portable: true, name: 'App-Setup.exe' }), false);
});

test('macOS selection respects architecture', () => {
  const result = chooseUpdateAsset({
    platform: 'darwin', arch: 'arm64', portable: false,
    assets: [asset('App-macOS-x64.dmg'), asset('App-macOS-arm64.dmg')],
  });
  assert.equal(result.asset.name, 'App-macOS-arm64.dmg');
});
