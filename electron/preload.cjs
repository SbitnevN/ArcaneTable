const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  openSpotify: url => ipcRenderer.invoke('spotify:open', url),
  monitors: () => ipcRenderer.invoke('monitors'),
  settings: () => ipcRenderer.invoke('settings'),
  openDisplay: id => ipcRenderer.invoke('display:open', id),
  fullscreen: enabled => ipcRenderer.invoke('display:fullscreen', enabled)
});
