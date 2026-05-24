# 1ClickSetup

> Cài đặt tự động phần mềm Windows — chọn app, bấm 1 nút, xong.

![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue)
![Version](https://img.shields.io/badge/version-1.0.0-brightgreen)

---

## Dành cho người dùng cuối

1. Vào tab **[Releases](../../releases)** → tải file `1ClickSetup-Portable.exe`
2. Double-click chạy thẳng — **không cần cài đặt gì thêm**
3. Nên chạy với quyền Admin *(right-click → Run as administrator)*

> **Yêu cầu:** Windows 10/11 · Kết nối internet

---

## Ứng dụng hỗ trợ mặc định

| # | Ứng dụng | Danh mục | Ghi chú |
|---|----------|----------|---------|
| 1 | Microsoft Edge | Browser | |
| 2 | Google Chrome | Browser | |
| 3 | Cốc Cốc | Browser | |
| 4 | Visual Studio Code | Dev Tools | |
| 5 | OBS Studio | Media | |
| 6 | UltraViewer | Remote | |
| 7 | UniKey | Input | ★ Tự tạo shortcut Desktop + thêm vào Startup |
| 8 | Zalo Desktop | Chat | |
| 9 | CapCut | Media | |

> Có thể thêm/sửa/xoá app trực tiếp trên UI — tab **⚙ Quản lý App**

---

## Dành cho developer

### Yêu cầu

- Windows 10/11
- [Node.js LTS](https://nodejs.org) (v18 trở lên)

### Cài đặt

```bash
git clone https://github.com/vominhkhoalxag-hue/1clicksetup
cd 1clicksetup
npm install
```

### Tải Electron binary thủ công

> ⚠️ Bước này cần làm vì npm thường không tự tải được Electron binary ở VN do mạng chặn.

**1.** Tải file zip từ mirror:
```
https://npmmirror.com/mirrors/electron/28.3.3/electron-v28.3.3-win32-x64.zip
```

**2.** Giải nén, copy toàn bộ nội dung vào:
```
node_modules\electron\dist\
```
Thư mục `dist` phải chứa file `electron.exe` (~176MB).

**3.** Tạo file `path.txt`:
```bash
echo|set /p ="electron.exe" > node_modules\electron\path.txt
```

**4.** Chạy thử:
```bash
npm start
```

---

## Thêm app mới

Mở tab **⚙ Quản lý App** → **+ Thêm app** → gõ tên vào ô tìm kiếm để tìm trên winget.

Hoặc sửa trực tiếp `main/apps.json`.

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

## Lỗi thường gặp

| Lỗi | Cách xử lý |
|-----|------------|
| `Electron failed to install` | Làm theo hướng dẫn tải binary thủ công ở trên |
| winget search không ra kết quả | Cài winget tại [aka.ms/getwinget](https://aka.ms/getwinget) |
| Cài app lỗi permission | Right-click → **Run as administrator** |
