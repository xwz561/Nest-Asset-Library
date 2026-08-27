const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { folderParts, physicalAssetPath, syncPhysicalFolders, needsPhysicalLayoutSync } = require('../electron/physical-folders.cjs');

test('builds nested physical folder parts from the virtual tree', () => {
  const folders = [{ id:'a', name:'角色', parentId:null }, { id:'b', name:'主角', parentId:'a' }];
  assert.deepEqual(folderParts(folders, 'b'), ['角色', '主角']);
});

test('physical layout migration runs once and is skipped on later launches', () => {
  assert.equal(needsPhysicalLayoutSync({ assets: [] }), true);
  assert.equal(needsPhysicalLayoutSync({ assets: [], physicalLayoutVersion: 1 }), false);
});

test('moves existing root assets into their classified physical folder', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-folders-'));
  try {
    fs.mkdirSync(path.join(root, 'assets'));
    fs.writeFileSync(path.join(root, 'assets', 'hero.png'), 'image');
    const data = { folders:[{ id:'a', name:'角色', parentId:null }], assets:[{ id:'1', file:'hero.png', folderId:'a' }] };
    syncPhysicalFolders(root, data);
    assert.equal(data.assets[0].file.replace(/\\/g, '/'), '角色/hero.png');
    assert.equal(fs.existsSync(physicalAssetPath(root, data.assets[0].file)), true);
  } finally { fs.rmSync(root, { recursive:true, force:true }); }
});
