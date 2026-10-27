'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
function run(file, args, options = {}) {
  const result = spawnSync(file, args, { cwd: root, stdio: 'inherit', windowsHide: true, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${path.basename(file)} failed (${result.status})`);
}
const compiler = [process.env.INNO_SETUP_ISCC, path.join(process.env['ProgramFiles(x86)'] || '', 'Inno Setup 6', 'ISCC.exe'), path.join(process.env.ProgramFiles || '', 'Inno Setup 7', 'ISCC.exe')].find(file => file && fs.existsSync(file));
if (!compiler) throw Error('Install Inno Setup and set INNO_SETUP_ISCC to its ISCC.exe path.');
// Traversal supports both npm and pnpm layouts without a globally installed package manager.
run(process.execPath, [require.resolve('electron-builder/cli.js'), '--win', '--dir', '--x64', '--publish', 'never'], { env: { ...process.env, npm_config_user_agent: 'traversal', npm_execpath: '' } });
fs.writeFileSync(path.join(root, 'dist/win-unpacked/resources/app-update.yml'), 'provider: github\nowner: ygm2019\nrepo: spine-physics-presets\nupdaterCacheDirName: spine-physics-presets-updater\n');
run(compiler, [`/DAppVersion=${pkg.version}`, `/O${path.join(root, 'dist')}`, path.join(root, 'build/installer.iss')]);
const name = `Spine-Physics-Presets-Setup-${pkg.version}.exe`;
const file = path.join(root, 'dist', name), bytes = fs.readFileSync(file);
fs.writeFileSync(file + '.sha256', crypto.createHash('sha256').update(bytes).digest('hex') + '  ' + name + '\n');
// Inno clients use electron-updater for discovery and verified downloads only.
const hash = crypto.createHash('sha512').update(bytes).digest('base64');
fs.writeFileSync(path.join(root, 'dist', 'latest.yml'), `version: ${pkg.version}\nfiles:\n  - url: ${name}\n    sha512: ${hash}\n    size: ${bytes.length}\npath: ${name}\nsha512: ${hash}\nreleaseDate: '${new Date().toISOString()}'\n`);
console.log('Built Inno Setup installer: ' + file);
