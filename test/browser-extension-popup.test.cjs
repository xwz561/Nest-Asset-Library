const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const extensionRoot = path.join(__dirname, '..', 'browser-extension');

test('sync console popup is packaged with a message-only control surface', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'));
  const html = fs.readFileSync(path.join(extensionRoot, 'popup.html'), 'utf8');
  const script = fs.readFileSync(path.join(extensionRoot, 'popup.js'), 'utf8');
  const css = fs.readFileSync(path.join(extensionRoot, 'popup.css'), 'utf8');

  assert.equal(manifest.version, '1.14.28');
  assert.deepEqual(manifest.action, {
    default_title: '小旺仔同步控制台',
    default_popup: 'popup.html',
  });
  assert.deepEqual(manifest.permissions, ['contextMenus', 'notifications', 'tabs', 'scripting']);
  assert.match(html, /connection-label/);
  assert.match(html, /project-name/);
  assert.match(html, /folder-name/);
  assert.match(html, /queue-upload-count/);
  assert.match(html, /queue-active-count/);
  assert.match(html, /queue-delete-count/);
  assert.match(html, /queue-failed-count/);
  assert.match(html, /queue-items/);
  assert.match(html, /重新唤醒队列/);
  assert.match(html, /error-message/);
  assert.match(html, /copy-diagnostics/);
  assert.match(script, /aiflow-control:get-status/);
  assert.match(script, /aiflow-control:reconnect/);
  assert.match(script, /aiflow-control:retry/);
  assert.match(script, /aiflow-control:refresh/);
  assert.match(script, /aiflow-control:cancel-upload/);
  assert.match(script, /cancelQueuedUpload/);
  assert.match(script, /transferStateLabel/);
  assert.match(script, /queued === 0/);
  assert.match(script, /runtime\.sendMessage/);
  assert.doesNotMatch(script, /\bfetch\s*\(/);
  assert.doesNotMatch(script, /chrome\.(?:tabs|scripting)\b/);
  assert.doesNotMatch(script, /127\.0\.0\.1|https?:\/\//);
  assert.match(css, /@keyframes pulse/);
  assert.match(css, /queue-cancel/);
});



