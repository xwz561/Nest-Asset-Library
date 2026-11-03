; Keep the application executable icon unchanged. The desktop shortcut alone uses
; the supplied cat image after the normal electron-builder shortcut is created.
!include nsDialogs.nsh
!include LogicLib.nsh

!ifndef BUILD_UNINSTALLER
Var legacyVersionsFound
Var legacyCheckbox

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
  ${ifNot} ${isNoDesktopShortcut}
    CreateShortCut "$newDesktopLink" "$appExe" "" "$INSTDIR\resources\desktop-shortcut-icon.ico" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  ${endIf}
!macroend
