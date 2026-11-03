const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { NEW_DOCUMENTS, blankDocumentBuffer } = require('../electron/new-document.cjs');
const { DOCUMENT_TYPES } = require('../electron/document-text.cjs');

test('new-document catalog exposes the five requested editable document types', () => {
  assert.deepEqual(Object.keys(NEW_DOCUMENTS), ['text', 'word', 'powerpoint', 'excel', 'xmind']);
  assert.equal(DOCUMENT_TYPES['.pptx'], NEW_DOCUMENTS.powerpoint.type);
  assert.equal(DOCUMENT_TYPES['.xlsx'], NEW_DOCUMENTS.excel.type);
  assert.equal(DOCUMENT_TYPES['.xmind'], NEW_DOCUMENTS.xmind.type);
});

test('blank Office and XMind documents are valid zip containers with their required entry points', async () => {
  const required = {
    word: ['[Content_Types].xml', 'word/document.xml'],
    powerpoint: ['[Content_Types].xml', 'ppt/presentation.xml', 'ppt/slides/slide1.xml'],
    excel: ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml'],
    xmind: ['content.json', 'metadata.json', 'manifest.json'],
  };
  for (const [kind, entries] of Object.entries(required)) {
    const zip = await JSZip.loadAsync(await blankDocumentBuffer(kind));
    for (const entry of entries) assert.ok(zip.file(entry), `${kind} should include ${entry}`);
  }
});

test('PowerPoint uses the packaged Office-compatible standard template', async () => {
  const buffer = await blankDocumentBuffer('powerpoint');
  assert.ok(buffer.length > 20_000);
});

test('blank text document starts as UTF-8 and remains directly editable', async () => {
  const buffer = await blankDocumentBuffer('text');
  assert.equal(buffer.toString('utf8'), '\uFEFF');
});
