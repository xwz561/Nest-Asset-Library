; Keep the application executable icon unchanged. The desktop shortcut alone uses
; the supplied cat image after the normal electron-builder shortcut is created.
!include nsDialogs.nsh
!include LogicLib.nsh

!ifndef BUILD_UNINSTALLER
Var legacyVersionsFound
Var legacyCheckbox
Var welcomeDialog

!macro customWelcomePage
  !define MUI_INSTFILESPAGE_PROGRESSBAR "smooth"
  !define MUI_INSTFILESPAGE_COLORS "1F2937 F4F6FA"
  Page custom WelcomePageCreate
!macroend

Function WelcomePageCreate
  nsDialogs::Create 1018
  Pop $welcomeDialog
  ${If} $welcomeDialog == error
    Abort
  ${EndIf}

  SetCtlColors $welcomeDialog "" "F4F6FA"
  ${NSD_CreateLabel} 0 8u 92u 19u "小旺仔素材库"
  Pop $0
  CreateFont $1 "Microsoft YaHei UI" 12 700
  SendMessage $0 ${WM_SETFONT} $1 1
  SetCtlColors $0 "172033" "F4F6FA"

  ${NSD_CreateLabel} 0 39u 92u 18u "安装前说明"
  Pop $0
  SetCtlColors $0 "65738A" "F4F6FA"
  ${NSD_CreateLabel} 0 68u 92u 54u "继续后先选择安装范围，再设置安装位置。"
  Pop $0
  SetCtlColors $0 "536176" "F4F6FA"
  ${NSD_CreateLabel} 0 130u 92u 54u "安装完成前会显示实际的安装进度。"
  Pop $0
  SetCtlColors $0 "536176" "F4F6FA"
  ${NSD_CreateVLine} 98u 8u 1u 218u
  Pop $0
  ${NSD_CreateLabel} 112u 9u 138u 25u "把素材整理得清清楚楚"
  Pop $0
  CreateFont $1 "Microsoft YaHei UI" 15 700
  SendMessage $0 ${WM_SETFONT} $1 1
  SetCtlColors $0 "172033" "F4F6FA"
  ${NSD_CreateLabel} 113u 37u 138u 25u "安装素材库 ${VERSION}，继续管理本地创作素材。"
  Pop $0
  SetCtlColors $0 "536176" "F4F6FA"

  ${NSD_CreateLabel} 113u 73u 138u 28u "覆盖安装会保留素材库和应用设置。"
  Pop $0
  SetCtlColors $0 "536176" "F4F6FA"
  ${NSD_CreateLabel} 113u 105u 138u 28u "下一步先选择为当前用户或所有用户安装，然后设置安装位置。"
  Pop $0
  SetCtlColors $0 "536176" "F4F6FA"
  ${NSD_CreateLabel} 113u 139u 138u 42u "安装时会请求授权：局域网发现 UDP 47483、私聊传文件 TCP 43128，仅允许本地子网的电脑通信。"
  Pop $0
  SetCtlColors $0 "536176" "F4F6FA"
  nsDialogs::Show
FunctionEnd

!macro customPageAfterChangeDir
  Page custom LegacyVersionsPage LegacyVersionsPageLeave
!macroend

Function LegacyVersionsPage
  Call FindLegacyVersions
  ${If} $legacyVersionsFound != "true"
    Abort
  ${EndIf}
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 28u "检测到以前安装的小旺仔素材库版本。"
  Pop $0
  ${NSD_CreateLabel} 0 30u 100% 28u "可在继续安装前卸载它们，素材库和设置会保留。"
  Pop $0
  ${NSD_CreateCheckbox} 0 68u 100% 16u "卸载检测到的旧版本"
  Pop $legacyCheckbox
  ${NSD_Check} $legacyCheckbox
  nsDialogs::Show
FunctionEnd

Function LegacyVersionsPageLeave
  ${NSD_GetState} $legacyCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    Call RemoveLegacyVersions
  ${EndIf}
FunctionEnd

