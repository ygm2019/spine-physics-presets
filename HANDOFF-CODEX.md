# Spine Physics Presets: Codex Handoff

## Current: 2026-10-17, version 1.4.2

The user resumed and explicitly authorized packaging, making the repository public and publishing a Release after completion. This supersedes the paused publication below. Version 1.4.2 includes the simplified CLI locator, legacy install-directory migration and startup update notifications. electron-updater 6.8.9 is a production dependency; GitHub publish configuration generates app-update.yml/latest.yml. Never embed a GitHub token in the application. Upload EXE, blockmap and latest.yml before making the Release public.

The updater checks after window load, does not auto-download or auto-install on ordinary quit, and uses a fixed GitHub feed. The right-side activity panel offers download/progress/restart. Updates use the current executable directory. Before installation, prepareUpdate flushes pending edits and awaits bound-project saves; unsaved/error state blocks restart. NSIS detects the old unregistered Programs/CreativeTools/SpinePhysicsPresets deployment and preserves that exact directory. App identity and preset storage are unchanged.

Targeted tests only: 18 discovery/controller tests; packaged IPC/notice/progress/restart rendering and clean/unsaved-project guards. No real update installation or overall regression is performed. Do not claim a real cross-version update has been installed. Release metadata and installer payload must be verified. The app remains unsigned. No standalone native test EXE is generated.


## Current: 2026-10-17, version 1.4.1

The installer only locates an existing Spine.com. build/installer.nsh auto-discovers the CLI and skips the custom page when found; otherwise a minimal file picker asks for its location. Download/install/activation actions, dependency explanation and optional checkbox have been removed at the user's request. Successful installation saves the selected path to HKCU\Software\CreativeTools\SpinePhysicsPresets, SpineCliPath (64-bit view). Canceling setup writes nothing. Runtime discovery reads both registry views, environment/PATH, local drive common paths and uninstall/App Paths entries.

The user paused publishing. The repository was still private and no Release was uploaded at the pause. Source commit c85a270 had already been pushed before the pause; this simplified installer is a subsequent local change. Do not make the repository public or publish a Release until the user resumes that work. Repackaging this simplified version and targeted tests are authorized. Do not rerun the whole regression, install over the live program or alter the running Spine/user presets.

The discarded standalone installer-check.exe test helper was detected by Huorong as Trojan/Injector.bfx. Its source generated a dummy CLI in a temporary directory to test discovery; it contained no process injection code. The exact detector trigger is unknown, so do not claim a vendor-confirmed false positive or antivirus clearance. The helper and its generation script are removed, must not be regenerated/restored, and are not part of the product payload. Use Node discovery tests and the real setup wizard instead. Do not disable antivirus or add exclusions. The final installer is unsigned.

## Current: 2026-10-17, version 1.4.0

The GitHub repository is now the maintenance source. See CHANGELOG.md for all changes since 1.3.1, including earlier local selection, rendering and preset improvements plus parameter auto-apply. Parameter edits patch only changed fields and retain transactional runtime validation, history and autosave. The apply button is removed; Ctrl+Enter flushes pending edits. Use npm run test:auto-parameters for browser regression (Chrome or CHROME_PATH required). Historical source/install paths and draft-only parameter behavior below are superseded. No new NSIS installer is published in this update.

Local progress and installed app.asar continue to be saved under E:\agent\spine物理预设软件 and mirrored to the user-designated NAS project directory. These machine-specific copies are not the repository publication artifacts.

## Current release: 2026-10-10, version 1.3.1

User explicitly authorized repackaging after the inheritance alignment fix. The inheritance row now uses 8px horizontal padding, matching the parameter-label text. The packaged EXE verified identical text-left positions at 1440px and 1060px window widths. Syntax checks, all 82 unit tests and packaged desktop smoke passed. Desktop default presets were synced again. Installer: C:\Users\22386\Documents\Codex\2026-10-08\1\outputs\Spine-Physics-Presets-Setup-1.3.1.exe. This release supersedes the 1.3.0 package below. No installation performed.


## Current handoff: 2026-10-08, version 1.3.0

The following sections describe the previous 1.2.0 baseline. This section takes precedence for the current release.

