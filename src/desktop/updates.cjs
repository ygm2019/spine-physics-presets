'use strict';
// No renderer-provided URLs or executable paths are accepted by this controller.
function createUpdates(updater, changed, prepareInstall = async () => true, installDownloaded) {
  let state = { status: 'idle', version: '', percent: 0, message: '' };
  let busy = false;
  let downloadedFiles = [];
  const set = patch => { state = { ...state, ...patch }; changed({ ...state }); };
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.disableDifferentialDownload = true;
  updater.on('update-available', info => set({ status: 'available', version: String(info.version), percent: 0, message: '' }));
  updater.on('update-not-available', () => set({ status: 'idle', version: '', message: '' }));
  updater.on('download-progress', info => set({ status: 'downloading', percent: Math.min(100, Math.max(0, Math.floor(Number(info.percent) || 0))) }));
  updater.on('update-downloaded', info => set({ status: 'downloaded', version: String(info.version), percent: 100, message: '' }));
  const failed = () => set({ status: state.version ? 'available' : 'error', message: state.version ? '下载失败，点击重试' : '检查更新失败' });
  updater.on('error', failed);
  async function check() {
    if (busy || ['downloading', 'downloaded', 'installing'].includes(state.status)) return { ...state };
    busy = true;
    set({ status: 'checking', message: '' });
    try { await updater.checkForUpdates(); }
    catch { failed(); }
    finally { busy = false; }
    return { ...state };
  }
  async function activate() {
    if (busy) return { ...state };
    if (state.status === 'error') return check();
    if (!['available', 'downloaded'].includes(state.status)) return { ...state };
    busy = true;
    try {
      if (state.status === 'downloaded') {
        if (await prepareInstall()) {
          set({ status: 'installing', message: '' });
          if (installDownloaded) await installDownloaded(downloadedFiles);
          else updater.quitAndInstall(true, true);
        }
      } else {
        set({ status: 'downloading', percent: 0, message: '' });
        downloadedFiles = await updater.downloadUpdate() || [];
      }
    } catch { failed(); }
    finally { busy = false; }
    return { ...state };
  }
  return { check, activate, snapshot: () => ({ ...state }) };
}
module.exports = { createUpdates };
