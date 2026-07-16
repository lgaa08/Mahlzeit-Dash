const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dashboardAPI', {
  getConfig: () => ipcRenderer.invoke('dashboard:get-config'),
  exitKiosk: () => ipcRenderer.invoke('dashboard:exit-kiosk')
});
