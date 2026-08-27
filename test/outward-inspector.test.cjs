const test=require('node:test');
const assert=require('node:assert/strict');
const {inspectorBounds}=require('../electron/outward-inspector.cjs');

test('inspector expands right without moving a window that has room',()=>{assert.deepEqual(inspectorBounds({x:100,y:40,width:1000,height:700},{x:0,y:0,width:1920,height:1040},350),{x:100,y:40,width:1350,height:700,added:350})});
test('inspector moves window left at right edge',()=>{assert.deepEqual(inspectorBounds({x:850,y:40,width:1000,height:700},{x:0,y:0,width:1920,height:1040},350),{x:570,y:40,width:1350,height:700,added:350})});
test('inspector is constrained to current display work area',()=>{assert.deepEqual(inspectorBounds({x:2000,y:20,width:1100,height:700},{x:1920,y:0,width:1280,height:1000},350),{x:1920,y:20,width:1280,height:700,added:180})});
