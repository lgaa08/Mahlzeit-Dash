const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dashboardAPI', {
  getConfig: () => ipcRenderer.invoke('dashboard:get-config'),
  getNetworkTime: () => ipcRenderer.invoke('dashboard:get-network-time'),
  exitKiosk: () => ipcRenderer.invoke('dashboard:exit-kiosk')
});
