const api = window.lanPeerChat;
const $ = id => document.getElementById(id);
const CHAT_EMOJIS = ['😀', '😃', '😄', '😁', '😆', '😂', '🤣', '😊', '😍', '🥰', '😘', '😎', '🤔', '😮', '😭', '😡', '🥳', '😴', '👍', '👎', '👏', '🙏', '❤️', '💔', '🔥', '✨', '🎉', '💯', '👀', '🤝', '🐱', '🐶'];
let state = { peers: [], messages: [], transfers: [], outbox: [] }, activePeer = null, avatarPeerId = null, messageKey = '', sending = false, sendingFiles = false, renderedMessages = '', reading = false;
const transfers = new Map();
function element(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function avatar(profile) { const node = element('div', '', 'avatar'); if (profile?.avatar) { const image = element('img'); image.src = profile.avatar; image.alt = ''; node.append(image); } else node.textContent = (profile?.name || '用').slice(0, 1).toUpperCase(); return node; }
function viewableAvatar(profile, peerId) { const node = avatar(profile); if (!profile?.avatar) return node; node.classList.add('can-preview'); node.setAttribute('role', 'button'); node.setAttribute('tabindex', '0'); node.setAttribute('aria-label', `放大查看${profile.name || '好友'}头像`); node.title = '点击放大查看头像'; const open = event => { event?.stopPropagation(); $('avatarPreviewName').textContent = `${profile.name || '好友'}的头像`; $('avatarPreviewImage').src = profile.avatar; avatarPeerId = peerId; $('avatarPreview').showModal(); }; node.addEventListener('click', open); node.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(event); } }); return node; }
function notice(text, error = false) { $('notice').textContent = text || ''; $('notice').className = error ? 'error' : ''; }
function size(bytes) { if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'; if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'; return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB'; }
async function act(fn) { try { const result = await fn(); if (result?.error) throw new Error(result.error); return result; } catch (error) { notice(error.message, true); } }
function selectPeer(id) { if (activePeer !== id) { activePeer = id; messageKey = ''; $('text').value = ''; renderedMessages = ''; $('emojiPicker').hidden = true; $('emojiToggle').setAttribute('aria-expanded', 'false'); notice(''); } render(); $('text').focus(); }
function markRead() { if (reading || !document.hasFocus() || !activePeer || !state.peers.find(peer => peer.id === activePeer)?.unread) return; reading = true; api.read({ peerId: activePeer }).finally(() => { reading = false; }); }
function render() {
  const friend = state.peers.find(peer => peer.id === activePeer);
  $('serviceStatus').textContent = state.ready ? '局域网直连' : state.error || '正在启动…';
  $('peerName').textContent = friend?.name || '选择好友'; $('peerStatus').textContent = friend ? (friend.online ? friend.canChat ? '在线 · 可以发送消息和文件' : '在线 · 消息和文件会排队，需对方更新素材库后发送' : '离线 · 文字和文件可先排队，对方上线后自动发送') : '从左侧选择要聊天的电脑';
  const currentAvatar = viewableAvatar(friend, friend?.id); currentAvatar.id = 'peerAvatar'; $('peerAvatar').replaceWith(currentAvatar);
  $('friends').replaceChildren();
  for (const peer of state.peers) {
    const button = element('button', '', 'friend' + (peer.id === activePeer ? ' active' : '')); button.type = 'button'; button.setAttribute('aria-label', `与${peer.name}聊天`);
    const copy = element('span', undefined, 'friend-copy'); copy.append(element('strong', peer.name), element('small', peer.online ? peer.canChat ? '在线' : '需要更新' : '离线'));
    button.append(viewableAvatar(peer, peer.id), copy); if (peer.unread) button.append(element('b', peer.unread > 99 ? '99+' : peer.unread, 'unread')); button.addEventListener('click', () => selectPeer(peer.id)); $('friends').append(button);
  }
  const messages = state.messages.filter(message => message.from === activePeer || message.to === activePeer);
  const key = JSON.stringify([activePeer, state.name, state.avatar, friend?.name, friend?.avatar, messages.map(message => [message.id, message.read, message.pending, message.deliveryError, message.archiveStatus, message.archiveError, message.archive])]);
  if (key !== renderedMessages) {
    const log = $('messages'), nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 90 || !renderedMessages;
    renderedMessages = key; log.replaceChildren();
    if (!messages.length) log.append(element('div', friend ? '发一条消息开始聊天，或者拖入文件发送。' : '暂无私聊记录', 'empty'));
    for (const message of messages) {
      const mine = message.from === state.id, author = mine ? state : friend;
      const row = element('article', undefined, 'message' + (mine ? ' mine' : ''));
      const content = element('div', undefined, 'message-content'), bubble = element('div', undefined, 'bubble');
      content.append(element('small', `${author?.name || '好友'} · ${new Date(message.time).toLocaleString()}`));
      if (message.text) bubble.append(element('p', message.text));
      if (message.file) {
        const attachment = element('div', undefined, 'attachment'), buttons = element('div'); attachment.append(element('strong', message.file.name), element('small', size(message.file.size)));
        if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(message.file.name) && message.file.size <= 25 * 1024 * 1024) { const preview = element('button', '查看图片'); preview.addEventListener('click', () => act(async () => { const result = await api.preview({ id: message.file.id }); if (result.dataUrl) { $('previewImage').src = result.dataUrl; $('preview').showModal(); } return result; })); buttons.append(preview); }
        const save = element('button', '保存附件'); save.addEventListener('click', async () => { save.disabled = true; const result = await act(() => api.save({ id: message.file.id })); save.disabled = false; if (result?.filePath) notice(`已保存到：${result.filePath}`); }); buttons.append(save);
        if (!mine) {
          attachment.append(element('small', message.archive ? `已加入 ${message.archive.libraryName}：${message.archive.relativePath}` : message.archiveStatus === 'importing' ? '正在加入素材库…' : message.archiveError || '文件保存在聊天缓存'));
          if (!message.archive) { const archive = element('button', message.archiveStatus === 'importing' ? '正在导入…' : '导入当前素材库'); archive.disabled = message.archiveStatus === 'importing'; archive.addEventListener('click', async () => { archive.disabled = true; const result = await act(() => api.archive({ id: message.id })); if (result?.deferred && result.reason) notice(result.reason); archive.disabled = false; }); buttons.append(archive); }
        }
        attachment.append(buttons); bubble.append(attachment);
      }
      content.append(bubble); if (mine) content.append(element('small', message.read ? '已读' : message.pending ? (message.deliveryError ? `发送失败，自动重试：${message.deliveryError}` : '等待送达') : '已发送', `message-receipt${message.deliveryError ? ' delivery-error' : ''}`)); row.append(mine ? avatar(author) : viewableAvatar(author, activePeer), content); log.append(row);
    }
    if (nearBottom) log.scrollTop = log.scrollHeight;
  }
  $('send').disabled = sending || !friend || !$('text').value.trim(); $('files').disabled = sendingFiles || !friend;
  $('emojiToggle').disabled = sending || !friend?.online || !friend.canChat;
  renderTransfers(); markRead();
}
function renderTransfers() {
  $('transfers').replaceChildren();
  const queued = new Set();
  for (const item of state.outbox || []) {
    if (item.peerId !== activePeer) continue;
    queued.add(item.id);
    const active = transfers.get(item.id), friend = state.peers.find(peer => peer.id === item.peerId);
    const percent = active?.total ? Math.min(100, Math.floor(active.loaded / active.total * 100)) : 0;
    const status = active ? `${active.direction === 'queue' ? '正在复制到待发送队列' : '正在发送'} · ${percent}%` : item.lastError ? `等待重试：${item.lastError}` : friend?.online ? friend.canChat ? '等待发送' : '等待对方更新素材库' : '等待好友上线';
    const row = element('div', undefined, 'transfer'), label = element('span', `${item.name} · ${status}`), cancel = element('button', '取消排队');
    row.append(label); cancel.addEventListener('click', () => api.cancel({ id: item.id })); row.append(cancel);
    if (active) { const progress = element('progress'); progress.max = active.total || 1; progress.value = active.loaded || 0; row.append(progress); }
    $('transfers').append(row);
  }
  for (const item of transfers.values()) {
    if (item.peerId !== activePeer || queued.has(item.id)) continue;
    const row = element('div', undefined, 'transfer'), label = element('span', `${item.direction === 'send' ? '发送' : '接收'} ${item.name} · ${Math.min(100, Math.floor(item.loaded / item.total * 100))}%`), progress = element('progress'); progress.max = item.total; progress.value = item.loaded;
    row.append(label);
    if (item.direction === 'send') { const cancel = element('button', '取消'); cancel.addEventListener('click', () => api.cancel({ id: item.id })); row.append(cancel); }
    row.append(progress); $('transfers').append(row);
  }
}
function update(value) { state = value; if (activePeer && value.peerAliases?.[activePeer]) activePeer = value.peerAliases[activePeer]; if (!activePeer) activePeer = value.activePeer || value.peers?.find(peer => peer.online)?.id; render(); }
async function send() {
  if (sending || !activePeer || !$('text').value.trim()) return;
  const peerId = activePeer, text = $('text').value; messageKey ||= crypto.randomUUID(); sending = true; render(); notice('');
  const result = await act(() => api.send({ peerId, text, id: messageKey })); sending = false;
  if (result?.ok && activePeer === peerId && $('text').value === text) { $('text').value = ''; messageKey = ''; }
  if (result?.queued) notice('消息已加入待发送队列，对方上线后自动发送');
  render();
}
async function sendEmoji(emoji) {
  if (sending || !activePeer) return;
  const friend = state.peers.find(peer => peer.id === activePeer);
  if (!friend?.online || !friend.canChat) return;
  const peerId = activePeer; $('emojiPicker').hidden = true; $('emojiToggle').setAttribute('aria-expanded', 'false'); sending = true; render(); notice('');
  await act(() => api.send({ peerId, text: emoji, id: crypto.randomUUID() })); sending = false; render();
}
for (const emoji of CHAT_EMOJIS) { const button = element('button', emoji); button.type = 'button'; button.setAttribute('role', 'gridcell'); button.setAttribute('aria-label', emoji); button.title = emoji; button.addEventListener('click', () => sendEmoji(emoji)); $('emojiPicker').append(button); }
async function files(fn) { if (sendingFiles) return; sendingFiles = true; render(); notice(''); const result = await act(fn); sendingFiles = false; if (result?.sent || result?.queued) notice([result.sent ? `已发送 ${result.sent} 个文件` : '', result.queued ? `${result.queued} 个文件已排队，对方上线后自动发送` : ''].filter(Boolean).join('；')); render(); }
$('text').addEventListener('input', () => { messageKey = ''; render(); });
$('text').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } if (event.key === 'Escape') { $('emojiPicker').hidden = true; $('emojiToggle').setAttribute('aria-expanded', 'false'); } });
$('emojiToggle').addEventListener('click', () => { const open = $('emojiPicker').hidden; $('emojiPicker').hidden = !open; $('emojiToggle').setAttribute('aria-expanded', String(open)); });
document.addEventListener('pointerdown', event => { if (!$('emojiPicker').hidden && !event.target.closest('.composer-input')) { $('emojiPicker').hidden = true; $('emojiToggle').setAttribute('aria-expanded', 'false'); } });
$('send').addEventListener('click', send); $('files').addEventListener('click', () => files(() => api.files({ peerId: activePeer })));
 $('conversation').addEventListener('dragover', event => { if (!Array.from(event.dataTransfer.types).includes('Files')) return; event.preventDefault(); if (activePeer && !sendingFiles) $('dropHint').hidden = false; });
