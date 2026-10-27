#ifndef AppVersion
  #error AppVersion must be provided by scripts/build-inno.cjs
#endif
[Setup]
AppId=local.yugongmang.spinephysics
AppName=Spine Physics Presets
AppVersion={#AppVersion}
AppPublisher=Yugongmang
DefaultDirName={code:GetInstallDir}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputBaseFilename=Spine-Physics-Presets-Setup-{#AppVersion}
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\Spine Physics Presets.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
SetupLogging=yes

[Languages]
Name: chinese; MessagesFile: "ChineseSimplified.isl"

[Tasks]
Name: desktopicon; Description: "创建桌面快捷方式"; Flags: checkedonce

[Files]
Source: "..\dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userprograms}\Spine Physics Presets"; Filename: "{app}\Spine Physics Presets.exe"; Check: not WizardNoIcons
Name: "{userdesktop}\Spine Physics Presets"; Filename: "{app}\Spine Physics Presets.exe"; Tasks: desktopicon; Check: not WizardNoIcons

[Registry]
Root: HKCU; Subkey: "Software\CreativeTools\SpinePhysicsPresets"; ValueType: string; ValueName: "InstallDir"; ValueData: "{app}"
Root: HKCU; Subkey: "Software\CreativeTools\SpinePhysicsPresets"; ValueType: string; ValueName: "SpineCliPath"; ValueData: "{code:GetSpineCli}"; Check: HasSpineCli

[Run]
Filename: "{app}\Spine Physics Presets.exe"; Description: "启动 Spine Physics Presets"; Flags: nowait postinstall skipifsilent

[Code]
var
  SpinePage: TInputFileWizardPage;
  SpineCli: String;

function GetInstallDir(Param: String): String;
var
  Keys: TArrayOfString;
  I: Integer;
  Dir, Name, Key: String;
begin
  if RegQueryStringValue(HKCU, 'Software\CreativeTools\SpinePhysicsPresets', 'InstallDir', Dir) and FileExists(Dir + '\Spine Physics Presets.exe') then begin
    Result := Dir; Exit;
  end;
  Key := 'Software\Microsoft\Windows\CurrentVersion\Uninstall';
  if RegGetSubkeyNames(HKCU, Key, Keys) then
    for I := 0 to GetArrayLength(Keys) - 1 do
      if RegQueryStringValue(HKCU, Key + '\' + Keys[I], 'DisplayName', Name) and (Name = 'Spine Physics Presets') then
        if RegQueryStringValue(HKCU, Key + '\' + Keys[I], 'InstallLocation', Dir) and FileExists(Dir + '\Spine Physics Presets.exe') then begin
          Result := Dir; Exit;
        end;
  Result := ExpandConstant('{localappdata}\Programs\CreativeTools\SpinePhysicsPresets');
end;

procedure CheckSpine(Candidate: String);
begin
  if (SpineCli <> '') or (Candidate = '') then Exit;
  Candidate := RemoveQuotes(Candidate);
  if CompareText(ExtractFileName(Candidate), 'Spine.exe') = 0 then Candidate := ExtractFilePath(Candidate) + 'Spine.com'
  else if CompareText(ExtractFileName(Candidate), 'Spine.com') <> 0 then Candidate := AddBackslash(Candidate) + 'Spine.com';
  if FileExists(Candidate) then SpineCli := Candidate;
end;

procedure InitializeWizard;
var
  Candidate, Paths: String;
  I, P: Integer;
begin
  CheckSpine(GetEnv('SPINE_CLI'));
  if RegQueryStringValue(HKCU64, 'Software\CreativeTools\SpinePhysicsPresets', 'SpineCliPath', Candidate) then CheckSpine(Candidate);
  if RegQueryStringValue(HKCU32, 'Software\CreativeTools\SpinePhysicsPresets', 'SpineCliPath', Candidate) then CheckSpine(Candidate);
  CheckSpine(ExpandConstant('{autopf}\Spine'));
  CheckSpine(ExpandConstant('{localappdata}\Programs\Spine'));
  Paths := GetEnv('PATH') + ';';
  while Pos(';', Paths) > 0 do begin
    P := Pos(';', Paths); CheckSpine(Copy(Paths, 1, P - 1)); Delete(Paths, 1, P);
  end;
  for I := 67 to 90 do begin
    Candidate := Chr(I) + ':';
    CheckSpine(Candidate + '\Spine');
    CheckSpine(Candidate + '\software\Spine');
    CheckSpine(Candidate + '\Program Files\Spine');
    CheckSpine(Candidate + '\Program Files (x86)\Spine');
  end;
  SpinePage := CreateInputFilePage(wpSelectDir, 'Spine.com', '选择已有的 Spine.com', '导入二进制工程需要 Spine.com；只使用 JSON 可以留空。');
  SpinePage.Add('Spine.com:', 'Spine CLI|Spine.com', '.com');
  SpinePage.Values[0] := SpineCli;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := (PageID = SpinePage.ID) and (SpineCli <> '');
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = SpinePage.ID then begin
    SpineCli := '';
    CheckSpine(SpinePage.Values[0]);
    Result := (SpineCli <> '') or (SpinePage.Values[0] = '');
    if not Result then MsgBox('请选择已有的 Spine.com，或将此项留空。', mbError, MB_OK);
  end;
end;

function GetSpineCli(Param: String): String;
begin
  Result := SpineCli;
end;

function HasSpineCli: Boolean;
begin
  Result := SpineCli <> '';
end;
