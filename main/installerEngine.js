const { exec, execFile, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')
const os = require('os')

const DOWNLOAD_DIR = path.join(os.tmpdir(), '1clicksetup_tmp')

// ── Ẩn cửa sổ cmd khi chạy lệnh ─────────────────────────
const HIDE_WINDOW = {
  windowsHide: true,        // ẩn cửa sổ cmd
  shell: false,
}

async function installApp(app, onStatus) {
  onStatus(app.id, 'installing', `Bắt đầu cài ${app.name}...`)

  const win = app.install && app.install.windows
  if (!win) {
    onStatus(app.id, 'error', 'Không có cấu hình Windows')
    return
  }

  let success = false

  // 1. Try winget
  if (win.winget) {
    onStatus(app.id, 'log', `Thử winget: ${win.winget}`)
    success = await tryWinget(win.winget, app.id, onStatus)
    if (success) onStatus(app.id, 'log', `winget cài thành công`)
  }

  // 2. Fallback: URL
  if (!success && win.url) {
    onStatus(app.id, 'log', `Chuyển sang tải trực tiếp...`)
    success = await tryUrlInstall(app, win.url, onStatus)
  }

  // 3. Retry 1 lần
  if (!success) {
    onStatus(app.id, 'retrying', `Thử lại ${app.name}...`)
    await sleep(1500)
    if (win.winget) success = await tryWinget(win.winget, app.id, onStatus)
    if (!success && win.url) success = await tryUrlInstall(app, win.url, onStatus)
  }

  if (!success) {
    onStatus(app.id, 'error', `Cài thất bại: ${app.name}`)
    return
  }

  // 4. Verify
  const verified = verifyInstall(app)
  if (!verified) {
    onStatus(app.id, 'log', `Không tìm thấy đường dẫn xác minh — app có thể đã cài OK`)
  }

  // 5. Post-install (UniKey)
  if (app.post_install) {
    if (app.post_install.shortcut) {
      onStatus(app.id, 'log', `Tạo shortcut Desktop...`)
      createDesktopShortcut(app)
    }
    if (app.post_install.startup) {
      onStatus(app.id, 'log', `Thêm vào Windows Startup...`)
      addToStartup(app)
    }
  }

  onStatus(app.id, 'done', `${app.name} đã cài thành công ✓`)
}

// ── winget (ẩn cmd) ───────────────────────────────────────
function tryWinget(wingetId, appId, onStatus) {
  return new Promise((resolve) => {
    const args = [
      'install', '--id', wingetId,
      '--silent',
      '--accept-package-agreements',
      '--accept-source-agreements',
      '--disable-interactivity',
    ]
    const proc = spawn('winget', args, {
      ...HIDE_WINDOW,
      shell: true,          // cần shell:true cho winget trên một số máy
    })

    let stderr = ''
    proc.stderr?.on('data', d => { stderr += d.toString() })

    proc.on('close', code => {
      if (code === 0 || code === -1967335424) {
        // -1967335424 = đã cài rồi (APPINSTALLER_ERROR_ALREADY_INSTALLED)
        resolve(true)
      } else {
        if (stderr) onStatus(appId, 'log', `winget: ${stderr.substring(0, 100)}`)
        resolve(false)
      }
    })

    proc.on('error', () => resolve(false))

    setTimeout(() => { try { proc.kill() } catch(e){} resolve(false) }, 180000)
  })
}

// ── URL download + silent install (ẩn cmd) ───────────────
async function tryUrlInstall(app, urlConfig, onStatus) {
  try {
    if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true })

    const fileName = path.basename(urlConfig.download).split('?')[0]
    const destPath = path.join(DOWNLOAD_DIR, fileName)

    onStatus(app.id, 'log', `Đang tải ${fileName}...`)
    await downloadFile(urlConfig.download, destPath, (pct) => {
      if (pct % 25 === 0) onStatus(app.id, 'log', `Tải về ${pct}%...`)
    })

    onStatus(app.id, 'log', `Tải xong. Đang cài...`)

    // ZIP (UniKey)
    if (urlConfig.type === 'zip') {
      const extractTo = resolveEnvVars(urlConfig.extract_to)
      if (!fs.existsSync(extractTo)) fs.mkdirSync(extractTo, { recursive: true })
      await extractZip(destPath, extractTo)
      return true
    }

    return await runSilentInstaller(destPath, urlConfig.silent_args || '/S')
  } catch (e) {
    onStatus(app.id, 'log', `Lỗi tải: ${e.message}`)
    return false
  }
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(dest)

    proto.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        return downloadFile(res.headers.location, dest, onProgress).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        file.close()
        return reject(new Error(`HTTP ${res.statusCode}`))
      }

      const total = parseInt(res.headers['content-length'] || '0', 10)
      let received = 0
      res.on('data', chunk => {
        received += chunk.length
        if (total && onProgress) onProgress(Math.round(received / total * 100))
      })
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
    }).on('error', e => { fs.unlink(dest, () => {}); reject(e) })
  })
}

// ẩn cửa sổ cmd khi chạy installer
function runSilentInstaller(exePath, args) {
  return new Promise((resolve) => {
    const argList = args ? args.trim().split(/\s+/) : ['/S']
    const proc = spawn(exePath, argList, {
      ...HIDE_WINDOW,
      detached: false,
    })
    proc.on('close', code => resolve(code === 0 || code === 3010))
    proc.on('error', () => resolve(false))
    setTimeout(() => { try { proc.kill() } catch(e){} resolve(false) }, 180000)
  })
}

// ẩn cmd khi giải nén zip qua PowerShell
function extractZip(zipPath, destDir) {
  return new Promise((resolve) => {
    const proc = spawn('powershell', [
      '-NonInteractive', '-WindowStyle', 'Hidden',
      '-Command',
      `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`
    ], { ...HIDE_WINDOW, shell: false })
    proc.on('close', () => resolve())
    proc.on('error', () => resolve())
  })
}

// ── Verify ────────────────────────────────────────────────
function verifyInstall(app) {
  if (!app.verify || !app.verify.path) return true
  return fs.existsSync(resolveEnvVars(app.verify.path))
}

// ── Post-install ──────────────────────────────────────────
function createDesktopShortcut(app) {
  if (!app.verify?.path) return
  const exePath = resolveEnvVars(app.verify.path)
  const desktop = path.join(os.homedir(), 'Desktop')
  const shortcutPath = path.join(desktop, `${app.name}.lnk`)
  const script = [
    `Set oWS = WScript.CreateObject("WScript.Shell")`,
    `Set oLink = oWS.CreateShortcut("${shortcutPath.replace(/\\/g,'\\\\')}")`,
    `oLink.TargetPath = "${exePath.replace(/\\/g,'\\\\')}"`,
    `oLink.Save`,
  ].join('\r\n')
  const tmpVbs = path.join(DOWNLOAD_DIR, `sc_${app.id}.vbs`)
  fs.writeFileSync(tmpVbs, script)
  spawn('cscript', ['//nologo', tmpVbs], { ...HIDE_WINDOW, shell: false })
}

function addToStartup(app) {
  if (!app.verify?.path) return
  const exePath = resolveEnvVars(app.verify.path)
  spawn('reg', [
    'add',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
    '/v', app.name,
    '/t', 'REG_SZ',
    '/d', exePath,
    '/f'
  ], { ...HIDE_WINDOW, shell: false })
}

// ── Helpers ───────────────────────────────────────────────
function resolveEnvVars(str) {
  if (!str) return str
  return str.replace(/%([^%]+)%/g, (_, k) => process.env[k] || `%${k}%`)
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

module.exports = { installApp }
