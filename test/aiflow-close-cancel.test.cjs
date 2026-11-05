const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('closing the desktop app cancels only unfinished AI Flow transfers and makes reference polling quiet', () => {
  const main = read('electron/main.cjs');
  const worker = read('browser-extension/service-worker.js');
  const page = read('browser-extension/aiflow-page.js');

  assert.match(main, /function cancelAIFlowTransfersForShutdown\(\)/);
  assert.match(main, /app\.on\('before-quit', event => \{ if \(!event\.defaultPrevented\) cancelAIFlowTransfersForShutdown\(\); \}\)/);
  assert.match(main, /pendingAIFlowUpload = null/);
  assert.doesNotMatch(main.slice(main.indexOf('function cancelAIFlowTransfersForShutdown'), main.indexOf('// Every library write')), /aiFlowReferenceAttachments\s*=/);

  assert.match(worker, /function fetchNestBridge\(path, options\)/);
  assert.match(worker, /throw nestBridgeUnavailableError\(error\)/);
  assert.match(worker, /readBridgeConnectionState\(\)/);
  assert.match(worker, /cancelled: true, offline: connection\.state === 'offline'/);
  assert.match(worker, /fetchNestBridge\('\/aiflow-reference-upload-plan'/);
  assert.match(worker, /fetchNestBridge\('\/aiflow-reference-upload-complete'/);

  assert.match(page, /let bridgeFailureCount = 0/);
  assert.match(page, /Date\.now\(\) < bridgeRetryAfter/);
  assert.match(page, /retryDelayForFailure\(bridgeFailureCount\)/);
  assert.match(page, /bridgeFailureCount = 0/);
});
