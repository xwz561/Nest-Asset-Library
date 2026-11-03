const core = require('../browser-extension/prompt-review-core.js');
const { parseJson } = require('./ai-provider.cjs');
const { randomUUID } = require('node:crypto');
function createPromptReview({ settings, secrets, router, recordUsage = () => {} }) {
  let busy = false;
  const jobs = new Map();
  const prune = () => { for (const [id, job] of jobs) if (Date.now() - job.created > 600000) jobs.delete(id); };
  const status = () => {
    const config = settings(), provider = config.providers.find(p => p.id === config.defaultProviderId);
    const ready = Boolean(config.enabled && provider?.enabled && provider.model && provider.baseUrl && (provider.type === 'ollama' || secrets()[provider.id]));
    let endpoint = ''; try { endpoint = new URL(provider?.baseUrl).origin; } catch {}
    return { ready, providerId: provider?.id || '', name: provider?.name || '', model: provider?.model || '', endpoint, reason: ready ? '' : '请在素材库“设置 → AI 与模型”启用并配置默认模型及 API Key。' };
  };
  const review = async input => {
    const data = core.normalize(input), current = status();
    if (!current.ready) throw new Error(current.reason);
    if (input.providerId !== current.providerId || input.model !== current.model || input.endpoint !== current.endpoint) throw new Error('模型配置已变化，请关闭审查面板后重新打开');
    if (busy) throw new Error('已有审查正在运行，请稍后再试');
    busy = true;
    try { const result = await router().get(current.providerId).chat({ messages: core.messages(data), temperature: 0.2 }); recordUsage(result.usage); return { ...core.validate(parseJson(result.text), data), model: current.model }; }
    catch (error) { if (/格式|JSON/.test(error.message)) throw new Error('AI 返回格式不完整，请重试'); throw new Error('AI 审查失败，请检查模型连接或稍后重试'); }
    finally { busy = false; }
  };
  const start = input => {
    prune(); if (busy) throw new Error('已有审查正在运行，请稍后再试');
    if (jobs.size >= 10) jobs.delete(jobs.keys().next().value);
    const jobId = randomUUID(), job = { created: Date.now(), state: 'running' }; jobs.set(jobId, job);
    review(input).then(result => { job.result = result; job.state = 'done'; }, error => { job.error = error.message; job.state = 'failed'; });
    return { jobId };
  };
  const result = id => { prune(); const job = jobs.get(id); if (!job) throw new Error('审查结果已过期，请重新审查'); return { state: job.state, result: job.result, error: job.error }; };
  return { status, review, start, result };
}
module.exports = { createPromptReview };

