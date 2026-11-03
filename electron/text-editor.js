const name = document.getElementById('document-name');
const status = document.getElementById('document-status');
const textarea = document.getElementById('document-text');
const saveButton = document.getElementById('save-button');
const count = document.getElementById('document-count');
let originalText = '';
let canEdit = false;
let saving = false;

function refreshState(message = '') {
  const dirty = textarea.value !== originalText;
  count.textContent = `${textarea.value.length.toLocaleString()} 字符`;
  status.textContent = message || (dirty ? '有未保存的修改' : canEdit ? '已保存' : '当前用户只有查看权限');
  saveButton.disabled = !canEdit || !dirty || saving;
  window.textEditor.update({ dirty, text: textarea.value });
}

async function saveDocument() {
  if (!canEdit || saving || textarea.value === originalText) return;
  saving = true;
  saveButton.disabled = true;
  status.textContent = '正在保存…';
  const value = textarea.value;
  const result = await window.textEditor.save(value);
  saving = false;
  if (result?.error) {
    refreshState(`保存失败：${result.error}`);
    return;
  }
  originalText = value;
  refreshState('已保存');
}

saveButton.addEventListener('click', () => { void saveDocument(); });
textarea.addEventListener('input', () => refreshState());
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    void saveDocument();
  }
});

window.textEditor.load().then(result => {
  if (result?.error) {
    name.textContent = '无法打开 TXT 文档';
    status.textContent = result.error;
    return;
  }
  name.textContent = result.name || 'TXT 文档';
  document.title = `${result.name || 'TXT 文档'} · 小旺仔素材库`;
  textarea.value = String(result.text || '');
  originalText = textarea.value;
  canEdit = Boolean(result.canEdit);
  textarea.disabled = false;
  textarea.readOnly = !canEdit;
  refreshState();
  if (canEdit) textarea.focus();
}).catch(error => {
  name.textContent = '无法打开 TXT 文档';
  status.textContent = `读取失败：${error.message}`;
});
