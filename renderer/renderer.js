// renderer.js

let APPS = []
let installState = {}
let installing = false
let startTime = null
let editingId = null
let searchTimer = null
let currentMethod = 'winget'

// ── Init ─────────────────────────────────────────────────
async function init() {
  APPS = await window.api.getApps()
  APPS.forEach(a => { installState[a.id] = { checked: false, status: 'idle' } })
  renderGrid()
  renderManageList()
  window.api.onStatus(({ id, status, msg }) => {
    if (!installState[id]) installState[id] = {}
    installState[id].status = status
    renderGrid()
    updateProgress()
    const type = status === 'done' ? 'ok' : status === 'error' ? 'err' : status === 'retrying' ? 'warn' : 'info'
    if (msg) appendLog(msg, type)
  })
}

// ── Tab switching ─────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t, i) => {
    t.classList.toggle('active', (i === 0 && name === 'install') || (i === 1 && name === 'manage'))
  })
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'))
  document.getElementById(name + '-view').classList.add('active')
  if (name === 'manage') renderManageList()
}

// ── Install view ──────────────────────────────────────────
function renderGrid() {
  const active = APPS.filter(a => !a.disabled)
  const grid = document.getElementById('app-grid')
  const statusIcons = { idle:'○', installing:'◉', retrying:'↺', done:'✓', error:'✗', log:'◉' }
  const statusCls = { idle:'st-idle', installing:'st-installing', retrying:'st-retrying', done:'st-done', error:'st-error', log:'st-installing' }

  grid.innerHTML = active.map(a => {
    const s = installState[a.id] || { checked: false, status: 'idle' }
    const ic = statusIcons[s.status] || '○'
    const sc = statusCls[s.status] || 'st-idle'
    return `<div class="app-card${s.checked ? ' selected' : ''}" onclick="toggle('${a.id}')">
      <div class="checkbox">
        <svg class="chk-svg" width="9" height="9" viewBox="0 0 9 9">
          <polyline points="1,4.5 3.5,7 8,2" stroke="white" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="app-icon">${a.icon || '📦'}</div>
      <div class="app-info">
        <div class="app-name">${esc(a.name)}</div>
        <div class="app-cat">${esc(a.category || '')}</div>
        ${a.note ? `<div class="app-note">★ ${esc(a.note)}</div>` : ''}
      </div>
      <div class="app-status ${sc}">${ic}</div>
    </div>`
  }).join('')

  const checked = active.filter(a => installState[a.id]?.checked).length
  document.getElementById('count-pill').textContent = `${checked} / ${active.length}`
}

function toggle(id) {
  if (installing) return
  if (!installState[id]) installState[id] = { checked: false, status: 'idle' }
  installState[id].checked = !installState[id].checked
  renderGrid()
}
function selectAll() {
  if (installing) return
  APPS.filter(a => !a.disabled).forEach(a => { installState[a.id] = installState[a.id] || {}; installState[a.id].checked = true })
  renderGrid()
}
function clearAll() {
  if (installing) return
  APPS.filter(a => !a.disabled).forEach(a => { if (installState[a.id]) installState[a.id].checked = false })
  renderGrid()
}

function appendLog(msg, type = 'info') {
  const box = document.getElementById('log-box')
  const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')
  const p = document.createElement('p')
  p.innerHTML = `<span class="log-t">${mm}:${ss}</span><span class="log-${type}">${esc(msg)}</span>`
  box.appendChild(p)
  while (box.children.length > 200) box.removeChild(box.firstChild)
  box.scrollTop = box.scrollHeight
}

function updateProgress() {
  const active = APPS.filter(a => !a.disabled)
  const selected = active.filter(a => installState[a.id]?.checked)
  if (!selected.length) return
  const done = selected.filter(a => ['done', 'error'].includes(installState[a.id]?.status)).length
  const pct = Math.round(done / selected.length * 100)
  document.getElementById('pct-text').textContent = pct + '%'
  document.getElementById('progress-fill').style.width = pct + '%'
}

async function startInstall() {
  const selected = APPS.filter(a => !a.disabled && installState[a.id]?.checked)
  if (!selected.length) { appendLog('Chưa chọn ứng dụng nào.', 'warn'); return }
  installing = true
  startTime = Date.now()
  document.getElementById('btn-install').disabled = true
  document.getElementById('log-box').innerHTML = ''
  appendLog(`Bắt đầu cài ${selected.length} ứng dụng...`, 'info')
  try {
    await window.api.startInstall(selected.map(a => a.id))
  } catch (e) {
    appendLog(`Lỗi: ${e.message}`, 'err')
  }
  const errs = selected.filter(a => installState[a.id]?.status === 'error').length
  const ok = selected.length - errs
  appendLog('─────────────────────────────────────', 'dim')
  appendLog(`Hoàn tất: ${ok}/${selected.length} thành công${errs ? `, ${errs} lỗi` : ''}`, errs ? 'warn' : 'ok')
  installing = false
  document.getElementById('btn-install').disabled = false
}

