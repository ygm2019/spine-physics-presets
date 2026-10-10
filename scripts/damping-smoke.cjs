'use strict';
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.SPINE_TEST_OUTPUT || path.join(root, '.damping-output'));
const packaged = process.argv[2];
const report = { mode: packaged ? 'packaged-exe' : 'development', checks: [], errors: [] };
let app;
async function main() {
  await fs.mkdir(output, { recursive: true });
  const env = { ...process.env, SPINE_PHYSICS_TEST: '1', SPINE_PHYSICS_TEST_DATA: path.join(output, 'profile-' + Date.now()) };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: packaged || require('electron'), args: packaged ? [] : [root], env, timeout: 60000 });
  const page = await app.firstWindow();
  page.on('pageerror', e => report.errors.push(e.message));
  await page.waitForFunction(() => window.__spineTool && window.desktop);
  for (const minor of [2, 3]) {
    const fixture = JSON.parse(await fs.readFile(path.join(root, `tests/fixtures/demo-4${minor}.json`), 'utf8'));
    const constraint = (fixture.physics || fixture.constraints)[0];
    constraint.damping = 0.88;
    await page.evaluate(d => window.__spineTool.loadSkeleton(d, 'damping.json'), fixture);
    await page.waitForFunction(m => window.__spineTool.runtime.active && window.__spineTool.runtime.key === 40 + m, minor);

    await page.locator('[data-constraint-name="head_physics"]').click();
    assert.equal(await page.locator('#f_damping').inputValue(), '12');
    assert.equal(await page.locator('[data-range="damping"]').inputValue(), '12');
    assert.equal(await page.locator('#f_damping').isEnabled(), true);
    assert.equal(await page.evaluate(() => window.__spineTool.getData().constraints?.[0]?.damping ?? window.__spineTool.getData().physics[0].damping), 0.88);
    for (const [display, json] of [[88, 0.12], [0, 1], [100, 0], [12, 0.88]]) {
      await page.locator('#f_damping').fill(String(display));
      await page.locator('#updateConstraint').click();
      const state = await page.evaluate(() => {
        const t = window.__spineTool, list = t.getData().constraints || t.getData().physics;
        const c = list.find(c => c.name === 'head_physics');
        const pc = (t.runtime.skeleton.physics || t.runtime.skeleton.physicsConstraints).find(c => c.data.name === 'head_physics');
        return { stored: c.damping, runtime: (pc.appliedPose || pc).damping, global: c.dampingGlobal };
      });
      assert.equal(state.stored, json);
      assert(Math.abs(state.runtime - json) < 1e-7, JSON.stringify(state));
      assert.notEqual(state.global, true);
      await page.locator('[data-constraint-name="head_physics"]').click();
      assert.equal(await page.locator('#f_damping').inputValue(), String(display));
    }
    await page.locator('[data-range="damping"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#f_damping').inputValue(), '13');
    assert.equal(await page.evaluate(() => window.__spineTool.valuesFromForm().damping), 0.87);
    await page.locator('#f_damping').fill('12');
    await page.locator('#updateConstraint').click();
    const dest = path.join(output, `damping-4${minor}.json`);
    await app.evaluate(({ dialog }, destination) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination });
    }, dest);
    assert.equal(await page.evaluate(() => window.__spineTool.exportJson()), true);
    const saved = JSON.parse(await fs.readFile(dest, 'utf8'));
    assert.equal((saved.constraints || saved.physics).find(c => c.name === 'head_physics').damping, 0.88);
    await page.locator('#fileInput').setInputFiles(dest);
    await page.waitForFunction(() => document.querySelector('#fileMeta').textContent.startsWith('damping-4'));
    await page.locator('[data-constraint-name="head_physics"]').click();
    assert.equal(await page.locator('#f_damping').inputValue(), '12');
    await page.locator('#saveAsPreset').click();
    await page.locator('dialog input').fill('damping-' + minor);
    await page.locator('dialog .primary').click();
    const storedPreset = await page.evaluate(name => JSON.parse(localStorage.getItem('spineRigTools.physicsPresets.v1')).find(p => p.name === name), 'damping-' + minor);
    assert.equal(storedPreset.values.damping, 0.88);
    await page.locator('#f_damping').fill('50');
    await page.locator('.preset-btn').filter({ hasText: 'damping-' + minor }).click();
    assert.equal(await page.locator('#f_damping').inputValue(), '12');
    const afterPreset = await page.evaluate(() => {
      const d = window.__spineTool.getData();
      return (d.constraints || d.physics).filter(c => c.bone === 'head');
    });
    assert.equal(afterPreset.length, 1);
    assert.equal(afterPreset[0].damping, 0.88);
    report.checks.push(`4.${minor}: 12 -> JSON/runtime 0.88 -> reload/preset 12; slider editable; 0/88/100 endpoints verified`);
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
}
main().catch(e => { report.passed = false; report.failure = e.stack; process.exitCode = 1; }).finally(async () => {
  if (app) await app.close().catch(() => {});
  await fs.writeFile(path.join(output, 'damping-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});