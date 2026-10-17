; Dependency setup is an assisted page, including during upgrades.
; Paths are saved only by customInstall, never by opening/canceling setup.
!include MUI2.nsh
!include nsDialogs.nsh
!include WinVer.nsh
!include x64.nsh
!include FileFunc.nsh
!include WordFunc.nsh

!ifndef BUILD_UNINSTALLER
Var spDialog
Var spPathEdit
Var spFound
Var spSelected
Var spCandidate
Var spTemp
Var spName
Var spDriveIndex
Var spDriveLetter
Var spDriveType
Var spRegIndex
Var spRegName
Var spPathIndex
Var spPathList
Var spButton

!macro customInit
  Call SP_LegacyDirectory
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "需要 Windows 10 或更新版本。"
    Quit
  ${EndIf}
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "需要 64 位 Windows。"
    Quit
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  !undef MUI_PAGE_CUSTOMFUNCTION_PRE
  !define MUI_PAGE_CUSTOMFUNCTION_PRE SP_InstallPre
  Page custom SP_DependencyPage SP_DependencyLeave
!macroend

; The old local deployment has no NSIS registration. Prefer its existing folder
; only when there is no registered install and the user has not chosen another path.
!macro customWelcomePage
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE SP_LegacyDirectory
!macroend

Function SP_LegacyDirectory
  ReadRegStr $spTemp HKCU "Software\${APP_GUID}" "InstallLocation"
  ${If} $spTemp != ""
    Return
  ${EndIf}
  ReadRegStr $spTemp HKLM "Software\${APP_GUID}" "InstallLocation"
  ${If} $spTemp != ""
    Return
  ${EndIf}
  ${If} $INSTDIR == "$LOCALAPPDATA\Programs\${APP_FILENAME}"
    IfFileExists "$LOCALAPPDATA\Programs\CreativeTools\SpinePhysicsPresets\Spine Physics Presets.exe" 0 sp_legacy_done
    StrCpy $INSTDIR "$LOCALAPPDATA\Programs\CreativeTools\SpinePhysicsPresets"
  ${EndIf}
  sp_legacy_done:
FunctionEnd

Function SP_InstallPre
  ${If} $INSTDIR == "$LOCALAPPDATA\Programs\CreativeTools\SpinePhysicsPresets"
    ; Preserve the legacy directory verbatim, without adding a spaced product subfolder.
    Return
  ${EndIf}
  Call instFilesPre
FunctionEnd

Function SP_CheckCandidate
  ${If} $spFound != ""
    Return
  ${EndIf}
  ${If} $spCandidate == ""
    Return
  ${EndIf}
  StrCpy $spName $spCandidate 1
  ${If} $spName == '"'
    StrCpy $spCandidate $spCandidate -1 1
  ${EndIf}
  ; Accept the CLI itself, the GUI launcher, or an installation directory.
  ${GetFileName} "$spCandidate" $spName
  ${If} $spName == "Spine.exe"
    ${GetParent} "$spCandidate" $spTemp
    StrCpy $spCandidate "$spTemp\Spine.com"
  ${ElseIf} $spName != "Spine.com"
    StrCpy $spCandidate "$spCandidate\Spine.com"
  ${EndIf}
  IfFileExists "$spCandidate" 0 sp_check_done
  ; Do not mistake a directory named Spine.com for an executable.
  IfFileExists "$spCandidate\*.*" sp_check_done 0
  StrCpy $spFound "$spCandidate"
  sp_check_done:
FunctionEnd

!macro SP_Registry HIVE VIEW
  SetRegView ${VIEW}
  StrCpy $spRegIndex 0
  ${Do}
    EnumRegKey $spRegName ${HIVE} "Software\Microsoft\Windows\CurrentVersion\Uninstall" $spRegIndex
    ${If} $spRegName == ""
      ${ExitDo}
    ${EndIf}
    ReadRegStr $spCandidate ${HIVE} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$spRegName" "InstallLocation"
    Call SP_CheckCandidate
    ${If} $spFound != ""
      ${ExitDo}
    ${EndIf}
    IntOp $spRegIndex $spRegIndex + 1
  ${Loop}
  ReadRegStr $spCandidate ${HIVE} "Software\Microsoft\Windows\CurrentVersion\App Paths\Spine.exe" ""
  Call SP_CheckCandidate
!macroend

