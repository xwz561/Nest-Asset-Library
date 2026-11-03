const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nestCalendarHost', {
  close: () => ipcRenderer.invoke('calendar:close'),
});