function resetAll() {
  if (installing) return
  APPS.forEach(a => { installState[a.id] = { checked: false, status: 'idle' } })
  document.getElementById('progress-fill').style.width = '0%'
  document.getElementById('pct-text').textContent = '0%'
  document.getElementById('log-box').innerHTML =
    '<p><span class="log-t">00:00</span><span class="log-dim">Sẵn sàng — chọn ứng dụng và nhấn Cài đặt ngay</span></p>'
  renderGrid()
}

// ── Manage view ───────────────────────────────────────────
function renderManageList() {
  const list = document.getElementById('manage-list')
  if (!APPS.length) {
    list.innerHTML = '<div class="search-status">Chưa có app nào. Nhấn "+ Thêm app" để bắt đầu.</div>'
    return
  }
  list.innerHTML = APPS.map(a => {
    const method = a.install?.windows?.winget
      ? `winget: ${a.install.windows.winget}`
      : a.install?.windows?.url?.download
        ? `URL: ${a.install.windows.url.download.substring(0, 40)}...`
        : 'Chưa cấu hình'
    return `<div class="manage-item${a.disabled ? ' is-disabled' : ''}">
      <div class="mi-icon">${a.icon || '📦'}</div>
      <div class="mi-info">
        <div class="mi-name">${esc(a.name)}${a.disabled ? ' <span style="font-size:9px;color:#3a3a6a">[ẩn]</span>' : ''}</div>
        <div class="mi-meta">${esc(method)}</div>
      </div>
      <div class="mi-actions">
        <button class="icon-btn" title="${a.disabled ? 'Hiện' : 'Ẩn'}" onclick="toggleAppDisabled('${a.id}')">${a.disabled ? '👁' : '🙈'}</button>
        <button class="icon-btn" title="Sửa" onclick="openEditModal('${a.id}')">✏️</button>
        <button class="icon-btn danger" title="Xoá" onclick="deleteApp('${a.id}')">🗑</button>
      </div>
    </div>`
  }).join('')
}

async function toggleAppDisabled(id) {
  await window.api.toggleApp(id)
  APPS = await window.api.getApps()
  renderManageList()
  renderGrid()
}

async function deleteApp(id) {
  const app = APPS.find(a => a.id === id)
  if (!app) return
  if (!confirm(`Xoá "${app.name}" khỏi danh sách?`)) return
  await window.api.deleteApp(id)
  APPS = await window.api.getApps()
  delete installState[id]
  renderManageList()
  renderGrid()
}

// ── Modal ─────────────────────────────────────────────────
function openAddModal() {
  editingId = null
  document.getElementById('modal-title').textContent = 'Thêm ứng dụng mới'
  clearModalFields()
  openModal()
}

function openEditModal(id) {
  const app = APPS.find(a => a.id === id)
  if (!app) return
  editingId = id
  document.getElementById('modal-title').textContent = `Sửa: ${app.name}`
  clearModalFields()

  document.getElementById('f-name').value = app.name || ''
  document.getElementById('f-cat').value = app.category || ''
  document.getElementById('f-icon').value = app.icon || ''
  document.getElementById('f-verify').value = app.verify?.path || ''

  if (app.install?.windows?.winget) {
    setMethod('winget')
    document.getElementById('f-winget').value = app.install.windows.winget
  } else if (app.install?.windows?.url) {
    setMethod('url')
    document.getElementById('f-url').value = app.install.windows.url.download || ''
    document.getElementById('f-args').value = app.install.windows.url.silent_args || ''
  }

  openModal()
}

function openModal() {
  document.getElementById('modal-overlay').classList.add('open')
  document.getElementById('search-input').focus()
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open')
  clearSearchResults()
  editingId = null
}

function clearModalFields() {
  ['f-name','f-cat','f-icon','f-winget','f-url','f-args','f-verify','search-input'].forEach(id => {
    document.getElementById(id).value = ''
  })
  document.getElementById('f-icon').value = '📦'
  setMethod('winget')
  clearSearchResults()
}

function setMethod(method) {
  currentMethod = method
  document.getElementById('tab-winget').classList.toggle('active', method === 'winget')
  document.getElementById('tab-url').classList.toggle('active', method === 'url')
  document.getElementById('winget-fields').classList.toggle('open', method === 'winget')
  document.getElementById('url-fields').classList.toggle('open', method === 'url')
}

