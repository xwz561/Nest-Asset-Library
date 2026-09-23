const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeBaseUrl,
  publicAccount,
  accessibleProjects,
  attachProjectAndEpisodeLabels,
  completedVideos,
  createAIFlowClient,
} = require('../electron/aiflow-client.cjs');

test('normalizes an AI Flow HTTP service URL without accepting credentials', () => {
  assert.equal(normalizeBaseUrl(' http://127.0.0.1:8081/ '), 'http://127.0.0.1:8081');
  assert.throws(() => normalizeBaseUrl('ftp://example.com'), /HTTP 或 HTTPS/);
  assert.throws(() => normalizeBaseUrl('https://token@example.com'), /HTTP 或 HTTPS/);
});

test('keeps only completed non-relaying AI Flow video tasks', () => {
  const videos = completedVideos({
    items: [
      { taskId: 'done-1', status: 'COMPLETED', videoUrl: '/videos/done-1.mp4', deliveryName: '镜头 A', duration: 12.5 },
      { taskId: 'relay-1', status: 'COMPLETED', videoUrl: '/videos/relay-1.mp4', relaying: true },
      { taskId: 'running-1', status: 'RUNNING', videoUrl: '/videos/running-1.mp4' },
      { taskId: 'missing-1', status: 'COMPLETED' },
    ],
  });
  assert.deepEqual(videos, [{
    taskId: 'done-1',
    name: '镜头 A',
    model: '',
    prompt: '',
    duration: 12.5,
    completedAt: 0,
    submittedAt: '',
    projectId: '',
    projectName: '',
    episodeId: '',
    episodeName: '',
    episodeSort: null,
    episodeNumber: null,
    storyOrder: null,
    shotNumber: null,
    versionNumber: null,
  }]);
});

test('keeps AI Flow date strings sortable and sends an explicit episode query', async () => {
  const videos = completedVideos({
    items: [{
      taskId: 'done-2', status: 'COMPLETED', videoUrl: '/videos/done-2.mp4',
      completedAt: '2026-09-02 12:34:56', time: '2026-09-02 10:00:00', storyOrder: 2, shotNumber: 4,
    }],
  });
  assert.equal(videos[0].completedAt, Date.parse('2026-09-02T12:34:56'));
  assert.equal(videos[0].submittedAt, '2026-09-02 10:00:00');
  assert.equal(videos[0].storyOrder, 2);
  assert.equal(videos[0].shotNumber, 4);

  const calls = [];
  const client = createAIFlowClient({
    baseUrl: 'https://aiflow.example.com', authMode: 'session',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    },
  });
  await client.listCompletedVideos({ episodeId: 101, limit: 2000 });
  assert.equal(calls[0].url, 'https://aiflow.example.com/auth/history?limit=2000&episode_id=101');
  await assert.rejects(client.listCompletedVideos({ episodeId: '../101' }), /集数 ID 无效/);
});

test('keeps only accessible AI Flow projects and maps episode display labels onto videos', () => {
  const projects = accessibleProjects({
    items: [
      {
        id: 10,
        name: 'AX17',
        canAccess: true,
        episodes: [{ id: 101, name: 'EP01_已锁定参考资产', sortOrder: 1, episodeNumber: 1 }],
      },
      { id: 11, name: '无权限项目', canAccess: false, episodes: [{ id: 111, name: '不应暴露' }] },
    ],
  });
  assert.deepEqual(projects, [{
    id: '10',
    name: 'AX17',
    episodes: [{ id: '101', name: 'EP01_已锁定参考资产', sortOrder: 1, episodeNumber: 1 }],
  }]);
  assert.deepEqual(attachProjectAndEpisodeLabels([{
    taskId: 'done-1', projectId: '10', episodeId: '101', projectName: '', episodeName: '', episodeSort: null, episodeNumber: null,
  }], projects), [{
    taskId: 'done-1', projectId: '10', episodeId: '101', projectName: 'AX17', episodeName: 'EP01_已锁定参考资产', episodeSort: 1, episodeNumber: 1,
  }]);
});

test('uses a bearer header for the read-only history endpoint without exposing it in output', async () => {
  const calls = [];
  const client = createAIFlowClient({
    baseUrl: 'http://127.0.0.1:8081',
    token: 'Bearer aiflow_secret_token',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ items: [{ taskId: 'done-1', status: 'COMPLETED', videoUrl: '/videos/done-1.mp4' }] }), { status: 200 });
    },
  });
  const videos = await client.listCompletedVideos();
  assert.equal(calls[0].url, 'http://127.0.0.1:8081/auth/history?limit=300');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer aiflow_secret_token');
  assert.equal(JSON.stringify(videos).includes('aiflow_secret_token'), false);
});

test('uses the authenticated browser session without exposing a cookie or a bearer header', async () => {
  const calls = [];
  const client = createAIFlowClient({
    baseUrl: 'https://aiflow.example.com',
    authMode: 'session',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ success: true, user: { id: 7, username: 'liwang', displayName: '小旺仔', role: 'user' } }), { status: 200 });
    },
  });
  const result = await client.testConnection();
  assert.equal(client.authMode, 'session');
  assert.equal(calls[0].url, 'https://aiflow.example.com/auth/me');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[0].options.credentials, 'include');
  assert.deepEqual(result.account, { id: '7', username: 'liwang', displayName: '小旺仔' });
  assert.equal(JSON.stringify(result).includes('sd2_session'), false);
});

test('requires a token only when the advanced token mode is selected', () => {
  assert.throws(
    () => createAIFlowClient({ baseUrl: 'https://aiflow.example.com', authMode: 'token', fetchImpl: async () => new Response('unused') }),
    /访问令牌/,
  );
  assert.doesNotThrow(() => createAIFlowClient({ baseUrl: 'https://aiflow.example.com', authMode: 'session', fetchImpl: async () => new Response('unused') }));
});

test('explicit session mode never falls back to a previously saved token', async () => {
  const calls = [];
  const client = createAIFlowClient({
    baseUrl: 'https://aiflow.example.com',
    authMode: 'session',
    token: 'stale_saved_token',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ success: true, user: { id: 1 } }), { status: 200 });
    },
  });
  await client.testConnection();
  assert.equal(client.authMode, 'session');
  assert.equal(calls[0].options.headers.Authorization, undefined);
});

test('only returns safe account display fields', () => {
  assert.deepEqual(
    publicAccount({ user: { id: 3, username: 'liwang', display_name: '小旺仔', password: 'secret', tokens: 99 } }),
    { id: '3', username: 'liwang', displayName: '小旺仔' },
  );
});

test('rejects an invalid task id before making a download request', async () => {
  const client = createAIFlowClient({ baseUrl: 'http://127.0.0.1:8081', token: 'aiflow_x', fetchImpl: async () => new Response('unused') });
  await assert.rejects(client.downloadVideo('../not-a-task'), /任务 ID 无效/);
});
