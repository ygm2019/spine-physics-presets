'use strict';
const path = require('node:path');
const { spawn } = require('node:child_process');
function launchInstaller(files, directory, launch = spawn) {
  const file = files?.find(file => typeof file === 'string' && path.isAbsolute(file) && /\.exe$/i.test(file));
  if (!file || !path.isAbsolute(directory)) return Promise.reject(Error('Missing verified installer or installation directory'));
  return new Promise((resolve, reject) => {
    // The executable comes only from electron-updater's verified download result.
    const child = launch(file, ['/SILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', '/DIR=' + directory], { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}
module.exports = { launchInstaller };
