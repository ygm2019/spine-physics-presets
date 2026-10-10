'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
let checked = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(cjs|js)$/.test(file) && !file.includes('spine-runtime')) {
      execFileSync(process.execPath, ['--check', file]);
      checked++;
    } else if (/\.json$/.test(file)) JSON.parse(fs.readFileSync(file, 'utf8'));
  }
}
for (const name of ['src', 'scripts', 'tests']) walk(path.join(root, name));
const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
if (/<script>(?!\s*<)/.test(html) || /<style>/.test(html)) throw new Error('Unexpected inline code');
for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (!fs.existsSync(path.join(root, 'src/renderer', match[1]))) throw new Error(`Missing resource: ${match[1]}`);
}
console.log(`Syntax and resource checks passed (${checked} scripts)`);