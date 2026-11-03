const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveMappedAIFlowFolder } = require('../electron/aiflow-current-folder-target.cjs');

const context = { serverOrigin: 'http://10.128.20.135:8080', projectId: '7' };

function mappedData({ roots = 1, includeChild = true } = {}) {
  const folders = [];
  for (let index = 1; index <= roots; index += 1) {
    const rootId = `root-${index}`;
    folders.push({
      id: rootId,
      name: `同步根 ${index}`,
      aiFlowRootSync: { serverOrigin: context.serverOrigin, projectId: context.projectId },
    });
    if (includeChild && index === 1) {
      folders.push({
        id: 'child-local',
        name: 'EP01',
        aiFlowFolderSync: {
          rootFolderId: rootId,
          remoteFolderId: '42',
          serverOrigin: context.serverOrigin,
          projectId: context.projectId,
        },
      });
    }
  }
  return { folders };
}

test('current-folder sync resolves a unique mapped root and its mapped child', () => {
  const data = mappedData();
  assert.equal(resolveMappedAIFlowFolder(data, { ...context }).id, 'root-1');
  assert.equal(resolveMappedAIFlowFolder(data, { ...context, remoteFolderId: '42' }).id, 'child-local');
});

test('explicit root mapping remains valid for full directory sync', () => {
  const data = mappedData({ roots: 2 });
  assert.equal(resolveMappedAIFlowFolder(data, { ...context, rootFolderId: 'root-1', remoteFolderId: '42' }).id, 'child-local');
});

test('current-folder sync refuses missing, ambiguous, or stale mappings instead of using the last selected local folder', () => {
  assert.throws(() => resolveMappedAIFlowFolder({ folders: [] }, { ...context }), /尚未与本地目录建立对应/);
  assert.throws(() => resolveMappedAIFlowFolder(mappedData({ roots: 2 }), { ...context }), /多个本地同步根目录/);
  assert.throws(() => resolveMappedAIFlowFolder(mappedData(), { ...context, rootFolderId: 'wrong-root' }), /目录对应已变化/);
  assert.throws(() => resolveMappedAIFlowFolder(mappedData({ includeChild: false }), { ...context, remoteFolderId: '42' }), /子目录对应不存在/);
});
