const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Window
  minimize: () => ipcRenderer.send('win-minimize'),
  close:    () => ipcRenderer.send('win-close'),

  // Install
  startInstall: (ids) => ipcRenderer.invoke('start-install', ids),
  onStatus:     (cb)  => ipcRenderer.on('install-status', (_, data) => cb(data)),

  // App registry
  getApps:     ()      => ipcRenderer.invoke('get-apps'),
  saveApp:     (app)   => ipcRenderer.invoke('save-app', app),
  deleteApp:   (id)    => ipcRenderer.invoke('delete-app', id),
  toggleApp:   (id)    => ipcRenderer.invoke('toggle-app', id),
  reorderApps: (ids)   => ipcRenderer.invoke('reorder-apps', ids),

  // winget
  wingetSearch:  (q) => ipcRenderer.invoke('winget-search', q),
  checkWinget:   ()  => ipcRenderer.invoke('check-winget'),

  // Import / Export
  exportApps: () => ipcRenderer.invoke('export-apps'),
  importApps: () => ipcRenderer.invoke('import-apps'),
})
