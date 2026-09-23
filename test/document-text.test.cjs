const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DOCUMENT_TYPES, extractDocumentText, normalizeDocumentText, parseFountainStructure } = require('../electron/document-text.cjs');

test('识别四类剧本文档格式', () => {
  assert.equal(DOCUMENT_TYPES['.pdf'], 'application/pdf');
  assert.match(DOCUMENT_TYPES['.docx'], /wordprocessingml/);
  assert.equal(DOCUMENT_TYPES['.txt'], 'text/plain');
  assert.equal(DOCUMENT_TYPES['.fountain'], 'text/fountain');
});

test('Fountain 仅提取场景、角色和对白计数，不误展开普通动作行', () => {
  const structure = parseFountainStructure(`Title: 示例\n\n.INT. 咖啡店 - 夜\n\n@ALICE\n你好。\n\n动作描述。\n\nBOB (低声)\n晚上好。\n\n外景：街道 - 连续\n\nALICE\n走吧。`);
  assert.equal(structure.sceneCount, 2);
  assert.deepEqual(structure.scenes[0], { title: 'INT. 咖啡店 - 夜', line: 3, characters: ['ALICE', 'BOB'], dialogueCount: 2 });
  assert.deepEqual(structure.scenes[1].characters, ['ALICE']);
});

test('Markdown 保留换行和行尾空格，其他文本继续规范化', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-doc-'));
  try {
    for (const ext of ['txt', 'md', 'fountain']) {
      const file = path.join(root, `script.${ext}`);
      fs.writeFileSync(file, '第一场\r\n\r\n\r\n\r\n角色：你好  \r\n');
      assert.equal(await extractDocumentText(file), ext === 'md' ? '第一场\r\n\r\n\r\n\r\n角色：你好  \r\n' : '第一场\n\n\n角色：你好');
    }
    assert.equal(normalizeDocumentText('a\r\nb'), 'a\nb');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
