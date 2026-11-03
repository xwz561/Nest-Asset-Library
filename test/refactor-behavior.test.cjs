const test = require('node:test');
const assert = require('node:assert/strict');
const { createMessageController } = require('../src/lib/message-controller.cjs');
const { createIndexedDBConnection } = require('../src/lib/indexed-db-connection.cjs');
const { collectFolderSubtreeIds } = require('../shared/folder-tree.cjs');

test('deep reverse-ordered folder trees are traversed once without recursion',()=>{
  let reads=0;const folders=[];
  for(let id=10000;id>0;id--)folders.push({id:String(id),get parentId(){reads++;return id>1?String(id-1):null;}});
  assert.equal(collectFolderSubtreeIds(folders,'1').size,10000);
  assert.ok(reads<=30000,`expected linear work, saw ${reads} parent reads`);
});
test('folder traversal tolerates cycles and excludes unrelated branches',()=>{
  const result=collectFolderSubtreeIds([{id:'a',parentId:'b'},{id:'b',parentId:'a'},{id:'c',parentId:'b'},{id:'x',parentId:null}], 'a');
  assert.deepEqual([...result],['a','b','c']);
});
test('closing a cached database clears the connection and a synchronous open failure can retry',async()=>{
  let calls=0;const request={};const db={close(){}};
  const connection=createIndexedDBConnection(()=>{calls++;if(calls===1)throw new Error('unavailable');return request;},()=>{});
  await assert.rejects(connection.get(),/unavailable/);
  const next=connection.get();request.result=db;request.onsuccess();await next;
  db.onclose();const third=connection.get();assert.equal(calls,3);request.onsuccess();await third;
});

test('an old message timer cannot dismiss a newer notification, even if already queued', () => {
  let value, next = 0;
  const callbacks = new Map();
  const timers = { setTimeout(callback) { callbacks.set(++next, callback); return next; }, clearTimeout() {} };
  const messages = createMessageController(text => { value = text; }, timers);
  messages.show('first', 5000);
  messages.show('second', 5000);
  callbacks.get(1)();
  assert.equal(value, 'second');
  callbacks.get(2)();
  assert.equal(value, '');
  messages.show('persistent');
  messages.dispose();
  callbacks.get(2)();
  assert.equal(value, 'persistent');
});

test('IndexedDB callers share a connection and reopen after a version change', async () => {
  const requests = [];
  const connection = createIndexedDBConnection(() => { const r = {}; requests.push(r); return r; }, () => {});
  const first = connection.get(), concurrent = connection.get();
  assert.equal(first, concurrent);
  assert.equal(requests.length, 1);
  let closed = false;
  const db = { close() { closed = true; } };
  requests[0].result = db; requests[0].onsuccess();
  assert.equal(await first, db);
  assert.equal(await connection.get(), db);
  db.onversionchange();
  assert.equal(closed, true);
  const reopened = connection.get();
  assert.equal(requests.length, 2);
  requests[1].result = { close() {} }; requests[1].onsuccess();
  await reopened;
});

test('a failed database open can be retried rather than caching a rejected promise', async () => {
  const requests = [];
  const connection = createIndexedDBConnection(() => { const r = {}; requests.push(r); return r; }, () => {});
  const first = connection.get(); requests[0].error = new Error('open failed'); requests[0].onerror();
  await assert.rejects(first, /open failed/);
  const retry = connection.get(); assert.equal(requests.length, 2);
  requests[1].result = { close() {} }; requests[1].onsuccess(); await retry;
});
