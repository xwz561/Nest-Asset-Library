'use strict';
/*
 * 桌宠右键菜单：每个桌宠一套各自的菜单（名称、动作、顺序、提示语都不同）。
 *
 * 每一项：
 *   - kind 'feed'      → 投喂本地文件或文件夹
 *   - kind 'action'    → perform(action)：sleep / walk / leash-walk / animals / interact
 *   - kind 'emote'     → perform('emote', {emote, duration})：由桌宠窗口按当前角色播放专属动作
 * 最后一项固定是“自主活动”开关，但名称跟角色走。
 */

const PET_MENUS = {
  'maid-deepseek-whale': {
    title: '蓝发鲸鱼女仆',
    items: [
      { label: '端上点心（投喂文件或文件夹…）', kind: 'feed' },
      { label: '行礼问候', kind: 'emote', emote: 'curtsy', duration: 4200 },
      { label: '召唤海洋伙伴', kind: 'action', action: 'animals' },
      { label: '巡视房间', kind: 'action', action: 'walk' },
      { label: '牵小猫去散步', kind: 'action', action: 'leash-walk' },
      { label: '小憩片刻', kind: 'action', action: 'sleep' },
      { label: '摸摸头', kind: 'action', action: 'interact' },
    ],
    autonomy: { on: '暂停女仆值班', off: '恢复女仆值班' },
  },
  'silver-kitten': {
    title: '银渐层小猫',
    items: [
      { label: '开个小鱼罐头（投喂文件或文件夹…）', kind: 'feed' },
      { label: '舔爪洗脸', kind: 'emote', emote: 'groom', duration: 3400 },
      { label: '伸个懒腰', kind: 'emote', emote: 'stretch', duration: 3000 },
      { label: '扑一下', kind: 'emote', emote: 'pounce', duration: 3000 },
      { label: '喵一声', kind: 'emote', emote: 'meow', duration: 3200 },
      { label: '要抱抱', kind: 'emote', emote: 'beg', duration: 3600 },
      { label: '趴下打盹', kind: 'action', action: 'sleep' },
      { label: '巡逻一圈', kind: 'action', action: 'walk' },
      { label: '跟女仆出门散步', kind: 'action', action: 'leash-walk' },
    ],
    autonomy: { on: '让它安静趴着', off: '让它自己玩' },
  },
  'liu-hai-buddy': {
    title: '刘海小伙伴',
    items: [
      { label: '塞点零食（投喂文件或文件夹…）', kind: 'feed' },
      { label: '挥手打招呼', kind: 'emote', emote: 'wave', duration: 3000 },
      { label: '蹦一蹦', kind: 'emote', emote: 'jump', duration: 2600 },
      { label: '跑一圈', kind: 'action', action: 'walk' },
      { label: '刷会儿手机', kind: 'emote', emote: 'phone', duration: 5200 },
      { label: '睡一会儿', kind: 'action', action: 'sleep' },
      { label: '戳一戳', kind: 'action', action: 'interact' },
    ],
    autonomy: { on: '别乱跑了', off: '放它自由活动' },
  },
  'glasses-buddy': {
    title: '眼镜小伙伴',
    items: [
      { label: '递杯咖啡（投喂文件或文件夹…）', kind: 'feed' },
      { label: '推推眼镜', kind: 'emote', emote: 'push-glasses', duration: 3000 },
      { label: '认真读书', kind: 'emote', emote: 'read', duration: 6200 },
      { label: '散步思考', kind: 'action', action: 'walk' },
      { label: '小睡片刻', kind: 'action', action: 'sleep' },
      { label: '拍拍肩膀', kind: 'action', action: 'interact' },
    ],
    autonomy: { on: '进入专注模式（暂停活动）', off: '结束专注模式' },
  },
};

const DEFAULT_PET_ID = 'maid-deepseek-whale';

/** 返回 Electron Menu.buildFromTemplate 可用的模板。 */
function petMenuTemplate(petId, { settings, feed, perform } = {}) {
  const spec = PET_MENUS[petId] || PET_MENUS[DEFAULT_PET_ID];
  // 饿晕（饥饿值为 0）时除了投喂，其它动作都不会执行：把它们置灰，并在最上面说明原因，避免“点了没反应”。
  const starving = !!settings && Number(settings.hunger) <= 0;
  const off = starving ? { enabled: false } : {};
  const template = spec.items.map((item) => {
    if (item.kind === 'feed') return { label: item.label, click: () => feed && feed() };
    if (item.kind === 'emote') return { label: item.label, ...off, click: () => perform && perform('emote', { emote: item.emote, duration: item.duration }) };
    return { label: item.label, ...off, click: () => perform && perform(item.action) };
  });
  if (starving) template.unshift({ label: '它饿晕了，先投喂才能活动', enabled: false }, { type: 'separator' });
  template.push({ type: 'separator' });
  const on = !settings || settings.autonomyEnabled !== false;
  template.push({ label: on ? spec.autonomy.on : spec.autonomy.off, click: () => perform && perform('toggle-autonomy') });
  return template;
}

module.exports = { PET_MENUS, petMenuTemplate };
