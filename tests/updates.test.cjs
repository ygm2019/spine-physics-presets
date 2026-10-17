'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createUpdates } = require('../src/desktop/updates.cjs');
function setup(prepare = async () => true) {
  const updater = new EventEmitter(), states = [], calls = [];
  updater.checkForUpdates = async () => { calls.push('check'); updater.emit('update-available', { version: '1.4.3' }); };
  updater.downloadUpdate = async () => { calls.push('download'); updater.emit('download-progress', { percent: 42.9 }); updater.emit('update-downloaded', { version: '1.4.3' }); };
  updater.quitAndInstall = (...args) => calls.push(['install', ...args]);
  return { updater, calls, states, api: createUpdates(updater, state => states.push(state), prepare) };
}
test('launch check notifies without downloading or installing', async () => {
  const s = setup(); await s.api.check();
  assert.deepEqual(s.calls, ['check']); assert.equal(s.api.snapshot().status, 'available');
  assert.equal(s.updater.autoDownload, false); assert.equal(s.updater.autoInstallOnAppQuit, false);
  assert.equal(s.updater.allowDowngrade, false); assert.equal(s.updater.allowPrerelease, false);
});
test('click downloads with progress, second click installs only after ready', async () => {
  const s = setup(); await s.api.activate(); assert.deepEqual(s.calls, []);
  await s.api.check(); await s.api.activate();
  assert.equal(s.api.snapshot().status, 'downloaded'); assert(s.states.some(state => state.percent === 42));
  assert.deepEqual(s.calls, ['check', 'download']);
  await s.api.activate(); assert.deepEqual(s.calls[2], ['install', true, true]);
});
test('unsaved work prevents restart and keeps update ready', async () => {
  const s = setup(async () => false); await s.api.check(); await s.api.activate(); await s.api.activate();
  assert.equal(s.api.snapshot().status, 'downloaded'); assert.deepEqual(s.calls, ['check', 'download']);
});
test('network/check errors do not produce an available-version notice', async () => {
  const s = setup(); s.updater.checkForUpdates = async () => { throw Error('offline'); };
  await s.api.check(); assert.equal(s.api.snapshot().version, ''); assert.equal(s.api.snapshot().status, 'error');
});
test('failed download can be retried without quitting', async () => {
  const s = setup(); await s.api.check(); s.updater.downloadUpdate = async () => { throw Error('checksum mismatch'); };
  await s.api.activate(); assert.equal(s.api.snapshot().status, 'available');
  assert.equal(s.api.snapshot().message, '下载失败，点击重试'); assert.deepEqual(s.calls, ['check']);
});
test('concurrent clicks do not start multiple downloads', async () => {
  const s = setup(); let done; s.updater.downloadUpdate = () => { s.calls.push('download'); return new Promise(resolve => { done = resolve; }); };
  await s.api.check(); const pending=s.api.activate(); await s.api.activate();
  assert.deepEqual(s.calls, ['check','download']); done(); await pending;
});
test('no available update clears an old notice', async () => {
  const s = setup(); await s.api.check(); s.updater.emit('update-not-available');
  assert.equal(s.api.snapshot().status, 'idle'); assert.equal(s.api.snapshot().version, '');
});
