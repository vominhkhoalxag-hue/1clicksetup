const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { exec } = require('child_process')
const { installApp } = require('./installerEngine')

let mainWindow
const APPS_PATH = path.join(__dirname, 'apps.json')

function loadApps() {
  return JSON.parse(fs.readFileSync(APPS_PATH, 'utf8'))
}

function saveApps(apps) {
  fs.writeFileSync(APPS_PATH, JSON.stringify(apps, null, 2), 'utf8')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 760,
    height: 720,
    minWidth: 680,
    minHeight: 580,
    frame: false,
    backgroundColor: '#0a0a18',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../assets/icon.png'),
  })
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  ipcMain.on('win-minimize', () => mainWindow.minimize())
  ipcMain.on('win-close', () => mainWindow.close())
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())

// ── Install ──────────────────────────────────────────────
ipcMain.handle('start-install', async (event, selectedIds) => {
  const apps = loadApps()
  const selected = apps.filter(a => selectedIds.includes(a.id))
  for (const appItem of selected) {
    await installApp(appItem, (id, status, msg) => {
      mainWindow.webContents.send('install-status', { id, status, msg })
    })
  }
  return { done: true }
})

// ── App registry CRUD ────────────────────────────────────
ipcMain.handle('get-apps', () => loadApps())

ipcMain.handle('save-app', (event, appData) => {
  const apps = loadApps()
  const idx = apps.findIndex(a => a.id === appData.id)
  if (idx >= 0) apps[idx] = appData
  else apps.push(appData)
  saveApps(apps)
  return { ok: true }
})

ipcMain.handle('delete-app', (event, id) => {
  const apps = loadApps().filter(a => a.id !== id)
  saveApps(apps)
  return { ok: true }
})

ipcMain.handle('toggle-app', (event, id) => {
  const apps = loadApps()
  const app = apps.find(a => a.id === id)
  if (app) app.disabled = !app.disabled
  saveApps(apps)
  return { ok: true }
})

// ── winget search ────────────────────────────────────────
ipcMain.handle('winget-search', (event, query) => {
  return new Promise((resolve) => {
    exec(`winget search "${query}" --accept-source-agreements`, { timeout: 15000 }, (err, stdout) => {
      if (err) { resolve({ results: [], error: 'winget không khả dụng trên máy này' }); return }

      const lines = stdout.split('\n')
      // Find the header line to know column positions
      const headerIdx = lines.findIndex(l => l.includes('Id') && l.includes('Version'))
      if (headerIdx < 0) { resolve({ results: [] }); return }

      const header = lines[headerIdx]
      const idStart = header.indexOf('Id')
      const verStart = header.indexOf('Version')
      const srcStart = header.indexOf('Source')

      const results = []
      for (let i = headerIdx + 2; i < lines.length; i++) {
        const line = lines[i]
        if (!line.trim() || line.startsWith('-')) continue
        const name = line.substring(0, idStart).trim()
        const id = line.substring(idStart, verStart > idStart ? verStart : line.length).trim()
        const source = srcStart > 0 ? line.substring(srcStart).trim() : ''
        if (name && id && source.includes('winget')) {
          results.push({ name, id, source })
        }
      }
      resolve({ results: results.slice(0, 8) })
    })
  })
})

// ── Export apps.json ─────────────────────────────────────
ipcMain.handle('export-apps', () => {
  const { dialog } = require('electron')
  return dialog.showSaveDialog(mainWindow, {
    defaultPath: 'apps.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  }).then(result => {
    if (!result.canceled) {
      fs.copyFileSync(APPS_PATH, result.filePath)
      return { ok: true }
    }
    return { ok: false }
  })
})
