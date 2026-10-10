'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(process.env.USERPROFILE || 'C:/Users/22386', 'Desktop', 'spine-physics-presets1.json');
const target = path.join(root, 'src', 'renderer', 'default-presets.js');
const library = JSON.parse(fs.readFileSync(source, 'utf8'));
if (!library || library.format !== 'spine-physics-presets' || library.version !== 1 || !Array.isArray(library.presets) || !library.presets.length) {
  throw new Error(`Invalid default preset library: ${source}`);
}
const names = new Set();
for (const preset of library.presets) {
  if (!preset || typeof preset.name !== 'string' || !preset.name.trim() || !preset.values || typeof preset.values !== 'object' || Array.isArray(preset.values) || names.has(preset.name)) {
    throw new Error(`Invalid or duplicate preset in ${source}`);
  }
  names.add(preset.name);
}
const output = `'use strict';\n(function(root, factory) {\n  const library = factory();\n  if (typeof module === 'object' && module.exports) module.exports = library;\n  else root.defaultPresetLibrary = library;\n})(typeof window === 'object' ? window : globalThis, () => (${JSON.stringify(library)}));\n`;
fs.writeFileSync(target, output, 'utf8');
console.log(`Synchronized ${library.presets.length} default presets from ${source}`);