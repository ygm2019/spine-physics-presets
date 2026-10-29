#ifndef AppVersion
  #error AppVersion required
#endif
[Setup]
AppId=local.yugongmang.spinephysics.joystick
AppName=spine物理预设-摇杆调节版
AppVersion={#AppVersion}
AppPublisher=Yugongmang
DefaultDirName={localappdata}\Programs\CreativeTools\SpinePhysicsJoystick
DisableDirPage=no
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputBaseFilename=Spine-Physics-Joystick-Setup-{#AppVersion}
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\spine物理预设-摇杆调节版.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=no
RestartApplications=no
SetupLogging=yes

[Languages]
Name: chinese; MessagesFile: "ChineseSimplified.isl"

[Tasks]
Name: desktopicon; Description: "创建摇杆调节版桌面快捷方式"; Flags: checkedonce

[Files]
Source: "..\dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userprograms}\spine物理预设-摇杆调节版"; Filename: "{app}\spine物理预设-摇杆调节版.exe"
Name: "{userdesktop}\spine物理预设-摇杆调节版"; Filename: "{app}\spine物理预设-摇杆调节版.exe"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\CreativeTools\SpinePhysicsJoystick"; ValueType: string; ValueName: "InstallDir"; ValueData: "{app}"

[Run]
Filename: "{app}\spine物理预设-摇杆调节版.exe"; Description: "启动摇杆调节版"; Flags: nowait postinstall skipifsilent unchecked

[Code]
function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = wpSelectDir) and FileExists(AddBackslash(WizardDirValue) + 'Spine Physics Presets.exe') then begin
    MsgBox('此目录含稳定版，请为摇杆调节版选择独立目录。', mbError, MB_OK);
    Result := False;
  end;
end;