- Source remains `C:\software\agent\spine-physics-desktop` (there is no `spine-physics-desktop1` directory).
- The user authorized implementing all five requested changes, consolidated testing, and packaging. Installation was not requested or performed.
- Delivered installer: `C:\Users\22386\Documents\Codex\2026-10-08\1\outputs\Spine-Physics-Presets-Setup-1.3.0.exe`.
- Shortcuts now have a dark category-based settings dialog with key capture, duplicate detection, defaults, save/cancel and local persistence. Mouse empty-canvas deselection remains unchanged. The keyboard deselection defaults are Esc and Ctrl+Shift+A; same-color selection defaults to Ctrl+Q. Same-color matching ignores case and alpha, and uses the displayed default color for bones without an explicit color. Input fields and dialogs retain their editing scopes.
- Selecting or dropping one skeleton, atlas or texture discovers same-directory companions. Supports `.json`, `.skel`, `.skel.bytes`, `.atlas`, `.atlas.txt` and atlas-referenced textures. Multiple ambiguous skeletons require choosing a concrete skeleton. Atlas paths cannot escape the import directory.
- Binary import requires an installed, activated official Spine CLI. `binary-import.cjs` locates Spine.com using common installation paths, `SPINE_CLI`, and the user uninstall registry. Conversion uses the binary's exact Spine version, includes nonessential data, and writes an exclusive `.physics.json` (or numbered variant) next to the binary. Existing JSON and original binary bytes are never overwritten by conversion. The generated JSON is the editing/autosave target. Users take that JSON back into Spine via Import Data.
- Rotation/scale inheritance checkboxes sit above movement/rotation/scale parameters. They edit bone inheritance directly with official runtime transaction, undo/redo and autosave. Mixed selections show indeterminate checkboxes. Legacy preset `noScale` values remain accepted; inheritance is never emitted on the physics constraint.
- The lower-right animation panel is a flat scrollable list, as explicitly requested in the user's follow-up. It contains setup pose and the skeleton's animation names, click-to-play, pause/stop, loop, speed and seeking. Default playback shortcut is Space. Animation/log separator supports pointer dragging and arrow-key resizing. Preview playback does not modify exported animation data or setup pose.
- Fixed the reported `$ is not a function or its return value is not iterable` error in animation-list node traversal. Also adapted AnimationState track access for Spine 4.2/4.3 API differences.
- Default library was synced and packaged from the Desktop JSON: 头发, 胸部, 蓬松衣服. Existing local libraries are preserved; restore-defaults is explicit.
- Validation: 82 Node unit tests; all 14 desktop regression suites; real official binary export/import tests for Spine 4.2.43 and 4.3.26; packaged EXE smoke, new-feature and default-library suites. All passed. Installer's 73 extracted payload files match unpacked file hashes; ASAR default library matches the Desktop JSON exactly. Installer is unsigned.
- New checks: `node scripts/features-smoke.cjs [exe]`, `node scripts/binary-smoke.cjs`, `node scripts/verify-release.cjs`. Binary checks use generated test assets and may launch CLI conversion; they never use the user's working skeletons.


## 1. Open the correct project

Use this source directory:

```text
C:\software\agent\spine-physics-desktop
```

This is the source project. Do not continue from the installer in `D:\download` and do not edit `dist/win-unpacked` directly.

The project is a standalone Electron app, not WinUI 3:

- Electron `44.6.0`
- HTML/CSS/JavaScript renderer
- Node main process with sandboxed `contextIsolation`
- Official Spine WebGL runtimes `4.2.120` and `4.3.13`
- `electron-builder 26.15.3` with NSIS
- Playwright Core desktop smoke tests

## 2. Start development

From the project root:

```powershell
npm install
npm start
```

The Windows development shortcut is also available:

```text
Start-Development.cmd
```

Use a copy of a Spine JSON while testing. Do not open or overwrite the user's working Spine project.

## 3. Current release state

Current source version: `1.2.0`.

The last authorized package was completed and delivered here:

```text
D:\download\Spine-Physics-Presets-Setup-1.2.0.exe
D:\download\Spine-Physics-Presets-Setup-1.2.0.exe.sha256
```

The installer was not installed. Its Setup wizard was opened and verified manually: it has an editable installation path and a Browse button. The NSIS settings that must remain are:

```json
"oneClick": false,
"allowToChangeInstallationDirectory": true,
"perMachine": false,
"allowElevation": false
```

The installer is unsigned. Do not claim that it is digitally signed.

## 4. Embedded default preset library

The packaged default library must come from this user file:

```text
C:\Users\22386\Desktop\spine-physics-presets1.json
```

The build-time sync script is:

```text
scripts/sync-default-presets.cjs
```

It generates:

```text
src/renderer/default-presets.js
```

The generated resource is loaded before `app.js` by `src/renderer/index.html`. It currently contains the three user presets named `头发`, `胸部`, and `蓬松衣服`.

