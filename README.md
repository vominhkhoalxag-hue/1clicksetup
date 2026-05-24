# 1ClickSetup · v1.1.0

> Cài đặt tự động phần mềm Windows — chọn app, bấm 1 nút, xong.  
> Hỗ trợ winget, URL download, **cài song song** (tối đa 3 app cùng lúc).

[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue)](https://github.com/vominhkhoalxag-hue/1clicksetup)
[![Version](https://img.shields.io/badge/version-1.1.0-brightgreen)](https://github.com/vominhkhoalxag-hue/1clicksetup/releases)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

---

## Dành cho người dùng cuối

1. Vào tab **[Releases](https://github.com/vominhkhoalxag-hue/1clicksetup/releases)** → tải `1ClickSetup-Portable.exe`
2. Double-click chạy thẳng — **không cần cài đặt gì thêm**
3. Nên chạy với quyền Admin *(right-click → Run as administrator)*

> **Yêu cầu:** Windows 10/11 · Kết nối internet · [winget](https://aka.ms/getwinget) (app sẽ cảnh báo nếu chưa có)

---

## Tính năng

| Tính năng | Chi tiết |
|---|---|
| ⚡ Cài song song | Tối đa 3 app cùng lúc — nhanh hơn ~3x so v1.0 |
| 🔁 Fallback tự động | winget thất bại → tự chuyển sang URL download |
| ⚠ winget check | Cảnh báo ngay khi khởi động nếu winget chưa cài |
| 📥 Import/Export | Backup và restore danh sách app dưới dạng JSON |
| 🔍 winget search | Tìm và thêm app mới trực tiếp từ UI |
| 🗂 Quản lý app | Thêm / sửa / ẩn / xoá app không cần sửa file |
| 💾 Atomic save | Ghi file JSON an toàn, không mất dữ liệu khi crash |

---

## Ứng dụng hỗ trợ mặc định

| # | Ứng dụng | Danh mục | Ghi chú |
|---|---|---|---|
| 1 | Microsoft Edge | Browser | |
| 2 | Google Chrome | Browser | |
| 3 | Cốc Cốc | Browser | |
| 4 | Visual Studio Code | Dev Tools | |
| 5 | OBS Studio | Media | |
| 6 | UltraViewer | Remote | |
| 7 | UniKey | Input | ★ Shortcut Desktop + Startup tự động |
| 8 | Zalo Desktop | Chat | |
| 9 | CapCut | Media | |

> Thêm/sửa/xoá app trực tiếp trên tab **⚙ Quản lý App**

---

## Dành cho developer

### Yêu cầu

- Windows 10/11
- [Node.js LTS](https://nodejs.org) (v18 trở lên)
- Electron mirror đã được cấu hình tự động trong `.npmrc` — **không cần tải binary thủ công**

### Cài đặt

```bash
git clone https://github.com/vominhkhoalxag-hue/1clicksetup
cd 1clicksetup
npm install   # Electron binary tự tải từ mirror VN qua .npmrc
npm start
```

### Build

```bash
npm run build:portable   # chỉ build portable .exe
npm run build            # build cả nsis installer + portable
```

---

## Thêm app mới

Mở tab **⚙ Quản lý App** → **+ Thêm app** → gõ tên để tìm trên winget.

Hoặc sửa `main/apps.json`:

```json
{
  "id": "notepadpp",
  "name": "Notepad++",
  "category": "Dev Tools",
  "icon": "📝",
  "install": {
    "windows": {
      "winget": "Notepad++.Notepad++"
    }
  },
  "verify": {
    "path": "C:\\Program Files\\Notepad++\\notepad++.exe"
  }
}
```

Tìm winget ID tại: [winget.run](https://winget.run)

---

## Import / Export danh sách app

- **Export**: Tab Quản lý App → **↓ Export JSON** → lưu file để backup
- **Import**: Tab Quản lý App → **↑ Import JSON** → chọn file đã export hoặc file tự tạo

---

## Lỗi thường gặp

| Lỗi | Cách xử lý |
|---|---|
| Banner "winget chưa được cài" | Cài winget tại [aka.ms/getwinget](https://aka.ms/getwinget) |
| App cài lỗi permission | Right-click → **Run as administrator** |
| winget search không ra kết quả | Kiểm tra kết nối internet hoặc nhập thủ công winget ID |
| `npm install` không tải được Electron | File `.npmrc` đã cấu hình mirror — nếu vẫn lỗi, chạy `$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"; npm install` |

---

## Changelog

### v1.1.0
- **Cài song song** — tối đa 3 app cùng lúc (trước đây tuần tự)
- **Import JSON** — backup và restore danh sách app
- **winget check** khi khởi động — hiển thị banner cảnh báo nếu chưa cài
- **Atomic save** — ghi `apps.json` an toàn, không mất dữ liệu
- **Better error messages** — log lỗi winget rõ ràng hơn, có tên app trong mỗi dòng log
- **`.npmrc`** — không cần tải Electron binary thủ công nữa
- **Nâng Electron** từ 28 lên 33 (bảo mật + bug fixes)
- Thêm **LICENSE** (MIT) và **`.gitignore`**
