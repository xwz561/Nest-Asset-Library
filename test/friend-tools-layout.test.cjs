const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const styles = fs.readFileSync(path.join(__dirname, '..', 'src', 'friend-tools.css'), 'utf8');

test('friend tools close button is anchored to the dialog top-right', () => {
  const dialog = styles.match(/\.app\.eagle-ui \.friend-tools-dialog\s*\{([^}]+)\}/)?.[1] || '';
  const button = styles.match(/\.friend-tools-heading>\.fui-Button\s*\{([^}]+)\}/)?.[1] || '';
  const heading = styles.match(/\.friend-tools-heading\s*\{([^}]+)\}/)?.[1] || '';

  assert.match(dialog, /position:\s*relative/);
  assert.match(button, /position:\s*absolute/);
  assert.match(button, /top:\s*20px/);
  assert.match(button, /right:\s*20px/);
  assert.match(button, /width:\s*34px/);
  assert.match(heading, /padding-right:\s*48px/);
});
