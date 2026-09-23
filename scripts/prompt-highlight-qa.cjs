const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>body{background:#141014;color:white}div{font-size:12px;line-height:20px}mark{padding:3px;font-weight:bold}textarea{font:600 16px/28px Arial;width:650px;height:340px;padding:16px;border:1px solid #555;background:#141014;color:white;box-sizing:border-box}</style><main id="assetLibrary"><textarea id="prompt"></textarea></main>`);
    const original = ('【镜头方向】角色@图片2进入宴会厅，另一位角色@图片3站在门边。\n\n' + '镜头保持人物表演，摄影机缓慢推进。'.repeat(8) + '\n').repeat(8);
    await page.locator('textarea').fill(original);
    const source = fs.readFileSync(process.env.PROMPT_SOURCE || path.join(__dirname, '../browser-extension/aiflow-page.js'), 'utf8');
    await page.addScriptTag({ content: source.slice(0, source.indexOf('  function requestVideoCopy')) + 'injectPromptReferenceHighlights(); })();' });
    await page.waitForTimeout(250);
    await page.evaluate(() => { document.querySelector('textarea').value += '\n重新制作@图片9'; });
    await page.waitForFunction(() => { const layer = document.querySelector('.nest-aiflow-prompt-highlight-layer'); return (layer.shadowRoot || layer).textContent.includes('重新制作@图片9'); }, null, { timeout: 1500 });
    await page.evaluate(() => { const e = document.querySelector('textarea'); e.style.fontSize = '18px'; e.style.lineHeight = '33px'; e.style.wordSpacing = '3px'; e.scrollTop = 117; });
    await page.waitForTimeout(250);
    const result = await page.evaluate(() => {
      const e = document.querySelector('textarea'), layer = document.querySelector('.nest-aiflow-prompt-highlight-layer'), content = layer.shadowRoot.querySelector('div');
      const oracle = document.createElement('div'); oracle.style.cssText = layer.style.cssText; oracle.style.position = 'absolute'; oracle.style.boxSizing = 'border-box'; oracle.style.overflow = 'hidden';
      const plain = document.createElement('span'); plain.textContent = e.value; plain.style.color = 'transparent'; oracle.append(plain); layer.parentNode.append(oracle);
      const deltas = [...content.querySelectorAll('mark')].map(mark => {
        let offset = 0; for (let node = mark.previousSibling; node; node = node.previousSibling) offset += node.textContent.length;
        const range = document.createRange(); range.setStart(plain.firstChild, offset); range.setEnd(plain.firstChild, offset + mark.textContent.length);
        const expected = range.getBoundingClientRect(), actual = mark.getBoundingClientRect();
        return Math.max(Math.abs(expected.x - e.scrollLeft - actual.x), Math.abs(expected.y - e.scrollTop - actual.y), Math.abs(expected.width - actual.width));
      }); oracle.remove();
      return { maxDelta: Math.max(...deltas), count: deltas.length, value: e.value, scroll: e.scrollTop, mirrorScroll: content.style.transform };
    });
    assert.equal(result.value, original + '\n重新制作@图片9'); assert.ok(result.maxDelta < 1, JSON.stringify(result));
    console.log(JSON.stringify({ pass: true, maxPixelDrift: result.maxDelta, references: result.count, nativeTextUnchanged: true }));
    await page.screenshot({ path: path.join(__dirname, '../prompt-highlight-qa.png') });
    await page.evaluate(() => {
      const editor = document.querySelector('textarea'); editor.id = 'promptInput';
      editor.value = '已有 @图片1，缺少 @图片10 @图片1000；已有 @视频1，缺少 @视频2；已有 @音频1，缺少 @音频2。';
      editor.scrollTop = 0;
      const tags = document.createElement('section'); tags.id = 'assetTags';
      tags.innerHTML = ['图片1', 'Vid1', '音频1'].map((label, i) => `<span class="asset-tag" data-asset-id="${i}"><span class="at-chip-label">@${label}</span></span>`).join('');
      document.body.append(tags);
    });
    const missing = () => [...document.querySelector('.nest-aiflow-prompt-highlight-layer').shadowRoot.querySelectorAll('.nest-aiflow-reference-missing')].map(mark => mark.textContent);
    await page.waitForFunction(() => document.querySelector('.nest-aiflow-prompt-highlight-layer').shadowRoot.querySelectorAll('.nest-aiflow-reference-missing').length === 4);
    assert.deepEqual(await page.evaluate(missing), ['@图片10', '@图片1000', '@视频2', '@音频2']);
    await page.screenshot({ path: path.join(__dirname, '../prompt-missing-reference-qa.png') });
    await page.evaluate(() => { document.querySelector('#assetTags').innerHTML += '<span class="asset-tag" data-asset-id="new"><span class="at-chip-label">@图片10</span></span>'; });
    await page.waitForFunction(() => document.querySelector('.nest-aiflow-prompt-highlight-layer').shadowRoot.querySelectorAll('.nest-aiflow-reference-missing').length === 3);
    await page.evaluate(() => document.querySelector('#assetTags').replaceChildren());
    await page.waitForFunction(() => document.querySelector('.nest-aiflow-prompt-highlight-layer').shadowRoot.querySelectorAll('.nest-aiflow-reference-missing').length === 7);
    await page.evaluate(() => document.querySelector('#assetTags').remove());
    await page.waitForFunction(() => document.querySelector('.nest-aiflow-prompt-highlight-layer').shadowRoot.querySelectorAll('.nest-aiflow-reference-missing').length === 0);
    console.log('PASS: missing references red, all 3 media types, exact numbering, add/remove without typing, unknown reference list avoids false alerts');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

