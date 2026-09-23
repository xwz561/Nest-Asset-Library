const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');

const DOCUMENT_TYPES = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.fountain': 'text/fountain',
};

function normalizeDocumentText(value, maxLength = 2_000_000) {
  return String(value || '').replace(/\r\n?/g, '\n').replace(/[\t ]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim().slice(0, maxLength);
}

function parseFountainStructure(value) {
  const lines = normalizeDocumentText(value).split('\n');
  const scenes = [];
  let currentScene = null;
  const scenePattern = /^(?:\.|(?:INT|EXT|EST|INT\.\/EXT|I\/E)(?:\.|\s)|(?:内景|外景|场景)[：:：\s])/i;
  const characterPattern = /^(?:@)?[A-Z0-9_\- .]{2,40}(?:\s*\([^)]*\))?$/;
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const line = raw.trim();
    if (!line) continue;
    if (scenePattern.test(line)) {
      currentScene = { title: line.replace(/^\./, '').trim(), line: index + 1, characters: [], dialogueCount: 0 };
      scenes.push(currentScene);
      continue;
    }
    if (!currentScene || !characterPattern.test(line)) continue;
    const next = (lines[index + 1] || '').trim();
    if (!next || scenePattern.test(next)) continue;
    const character = line.replace(/^@/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (!currentScene.characters.includes(character)) currentScene.characters.push(character);
    currentScene.dialogueCount += 1;
  }
  return { scenes, sceneCount: scenes.length };
}

async function extractDocumentText(file) {
  const ext = path.extname(file).toLowerCase();
  if (['.md', '.markdown'].includes(ext)) return (await fs.promises.readFile(file, 'utf8')).replace(/^\uFEFF/, '');
  if (['.txt', '.fountain'].includes(ext)) return normalizeDocumentText(await fs.promises.readFile(file, 'utf8'));
  if (ext === '.docx') return normalizeDocumentText((await mammoth.extractRawText({ path: file })).value);
  if (ext === '.pdf') {
    const parser = new PDFParse({ data: await fs.promises.readFile(file) });
    try { return normalizeDocumentText((await parser.getText()).text); }
    finally { await parser.destroy(); }
  }
  return '';
}

module.exports = { DOCUMENT_TYPES, extractDocumentText, normalizeDocumentText, parseFountainStructure };
