const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PET_MENUS, petMenuTemplate } = require('../electron/pet-menus.cjs');

const PETS = ['maid-deepseek-whale', 'silver-kitten', 'liu-hai-buddy', 'glasses-buddy'];
const labelsOf = (id, settings) => petMenuTemplate(id, { settings }).filter((i) => i.label).map((i) => i.label);

test('四个桌宠各有一套完全不同的右键菜单', () => {
  const sets = PETS.map((id) => labelsOf(id, { autonomyEnabled: true }));
  for (const labels of sets) assert.ok(labels.length >= 6);
  const all = sets.flat();
  assert.equal(new Set(all).size, all.length, '任意两个桌宠之间不应有相同的菜单文字');
  // 自主活动开关的文字也随角色变化，并随状态切换
  for (const id of PETS) {
    assert.notEqual(labelsOf(id, { autonomyEnabled: true }).at(-1), labelsOf(id, { autonomyEnabled: false }).at(-1));
  }
});

test('菜单项会触发正确的动作；未知桌宠回退到默认角色', () => {
  const calls = []; let fed = 0;
  const t = petMenuTemplate('silver-kitten', { settings: {}, feed: () => { fed++; }, perform: (a, x) => calls.push([a, x && x.emote]) });
  t.filter((i) => i.click).forEach((i) => i.click());
  assert.equal(fed, 1);
  const emotes = calls.filter(([a]) => a === 'emote').map(([, e]) => e);
  assert.deepEqual(emotes, ['groom', 'stretch', 'pounce', 'meow', 'beg']);
  assert.ok(calls.some(([a]) => a === 'sleep') && calls.some(([a]) => a === 'walk') && calls.some(([a]) => a === 'toggle-autonomy'));
  assert.deepEqual(labelsOf('nope', {}), labelsOf('maid-deepseek-whale', {}));
});

test('菜单里用到的每个 emote，桌宠窗口都有对应的动作与提示语', () => {
  const src = fs.readFileSync(path.join(__dirname, '../electron/pet-window.js'), 'utf8');
  const block = src.slice(src.indexOf('const EMOTES='), src.indexOf('const playEmote='));
  assert.ok(block.length > 50);
  for (const id of PETS) for (const item of PET_MENUS[id].items) {
    if (item.kind !== 'emote') continue;
    assert.ok(new RegExp(`(^|[\\s,{'"])'?${item.emote.replace('-', '\\-')}'?:\\{`).test(block), `缺少 emote：${item.emote}`);
  }
  assert.ok(/action==='emote'/.test(src));
});

test('小猫的专属动作都能由动画引擎播放并回到待机', () => {
  const vm = require('node:vm');
  const sandbox = { module: { exports: {} }, Math, Number, Array, Object, console };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../electron/pet-kitten.js'), 'utf8'), sandbox);
  const KM = sandbox.module.exports;
  for (const name of ['groom', 'stretch', 'pounce', 'meow', 'beg']) {
    const c = KM.createController({ random: () => 0.5 });
    c.update(0); c.emote(name);
    assert.equal(c.state.mode, 'action', name);
    for (let t = 16; t < 6000; t += 16) c.update(t);
    assert.equal(c.state.mode, 'idle', name);
    assert.equal(c.state.cur.join(','), '0,0', name);
  }
});

test('饿晕时：只有投喂和自主活动开关可点，其余置灰并说明原因', () => {
  for (const id of PETS) {
    const t = petMenuTemplate(id, { settings: { hunger: 0, autonomyEnabled: true } });
    assert.match(t[0].label, /饿晕/);
    assert.equal(t[0].enabled, false);
    const items = t.filter((i) => i.label && i.click);
    assert.equal(items[0].enabled, undefined, '投喂必须可点');
    const rest = items.slice(1, -1);
    assert.ok(rest.length >= 5 && rest.every((i) => i.enabled === false));
    assert.equal(items.at(-1).enabled, undefined, '自主活动开关必须可点');
  }
  const fed = petMenuTemplate('silver-kitten', { settings: { hunger: 6 } });
  assert.ok(fed.every((i) => i.enabled !== false) && !fed.some((i) => /饿晕/.test(i.label || '')));
});
