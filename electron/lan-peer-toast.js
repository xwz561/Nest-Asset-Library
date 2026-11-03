const toast = document.getElementById('toast');
const avatar = document.getElementById('avatar');
let peerId = '';

function render(value) {
  peerId = value.peerId || '';
  document.getElementById('name').textContent = value.name || '局域网好友';
  document.getElementById('preview').textContent = value.preview || '发来一条消息';
  avatar.replaceChildren();
  if (typeof value.avatar === 'string' && value.avatar.startsWith('data:image/')) {
    const image = document.createElement('img'); image.src = value.avatar; image.alt = '';
    avatar.append(image);
  } else avatar.textContent = (value.name || '友').slice(0, 1).toUpperCase();
}

function openChat() { if (peerId) window.peerChatToast.open(peerId); }
toast.addEventListener('click', openChat);
toast.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openChat(); } });
document.getElementById('dismiss').addEventListener('click', event => { event.stopPropagation(); window.peerChatToast.dismiss(); });
window.peerChatToast.onShow(render);