$('conversation').addEventListener('dragleave', event => { if (!event.currentTarget.contains(event.relatedTarget)) $('dropHint').hidden = true; });
$('conversation').addEventListener('drop', event => {
  event.preventDefault(); $('dropHint').hidden = true;
  const droppedFiles = Array.from(event.dataTransfer?.files || []);
  if (!droppedFiles.length) return;
  if (!activePeer) { notice('请先选择要发送给哪位好友', true); return; }
  files(() => api.drop(droppedFiles, activePeer));
});
$('closePreview').addEventListener('click', () => $('preview').close());
$('closeAvatarPreview').addEventListener('click', () => $('avatarPreview').close());
$('saveAvatar').addEventListener('click', async () => { if (!avatarPeerId) return; const button = $('saveAvatar'); button.disabled = true; const result = await act(() => api.avatarSave({ peerId: avatarPeerId })); button.disabled = false; if (result?.filePath) notice(`头像已保存到：${result.filePath}`); });
window.addEventListener('focus', markRead);
api.onState(update); api.onOpen(selectPeer); api.onProgress(value => { if (value.finished) transfers.delete(value.id); else transfers.set(value.id, value); renderTransfers(); });
api.state().then(value => { for (const item of value.transfers || []) transfers.set(item.id, item); update(value); });
