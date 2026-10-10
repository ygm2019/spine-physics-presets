'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeWindowSettings } = require('../src/desktop/window-settings.cjs');
const defaults = { width: 1440, height: 900, maximized: false };

test('recovers from null, arrays and primitive preference values', () => {
  for (const value of [null, [], 'bad', true, 12, undefined]) assert.deepEqual(normalizeWindowSettings(value), defaults);
});

test('rejects invalid dimensions and clamps finite numeric dimensions', () => {
  assert.deepEqual(normalizeWindowSettings({ width: '2000', height: Infinity, maximized: 'false' }), defaults);
  assert.deepEqual(normalizeWindowSettings({ width: 1, height: 9000, maximized: true }), { width: 1060, height: 2160, maximized: true });
  assert.equal(normalizeWindowSettings({ width: 1550.2 }).width, 1550);
});

test('preserves only valid absolute dialog directories', () => {
  assert.deepEqual(normalizeWindowSettings({ openDirectory: [], saveDirectory: '../bad' }), defaults);
  assert.equal(normalizeWindowSettings({ openDirectory: 'C:/assets', saveDirectory: 'D:/exports' }).saveDirectory, 'D:/exports');
  assert(!('openDirectory' in normalizeWindowSettings({ openDirectory: 'C:/bad\0path' })));
});