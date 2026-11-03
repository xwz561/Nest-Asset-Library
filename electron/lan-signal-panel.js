const $ = id => document.getElementById(id);
let wheelEmotes = [], wheelEmoteSignature = '';
const signatureForEmotes = items => JSON.stringify((items || []).map(({ type, id, emoji, name }) => ({ type, id, emoji, name })));
function avatar(profile) { const node = document.createElement('i'); node.className = 'avatar'; if (profile.avatar) { const image = document.createElement('img'); image.src = profile.avatar; image.alt = ''; node.append(image); } else node.textContent = (profile.name || '用').slice(0, 1).toUpperCase(); return node; }
function peerRow(profile, local = false) {
  const row = document.createElement(local ? 'div' : 'button'); row.className = 'peer' + (local ? ' local' : '');
  const label = document.createElement('span'); label.textContent = profile.name || '素材库用户'; row.append(avatar(profile), label);
  const badge = document.createElement('small');
  if (local) { badge.textContent = '本机'; row.append(badge); }
  else {
    row.type = 'button'; row.disabled = !profile.canChat; row.setAttribute('aria-label', `与${profile.name}聊天`);
    if (!profile.canChat) { badge.textContent = '需更新素材库'; row.append(badge); }
    else if (profile.unread) { badge.textContent = profile.unread > 99 ? '99+' : profile.unread; badge.className = 'unread'; row.append(badge); }
    else { badge.textContent = '聊天 ›'; row.append(badge); }
    row.addEventListener('click', async () => { const result = await window.lanSignalPanel.openChat(profile.id); $('chatResult').textContent = result?.error || ''; });
  }
  return row;
}
function render(value) {
  if (!value) return;
  const nextSignature = signatureForEmotes(value.wheelEmotes);
  if (nextSignature !== wheelEmoteSignature) { wheelEmoteSignature = nextSignature; window.lanSignalPanel.getWheelEmotes().then(renderWheelEmotes); }
  if (document.activeElement !== $('nickname')) $('nickname').value = value.name || '';
  $('accountId').value = value.accountId || '';
  const isAdmin = value.isAdmin === true;
  $('adminBadge').hidden = !isAdmin;
  const ownAvatar = avatar(value); ownAvatar.id = 'myAvatar'; $('myAvatar').replaceWith(ownAvatar);
  const enabled = value.shortcutEnabled !== false;
  $('shortcutToggle').checked = enabled; $('shortcutToggle').setAttribute('aria-checked', String(enabled));
  $('shortcutStatus').textContent = enabled ? '快捷键已开启' : '快捷键已关闭';
  $('shortcutDescription').textContent = enabled ? '按住 Alt 打开信号轮盘，按住 Ctrl 打开表情轮盘；移动选择，松开发送。' : '已关闭：按住 Alt 或 Ctrl 不会显示轮盘，也不会发送；接收信号不受影响。';
  const hidden = !isAdmin && value.hideEmotesOnThisDevice === true;
  $('hideEmoteToggle').disabled = isAdmin;
  $('hideEmoteToggle').checked = hidden; $('hideEmoteToggle').setAttribute('aria-checked', String(hidden));
  $('hideEmoteStatus').textContent = isAdmin ? '管理员模式：始终显示表情' : hidden ? '已隐藏普通好友的表情' : '本机显示表情';
  $('hideEmoteDescription').textContent = isAdmin ? '此账户 ID 有管理员权限，忽略本机隐藏开关，始终显示表情。' : hidden ? '本机隐藏普通好友的表情；管理员账户发出的表情仍会显示。' : '普通表情会显示在本机；开启隐藏后，管理员账户发出的表情仍会显示。';
  const online = value.status === 'online'; $('dot').className = 'dot' + (online ? ' online' : ''); $('state').textContent = online ? '已加入局域网房间' : '连接不可用';
  $('count').textContent = ((online ? 1 : 0) + value.peers.length) + ' 台在线电脑';
  $('peers').replaceChildren(); if (online) $('peers').append(peerRow(value, true)); for (const peer of value.peers) $('peers').append(peerRow(peer));
  if (!online && !value.peers.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = '请检查网络连接或 Windows 防火墙设置。'; $('peers').append(empty); }
  if (value.chatError) $('chatResult').textContent = value.chatError;
}
function renderWheelEmotes(items) {
  if (!Array.isArray(items)) return;
  wheelEmotes = items; wheelEmoteSignature = signatureForEmotes(items); const list = $('wheelEmotes'); list.replaceChildren();
  for (let index = 0; index < items.length; index++) {
    const item = items[index], row = document.createElement('div'); row.className = 'wheel-emote';
    const preview = document.createElement('div'); preview.className = 'wheel-emote-preview';
    if (item.type === 'image' && typeof item.preview === 'string' && item.preview.startsWith('data:image/png;base64,')) { const image = document.createElement('img'); image.src = item.preview; image.alt = ''; preview.append(image); }
    else preview.textContent = item.emoji || '🖼️';
    const name = document.createElement('span'); name.className = 'wheel-emote-name'; name.textContent = item.type === 'image' ? (item.name || '本地图片') : item.emoji; row.append(preview, name);
    const actions = document.createElement('div'); actions.className = 'wheel-emote-actions';
    for (const [label, delta, disabled] of [['↑', -1, index === 0], ['↓', 1, index === items.length - 1]]) { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.title = delta < 0 ? '上移' : '下移'; button.setAttribute('aria-label', `${button.title}${name.textContent}`); button.disabled = disabled; button.addEventListener('click', () => moveWheelEmote(index, delta)); actions.append(button); }
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '删除'; remove.disabled = items.length <= 1; remove.setAttribute('aria-label', `删除${name.textContent}`); remove.addEventListener('click', () => saveWheelEmotes(items.filter((_, itemIndex) => itemIndex !== index))); actions.append(remove); row.append(actions); list.append(row);
  }
  $('addWheelEmoji').disabled = items.length >= 8; $('addWheelImage').disabled = items.length >= 8;
}
async function saveWheelEmotes(items) {
  $('wheelEmoteResult').textContent = '正在保存…'; $('addWheelEmoji').disabled = $('addWheelImage').disabled = true;
  try { const result = await window.lanSignalPanel.setWheelEmotes(items); if (result?.ok) { renderWheelEmotes(result.emotes); $('wheelEmoteResult').textContent = '轮盘表情已保存'; } else { $('wheelEmoteResult').textContent = result?.error || '保存失败'; } }
  finally { $('addWheelEmoji').disabled = $('addWheelImage').disabled = wheelEmotes.length >= 8; }
}
function moveWheelEmote(index, delta) { const next = [...wheelEmotes], target = index + delta; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; saveWheelEmotes(next); }
async function addWheelEmoji() { const emoji = $('newWheelEmoji').value.trim(); if (!emoji) { $('wheelEmoteResult').textContent = '请输入一个 emoji'; return; } await saveWheelEmotes([...wheelEmotes.map(({ type, id, emoji: value, name }) => type === 'image' ? { type, id, name } : { type, emoji: value }), { type: 'emoji', emoji }]); if ($('wheelEmoteResult').textContent === '轮盘表情已保存') $('newWheelEmoji').value = ''; }
async function addWheelImage() { $('wheelEmoteResult').textContent = '正在打开图片选择器…'; $('addWheelImage').disabled = true; try { const result = await window.lanSignalPanel.addWheelImage(); if (result?.ok) { renderWheelEmotes(result.emotes); $('wheelEmoteResult').textContent = '图片已添加；在线电脑会在收到该表情时自动获取图片'; } else if (result?.canceled) $('wheelEmoteResult').textContent = ''; else $('wheelEmoteResult').textContent = result?.error || '添加图片失败'; } finally { $('addWheelImage').disabled = wheelEmotes.length >= 8; } }
async function saveNickname() { const result = await window.lanSignalPanel.setName($('nickname').value); $('saveResult').textContent = result?.ok ? '昵称已更新，已通知局域网其他电脑' : result?.error || '昵称保存失败'; }
$('saveName').addEventListener('click', saveNickname); $('nickname').addEventListener('keydown', event => { if (event.key === 'Enter') saveNickname(); });
$('copyAccountId').addEventListener('click', async () => { const button = $('copyAccountId'); button.disabled = true; $('accountIdResult').textContent = '正在复制…'; try { const result = await window.lanSignalPanel.copyAccountId(); $('accountIdResult').textContent = result?.ok ? '账户 ID 已复制' : result?.error || '复制失败'; } finally { button.disabled = false; } });
async function changeAvatar(reset) {
  $('chooseAvatar').disabled = $('resetAvatar').disabled = true;
  try { const result = await (reset ? window.lanSignalPanel.resetAvatar() : window.lanSignalPanel.chooseAvatar()); $('avatarResult').textContent = result?.error || (result?.ok ? '头像已更新，正在同步给在线好友' : ''); }
  finally { $('chooseAvatar').disabled = $('resetAvatar').disabled = false; }
}
$('chooseAvatar').addEventListener('click', () => changeAvatar(false)); $('resetAvatar').addEventListener('click', () => changeAvatar(true));
$('openChats').addEventListener('click', async () => { const result = await window.lanSignalPanel.openChat(); $('chatResult').textContent = result?.error || ''; });
$('addWheelEmoji').addEventListener('click', addWheelEmoji); $('newWheelEmoji').addEventListener('keydown', event => { if (event.key === 'Enter') addWheelEmoji(); }); $('addWheelImage').addEventListener('click', addWheelImage);
for (const [id, api, resultId] of [['shortcutToggle', 'setShortcutEnabled', 'shortcutResult'], ['hideEmoteToggle', 'setHideEmotes', 'hideEmoteResult']]) {
  $(id).addEventListener('change', async () => { const enabled = $(id).checked; $(id).disabled = true; $(resultId).textContent = '正在保存…'; try { const result = await window.lanSignalPanel[api](enabled); $(resultId).textContent = result?.ok ? '设置已保存' : result?.error || '保存失败'; await window.lanSignalPanel.getState().then(render); } finally { $(id).disabled = false; } });
}
window.lanSignalPanel.getState().then(render); window.lanSignalPanel.onState(render);
