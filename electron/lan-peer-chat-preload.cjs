const { contextBridge, ipcRenderer, webUtils } = require('electron');
const subscribe = (channel, callback) => { const listener = (_, value) => callback(value); ipcRenderer.on(channel, listener); return () => ipcRenderer.removeListener(channel, listener); };
contextBridge.exposeInMainWorld('lanPeerChat', {
  ...Object.fromEntries(['state', 'read', 'send', 'files', 'save', 'preview', 'cancel', 'archive'].map(key => [key, input => ipcRenderer.invoke('peer-chat:' + key, input)])),
  avatarSave: input => ipcRenderer.invoke('peer-chat:avatar-save', input),
  drop: (files, peerId) => {
    const dropped = Array.from(files || []);
    const paths = dropped.map(file => {
      try { return webUtils.getPathForFile(file) || (typeof file?.path === 'string' ? file.path : ''); }
      catch { return typeof file?.path === 'string' ? file.path : ''; }
    });
    return ipcRenderer.invoke('peer-chat:drop', { peerId, files: paths, droppedCount: dropped.length });
  },
  onState: callback => subscribe('peer-chat:state', callback), onOpen: callback => subscribe('peer-chat:open', callback), onProgress: callback => subscribe('peer-chat:progress', callback)
});
