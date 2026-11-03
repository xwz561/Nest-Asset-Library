const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const main = require('./source-tree.cjs').readSource(path.join(root, 'src', 'main.jsx'), 'utf8');
const electron = require('./source-tree.cjs').readSource(path.join(root, 'electron', 'main.cjs'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');

test('blank library space opens a five-item new-document menu', () => {
  assert.match(main, /kind: "blank"/);
  for (const label of ['文本文档', 'Word 文档', 'PowerPoint 文档', 'Excel 文档', 'XMind 文档']) assert.match(main, new RegExp(label));
});

test('text documents edit and save inside the preview while Office and XMind open in their desktop editors', () => {
  assert.match(main, /function TextDocumentEditor/);
  assert.match(main, /saveTextDocument\(id, value\)/);
  assert.match(main, /if \(isExternalEditableAsset\(a\)\)/);
  assert.match(preload, /createDocument: \(kind, folderId\)/);
  assert.match(preload, /saveTextDocument: \(id, value\)/);
  assert.match(electron, /ipcMain\.handle\('library:create-document'/);
  assert.match(electron, /ipcMain\.handle\('library:save-text-document'/);
});
