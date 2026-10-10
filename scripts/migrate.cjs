'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const legacy = path.resolve(root, '../spine-physics-presets.html');
const source = fs.readFileSync(legacy, 'utf8');
const style = source.match(/<style>([\s\S]*?)<\/style>/);
const script = source.match(/<script>([\s\S]*?)<\/script>/);
if (!style || !script) throw new Error('Expected one inline style and app script');
const write = (name, text) => {
  const dest = path.join(root, name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) throw new Error(`Refusing to overwrite ${dest}`);
  fs.writeFileSync(dest, text);
};
// Keep cascade order; only exact repeated rules are redundant.
const rules = new Set();
const css = style[1].split('\n').filter(line => {
  if (!line.trim() || line.startsWith('/*')) return true;
  if (rules.has(line)) return false;
  rules.add(line);
  return true;
}).join('\n');
write('src/renderer/app.css', css);
write('src/renderer/app.js', script[1]);
let html = source.replace(style[0], '<link rel="stylesheet" href="app.css">\n<link rel="stylesheet" href="desktop.css">')
  .replace(script[0], '<script src="dialogs.js"></script>\n<script src="app.js"></script>\n<script src="desktop.js"></script>');
html = html.replace('<title>Spine Rig Tools · Physics Presets</title>', '<title>Spine Physics Presets</title>');
html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' blob: data:; connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">\n');
write('src/renderer/index.html', html);
fs.cpSync(path.resolve(root, '../spine-runtime'), path.join(root, 'src/renderer/spine-runtime'), { recursive: true });
fs.cpSync(path.resolve(root, '../spine-fixtures'), path.join(root, 'tests/fixtures'), { recursive: true });
fs.mkdirSync(path.join(root, 'LICENSES'), { recursive: true });
fs.copyFileSync(path.resolve(root, '../spine-runtime/LICENSE-spine-runtimes.txt'), path.join(root, 'LICENSES/Spine-Runtimes.txt'));
console.log(JSON.stringify({ source: legacy, output: root, inlineStylesRemoved: true, inlineScriptsRemoved: true, duplicateStyleLinesRemoved: style[1].split('\n').length - css.split('\n').length }, null, 2));