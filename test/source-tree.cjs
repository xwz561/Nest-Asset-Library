// Source contracts follow extracted modules instead of assuming a monolithic entry.
const fs = require('node:fs');
const path = require('node:path');
function readSource(file, encoding = 'utf8', seen = new Set()) {
  file = path.resolve(file);
  if (seen.has(file)) return '';
  seen.add(file);
  const source = fs.readFileSync(file, encoding);
  const children = [];
  for (const match of source.matchAll(/(?:from\s*|import\s*(?:\(\s*)?|require\(\s*)["'](\.[^"']+)["']/g)) {
    const child = path.resolve(path.dirname(file), match[1]);
    if (!/\.(?:jsx?|cjs)$/.test(child) || !fs.existsSync(child)) continue;
    const relative = path.relative(path.resolve(__dirname, '..'), child).split(path.sep).join('/');
    if (/^src\/(?:components|hooks|lib)\//.test(relative) || /^electron\/handlers\//.test(relative)) children.push(readSource(child, encoding, seen));
  }
  return [source, ...children].join('\n');
}
module.exports = { readSource };
