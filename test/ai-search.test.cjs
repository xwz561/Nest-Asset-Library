const test=require('node:test');
const assert=require('node:assert/strict');
const {duplicateGroups,similarAssets}=require('../electron/ai-search.cjs');

test('duplicate detection returns only exact hash groups',()=>{
  const groups=duplicateGroups([{id:'a',hash:'same'},{id:'b',hash:'same'},{id:'c',hash:'other'},{id:'d'}]);
  assert.deepEqual(groups,[{hash:'same',assetIds:['a','b']}]);
});

test('similarity ranks matching media, tags, aspect and filename above unrelated assets',()=>{
  const assets=[
    {id:'source',name:'warm study room',type:'image/png',tags:['暖色','书房'],width:1600,height:900},
    {id:'best',name:'warm study alternate',type:'image/jpeg',tags:['暖色','书房'],width:1920,height:1080},
    {id:'partial',name:'cold room',type:'image/png',tags:['书房'],width:900,height:1600},
    {id:'audio',name:'warm study room',type:'audio/wav',tags:[],width:0,height:0},
  ];
  const result=similarAssets(assets,'source');
  assert.equal(result[0].assetId,'best');
  assert.ok(result[0].score>result[1].score);
  assert.equal(result.some(item=>item.assetId==='source'),false);
});
