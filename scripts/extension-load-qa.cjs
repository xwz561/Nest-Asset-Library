const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const http = require('node:http'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<main id="assetLibrary"><div id="assetTags"></div><textarea id="promptInput">测试@图片1</textarea></main>'); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const extension = path.join(__dirname, '../browser-extension'), profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-extension-load-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, { headless: true, channel: 'msedge', ignoreDefaultArgs: ['--disable-extensions'], args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
    const page = await context.newPage(); page.on('pageerror', e => console.log('PAGE ERROR:', e.message)); page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); }); await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForTimeout(1500);
    const state = await page.evaluate(() => ({ review: !!document.getElementById('nest-prompt-review-button'), highlight: !!document.querySelector('.nest-aiflow-prompt-highlight-layer'), missing: document.querySelector('.nest-aiflow-prompt-highlight-layer')?.shadowRoot.querySelectorAll('.nest-aiflow-reference-missing').length }));
    assert.deepEqual(state, { review: true, highlight: true, missing: 1 });
    await page.getByRole('button', { name: '生成前审查', exact: true }).click();
    await page.getByText('当前引用栏没有这个编号的素材', { exact: true }).waitFor();
    console.log(JSON.stringify({ pass: true, actualExtensionAutoInjection: state, reviewPanel: true }));
  } finally { await context?.close(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });

