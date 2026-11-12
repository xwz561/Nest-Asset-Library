const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const page = fs.readFileSync(path.join(__dirname, '..', 'browser-extension', 'aiflow-page.js'), 'utf8');
const clickStart = "document.addEventListener('click', event => {";
const clickEnd = '}, true);';

function loadClickHandler() {
  const start = page.indexOf(clickStart);
  const end = page.indexOf(clickEnd, start);
  assert.notEqual(start, -1, 'page click listener exists');
  assert.notEqual(end, -1, 'page click listener is complete');
  const body = page.slice(start + clickStart.length, end);
  const scheduled = [];
  class FakeElement {
    constructor({ textContent = '', dataset = {}, matches = {} } = {}) {
      this.textContent = textContent;
      this.dataset = dataset;
      this.matches = matches;
    }
    closest(selector) { return this.matches[selector] || null; }
    getAttribute() { return ''; }
  }
  const sandbox = {
    AI_FLOW_DOM: null,
    Element: FakeElement,
    document: {},
    injectVideoExtendWorkbench() {},
    lastVideoExtendTaskId: '',
    setTimeout(_callback, delay) { scheduled.push(delay); return scheduled.length; },
  };
  vm.createContext(sandbox);
  vm.runInContext(`globalThis.__handleClick = event => {${body}\n};`, sandbox);
  return { handleClick: sandbox.__handleClick, scheduled, FakeElement };
}

test('blank page clicks do not enqueue expensive extend-workbench DOM scans', () => {
  const { handleClick, scheduled, FakeElement } = loadClickHandler();
  for (let click = 0; click < 5; click += 1) handleClick({ target: new FakeElement() });
  assert.deepEqual(scheduled, []);
});

test('AI Flow rebuild actions still schedule the late workbench checks', () => {
  const { handleClick, scheduled, FakeElement } = loadClickHandler();
  const rebuildButton = new FakeElement({ textContent: '重制' });
  const target = new FakeElement({ matches: { 'button, [role="button"]': rebuildButton } });
  handleClick({ target });
  assert.deepEqual(scheduled, [80, 400, 800, 1300, 2000]);
});

test('clicks inside the extension workbench do not rescan the AI Flow page', () => {
  const { handleClick, scheduled, FakeElement } = loadClickHandler();
  const workbench = new FakeElement();
  const target = new FakeElement({ matches: { '[id^="nest-aiflow-"]': workbench } });
  handleClick({ target });
  assert.deepEqual(scheduled, []);
});

test('clicks in the native AI Flow dialog still check whether it closed', () => {
  const { handleClick, scheduled, FakeElement } = loadClickHandler();
  const dialog = new FakeElement();
  const target = new FakeElement({ matches: { '[role="dialog"], [aria-modal="true"], [class*="modal"], [class*="dialog"]': dialog } });
  handleClick({ target });
  assert.deepEqual(scheduled, [80, 400]);
});
