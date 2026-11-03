const assert = require('node:assert/strict');
const { test } = require('node:test');
const manifest = require('../package.json');

test('Mammoth runtime dependency underscore is declared for packaging', () => {
  assert.ok(manifest.dependencies.underscore, 'underscore must be a production dependency so Electron packages it');
});
