const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../browser-extension/prompt-review-core.js');
const { createPromptReview } = require('../electron/prompt-review.cjs');
test('Codex export keeps full original and works without model credentials', () => {
  const prompt = '【镜头1】\n角色@图片1说：“不要走！”\n\n保留空行与台词。';
  const text = core.codexPackage({ prompt, duration: 15, references: [{ tag: '@图片1', name: '角色参考' }], apiKey: 'do-not-copy' });
  assert.ok(text.includes('【待审查原文开始】\n' + prompt + '\n【待审查原文结束】'));
  assert.ok(text.includes('15 秒')); assert.ok(text.includes('@图片1：角色参考')); assert.ok(!text.includes('do-not-copy'));
});
test('basic review checks missing references and explicit timing without editing text', () => {
  const input = { prompt: '角色@图片1对着@图片10\n0-7秒 | 镜头一\n6-18秒 | 镜头二', duration: 15, references: [{ tag: '@图片1' }] };
  assert.equal(core.basic(input).issues.length, 3);
  assert.equal(core.normalize(input).prompt, input.prompt);
  assert.equal(core.basic({ prompt: '镜头没有时间标记', references: null }).issues.length, 0);
  assert.throws(() => core.normalize({ prompt: ' '.repeat(3) }));
  assert.throws(() => core.normalize({ prompt: '长'.repeat(40001) }));
});
test('pre-review catches the actual AI Flow input limit and splits without losing prompt text', () => {
  const prompt = '镜头一：人物看向门口。\n\n镜头二：门被推开，人物后退。\n\n镜头三：镜头固定在人物表情。';
  const input = { prompt, maxLength: 24 };
  const issue = core.basic(input).issues.find(item => /输入框上限/.test(item.problem));
  const chunks = core.splitPrompt(input);
  assert.equal(issue.severity, 'high');
  assert.match(issue.quote, new RegExp(`${prompt.length} / 24`));
  assert.match(issue.suggestion, /拆为/);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.length <= 24));
  assert.equal(chunks.join(''), prompt);
});
test('model report rejects invented quotations and invalid responses', () => {
  const input = { prompt: '人物背对镜头' };
  const result = core.validate({ summary: '分析', expectedFrames: [{ frame: '背影' }], issues: [{ quote: '不存在', problem: '问题', suggestion: '建议' }, { quote: '背对镜头', severity: 'high', problem: '口型不可见', suggestion: '确认意图' }] }, input);
  assert.equal(result.discarded, 1); assert.equal(result.issues.length, 1);
  assert.throws(() => core.validate({ text: 'bad' }, input));
});
test('AI requires enabled configured provider and explicit matching provider choice; no API calls from status', async () => {
  let calls = 0, captured;
  const config = { enabled: true, defaultProviderId: 'test', providers: [{ id: 'test', enabled: true, model: 'test-model', baseUrl: 'http://127.0.0.1:19999/v1', name: '测试' }] };
  const api = createPromptReview({ settings: () => config, secrets: () => ({ test: 'not-a-real-key' }), router: () => ({ get: () => ({ chat: async value => { calls++; captured = value; return { text: JSON.stringify({ summary: '测试结果', issues: [], expectedFrames: [{ frame: '人物背影' }] }) }; } }) }) });
  const status = api.status(); assert.equal(calls, 0); assert.equal(JSON.stringify(status).includes('not-a-real-key'), false);
  await assert.rejects(api.review({ prompt: '人物背影', providerId: 'wrong' }), /配置已变化/); assert.equal(calls, 0);
  const output = await api.review({ prompt: '人物背影', providerId: status.providerId, model: status.model, endpoint: status.endpoint, references: [{ tag: '@图片1', name: '角色' }], password: 'do-not-send' });
  assert.equal(output.summary, '测试结果'); assert.equal(calls, 1); assert.ok(!JSON.stringify(captured).includes('do-not-send'));
  config.enabled = false; await assert.rejects(api.review({ prompt: '人物背影' }), /配置默认模型/); assert.equal(calls, 1);
});
test('async review job uses actual provider adapter against local mock HTTP, returns verified report', async t => {
  const http = require('node:http'), { AIProviderRouter } = require('../electron/ai-provider.cjs');
  let received, requests = 0;
  const server = http.createServer(async (req, res) => {
    requests++; let body = ''; for await (const chunk of req) body += chunk; received = JSON.parse(body);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ summary: '本地测试', expectedFrames: [{ frame: '角色跑向门口' }], issues: [{ quote: '跑向门口', problem: '风险示例', suggestion: '建议示例' }] }) } }], usage: { total_tokens: 10 } }));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => new Promise(r => server.close(r)));
  const endpoint = `http://127.0.0.1:${server.address().port}`, provider = { id: 'local-test', enabled: true, model: 'test', type: 'ollama', baseUrl: endpoint + '/v1' };
  const api = createPromptReview({ settings: () => ({ enabled: true, defaultProviderId: provider.id, providers: [provider] }), secrets: () => ({}), router: () => new AIProviderRouter({ [provider.id]: provider }) });
  const job = api.start({ prompt: '角色跑向门口', providerId: provider.id, model: 'test', endpoint });
  assert.equal(api.result(job.jobId).state, 'running');
  assert.throws(() => api.start({ prompt: '角色跑向门口' }), /正在运行/);
  for (let i = 0; i < 100 && api.result(job.jobId).state === 'running'; i++) await new Promise(r => setTimeout(r, 10));
  const result = api.result(job.jobId); assert.equal(result.state, 'done'); assert.equal(result.result.summary, '本地测试'); assert.equal(requests, 1);
  assert.equal(received.messages[1].role, 'user'); assert.equal(JSON.parse(received.messages[1].content).prompt, '角色跑向门口');
});

