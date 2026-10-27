'use strict';
const { app, BrowserWindow, Menu, ipcMain, dialog, nativeTheme } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { validateSave, atomicWrite } = require('./file-service.cjs');
const { ProjectFiles } = require('./project-files.cjs');
const { normalizeWindowSettings } = require('./window-settings.cjs');
const page = path.join(__dirname, '../renderer/index.html');
const pageUrl = pathToFileURL(page).href;
let window;
let settingsFile;
let settings = normalizeWindowSettings({});
let updates;
const projectFiles = new ProjectFiles();

if (process.env.SPINE_PHYSICS_TEST_DATA) {
  const directory = path.resolve(process.env.SPINE_PHYSICS_TEST_DATA);
  fs.mkdirSync(directory, { recursive: true });
  app.setPath('userData', directory);
}
app.setAppUserModelId('local.yugongmang.spinephysics');

function trusted(event) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== pageUrl) {
    throw new Error('Untrusted IPC sender');
  }
}

function persistSettings() {
  try { fs.writeFileSync(settingsFile, JSON.stringify(settings)); } catch { /* Optional window preferences. */ }
}

function createWindow() {
  nativeTheme.themeSource = 'dark';
  Menu.setApplicationMenu(null);
  window = new BrowserWindow({
    title: 'Spine Physics Presets',
    width: settings.width,
    height: settings.height,
    minWidth: 1060,
    minHeight: 650,
    backgroundColor: '#292a2c',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../renderer/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged || process.env.SPINE_PHYSICS_TEST === '1'
    }
  });
  const session = window.webContents.session;
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (url !== pageUrl) event.preventDefault(); });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.on('will-prevent-unload', event => {
    const response = dialog.showMessageBoxSync(window, {
      type: 'warning', title: 'JSON 尚未保存',
      message: '原 JSON 尚未保存。关闭或重新载入会丢失当前未保存的修改。',
      buttons: ['继续编辑', '放弃修改并关闭'], defaultId: 0, cancelId: 0, noLink: true
    });
    if (response === 1) event.preventDefault();
  });
  window.once('ready-to-show', () => {
    if (settings.maximized) window.maximize();
    window.show();
  });
  window.on('close', () => {
    const bounds = window.getNormalBounds();
    settings.width = bounds.width;
    settings.height = bounds.height;
    settings.maximized = window.isMaximized();
    persistSettings();
  });
  window.loadFile(page);
  window.webContents.once('did-finish-load', () => {
    if (!app.isPackaged || process.env.SPINE_PHYSICS_TEST === '1') return;
    const { autoUpdater } = require('electron-updater');
    autoUpdater.installDirectory = path.dirname(app.getPath('exe'));
    updates = require('./updates.cjs').createUpdates(autoUpdater, state => {
      if (window && !window.isDestroyed()) window.webContents.send('updates:state', state);
    }, async () => Boolean(await window.webContents.executeJavaScript('window.__spineTool.prepareUpdate()')),
      require('../../package.json').distribution === 'inno' ? async files => {
        await require('./inno-update.cjs').launchInstaller(files, path.dirname(app.getPath('exe')));
        app.quit();
      } : undefined);
    setTimeout(() => updates.check(), 2500).unref();
  });
}

ipcMain.handle('updates:get', event => { trusted(event); return updates?.snapshot() || { status: 'idle', version: '' }; });
ipcMain.handle('updates:activate', event => { trusted(event); return updates?.activate() || { status: 'idle', version: '' }; });

ipcMain.handle('app:info', event => {
  trusted(event);
  return { name: app.getName(), version: app.getVersion(), packaged: app.isPackaged };
});

ipcMain.handle('files:open', async (event, kind, retainedId) => {
  trusted(event);
  const filters = {
    project: [{ name: 'Spine JSON / binary / atlas / textures', extensions: ['json', 'skel', 'bytes', 'atlas', 'txt', 'png', 'jpg', 'jpeg', 'webp'] }],
    assets: [{ name: 'Spine atlas / textures', extensions: ['atlas', 'png', 'jpg', 'jpeg', 'webp'] }],
    presets: [{ name: 'Physics presets JSON', extensions: ['json'] }]
  };
  if (!filters[kind]) throw new Error('Unknown file picker');
  const picked = await dialog.showOpenDialog(window, {
    title: kind === 'presets' ? '导入预设库' : kind === 'assets' ? '选择 atlas 和纹理' : '打开 Spine 文件',
    defaultPath: settings.openDirectory,
    filters: filters[kind],
    properties: kind === 'presets' ? ['openFile'] : ['openFile', 'multiSelections']
  });
  if (picked.canceled) return [];
  const files = await projectFiles.read(picked.filePaths, kind, retainedId);
  if (files.length) {
    settings.openDirectory = path.dirname(picked.filePaths[0]);
    persistSettings();
  }
  return files;
});

ipcMain.handle('files:drop-project', async (event, paths, retainedId) => {
  trusted(event);
  if (!Array.isArray(paths) || !paths.length || paths.some(file => typeof file !== 'string' || !path.isAbsolute(file))) throw Error('无效的拖入文件。');
  return projectFiles.read(paths, 'project', retainedId);
});

ipcMain.handle('files:save-project', async (event, payload) => {
  trusted(event);
  return projectFiles.save(payload);
});

ipcMain.handle('files:save-json', async (event, payload) => {
  trusted(event);
  const { text, name } = validateSave(payload);
  const chosen = await dialog.showSaveDialog(window, {
    title: '保存 JSON',
    defaultPath: path.join(settings.saveDirectory || app.getPath('documents'), name),
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['showOverwriteConfirmation', 'createDirectory']
  });
  if (chosen.canceled || !chosen.filePath) return { canceled: true };
  if (path.extname(chosen.filePath).toLowerCase() !== '.json') throw new Error('Please save a .json file');
  await atomicWrite(chosen.filePath, text);
  settings.saveDirectory = path.dirname(chosen.filePath);
  persistSettings();
  return { canceled: false, path: chosen.filePath };
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(() => {
    settingsFile = path.join(app.getPath('userData'), 'window-settings.json');
    try { settings = normalizeWindowSettings(JSON.parse(fs.readFileSync(settingsFile, 'utf8'))); }
    catch { settings = normalizeWindowSettings({}); }
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
