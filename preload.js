const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dashboardAPI', {
  getConfig: () => ipcRenderer.invoke('dashboard:get-config'),
  getNetworkTime: () => ipcRenderer.invoke('dashboard:get-network-time'),
  fingerprintImage: (url) => ipcRenderer.invoke('dashboard:fingerprint-image', url),
  exitKiosk: () => ipcRenderer.invoke('dashboard:exit-kiosk')
});