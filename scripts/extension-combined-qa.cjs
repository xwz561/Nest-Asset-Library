const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs'), path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.setContent('<main id="assetLibrary"><div id="assetTags"><span class="asset-tag" data-asset-id="1"><span class="at-chip-label">@图片1</span></span></div><textarea id="promptInput" style="width:600px;height:250px">测试@图片1和@图片2</textarea></main>');
    await page.evaluate(() => { globalThis.chrome = { runtime: { sendMessage: (_m, cb) => cb?.({}), onMessage: { addListener() {} } } }; });
    const root = path.join(__dirname, '../browser-extension');
    for (const file of JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'))).content_scripts[0].js) await page.addScriptTag({ path: path.join(root, file) });
    await page.waitForTimeout(500);
    console.log(JSON.stringify({ errors, state: await page.evaluate(() => ({ button: !!document.getElementById('nest-prompt-review-button'), layers: document.querySelectorAll('.nest-aiflow-prompt-highlight-layer').length, marks: document.querySelector('.nest-aiflow-prompt-highlight-layer')?.shadowRoot.querySelectorAll('mark').length })) }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
