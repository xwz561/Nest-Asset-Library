const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

const NEW_DOCUMENTS = {
  text: { label: '文本文档', baseName: '新建文本文档', extension: '.txt', type: 'text/plain', format: 'TXT' },
  word: { label: 'Word 文档', baseName: '新建 Word 文档', extension: '.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', format: 'DOCX' },
  powerpoint: { label: 'PowerPoint 文档', baseName: '新建 PowerPoint 文档', extension: '.pptx', type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', format: 'PPTX' },
  excel: { label: 'Excel 文档', baseName: '新建 Excel 文档', extension: '.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', format: 'XLSX' },
  xmind: { label: 'XMind 文档', baseName: '新建 XMind 文档', extension: '.xmind', type: 'application/x-xmind', format: 'XMIND' },
};

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const add = (zip, name, value) => zip.file(name, `${XML_HEADER}${value}`);

async function wordTemplate() {
  const zip = new JSZip();
  add(zip, '[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  add(zip, '_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  add(zip, 'word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>');
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function excelTemplate() {
  const zip = new JSZip();
  add(zip, '[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
  add(zip, '_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  add(zip, 'xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>');
  add(zip, 'xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  add(zip, 'xl/worksheets/sheet1.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>');
  add(zip, 'xl/styles.xml', '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>');
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function powerpointTemplate() {
  const zip = new JSZip();
  add(zip, '[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>');
  add(zip, '_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>');
  add(zip, 'ppt/presentation.xml', '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>');
  add(zip, 'ppt/_rels/presentation.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>');
  add(zip, 'ppt/slides/slide1.xml', '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>');
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function xmindTemplate() {
  const zip = new JSZip();
  const sheetId = 'sheet-1';
  const rootId = 'root-topic';
  zip.file('content.json', JSON.stringify([{ id: sheetId, class: 'sheet', title: '思维导图', rootTopic: { id: rootId, class: 'topic', title: '中心主题', structureClass: 'org.xmind.ui.logic.right' } }], null, 2));
  zip.file('metadata.json', JSON.stringify({ creator: { name: '小旺仔素材库' }, activeSheetId: sheetId }, null, 2));
  zip.file('manifest.json', JSON.stringify({ 'file-entries': { 'content.json': {}, 'metadata.json': {} } }, null, 2));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function blankDocumentBuffer(kind) {
  if (kind === 'text') return Buffer.from('\uFEFF', 'utf8');
  if (kind === 'word') return wordTemplate();
  if (kind === 'excel') return excelTemplate();
  if (kind === 'powerpoint') return fs.promises.readFile(path.join(__dirname, '..', 'build', 'document-templates', 'blank.pptx'));
  if (kind === 'xmind') return xmindTemplate();
  throw new Error('不支持的文档类型');
}

module.exports = { NEW_DOCUMENTS, blankDocumentBuffer };
