const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')
const os = require('os')

const DOWNLOAD_DIR = path.join(os.tmpdir(), '1clicksetup_tmp')
const HIDE_WINDOW = { windowsHide: true, shell: false }

// ── Cài song song (tối đa CONCURRENCY app cùng lúc) ──────
const CONCURRENCY = 3

async function installAll(apps, onStatus) {
  const queue = [...apps]
  const running = []

  function runNext() {
    if (!queue.length) return null
    const app = queue.shift()
    const task = installApp(app, onStatus).then(() => {
      running.splice(running.indexOf(task), 1)
    })
    running.push(task)
    return task
  }

  // Khởi động CONCURRENCY slot đầu tiên
  for (let i = 0; i < Math.min(CONCURRENCY, apps.length); i++) runNext()

  // Khi 1 slot xong thì lấy app tiếp từ queue
  while (running.length > 0) {
    await Promise.race(running)
    runNext()
  }
}

async function installApp(app, onStatus) {
  onStatus(app.id, 'installing', `Bắt đầu cài ${app.name}...`)

  const win = app.install?.windows
  if (!win) {
    onStatus(app.id, 'error', `[${app.name}] Không có cấu hình Windows`)
    return
  }

  let success = false

  // 1. Try winget
  if (win.winget) {
    onStatus(app.id, 'log', `[${app.name}] Thử winget: ${win.winget}`)
    success = await tryWinget(win.winget, app.id, app.name, onStatus)
  }

  // 2. Fallback: URL
  if (!success && win.url) {
    onStatus(app.id, 'log', `[${app.name}] winget thất bại — chuyển sang tải trực tiếp...`)
    success = await tryUrlInstall(app, win.url, onStatus)
  }

  // 3. Retry 1 lần nếu thất bại hoàn toàn
  if (!success) {
    onStatus(app.id, 'retrying', `[${app.name}] Thử lại lần 2...`)
    await sleep(2000)
    if (win.winget) success = await tryWinget(win.winget, app.id, app.name, onStatus)
    if (!success && win.url) success = await tryUrlInstall(app, win.url, onStatus)
  }

  if (!success) {
    onStatus(app.id, 'error', `[${app.name}] ✗ Cài thất bại sau 2 lần thử`)
    return
  }

  // 4. Verify
  const verified = verifyInstall(app)
  if (verified === false) {
    onStatus(app.id, 'log', `[${app.name}] ⚠ Không tìm thấy file verify — app có thể đã cài OK`)
  }

  // 5. Post-install
  if (app.post_install) {
    if (app.post_install.shortcut) {
      onStatus(app.id, 'log', `[${app.name}] Tạo shortcut Desktop...`)
      await createDesktopShortcut(app)
    }
    if (app.post_install.startup) {
      onStatus(app.id, 'log', `[${app.name}] Thêm vào Windows Startup...`)
      addToStartup(app)
    }
  }

  onStatus(app.id, 'done', `[${app.name}] ✓ Cài thành công`)
}

// ── winget ────────────────────────────────────────────────
function tryWinget(wingetId, appId, appName, onStatus) {
  return new Promise((resolve) => {
    const args = [
      'install', '--id', wingetId,
      '--silent',
      '--accept-package-agreements',
      '--accept-source-agreements',
      '--disable-interactivity',
    ]
    const proc = spawn('winget', args, { ...HIDE_WINDOW, shell: true })

    let stderr = ''
    let stdout = ''
    proc.stdout?.on('data', d => { stdout += d.toString() })
    proc.stderr?.on('data', d => { stderr += d.toString() })

    const timer = setTimeout(() => {
      try { proc.kill() } catch (_) {}
      onStatus(appId, 'log', `[${appName}] winget timeout (3 phút)`)
      resolve(false)
    }, 180000)

    proc.on('close', code => {
      clearTimeout(timer)
      // 0 = OK, -1967335424 = đã cài rồi (ALREADY_INSTALLED)
      if (code === 0 || code === -1967335424) {
        resolve(true)
      } else {
        // Trích lỗi hữu ích từ stderr/stdout
        const hint = extractWingetError(stderr + stdout)
        if (hint) onStatus(appId, 'log', `[${appName}] winget: ${hint}`)
        resolve(false)
      }
    })

    proc.on('error', (e) => {
      clearTimeout(timer)
      onStatus(appId, 'log', `[${appName}] winget không khả dụng: ${e.message}`)
      resolve(false)
    })
  })
}

function extractWingetError(output) {
  const lines = output.split('\n').map(l => l.trim()).filter(Boolean)
  // Tìm dòng có chứa thông tin lỗi thực sự
  const errLine = lines.find(l =>
    l.toLowerCase().includes('error') ||
    l.toLowerCase().includes('failed') ||
    l.toLowerCase().includes('not found') ||
    l.toLowerCase().includes('0x')
  )
  return errLine ? errLine.substring(0, 120) : null
}

