'use strict';
const fs = require('node:fs/promises');
const path = require('node:path').win32;
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const SETTINGS_KEY = String.raw`HKCU\Software\CreativeTools\SpinePhysicsPresets`;

function cliPath(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let file = value.trim().replace(/^"([^"]+)"(?:,\s*-?\d+)?$/, '$1').replace(/,\s*-?\d+$/, '');
  if (!path.isAbsolute(file)) return null;
  if (/^Spine\.exe$/i.test(path.basename(file))) file = path.join(path.dirname(file), 'Spine.com');
  else if (!/^Spine\.com$/i.test(path.basename(file))) {
    if (path.extname(file)) return null;
    file = path.join(file, 'Spine.com');
  }
  return path.normalize(file);
}

async function readRegistry(key, view) {
  try {
    const args = ['query', key];
    if (/Uninstall$/i.test(key)) args.push('/s', '/f', 'Spine');
    if (view) args.push('/reg:' + view);
    const { stdout } = await execute('reg.exe', args, { windowsHide: true, timeout: 5000, maxBuffer: 2 * 1024 * 1024 });
    return stdout;
  } catch { return ''; }
}

async function findSpine(options = {}) {
  const env = options.env || process.env;
  const exists = options.exists || (async file => { try { return (await fs.stat(file)).isFile(); } catch { return false; } });
  const registry = options.readRegistry || readRegistry;
  const checked = new Set();
  async function check(value) {
    const file = cliPath(value);
    if (!file || checked.has(file.toLowerCase())) return null;
    checked.add(file.toLowerCase());
    return await exists(file) ? file : null;
  }
  let found = await check(env.SPINE_CLI);
  if (found) return found;
  for (const view of ['64', '32']) {
    const text = await registry(SETTINGS_KEY, view);
    const saved = text.match(/SpineCliPath\s+REG_(?:EXPAND_)?SZ\s+([^\r\n]+)/i);
    found = await check(saved?.[1]);
    if (found) return found;
  }
  const candidates = [env.ProgramFiles && path.join(env.ProgramFiles, 'Spine'), env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Spine'), env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'Spine'), ...(env.PATH || env.Path || '').split(';')];
  for (const drive of options.drives || 'CDEFGHIJKLMNOPQRSTUVWXYZAB'.split('').map(letter => letter + ':\\')) {
    for (const folder of ['Spine', 'software\\Spine', '软件\\Spine', 'Program Files\\Spine', 'Program Files (x86)\\Spine']) candidates.push(path.join(drive, folder));
  }
  for (const value of candidates) {
    found = await check(value);
    if (found) return found;
  }
  for (const hive of ['HKCU', 'HKLM']) for (const view of ['64', '32']) {
    for (const key of [hive + String.raw`\Software\Microsoft\Windows\CurrentVersion\App Paths\Spine.exe`, hive + String.raw`\Software\Microsoft\Windows\CurrentVersion\Uninstall`]) {
      const text = await registry(key, view);
      for (const match of text.matchAll(/(?:InstallLocation|DisplayIcon|\(Default\)|\(默认\))\s+REG_(?:EXPAND_)?SZ\s+([^\r\n]+)/gi)) {
        const expanded = match[1].replace(/%([^%]+)%/g, (whole, name) => env[name] || whole);
        found = await check(expanded);
        if (found) return found;
      }
    }
  }
  throw Error('未找到 Spine.com。请重新运行安装包以识别或选择 Spine.com 路径；也可设置 SPINE_CLI。JSON 导入无需此依赖。二进制转换还需要在 Spine 中完成激活。');
}
module.exports = { cliPath, findSpine, SETTINGS_KEY };
