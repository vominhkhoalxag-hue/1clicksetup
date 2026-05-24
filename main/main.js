const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { exec, spawn } = require('child_process')
const { installApp } = require('./installerEngine')

let mainWindow

// ── Phân biệt portable vs installer ─────────────────────
const IS_PORTABLE = !!process.env.PORTABLE_EXECUTABLE_DIR

// Gom toàn bộ Electron cache vào 1 chỗ duy nhất
if (IS_PORTABLE) {
  app.setPath('userData', path.join(process.env.PORTABLE_EXECUTABLE_DIR, '.cache'))
} else {
  app.setPath('userData', path.join(os.homedir(), 'AppData', 'Roaming', '1ClickSetup'))
}

// apps.json: cạnh .exe (portable) hoặc AppData\Roaming (installer)
const DATA_DIR = IS_PORTABLE
  ? process.env.PORTABLE_EXECUTABLE_DIR
  : path.join(os.homedir(), 'AppData', 'Roaming', '1ClickSetup')

const APPS_PATH = path.join(DATA_DIR, 'apps.json')
const DEFAULT_APPS_PATH = path.join(__dirname, 'apps.json')

function loadApps() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(APPS_PATH)) fs.copyFileSync(DEFAULT_APPS_PATH, APPS_PATH)
  return JSON.parse(fs.readFileSync(APPS_PATH, 'utf8'))
}

function saveApps(apps) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
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
app.on('window-all-closed', () => {
  if (IS_PORTABLE) schedulePortableCleanup()
  app.quit()
})

// ── Portable: xoá sạch khi đóng app (VBScript, hoàn toàn ẩn) ──
function schedulePortableCleanup() {
  const exeDir = process.env.PORTABLE_EXECUTABLE_DIR

  // Dùng double-backslash cho VBScript path
  const appsJson  = path.join(exeDir, 'apps.json').split('/').join('\\')
  const cacheDir  = path.join(exeDir, '.cache').split('/').join('\\')
  const tmpDir    = path.join(os.tmpdir(), '1clicksetup_tmp').split('/').join('\\')

  const lines = [
    'WScript.Sleep 2000',
    'Dim fso : Set fso = CreateObject("Scripting.FileSystemObject")',
    'On Error Resume Next',
    `If fso.FileExists("${appsJson}") Then fso.DeleteFile "${appsJson}", True`,
    `If fso.FolderExists("${cacheDir}") Then fso.DeleteFolder "${cacheDir}", True`,
    `If fso.FolderExists("${tmpDir}") Then fso.DeleteFolder "${tmpDir}", True`,
    'Dim self : self = WScript.ScriptFullName',
    'WScript.Sleep 500',
    'fso.DeleteFile self, True',
  ]

  const scriptPath = path.join(os.tmpdir(), '_1cs_cleanup.vbs')
  fs.writeFileSync(scriptPath, lines.join('\r\n'), 'utf8')

  spawn('wscript.exe', ['//nologo', scriptPath], {
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
  }).unref()
}

// ── Xoá thư mục temp sau khi cài xong ───────────────────
function cleanupTemp() {
  const tmpDir = path.join(os.tmpdir(), '1clicksetup_tmp')
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}
}

// ── Install ──────────────────────────────────────────────
ipcMain.handle('start-install', async (event, selectedIds) => {
  const apps = loadApps()
  const selected = apps.filter(a => selectedIds.includes(a.id))
  for (const appItem of selected) {
    await installApp(appItem, (id, status, msg) => {
      mainWindow.webContents.send('install-status', { id, status, msg })
    })
  }
  cleanupTemp()
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
  const a = apps.find(a => a.id === id)
  if (a) a.disabled = !a.disabled
  saveApps(apps)
  return { ok: true }
})

// ── winget search ────────────────────────────────────────
ipcMain.handle('winget-search', (event, query) => {
  return new Promise((resolve) => {
    exec(`winget search "${query}" --accept-source-agreements`, { timeout: 15000, windowsHide: true }, (err, stdout) => {
      if (err) { resolve({ results: [], error: 'winget không khả dụng trên máy này' }); return }
      const lines = stdout.split('\n')
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
        if (name && id && source.includes('winget')) results.push({ name, id, source })
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
