const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { folderParts, physicalAssetPath, syncPhysicalFolders, needsPhysicalLayoutSync, archiveLegacyRootAliases } = require('../electron/physical-folders.cjs');

test('builds nested physical folder parts from the virtual tree', () => {
  const folders = [{ id:'a', name:'角色', parentId:null }, { id:'b', name:'主角', parentId:'a' }];
  assert.deepEqual(folderParts(folders, 'b'), ['角色', '主角']);
});

test('physical layout migration runs once and is skipped on later launches', () => {
  assert.equal(needsPhysicalLayoutSync({ assets: [] }), true);
  assert.equal(needsPhysicalLayoutSync({ assets: [], physicalLayoutVersion: 1 }, 2), true);
  assert.equal(needsPhysicalLayoutSync({ assets: [], physicalLayoutVersion: 2 }, 2), false);
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
    assert.equal(fs.existsSync(path.join(root, 'assets', 'hero.png')), false);
  } finally { fs.rmSync(root, { recursive:true, force:true }); }
});

test('keeps genuinely unclassified root assets while removing stale categorized aliases', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-root-cleanup-'));
  try {
    fs.mkdirSync(path.join(root, 'assets', '角色'), { recursive:true });
    fs.writeFileSync(path.join(root, 'assets', '角色', 'hero.png'), 'hero');
    fs.writeFileSync(path.join(root, 'assets', 'hero.png'), 'stale alias');
    fs.writeFileSync(path.join(root, 'assets', 'loose.png'), 'loose');
    fs.writeFileSync(path.join(root, 'assets', 'manual.txt'), 'unindexed user file');
    const data={folders:[{id:'a',name:'角色',parentId:null}],assets:[{id:'1',file:'角色/hero.png',folderId:'a'},{id:'2',file:'loose.png',folderId:null}]};
    assert.equal(archiveLegacyRootAliases(root,data),1);
    syncPhysicalFolders(root,data);
    assert.equal(fs.existsSync(path.join(root,'assets','hero.png')),false);
    assert.equal(fs.existsSync(path.join(root,'assets','loose.png')),true);
    assert.equal(fs.existsSync(path.join(root,'assets','manual.txt')),true);
    assert.equal(fs.existsSync(path.join(root,'.nest-backups','legacy-root-aliases','hero.png')),true);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
