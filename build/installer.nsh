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
Var spStatus
Var spEnable
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
  Page custom SP_DependencyPage SP_DependencyLeave
!macroend

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

Function SP_UpdateStatus
  ${If} $spFound == ""
    ${NSD_SetText} $spStatus "未找到 Spine.com：仍可安装并使用 JSON 功能。"
  ${Else}
    ${NSD_SetText} $spStatus "已找到 Spine.com。首次二进制转换前请在 Spine 中激活。"
  ${EndIf}
FunctionEnd

Function SP_Recheck
  Pop $spButton
  ; Prefer the currently entered location, then retry automatic discovery.
  ${NSD_GetText} $spPathEdit $spCandidate
  StrCpy $spFound ""
  Call SP_CheckCandidate
  ${If} $spFound == ""
    Call SP_FindSpine
  ${EndIf}
  ${NSD_SetText} $spPathEdit "$spFound"
  Call SP_UpdateStatus
FunctionEnd

Function SP_Browse
  Pop $spButton
  nsDialogs::SelectFileDialog open "" "Spine CLI (Spine.com)|Spine.com|Spine launcher (Spine.exe)|Spine.exe"
  Pop $spCandidate
  ${If} $spCandidate != ""
    StrCpy $spFound ""
    Call SP_CheckCandidate
    ${NSD_SetText} $spPathEdit "$spFound"
    Call SP_UpdateStatus
  ${EndIf}
FunctionEnd

Function SP_Download
  Pop $spButton
  ExecShell "open" "https://esotericsoftware.com/spine-getting-started"
FunctionEnd

Function SP_InstallDependency
  Pop $spButton
  nsDialogs::SelectFileDialog open "" "官方 Spine 安装程序 (*.exe)|*.exe"
  Pop $spTemp
  ${If} $spTemp != ""
    ClearErrors
    ExecShell "open" "$spTemp"
    ${If} ${Errors}
      MessageBox MB_ICONEXCLAMATION "无法运行安装程序。请确认文件有效，并允许官方安装程序所需的系统权限。"
    ${Else}
      MessageBox MB_ICONINFORMATION "请在打开的 Spine 安装程序中完成安装，然后返回此页点击“重新检测”。"
    ${EndIf}
  ${EndIf}
FunctionEnd

Function SP_Activate
  Pop $spButton
  ${NSD_GetText} $spPathEdit $spCandidate
  StrCpy $spFound ""
  Call SP_CheckCandidate
  ${If} $spFound != ""
    ${GetParent} "$spFound" $spTemp
    IfFileExists "$spTemp\Spine.exe" 0 sp_activate_missing
    ExecShell "open" "$spTemp\Spine.exe"
    Return
  ${EndIf}
  sp_activate_missing:
  MessageBox MB_ICONINFORMATION "请先安装 Spine，或选择有效的 Spine.com 路径。"
FunctionEnd

Function SP_DependencyPage
  !insertmacro MUI_HEADER_TEXT "环境与依赖" "检查运行环境，并配置二进制骨架导入所需的 Spine。"
  nsDialogs::Create 1018
  Pop $spDialog
  ${If} $spDialog == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 21u "系统：64 位 Windows 10 或更新版本。运行组件：已包含 Electron / Node.js / Chromium，无需额外下载。"
  Pop $spTemp
  ${NSD_CreateCheckbox} 0 25u 100% 12u "配置二进制导入（.skel / .skel.bytes，需要官方 Spine）"
  Pop $spEnable
  ${NSD_CreateLabel} 0 43u 100% 12u "Spine.com 路径："
  Pop $spTemp
  ${NSD_CreateText} 0 58u 78% 13u ""
  Pop $spPathEdit
  ${NSD_CreateButton} 80% 57u 20% 15u "浏览…"
  Pop $spButton
  ${NSD_OnClick} $spButton SP_Browse
  ${NSD_CreateLabel} 0 77u 100% 19u ""
  Pop $spStatus
  ${NSD_CreateButton} 0 99u 24% 16u "官方下载说明"
  Pop $spButton
  ${NSD_OnClick} $spButton SP_Download
  ${NSD_CreateButton} 25% 99u 24% 16u "运行安装程序…"
  Pop $spButton
  ${NSD_OnClick} $spButton SP_InstallDependency
  ${NSD_CreateButton} 50% 99u 24% 16u "重新检测"
  Pop $spButton
  ${NSD_OnClick} $spButton SP_Recheck
  ${NSD_CreateButton} 75% 99u 25% 16u "打开 Spine 激活"
  Pop $spButton
  ${NSD_OnClick} $spButton SP_Activate
  ${NSD_CreateLabel} 0 122u 100% 27u "没有 Spine：可从许可证页面下载完整版，再在此运行安装程序。试用版不支持导出，不能用于二进制转换。激活和首次下载编辑器版本需要联网；JSON 功能可跳过此项。"
  Pop $spTemp
  Call SP_FindSpine
  ${NSD_SetText} $spPathEdit "$spFound"
  ${If} $spFound != ""
    ${NSD_Check} $spEnable
  ${EndIf}
  Call SP_UpdateStatus
  nsDialogs::Show
FunctionEnd

Function SP_DependencyLeave
  StrCpy $spSelected ""
  ${NSD_GetState} $spEnable $spTemp
  ${If} $spTemp == ${BST_CHECKED}
    ${NSD_GetText} $spPathEdit $spCandidate
    StrCpy $spFound ""
    Call SP_CheckCandidate
    ${If} $spFound == ""
      MessageBox MB_ICONEXCLAMATION "未找到有效的 Spine.com。请先安装、浏览或重新检测；也可以取消勾选，继续安装 JSON 功能。"
      Abort
    ${EndIf}
    StrCpy $spSelected "$spFound"
  ${EndIf}
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
