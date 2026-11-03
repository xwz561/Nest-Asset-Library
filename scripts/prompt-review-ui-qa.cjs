const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    await page.setContent('<style>body{background:#141014;color:white;font:16px sans-serif}textarea{width:600px;height:200px}</style><textarea id="promptInput"></textarea><input id="durationRange" value="15"><div id="assetTags"><span class="asset-tag" data-asset-id="1"><span class="at-chip-label">@图片1</span><span class="at-chip-name">角色</span></span></div>');
    await page.locator('#promptInput').fill('角色@图片1跑向@图片2。\n0-18秒 | 镜头跟拍。');
    await page.evaluate(() => {
      globalThis.reviewCalls = 0;
      globalThis.chrome = { runtime: { sendMessage: (message, callback) => {
        if (message.action.endsWith('-status')) callback({ ready: !globalThis.noModel, reason: '请先配置默认模型', providerId: 'mock', name: '模拟模型', model: 'qa-model', endpoint: 'http://127.0.0.1' });
        else if (message.action.endsWith('-result')) callback({ state: 'done', result: { summary: '测试报告：注意动作可见性', expectedFrames: [{ time: '0-18秒', frame: '角色向目标跑去，镜头跟随', uncertainty: '目标位置需要明确' }], issues: [{ severity: 'medium', quote: '镜头跟拍', problem: '跟拍方位未明确', suggestion: '补充侧后方跟拍' }], limitations: '仅文本测试' } });
        else { globalThis.reviewCalls++; callback({ jobId: 'mock-job' }); }
      } } };
    });
    for (const file of ['prompt-review-core.js', 'prompt-review-ui.js']) await page.addScriptTag({ path: path.join(__dirname, '../browser-extension', file) });
    await page.getByRole('button', { name: '生成前审查', exact: true }).click();
    await page.getByText('当前引用栏没有这个编号的素材', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => reviewCalls), 0);
    await page.getByRole('button', { name: 'AI 深度审查', exact: true }).click();
    await page.getByText('测试报告：注意动作可见性', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => reviewCalls), 1);
    assert.equal(await page.locator('#promptInput').inputValue(), '角色@图片1跑向@图片2。\n0-18秒 | 镜头跟拍。');
    await page.screenshot({ path: path.join(__dirname, '../prompt-review-ui-qa.png') });
    await page.locator('#promptInput').evaluate(e => { e.value += ' 新动作'; });
    await page.getByText('页面内容已变化，当前报告针对旧内容，请重新读取。', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'AI 深度审查', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: '关闭', exact: true }).click(); await page.evaluate(() => { globalThis.noModel = true; });
    await page.getByRole('button', { name: '生成前审查', exact: true }).click();
    await page.getByText('请先配置默认模型', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'AI 深度审查', exact: true }).isDisabled(), true);
    await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { globalThis.copiedReview = text; } } }); });
    await page.getByRole('button', { name: '复制 Codex 审查包', exact: true }).click();
    await page.getByText('已复制当前内容。粘贴到 Codex 后发送即可审查；参考图片需要另外附上。', { exact: true }).waitFor();
    const copied = await page.evaluate(() => copiedReview);
    assert.ok(copied.includes('新动作')); assert.ok(copied.includes('@图片1：角色')); assert.equal(await page.evaluate(() => reviewCalls), 1);
    await page.screenshot({ path: path.join(__dirname, '../codex-review-export-qa.png') });
    console.log('PASS local checks, explicit AI trigger, report display, original prompt unchanged, stale report detection (mock AI only)');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

