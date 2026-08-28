import fs from 'node:fs';
import path from 'node:path';
import { buildFolderRows, toggleExpandedFolder } from '../src/folder-tree.js';
import { createAudioPreviewManager } from '../src/audio-preview-manager.js';

const seed = Number(process.argv[2] || 27082026) >>> 0;
const actionCount = Number(process.argv[3] || 50000);
const output = path.resolve(process.argv[4] || `qa-round2-monkey-${seed}-${actionCount}.json`);
let randomState = seed;
const random = () => {
  randomState = (randomState + 0x6d2b79f5) >>> 0;
  let value = randomState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};

const folders = Array.from({ length: 100 }, (_, index) => ({
  id: `folder-${String(index + 1).padStart(3, '0')}`,
  parentId: index === 0 || index >= 12 ? null : `folder-${String(index).padStart(3, '0')}`,
}));
let expanded = new Set();
const folderActions = [];
for (let index = 0; index < 5000; index += 1) {
  const target = folders[Math.floor(random() * folders.length)].id;
  const before = expanded;
  expanded = toggleExpandedFolder(expanded, target);
  const changed = [...new Set([...before, ...expanded])].filter(id => before.has(id) !== expanded.has(id));
  if (changed.length !== 1 || changed[0] !== target) throw new Error(`Non-local toggle at ${index}: ${changed}`);
  folderActions.push(target);
}
const visibleRows = buildFolderRows(folders, expanded);

class FakeAudio {
  constructor() { this.src = ''; this.currentTime = 0; this.duration = 10; this.paused = true; this.listeners = new Map(); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}
let scheduled;
let audioInstances = 0;
const audio = new FakeAudio();
const manager = createAudioPreviewManager({
  createAudio: () => { audioInstances += 1; return audio; },
  setTimer: callback => { scheduled = callback; return 1; },
  clearTimer: () => { scheduled = undefined; },
});
for (let index = 0; index < 100; index += 1) {
  manager.hover({ id: `audio-${index}`, url: `audio-${index}.wav` });
  scheduled?.();
  if (manager.getState().id !== `audio-${index}`) throw new Error(`Wrong hover audio at ${index}`);
  manager.leave(`audio-${index}`);
}
if (audioInstances !== 1) throw new Error(`Expected one Audio instance, got ${audioInstances}`);

const actions = new Array(actionCount);
const state = { folder: null, asset: null, query: '', filter: 'all', inspector: false, menu: false, selection: new Set() };
const names = ['folder', 'asset', 'search', 'filter', 'inspector', 'menu', 'select', 'escape'];
const startMemory = process.memoryUsage();
for (let index = 0; index < actionCount; index += 1) {
  const action = names[Math.floor(random() * names.length)];
  const value = Math.floor(random() * 100);
  actions[index] = [action, value];
  if (action === 'folder') state.folder = `folder-${value}`;
  else if (action === 'asset') state.asset = `asset-${value}`;
  else if (action === 'search') state.query = `q${value}`;
  else if (action === 'filter') state.filter = `f${value % 5}`;
  else if (action === 'inspector') state.inspector = !state.inspector;
  else if (action === 'menu') state.menu = !state.menu;
  else if (action === 'select') state.selection.has(value) ? state.selection.delete(value) : state.selection.add(value);
  else { state.inspector = false; state.menu = false; state.selection.clear(); }
}
const endMemory = process.memoryUsage();
const report = {
  seed,
  actionCount,
  folderToggleCount: folderActions.length,
  folderCount: folders.length,
  maximumDepth: 12,
  visibleRows: visibleRows.length,
  audioHoverCount: 100,
  audioInstances,
  memory: { start: startMemory, end: endMemory, rssDelta: endMemory.rss - startMemory.rss },
  finalState: { ...state, selection: [...state.selection] },
  folderActions,
  actions,
};
fs.writeFileSync(output, `${JSON.stringify(report)}\n`);
console.log(JSON.stringify({ output, seed, actionCount, folderToggleCount: 5000, audioInstances, rssDelta: report.memory.rssDelta }));
