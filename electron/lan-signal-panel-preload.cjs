const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lanSignalPanel', {
  getState: () => ipcRenderer.invoke('lan-signals:state'),
  copyAccountId: () => ipcRenderer.invoke('lan-signals:copy-account-id'),
  setName: name => ipcRenderer.invoke('lan-signals:set-name', name),
  setShortcutEnabled: enabled => ipcRenderer.invoke('lan-signals:set-shortcut-enabled', enabled),
  setHideEmotes: enabled => ipcRenderer.invoke('lan-signals:set-hide-emotes', enabled),
  getWheelEmotes: () => ipcRenderer.invoke('lan-signals:get-wheel-emotes'),
  setWheelEmotes: emotes => ipcRenderer.invoke('lan-signals:set-wheel-emotes', emotes),
  addWheelImage: () => ipcRenderer.invoke('lan-signals:add-wheel-image'),
  openChat: peerId => ipcRenderer.invoke('peer-chat:open', { peerId }),
  chooseAvatar: () => ipcRenderer.invoke('peer-chat:avatar', {}),
  resetAvatar: () => ipcRenderer.invoke('peer-chat:avatar', { reset: true }),
  onState: callback => {
    const listener = (_, value) => callback(value);
    ipcRenderer.on('lan-signals:state', listener);
    return () => ipcRenderer.removeListener('lan-signals:state', listener);
  }
});
