; installer.nsh — xoá sạch khi uninstall

!macro customUnInstall
  ; Xoá thư mục cài đặt
  RMDir /r "$LOCALAPPDATA\Programs\1clicksetup"

  ; Xoá thư mục update (electron-updater)
  RMDir /r "$LOCALAPPDATA\1ClickSetup"
  RMDir /r "$LOCALAPPDATA\1clicksetup-updater"

  ; Xoá dữ liệu người dùng (apps.json + Electron cache)
  RMDir /r "$APPDATA\1ClickSetup"

  ; Xoá thư mục Temp nếu còn
  RMDir /r "$LOCALAPPDATA\Temp\1clicksetup_tmp"

  ; Chỉ xoá shortcut của chính app này
  Delete "$DESKTOP\1ClickSetup.lnk"
  Delete "$SMPROGRAMS\1ClickSetup\1ClickSetup.lnk"
  RMDir "$SMPROGRAMS\1ClickSetup"
!macroend