Function SP_FindSpine
  StrCpy $spFound ""
  ReadEnvStr $spCandidate "SPINE_CLI"
  Call SP_CheckCandidate
  SetRegView 64
  ReadRegStr $spCandidate HKCU "Software\CreativeTools\SpinePhysicsPresets" "SpineCliPath"
  Call SP_CheckCandidate
  SetRegView 32
  ReadRegStr $spCandidate HKCU "Software\CreativeTools\SpinePhysicsPresets" "SpineCliPath"
  Call SP_CheckCandidate
  StrCpy $spCandidate "$PROGRAMFILES64\Spine"
  Call SP_CheckCandidate
  StrCpy $spCandidate "$PROGRAMFILES32\Spine"
  Call SP_CheckCandidate
  StrCpy $spCandidate "$LOCALAPPDATA\Programs\Spine"
  Call SP_CheckCandidate
  ReadEnvStr $spPathList "PATH"
  StrCpy $spPathIndex 1
  ${Do}
    ${WordFind} "$spPathList" ";" "+$spPathIndex" $spCandidate
    ${If} $spCandidate == ""
      ${ExitDo}
    ${EndIf}
    Call SP_CheckCandidate
    ${If} $spFound != ""
      ${ExitDo}
    ${EndIf}
    IntOp $spPathIndex $spPathIndex + 1
    ${If} $spPathIndex > 256
      ${ExitDo}
    ${EndIf}
  ${Loop}
  StrCpy $spDriveIndex 0
  ${DoWhile} $spDriveIndex < 26
    ${If} $spFound != ""
      ${ExitDo}
    ${EndIf}
    StrCpy $spDriveLetter "CDEFGHIJKLMNOPQRSTUVWXYZAB" 1 $spDriveIndex
    System::Call 'kernel32::GetDriveTypeW(w "$spDriveLetter:\") i .r0'
    StrCpy $spDriveType $0
    ; Scan fixed local disks only; never recursively scan projects/network drives.
    ${If} $spDriveType == 3
      StrCpy $spCandidate "$spDriveLetter:\Spine"
      Call SP_CheckCandidate
      StrCpy $spCandidate "$spDriveLetter:\software\Spine"
      Call SP_CheckCandidate
      StrCpy $spCandidate "$spDriveLetter:\软件\Spine"
      Call SP_CheckCandidate
      StrCpy $spCandidate "$spDriveLetter:\Program Files\Spine"
      Call SP_CheckCandidate
      StrCpy $spCandidate "$spDriveLetter:\Program Files (x86)\Spine"
      Call SP_CheckCandidate
    ${EndIf}
    IntOp $spDriveIndex $spDriveIndex + 1
  ${Loop}
  !insertmacro SP_Registry HKCU 64
  !insertmacro SP_Registry HKCU 32
  !insertmacro SP_Registry HKLM 64
  !insertmacro SP_Registry HKLM 32
  SetRegView 64
  ClearErrors
FunctionEnd

Function SP_Browse
  Pop $spButton
  nsDialogs::SelectFileDialog open "" "Spine CLI (Spine.com)|Spine.com"
  Pop $spCandidate
  ${If} $spCandidate != ""
    StrCpy $spFound ""
    Call SP_CheckCandidate
    ${NSD_SetText} $spPathEdit "$spFound"
  ${EndIf}
FunctionEnd

Function SP_DependencyPage
  Call SP_LegacyDirectory
  Call SP_FindSpine
  StrCpy $spSelected "$spFound"
  ; Normally nothing to confirm: a discovered CLI skips this fallback page.
  ${If} $spFound != ""
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "选择 Spine 路径" "未自动找到 Spine.com，请指定文件位置。"
  nsDialogs::Create 1018
  Pop $spDialog
  ${If} $spDialog == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 12u 100% 20u "请选择 Spine 安装目录中的 Spine.com。"
  Pop $spTemp
  ${NSD_CreateText} 0 39u 78% 13u ""
  Pop $spPathEdit
  ${NSD_CreateButton} 80% 38u 20% 15u "浏览…"
  Pop $spButton
  ${NSD_OnClick} $spButton SP_Browse
  nsDialogs::Show
FunctionEnd

Function SP_DependencyLeave
  ${NSD_GetText} $spPathEdit $spCandidate
  StrCpy $spFound ""
  Call SP_CheckCandidate
  ${If} $spFound == ""
    MessageBox MB_ICONEXCLAMATION "请选择有效的 Spine.com 文件。"
    Abort
  ${EndIf}
  StrCpy $spSelected "$spFound"
FunctionEnd

!macro customInstall
  ${If} ${Silent}
    Call SP_FindSpine
    StrCpy $spSelected "$spFound"
  ${EndIf}
  ${If} $spSelected != ""
    SetRegView 64
    WriteRegStr HKCU "Software\CreativeTools\SpinePhysicsPresets" "SpineCliPath" "$spSelected"
  ${EndIf}
!macroend
!endif