// ── URL download + silent install ─────────────────────────
async function tryUrlInstall(app, urlConfig, onStatus) {
  try {
    if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true })

    const rawName = path.basename(urlConfig.download).split('?')[0]
    const fileName = rawName || `${app.id}_setup.exe`
    const destPath = path.join(DOWNLOAD_DIR, fileName)

    onStatus(app.id, 'log', `[${app.name}] Đang tải ${fileName}...`)

    await downloadFile(urlConfig.download, destPath, (pct) => {
      // Cập nhật mỗi 10%
      if (pct % 10 === 0) onStatus(app.id, 'log', `[${app.name}] Tải về ${pct}%`)
    })

    onStatus(app.id, 'log', `[${app.name}] Tải xong. Đang cài...`)

    if (urlConfig.type === 'zip') {
      const extractTo = resolveEnvVars(urlConfig.extract_to)
      if (!fs.existsSync(extractTo)) fs.mkdirSync(extractTo, { recursive: true })
      await extractZip(destPath, extractTo)
      return true
    }

    const ok = await runSilentInstaller(destPath, urlConfig.silent_args || '/S')
    if (!ok) onStatus(app.id, 'log', `[${app.name}] Installer trả về lỗi — kiểm tra silent args`)
    return ok
  } catch (e) {
    onStatus(app.id, 'log', `[${app.name}] Lỗi tải/cài: ${e.message}`)
    return false
  }
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(dest)

    const request = proto.get(url, { timeout: 30000 }, (res) => {
      // Follow redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        fs.unlink(dest, () => {})
        return downloadFile(res.headers.location, dest, onProgress).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        file.close()
        fs.unlink(dest, () => {})
        return reject(new Error(`HTTP ${res.statusCode} từ ${url}`))
      }

      const total = parseInt(res.headers['content-length'] || '0', 10)
      let received = 0
      let lastPct = -1

      res.on('data', chunk => {
        received += chunk.length
        if (total && onProgress) {
          const pct = Math.round(received / total * 100)
          if (pct !== lastPct) { lastPct = pct; onProgress(pct) }
        }
      })
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
      file.on('error', (e) => { fs.unlink(dest, () => {}); reject(e) })
    })

    request.on('error', e => { fs.unlink(dest, () => {}); reject(e) })
    request.on('timeout', () => {
      request.destroy()
      reject(new Error('Download timeout (30s connect)'))
    })
  })
}

function runSilentInstaller(exePath, args) {
  return new Promise((resolve) => {
    const argList = args ? args.trim().split(/\s+/) : ['/S']
    const proc = spawn(exePath, argList, { ...HIDE_WINDOW, detached: false })

    const timer = setTimeout(() => {
      try { proc.kill() } catch (_) {}
      resolve(false)
    }, 180000)

    proc.on('close', code => {
      clearTimeout(timer)
      // 0 = OK, 3010 = cần reboot (coi là thành công)
      resolve(code === 0 || code === 3010)
    })
    proc.on('error', () => { clearTimeout(timer); resolve(false) })
  })
}

function extractZip(zipPath, destDir) {
  return new Promise((resolve) => {
    const proc = spawn('powershell', [
      '-NonInteractive', '-WindowStyle', 'Hidden',
      '-Command',
      `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`
    ], { ...HIDE_WINDOW })
    proc.on('close', () => resolve())
    proc.on('error', () => resolve())
  })
}

// ── Verify ────────────────────────────────────────────────
function verifyInstall(app) {
  if (!app.verify?.path) return null   // null = không có path để verify, không coi là lỗi
  return fs.existsSync(resolveEnvVars(app.verify.path))
}

// ── Post-install ──────────────────────────────────────────
function createDesktopShortcut(app) {
  return new Promise((resolve) => {
    if (!app.verify?.path) { resolve(); return }
    const exePath = resolveEnvVars(app.verify.path)
    if (!fs.existsSync(exePath)) { resolve(); return }

    const desktop = path.join(os.homedir(), 'Desktop')
    const shortcutPath = path.join(desktop, `${app.name}.lnk`)
    const escapedExe = exePath.replace(/\\/g, '\\\\')
    const escapedLnk = shortcutPath.replace(/\\/g, '\\\\')

    const script = [
      `Set oWS = WScript.CreateObject("WScript.Shell")`,
      `Set oLink = oWS.CreateShortcut("${escapedLnk}")`,
      `oLink.TargetPath = "${escapedExe}"`,
      `oLink.Save`,
    ].join('\r\n')

    if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true })
    const tmpVbs = path.join(DOWNLOAD_DIR, `sc_${app.id}.vbs`)
    fs.writeFileSync(tmpVbs, script, 'utf8')

    const proc = spawn('cscript', ['//nologo', tmpVbs], { ...HIDE_WINDOW })
    proc.on('close', () => resolve())
    proc.on('error', () => resolve())
  })
}

function addToStartup(app) {
  if (!app.verify?.path) return
  const exePath = resolveEnvVars(app.verify.path)
  if (!fs.existsSync(exePath)) return
  spawn('reg', [
    'add',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
    '/v', app.name,
    '/t', 'REG_SZ',
    '/d', exePath,
    '/f'
  ], { ...HIDE_WINDOW })
}

// ── Helpers ───────────────────────────────────────────────
function resolveEnvVars(str) {
  if (!str) return str
  return str.replace(/%([^%]+)%/g, (_, k) => process.env[k] || `%${k}%`)
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ── Dọn temp ─────────────────────────────────────────────
function cleanupTemp() {
  try { fs.rmSync(DOWNLOAD_DIR, { recursive: true, force: true }) } catch (_) {}
}

module.exports = { installAll, installApp, cleanupTemp }
