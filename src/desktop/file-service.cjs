'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const extensions = {
  project: new Set(['.json', '.atlas', '.txt', '.png', '.jpg', '.jpeg', '.webp']),
  assets: new Set(['.atlas', '.txt', '.png', '.jpg', '.jpeg', '.webp']),
  presets: new Set(['.json'])
};

function validateSave(payload) {
  // Pretty-printing must not make an imported document unsavable.
  if (!payload || typeof payload.text !== 'string') {
    throw new Error('Invalid JSON document');
  }
  JSON.parse(payload.text);
  const name = path.basename(String(payload.suggestedName || 'skeleton.json'));
  return { text: payload.text, name: name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\.json$/i, '') + '.json' };
}

async function readSelectedFiles(paths, kind) {
  if (!extensions[kind]) throw new Error('Unsupported file picker');
  const result = [];
  let total = 0;
  for (const file of paths) {
    if (/\.txt$/i.test(file) && !/\.atlas\.txt$/i.test(file)) continue;
    if (!extensions[kind].has(path.extname(file).toLowerCase())) continue;
    const info = await fs.stat(file);
    total += info.size;
    if (!info.isFile() || info.size > 256 * 1024 * 1024 || total > 512 * 1024 * 1024) {
      throw new Error('Selected files exceed the 512 MB import limit');
    }
    result.push({ name: path.basename(file), bytes: new Uint8Array(await fs.readFile(file)) });
  }
  return result;
}

async function atomicWrite(file, text) {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, text, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

module.exports = { validateSave, readSelectedFiles, atomicWrite };
