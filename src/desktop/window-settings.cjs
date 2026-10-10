'use strict';
const path = require('node:path');

function normalizeWindowSettings(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const dimension = (name, fallback, min, max) => {
    const n = input[name];
    return typeof n === 'number' && Number.isFinite(n) ? Math.round(Math.max(min, Math.min(max, n))) : fallback;
  };
  const result = {
    width: dimension('width', 1440, 1060, 3840),
    height: dimension('height', 900, 650, 2160),
    maximized: input.maximized === true
  };
  for (const key of ['openDirectory', 'saveDirectory']) {
    if (typeof input[key] === 'string' && !input[key].includes('\0') && path.isAbsolute(input[key])) result[key] = input[key];
  }
  return result;
}

module.exports = { normalizeWindowSettings };