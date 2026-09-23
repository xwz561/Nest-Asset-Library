const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('macOS packaging declares installable DMG and portable ZIP outputs for both supported architectures', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const targets = pkg.build.mac.target;
  const targetNames = targets.map(target => target.target).sort();
  assert.deepEqual(targetNames, ['dmg', 'zip']);
  for (const target of targets) assert.deepEqual([...target.arch].sort(), ['arm64', 'x64']);
  assert.equal(pkg.build.mac.artifactName, 'NestAssetLibrary-${version}-macOS-${arch}.${ext}');
  assert.equal(pkg.build.mac.icon, 'build/icon.png');
  assert.equal(pkg.devDependencies.electron, '^44.3.0');
});

test('macOS packaging script waits for both architecture DMGs and ZIP archives', () => {
  const script = fs.readFileSync(path.join(root, 'scripts', 'package-macos-app.cjs'), 'utf8');
  assert.match(script, /'--mac', 'dmg', 'zip', '--x64', '--arm64'/);
  assert.match(script, /\['dmg', 'zip'\]/);
  assert.match(script, /-macOS-\(x64\|arm64\)\\\.\(dmg\|zip\)/);
});
