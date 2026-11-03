const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.jsx'), 'utf8');
const dialog = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'friend-tools-dialog.jsx'), 'utf8');

test('friend tools use the wrench icon in the toolbar and dialog heading', () => {
  const lucideImport = main.match(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/)?.[1] || '';
  assert.match(lucideImport, /\bWrench\b/);
  assert.doesNotMatch(lucideImport, /\bPipette\b/);
  assert.match(main, /<Wrench\s+size=\{14\}\s*\/>/);
  assert.match(dialog, /friend-tools-heading-icon[^]*?<Wrench\s+size=\{18\}\s*\/>/);
});