Rules:

- Do not modify the Desktop source JSON.
- A fresh profile uses the embedded library.
- An existing user's local preset library remains authoritative and must not be overwritten automatically.
- Explicit restore-defaults may replace the local library.
- Before any future authorized package, run the sync script and verify the generated library against the Desktop JSON.

## 5. Important product behavior

The app edits exported Spine JSON and returns to Spine through `Import Data`; it does not live-sync a `.spine` project.

The current workflow is:

1. In Spine, export JSON with `非必要的数据` and `纹理图集的打包` enabled.
2. In this app, use the upper-left unified picker/drop target for JSON + atlas + textures.
3. Select bones with left click, Ctrl+left click, right drag, or Ctrl+left drag. Apply a preset or edit the right physics inspector, then apply physics parameters.
4. Left-drag empty canvas to test physics. Middle-drag pans; wheel zooms.
5. Committed project changes auto-save the originally imported JSON. In Spine, use `Import -> Import Data`, then choose a new project.

The selection model uses the conditional four-stage Ctrl+A cycle:

- Middle-of-chain selection: complete the chain, then peer chains, then all bones, then cycle back.
- Chain-head selection skips a redundant completion stage.
- Selection-only actions do not write JSON or project history.

The official runtime must stay enabled by default. Do not reintroduce the removed toolbar, built-in wireframe mode, physics-live checkbox, separate atlas/texture picker, or runtime status row.

## 6. Areas that must not regress

- Preserve Spine 4.2 and 4.3 JSON differences.
- Preserve unknown JSON fields, setup pose, skins, animations, and `*Global` values.
- `scaleY` in Spine 4.3 is a mode (`uniform` or `volume`), not a numeric influence and not `scaleYMode` in exported JSON.
- `noScale` belongs to bone inheritance, not the physics constraint.
- Project edits use staged official-runtime transactions. If runtime rebuild fails, retain the old project state.
- Auto-save uses the imported source capability, first-write backup, conflict checking, and atomic replacement.
- Existing user files and Spine projects are never test fixtures.
- Keep the lower-left mouse-selection legend in the preview stage. It must not overlap the lower-right visibility controls.
- Keep the help dialog scrollable and synchronized with implemented keyboard and mouse behavior.

## 7. Verification commands

Small source edits do not need an individual review or test run. The user requested one consolidated verification before each authorized package. Do not package again until the user explicitly says to package.

Basic source checks:

```powershell
npm run check
npm test
```

Development/runtime smoke tests:

```powershell
npm run test:desktop
npm run test:constraints
npm run test:damping
npm run test:presets
npm run test:preset-library
npm run test:scale
npm run test:save
npm run test:import-race
npm run test:workflow
npm run test:chain-selection
npm run test:default-presets
npm run test:help
node scripts/tree-collapse-smoke.cjs
```

The last completed release verification was:

- 80 Node unit tests passed.
- 113 development desktop/runtime checks passed.
- 55 packaged-EXE checks passed.
- Packaged ASAR default library matched the Desktop JSON exactly.
- Installer payload contained 75 files and matched the unpacked payload by hash.

## 8. Safe iteration rules

Before editing, inspect the existing implementation and current user changes. This directory is not a Git repository, so do not assume `git diff` or branches are available.

Use the existing patterns in:

- `src/desktop/main.cjs`
- `src/desktop/preload.cjs`
- `src/desktop/project-files.cjs`
- `src/renderer/app.js`
- `src/renderer/workflow-model.js`
- `src/renderer/usage-guide.js`
- `src/renderer/desktop.css`
- `tests/`
- `scripts/`

Do not install the app, overwrite the existing installation, or close the user's Spine instance. Do not package until explicitly authorized.

## 9. First prompt to paste into Codex

```text
Read HANDOFF-CODEX.md first. Work in C:\\software\\agent\\spine-physics-desktop. Inspect the current source before changing anything. This is an Electron Spine 4.2/4.3 physics JSON editor. Preserve the existing JSON safety rules, official runtime transaction flow, auto-save safeguards, four-stage Ctrl+A selection behavior, embedded Desktop preset-library behavior, and assisted NSIS installation-directory configuration. Do not package or install; I will explicitly authorize packaging later. For the next change, make only the requested scoped edit and report changed files and any tests actually run.
```

If continuing from ChatGPT/Codex web, upload this file or paste the first prompt above, then tell Codex the next concrete change. If using local Codex CLI, open the project directory and run `codex` there.
