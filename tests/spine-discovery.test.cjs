'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { findSpine, cliPath, SETTINGS_KEY } = require('../src/desktop/spine-discovery.cjs');
function fixture(files = [], extra = {}) {
  return { env: {}, drives: [], readRegistry: async () => '', exists: async file => files.some(value => value.toLowerCase() === file.toLowerCase()), ...extra };
}
test('normalizes CLI, GUI, directory and quoted registry icon paths; rejects unrelated/relative programs', () => {
  for (const value of ['E:/software/Spine/Spine.com', 'E:\\software\\Spine', 'E:\\software\\Spine\\Spine.exe', '"E:\\software\\Spine\\Spine.exe",0']) assert.equal(cliPath(value), 'E:\\software\\Spine\\Spine.com');
  for (const value of ['', null, 'Spine.com', 'C:\\bad.exe']) assert.equal(cliPath(value), null);
});
test('SPINE_CLI takes priority over installer configuration', async () => {
  const files = ['F:\\Custom\\Spine.com', 'E:\\Saved\\Spine.com'];
  assert.equal(await findSpine(fixture(files, { env: { SPINE_CLI: files[0] }, readRegistry: async () => 'SpineCliPath REG_SZ ' + files[1] })), files[0]);
});
test('installer configuration works from either registry view; stale values fall through', async () => {
  const file = 'F:\\Custom\\Spine.com';
  const seen = [];
  const result = await findSpine(fixture([file], { readRegistry: async (key, view) => { seen.push([key, view]); return key === SETTINGS_KEY ? 'SpineCliPath REG_SZ ' + (view === '64' ? 'Z:\\Missing\\Spine.com' : file) : ''; } }));
  assert.equal(result, file);
  assert.deepEqual(seen, [[SETTINGS_KEY, '64'], [SETTINGS_KEY, '32']]);
});
test('discovers E drive without requiring environment variables or installation registry', async () => {
  const file = 'E:\\software\\Spine\\Spine.com';
  assert.equal(await findSpine(fixture([file], { drives: ['C:\\', 'D:\\', 'E:\\'] })), file);
});
test('discovers PATH with spaces', async () => {
  const file = 'F:\\Tools With Spaces\\Spine.com';
  assert.equal(await findSpine(fixture([file], { env: { Path: 'C:\\Windows;F:\\Tools With Spaces' } })), file);
});
for (const hive of ['HKCU', 'HKLM']) for (const view of ['64', '32']) {
  test(`discovers ${hive} uninstall location in ${view}-bit view`, async () => {
    const file = 'F:\\Unusual\\Spine.com';
    assert.equal(await findSpine(fixture([file], { readRegistry: async (key, actualView) => key.startsWith(hive + '\\') && key.endsWith('Uninstall') && actualView === view ? 'InstallLocation    REG_SZ    F:\\Unusual' : '' })), file);
  });
}
test('discovers machine App Paths GUI entry and expands registry environment variables', async () => {
  const file = 'F:\\Tool Set\\Spine.com';
  assert.equal(await findSpine(fixture([file], { env: { TOOLS: 'F:\\Tool Set' }, readRegistry: async key => key.endsWith('App Paths\\Spine.exe') ? '(Default) REG_EXPAND_SZ "%TOOLS%\\Spine.exe"' : '' })), file);
});
test('missing CLI reports installation guidance and leaves JSON workflow available', async () => {
  await assert.rejects(findSpine(fixture()), /环境与依赖.*JSON 导入无需此依赖/);
});
