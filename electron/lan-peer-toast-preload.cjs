const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('peerChatToast', {
  onShow: callback => ipcRenderer.on('peer-chat:toast-show', (_, value) => callback(value)),
  open: peerId => ipcRenderer.send('peer-chat:toast-open', peerId),
  dismiss: () => ipcRenderer.send('peer-chat:toast-dismiss')
});
