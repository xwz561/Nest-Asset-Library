(() => {
  const core = globalThis.NestPromptReview;
  if (!core) return;
  const snapshot = () => {
    const tags = document.getElementById('assetTags'), editor = document.getElementById('promptInput');
    const maxLength = Number(editor?.getAttribute('maxlength') || editor?.maxLength || 0);
    return { prompt: editor?.value || '', maxLength: maxLength > 0 ? maxLength : null, duration: Number(document.getElementById('durationRange')?.value) || null,
      references: tags ? [...tags.querySelectorAll('.asset-tag[data-asset-id]')].map(tag => ({ tag: tag.querySelector('.at-chip-label')?.textContent.trim() || '', name: tag.querySelector('.at-chip-name')?.textContent.trim() || '' })) : null };
  };
  const request = (action, input) => new Promise(resolve => {
    try { chrome.runtime.sendMessage({ action, input }, value => { const error = chrome.runtime.lastError; resolve(error ? { error: '扩展连接已失效，请重新加载插件并刷新页面。' } : value || { error: '素材库没有返回结果' }); }); }
    catch { resolve({ error: '扩展连接已失效，请重新加载插件并刷新页面。' }); }
  });
  function openReview() {
    if (document.getElementById('nest-prompt-review-panel')) return;
    const host = document.createElement('div'); host.id = 'nest-prompt-review-panel';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      :host{font:14px/1.6 system-ui;color:#e9edf5}*{box-sizing:border-box}.backdrop{position:absolute;inset:0;background:#0008;display:flex;justify-content:flex-end}
      section{width:min(620px,100vw);height:100%;background:#171b23;border-left:1px solid #434b5a;display:flex;flex-direction:column;box-shadow:0 0 40px #0008}header{display:flex;align-items:center;justify-content:space-between;padding:16px;border-bottom:1px solid #434b5a}h2{font-size:18px;margin:0}h3{font-size:15px;margin:16px 0 8px}button,select{border:1px solid #586578;background:#293b54;color:#f5f7fb;border-radius:7px;padding:8px 12px;cursor:pointer}button:disabled{opacity:.5;cursor:default}.body{padding:16px;overflow:auto;flex:1}p{margin:8px 0;white-space:pre-wrap;overflow-wrap:anywhere}.muted{color:#acb7c8;font-size:12px}.error{color:#ff9299}.stale{color:#ffd17d}.issue{padding:12px;border:1px solid #455064;border-left:3px solid #e9ba68;border-radius:7px;margin:10px 0}.high{border-left-color:#ff6375}.low{border-left-color:#68acd9}blockquote{margin:8px 0;padding:8px;background:#252c38;border-radius:5px;white-space:pre-wrap;overflow-wrap:anywhere}.actions{display:flex;gap:8px;flex-wrap:wrap}details{margin:10px 0}pre{font:inherit;white-space:pre-wrap;max-height:220px;overflow:auto;background:#222935;padding:10px}
      </style><div class="backdrop"><section role="dialog" aria-label="生成前审查"><header><h2>生成前审查</h2><button id="close">关闭</button></header><div class="body"><p class="muted">检查当前这一段。仅给建议，不修改提示词、不提交视频生成。</p><p id="length" class="muted"></p><div id="length-actions" class="actions" hidden><select id="segment" aria-label="分段提示词"></select><button id="copy-segment">复制选中分段</button></div><p id="stale" class="stale"></p><div class="actions"><button id="codex">复制 Codex 审查包</button><button id="refresh">重新读取当前内容</button><button id="copy">复制报告</button></div><p class="muted">无需 API Key：复制后粘贴到桌面端 Codex，直接在对话里审查。包含当前原文、引用名称和时长，不含素材文件。</p><p id="codex-status" role="status"></p><textarea id="codex-fallback" aria-label="Codex 审查包" readonly hidden style="width:100%;height:180px;background:#222935;color:#e9edf5"></textarea><details><summary>本次审查内容</summary><pre id="snapshot"></pre></details><h3>基础检查 · 本机完成</h3><div id="basic"></div><h3>AI 深度审查</h3><p id="provider" class="muted">正在读取素材库模型配置…</p><button id="review" disabled>AI 深度审查</button><p id="status" role="status"></p><div id="ai"></div></div></section></div>`;
    document.documentElement.append(host);
    const $ = id => shadow.getElementById(id);
    let data, basicResult, aiResult = null, config = null, running = false, previousFocus = document.activeElement, promptSegments = [];
    const node = (tag, text, className) => { const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el; };
    function issue(target, item) {
      const box = node('article', '', 'issue ' + item.severity);
      box.append(node('strong', ({ high: '重点核对', medium: '潜在风险', low: '优化建议' })[item.severity] || '建议'), node('blockquote', item.quote), node('p', item.problem), node('p', '建议：' + item.suggestion)); target.append(box);
    }
    function refresh() {
      if (running) return;
      data = snapshot(); aiResult = null; $('ai').replaceChildren(); $('status').textContent = ''; $('basic').replaceChildren();
      try { promptSegments = data.prompt.trim() ? (data.maxLength ? core.splitPrompt(data, data.maxLength) : [data.prompt]) : []; }
      catch { promptSegments = []; }
      const overLimit = promptSegments.length > 1;
      $('length').textContent = !data.prompt.trim() ? '当前没有可审查的提示词。' : data.maxLength ? (overLimit ? `当前提示词 ${data.prompt.length} / ${data.maxLength} 字，不能直接生成。已按原换行拆为 ${promptSegments.length} 段，原文没有截断。` : `当前提示词 ${data.prompt.length} / ${data.maxLength} 字，可以直接生成。`) : `当前提示词 ${data.prompt.length} 字，页面未提供长度上限。`;
      $('length').className = overLimit || !data.prompt.trim() ? 'error' : 'muted';
      $('length-actions').hidden = !overLimit;
      $('segment').replaceChildren(...promptSegments.map((part, index) => { const option = document.createElement('option'); option.value = String(index); option.textContent = `第 ${index + 1} 段 · ${part.length} 字`; return option; }));
      $('snapshot').textContent = `${data.duration ? data.duration + ' 秒' : '时长未识别'}\n提示词：${data.maxLength ? `${data.prompt.length} / ${data.maxLength} 字` : `${data.prompt.length} 字`}\n引用：${data.references ? data.references.map(r => r.tag + ' ' + r.name).join('、') || '无' : '未识别引用栏'}\n\n${data.prompt}`;
      try { basicResult = core.basic(data); basicResult.issues.forEach(i => issue($('basic'), i)); $('basic').append(node('p', basicResult.issues.length ? basicResult.notice : '未发现明确的引用或时间段问题。' + basicResult.notice, 'muted')); }
      catch (error) { basicResult = null; $('basic').append(node('p', error.message, 'error')); }
      update();
    }
    function update() {
      const stale = JSON.stringify(data) !== JSON.stringify(snapshot());
      $('stale').textContent = stale ? '页面内容已变化，当前报告针对旧内容，请重新读取。' : '';
      $('review').disabled = running || stale || !basicResult || !config?.ready;
      $('refresh').disabled = running;
    }
    const timer = setInterval(update, 400);
    function close() { clearInterval(timer); host.remove(); previousFocus?.focus?.(); }
    $('close').onclick = close;
    host.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
    $('refresh').onclick = refresh;
    $('copy-segment').onclick = async () => {
      const index = Number($('segment').value), text = promptSegments[index];
      if (!text) return;
      try { await navigator.clipboard.writeText(text); $('status').textContent = `已复制第 ${index + 1} 段；粘贴到 AI Flow 后单独生成。`; }
      catch { $('status').textContent = '复制失败，请在“本次审查内容”中手动选择对应段落复制。'; }
    };
    $('codex').onclick = async () => {
      let text;
      try { text = core.codexPackage(snapshot()); }
      catch (error) { $('codex-status').textContent = error.message; return; }
      const fallback = $('codex-fallback'); fallback.value = text;
      let copied = false;
      try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); copied = true; } } catch {}
      if (!copied) {
        fallback.hidden = false; fallback.focus(); fallback.select();
        try { copied = document.execCommand('copy'); } catch {}
      }
      fallback.hidden = copied;
      $('codex-status').textContent = copied ? '已复制当前内容。粘贴到 Codex 后发送即可审查；参考图片需要另外附上。' : '请在下方文本框按 Ctrl+A、Ctrl+C 复制，再粘贴到 Codex。';
      if (copied) $('codex').focus();
    };
    $('copy').onclick = async () => {
      const report = ['生成前审查', $('stale').textContent, '基础检查', $('basic').textContent, 'AI 深度审查', aiResult ? $('ai').textContent : '尚未完成 AI 审查'].filter(Boolean).join('\n\n');
      try { await navigator.clipboard.writeText(report); $('status').textContent = '报告已复制'; } catch { $('status').textContent = '复制失败，请手动选择报告文字复制'; }
    };
    $('review').onclick = async () => {
      if ($('review').disabled) return;
      running = true; aiResult = null; $('ai').replaceChildren(); update(); $('status').textContent = '正在审查，可关闭面板；本次请求仍可能计费。';
      let result = await request('nest-prompt-review', { ...data, providerId: config.providerId, model: config.model, endpoint: config.endpoint });
      if (result.jobId) {
        const jobId = result.jobId, deadline = Date.now() + 320000;
        do {
          await new Promise(resolve => setTimeout(resolve, 1200));
          if (!host.isConnected) return;
          const progress = await request('nest-prompt-review-result', { jobId });
          if (progress.error) { result = { error: progress.error }; break; }
          if (progress.state === 'done') { result = progress.result; break; }
          result = { error: '等待审查超时，请稍后重新审查' };
        } while (Date.now() < deadline);
      }
      running = false; if (!host.isConnected) return;
      $('status').textContent = result.error || '审查完成。预期画面是推断，不保证实际生成效果。';
      if (!result.error) {
        aiResult = result; $('ai').append(node('p', result.summary), node('h3', '预期画面（按文字推断）'));
        for (const frame of result.expectedFrames || []) { const box = node('article', '', 'issue low'); box.append(node('strong', frame.time || '未标时间'), node('p', frame.frame), node('p', frame.uncertainty || '', 'muted')); $('ai').append(box); }
        $('ai').append(node('h3', '风险与修改建议')); (result.issues || []).forEach(i => issue($('ai'), i));
        if (!result.issues?.length) $('ai').append(node('p', 'AI 未返回可核对的具体问题；不代表没有风险。', 'muted'));
        $('ai').append(node('p', '本次没有查看图片、音频或视频内容，不能确认角色外观与参考图是否匹配。' + (result.limitations || ''), 'muted'));
        if (result.discarded) $('ai').append(node('p', `已过滤 ${result.discarded} 条无法对应原文的问题。`, 'muted'));
      }
      update();
    };
    refresh(); $('close').focus();
    request('nest-prompt-review-status').then(result => {
      if (!host.isConnected) return; config = result;
      $('provider').textContent = result.error || (result.ready ? `点击后将本段提示词、引用标签/名称及设置时长发送至 ${result.name} · ${result.model}（${result.endpoint}），可能产生调用费用。不上传素材文件。` : result.reason);
      update();
    });
  }
  function inject() {
    const editor = document.getElementById('promptInput');
    if (!editor || document.getElementById('nest-prompt-review-button')) return;
    const button = document.createElement('button'); button.id = 'nest-prompt-review-button'; button.type = 'button'; button.textContent = '生成前审查';
    button.style.cssText = 'margin:8px 0;padding:7px 12px;border:1px solid #7793b8;border-radius:6px;background:#253e60;color:#fff;cursor:pointer';
    const tip = document.createElement('span'); tip.id = 'nest-prompt-limit-tip'; tip.style.cssText = 'display:block;margin:0 0 8px;color:#ff8b95;font-size:12px';
    const updateLimitTip = () => {
      const maxLength = Number(editor.getAttribute('maxlength') || editor.maxLength || 0);
      if (!editor.value.trim()) { tip.textContent = ''; return; }
      try {
        const chunks = maxLength > 0 ? core.splitPrompt({ prompt: editor.value, maxLength }, maxLength) : [editor.value];
        tip.textContent = chunks.length > 1 ? `提示词超出当前上限 ${editor.value.length - maxLength} 字，请点“生成前审查”按完整镜头拆分为 ${chunks.length} 段。` : '';
      } catch (error) { tip.textContent = error.message; }
    };
    button.onclick = openReview; editor.insertAdjacentElement('afterend', button); button.insertAdjacentElement('afterend', tip);
    editor.addEventListener('input', updateLimitTip); editor.addEventListener('change', updateLimitTip); updateLimitTip();
  }
  new MutationObserver(inject).observe(document.documentElement, { subtree: true, childList: true }); inject();
})();

