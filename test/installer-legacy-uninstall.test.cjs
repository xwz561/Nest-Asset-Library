const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

test('legacy-version removal closes the old desktop process and runs its uninstaller silently', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'build', 'desktop-shortcut-icon.nsh'), 'utf8');
  assert.match(script, /taskkill \/F \/IM "小旺仔素材库\.exe"/);
  assert.match(script, /Sleep 700/);
  assert.match(script, /ExecWait '\$4 \/S \/KEEP_APP_DATA --updated' \$5/);
});