async function saveAppFromModal() {
  const name = document.getElementById('f-name').value.trim()
  if (!name) { alert('Vui lòng nhập tên ứng dụng'); return }

  const id = editingId || name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now()
  const cat = document.getElementById('f-cat').value.trim() || 'Other'
  const icon = document.getElementById('f-icon').value.trim() || '📦'
  const verifyPath = document.getElementById('f-verify').value.trim()

  const appData = {
    id,
    name,
    category: cat,
    icon,
    install: { windows: {} },
    verify: verifyPath ? { path: verifyPath } : undefined,
  }

  if (currentMethod === 'winget') {
    const wingetId = document.getElementById('f-winget').value.trim()
    if (!wingetId) { alert('Vui lòng nhập winget ID hoặc chọn từ kết quả tìm kiếm'); return }
    appData.install.windows.winget = wingetId
  } else {
    const url = document.getElementById('f-url').value.trim()
    if (!url) { alert('Vui lòng nhập URL download'); return }
    appData.install.windows.url = {
      download: url,
      silent_args: document.getElementById('f-args').value.trim() || '/S',
    }
  }

  await window.api.saveApp(appData)
  APPS = await window.api.getApps()
  if (!installState[id]) installState[id] = { checked: false, status: 'idle' }
  renderManageList()
  renderGrid()
  closeModal()
}

// ── winget search ─────────────────────────────────────────
function onSearchInput() {
  clearTimeout(searchTimer)
  const q = document.getElementById('search-input').value.trim()
  if (!q || q.length < 2) { clearSearchResults(); return }
  setSearchStatus('Đang tìm...', 'spinner')
  searchTimer = setTimeout(() => doSearch(q), 600)
}

async function doSearch(q) {
  const { results, error } = await window.api.wingetSearch(q)
  const container = document.getElementById('search-results')
  container.classList.add('open')

  if (error) { setSearchStatus(`⚠ ${error}`, 'text'); return }
  if (!results.length) { setSearchStatus('Không tìm thấy trên winget — thử nhập URL thủ công', 'text'); return }

  document.getElementById('search-status').style.display = 'none'
  // remove old result items
  container.querySelectorAll('.search-item').forEach(el => el.remove())

  results.forEach(r => {
    const div = document.createElement('div')
    div.className = 'search-item'
    div.innerHTML = `
      <div class="si-name">${esc(r.name)}</div>
      <div class="si-id">${esc(r.id)}</div>
      <span class="si-badge">winget</span>`
    div.onclick = () => fillFromSearch(r)
    container.appendChild(div)
  })
}

function fillFromSearch(result) {
  document.getElementById('f-name').value = result.name
  document.getElementById('f-winget').value = result.id
  if (!document.getElementById('f-cat').value) document.getElementById('f-cat').value = 'Other'
  if (!document.getElementById('f-icon').value || document.getElementById('f-icon').value === '📦') {
    document.getElementById('f-icon').value = guessIcon(result.name)
  }
  setMethod('winget')
  clearSearchResults()
  document.getElementById('search-input').value = ''
}

function guessIcon(name) {
  const n = name.toLowerCase()
  if (n.includes('chrome') || n.includes('firefox') || n.includes('edge') || n.includes('browser')) return '🌐'
  if (n.includes('code') || n.includes('studio') || n.includes('jetbrains') || n.includes('vim')) return '💻'
  if (n.includes('obs') || n.includes('vlc') || n.includes('media') || n.includes('video')) return '🎥'
  if (n.includes('zoom') || n.includes('teams') || n.includes('slack') || n.includes('zalo')) return '💬'
  if (n.includes('git')) return '🔀'
  if (n.includes('zip') || n.includes('rar') || n.includes('7-zip')) return '📦'
  if (n.includes('notepad') || n.includes('text')) return '📝'
  return '📦'
}

function setSearchStatus(msg, type) {
  const el = document.getElementById('search-status')
  el.style.display = 'block'
  el.className = type === 'spinner' ? 'search-status search-spinner' : 'search-status'
  el.textContent = msg
  document.getElementById('search-results').classList.add('open')
}

function clearSearchResults() {
  const container = document.getElementById('search-results')
  container.classList.remove('open')
  container.querySelectorAll('.search-item').forEach(el => el.remove())
  document.getElementById('search-status').style.display = 'none'
}

// ── Helpers ───────────────────────────────────────────────
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

// Close modal on overlay click
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal()
})

init()
