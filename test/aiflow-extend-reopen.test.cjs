const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const page = fs.readFileSync(path.join(__dirname, '..', 'browser-extension', 'aiflow-page.js'), 'utf8');
const slice = (start, end) => page.slice(page.indexOf(start), page.indexOf(end));

// 关掉一次延长窗口后再点「延长」，要重新弹出小旺仔延长工作台，而不是停在 AI Flow 原窗口。
function loadHelpers() {
  class FakeElement {
    constructor({ display = 'block', visibility = 'visible', parent = null, rects = 1, connected = true, text = '' } = {}) {
      Object.assign(this, { display, visibility, parentElement: parent, rects, connected, textContent: text });
    }
    get isConnected() { return this.connected; }
    getClientRects() { return { length: this.rects }; }
  }
  const documentElement = new FakeElement();
  const sandbox = {
    HTMLElement: FakeElement,
    getComputedStyle: node => ({ display: node.display, visibility: node.visibility }),
    document: { documentElement, body: null, textareas: [], querySelectorAll() { return this.textareas; } },
  };
  vm.createContext(sandbox);
  const source = [
    slice('  function isVideoExtendPrompt(editor)', '  function referenceAssetKey(asset)'),
  ].join('\n');
  vm.runInContext(`${source}\nglobalThis.__t = { isVideoExtendDialogShown, currentVideoExtendEditor };`, sandbox);
  const make = (options = {}) => new FakeElement({ parent: documentElement, ...options });
  const extendDialog = (options = {}) => {
    const dialog = make({ text: '延长秒数 提交延长', ...options });
    const editor = new FakeElement({ parent: dialog });
    return { dialog, editor };
  };
  return { api: sandbox.__t, sandbox, make, extendDialog };
}

test('a hidden or removed extend window counts as closed', () => {
  const { api, make, extendDialog } = loadHelpers();
  assert.equal(api.isVideoExtendDialogShown(extendDialog().dialog), true);
  assert.equal(api.isVideoExtendDialogShown(extendDialog({ display: 'none' }).dialog), false);
  assert.equal(api.isVideoExtendDialogShown(extendDialog({ connected: false }).dialog), false);
  const hiddenModal = make({ visibility: 'hidden' });
  const inner = make({ parent: hiddenModal, text: '延长秒数 提交延长' });
  assert.equal(api.isVideoExtendDialogShown(inner), false, '外层弹窗藏起来时，里面的延长内容也算关闭');
  assert.equal(api.isVideoExtendDialogShown(extendDialog({ rects: 0 }).dialog), false);
});

test('the currently shown extend window wins over an old hidden one', () => {
  const { api, sandbox, extendDialog } = loadHelpers();
  const old = extendDialog({ display: 'none' });
  const fresh = extendDialog();
  sandbox.document.textareas = [old.editor, fresh.editor];
  assert.equal(api.currentVideoExtendEditor(), fresh.editor);
  sandbox.document.textareas = [old.editor];
  assert.equal(api.currentVideoExtendEditor(), old.editor, '只剩藏起来的窗口时仍能找到它，用来做清理');
});

test('closing, submitting or using the native window never leaves the workbench switched off', () => {
  const inject = slice('  function injectVideoExtendWorkbench()', '    const seconds = dialog.querySelector');
  assert.match(inject, /if \(videoExtendSubmitting\) return;/);
  assert.match(inject, /!isVideoExtendDialogShown\(dialog\)/);
  assert.match(inject, /delete dialog\.dataset\.nestWorkbenchDisabled/, '窗口关掉后清除「用原窗口」的选择');
  assert.match(inject, /videoExtendWorkbenchDialogs\.get\(existing\) !== dialog/, '旧窗口留下的工作台要重建');
  assert.match(page, /videoExtendWorkbenchDialogs\.set\(workbench, dialog\)/);

  const resume = slice('  function resumeAfterVideoExtendDialogCloses', '  function referenceAssetKey');
  assert.match(resume, /pageMutationObserver\?\.observe\(document\.documentElement, PAGE_OBSERVER_OPTIONS\)/);
  assert.match(resume, /injectVideoExtendWorkbench\(\)/);

  const submit = slice("workbench.querySelector('[data-nest-workbench-submit]')", "workbench.querySelector('[data-nest-workbench-close]')");
  assert.match(submit, /videoExtendSubmitting = true/);
  assert.match(submit, /resumeAfterVideoExtendDialogCloses\(dialog, \(\) => \{ videoExtendSubmitting = false; \}\)/);

  const native = slice("workbench.querySelector('[data-nest-workbench-native]')", 'const nestWorkbenchDrag');
  assert.match(native, /resumeAfterVideoExtendDialogCloses\(dialog, \(\) => \{\s*delete dialog\.dataset\.nestWorkbenchDisabled;/);

  const click = slice("document.addEventListener('click', event => {", "document.addEventListener('contextmenu'");
  assert.match(click, /setTimeout\(injectVideoExtendWorkbench, 80\)/);
  assert.match(click, /\/\^\(重制\|延长\)\$\/\.test\(actionText\)/, '点「重制」「延长」后多查到 2 秒');
  assert.match(click, /\[800, 1300, 2000\]/);
});
