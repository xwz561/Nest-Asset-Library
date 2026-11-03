const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');

test('Eagle asset details stay in a reserved grid column on compact windows', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/eagle-ui.css'), 'utf8');
  const root = postcss.parse(css);
  let gridColumns;
  let detailPosition;

  root.walkAtRules('media', media => {
    if (!/max-width:\s*760px/.test(media.params)) return;
    media.walkRules(rule => {
      if (rule.selector === '.app.eagle-ui.detail-open:not(.ai-panel-open)') {
        gridColumns = rule.nodes.find(node => node.prop === 'grid-template-columns')?.value;
      }
      if (rule.selector.includes('.app.eagle-ui.detail-open:not(.ai-panel-open) > .detail')) {
        detailPosition = rule.nodes.find(node => node.prop === 'position')?.value;
      }
    });
  });

  assert.match(gridColumns || '', /64px\s+minmax\(0,\s*1fr\)\s+minmax\(/);
  assert.equal(detailPosition, 'relative');
});