!macro FindLegacyVersionsInRegistry ROOT PATH LABEL
  StrCpy $0 0
  legacyFindLoop_${LABEL}:
    EnumRegKey $1 ${ROOT} "${PATH}" $0
    StrCmp $1 "" legacyFindDone_${LABEL}
    ReadRegStr $2 ${ROOT} "${PATH}\$1" "DisplayName"
    StrCpy $3 $2 6
    StrCmp $3 "小旺仔素材库" 0 legacyFindNext_${LABEL}
    ReadRegStr $3 ${ROOT} "${PATH}\$1" "DisplayVersion"
    StrCmp $3 "${VERSION}" legacyFindNext_${LABEL}
    ReadRegStr $3 ${ROOT} "${PATH}\$1" "UninstallString"
    StrCmp $3 "" legacyFindNext_${LABEL}
    StrCpy $legacyVersionsFound "true"
  legacyFindNext_${LABEL}:
    IntOp $0 $0 + 1
    Goto legacyFindLoop_${LABEL}
  legacyFindDone_${LABEL}:
!macroend

!macro RemoveLegacyVersionsInRegistry ROOT PATH LABEL
  StrCpy $0 0
  legacyRemoveLoop_${LABEL}:
    EnumRegKey $1 ${ROOT} "${PATH}" $0
    StrCmp $1 "" legacyRemoveDone_${LABEL}
    ReadRegStr $2 ${ROOT} "${PATH}\$1" "DisplayName"
    StrCpy $3 $2 6
    StrCmp $3 "小旺仔素材库" 0 legacyRemoveNext_${LABEL}
    ReadRegStr $3 ${ROOT} "${PATH}\$1" "DisplayVersion"
    StrCmp $3 "${VERSION}" legacyRemoveNext_${LABEL}
    ReadRegStr $4 ${ROOT} "${PATH}\$1" "UninstallString"
    StrCmp $4 "" legacyRemoveNext_${LABEL}
    ; The old executable can keep its own uninstaller blocked. The user chose
    ; to remove this legacy version, so close only this app before waiting.
    nsExec::ExecToLog 'taskkill /F /IM "小旺仔素材库.exe"'
    Pop $6
    Sleep 700
    ExecWait '$4 /S /KEEP_APP_DATA --updated' $5
    ${If} $5 != 0
      MessageBox MB_OK|MB_ICONEXCLAMATION "无法自动卸载 $2。新版会继续安装；你可稍后在 Windows 设置中手动卸载它。"
    ${Else}
      StrCpy $0 0
      Goto legacyRemoveLoop_${LABEL}
    ${EndIf}
  legacyRemoveNext_${LABEL}:
    IntOp $0 $0 + 1
    Goto legacyRemoveLoop_${LABEL}
  legacyRemoveDone_${LABEL}:
!macroend

Function FindLegacyVersions
  StrCpy $legacyVersionsFound ""
  !insertmacro FindLegacyVersionsInRegistry HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall" CU
  !insertmacro FindLegacyVersionsInRegistry HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall" LM64
  !insertmacro FindLegacyVersionsInRegistry HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall" LM32
FunctionEnd

Function RemoveLegacyVersions
  !insertmacro RemoveLegacyVersionsInRegistry HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall" CU
  !insertmacro RemoveLegacyVersionsInRegistry HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall" LM64
  !insertmacro RemoveLegacyVersionsInRegistry HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall" LM32
FunctionEnd
!endif

!macro customInstall
  FileOpen $0 "$INSTDIR\resources\installation-context.json" w
  FileWrite $0 '{"scope":"$installMode"}'
  FileClose $0
  ; Configure discovery and direct chat in one elevated helper. Both rules are
  ; limited to this executable, the local subnet, and their fixed ports.
  ${IfNot} ${Silent}
  ClearErrors
  ExecShell "runas" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\configure-lan-firewall.ps1" -ProgramPath "$INSTDIR\${APP_EXECUTABLE_FILENAME}" -InstallPath "$INSTDIR"' SW_HIDE
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONEXCLAMATION "没有添加局域网通信规则。其他电脑可能无法发现或连接本机；可重新运行安装程序并允许管理员授权。"
  ${EndIf}
  ${EndIf}

  ${ifNot} ${isNoDesktopShortcut}
    CreateShortCut "$newDesktopLink" "$appExe" "" "$INSTDIR\resources\desktop-shortcut-icon.ico" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  ${endIf}
!macroend

!macro customUnInstall
  ; Silent uninstall is also used during upgrades; retain the rule in that case.
  ${IfNot} ${Silent}
    ClearErrors
    ExecShellWait "runas" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\configure-lan-firewall.ps1" -ProgramPath "$INSTDIR\${APP_EXECUTABLE_FILENAME}" -InstallPath "$INSTDIR" -Remove' SW_HIDE
  ${EndIf}
!macroend
