const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('textEditor', {
  load: () => ipcRenderer.invoke('text-editor:load'),
  save: text => ipcRenderer.invoke('text-editor:save', String(text ?? '')),
  update: state => {
    if (!state || typeof state.text !== 'string') return;
    ipcRenderer.send('text-editor:state', { dirty: Boolean(state.dirty), text: state.text });
  },
});
