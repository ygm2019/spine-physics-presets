'use strict';
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const fixtures = path.join(root, 'tests/fixtures');
const output = path.resolve(process.env.SPINE_TEST_OUTPUT || path.join(root, '.preset-output'));
const packaged = process.argv[2];
const storageKey = 'spineRigTools.physicsPresets.v1';
const report = { mode: packaged ? 'packaged-exe' : 'development', checks: [], resources: [], errors: [] };
let app;

async function main() {
  await fs.mkdir(output, { recursive: true });
  const env = { ...process.env, SPINE_PHYSICS_TEST: '1', SPINE_PHYSICS_TEST_DATA: path.join(output, 'profile-' + Date.now()) };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: packaged || require('electron'), args: packaged ? [] : [root], env, timeout: 60000 });
  const page = await app.firstWindow();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.waitForFunction(() => window.__spineTool && window.desktop);
  const preset = name => page.locator('.preset-btn').filter({ hasText: name });
  const saveAs = async name => {
    await page.locator('#saveAsPreset').click();
    await page.locator('dialog input').fill(name);
    await page.locator('dialog .primary').click();
    await preset(name).waitFor();
  };
  const readPreset = name => page.evaluate(({ key, name }) => JSON.parse(localStorage.getItem(key)).find(p => p.name === name), { key: storageKey, name });
  const findConstraint = bone => page.evaluate(bone => {
    const t = window.__spineTool, minor = Number(t.getData().skeleton.spine.split('.')[1]);
    return window.constraintModel.physics(t.getData(), minor).find(c => c.bone === bone);
  }, bone);
  for (const minor of [2, 3]) {
    const fixture = JSON.parse(await fs.readFile(path.join(fixtures, `demo-4${minor}.json`), 'utf8'));
    const source = (fixture.constraints || fixture.physics)[0];
    const globals = { inertiaGlobal: true, strengthGlobal: false, dampingGlobal: true, massGlobal: false, windGlobal: true, gravityGlobal: false, mixGlobal: true };
    Object.assign(source, globals);
    if (minor === 3) source.scaleY = 'volume';
    await page.locator('#fileInput').setInputFiles(['demo.atlas', 'demo.png'].map(n => path.join(fixtures, n)));
    await page.waitForFunction(() => window.__spineTool.runtime.assets.atlasText && window.__spineTool.runtime.assets.images.has('demo.png'));
    await page.evaluate(d => window.__spineTool.loadSkeleton(d, 'preset-source.json'), fixture);
    await page.waitForFunction(m => window.__spineTool.runtime.active && window.__spineTool.runtime.key === 40 + m && window.__spineTool.runtime.texturedPages === 1, minor);

    await page.locator('[data-constraint-name="head_physics"]').click({ button: 'right' });
    await page.locator('#constraintMenu [data-action="save-preset"]').click();
    const name = 'roundtrip-' + minor;
    await page.locator('dialog input').fill(name);
    await page.locator('dialog .primary').click();
    const saved = await readPreset(name);
    for (const [key, value] of Object.entries(globals)) assert.equal(saved.values[key], value);
    await page.locator('[data-tree-name="root"]').click();
    await preset(name).click();
    const applied = await findConstraint('root');
    for (const [key, value] of Object.entries(globals)) assert.equal(applied[key], value, `4.${minor} preset lost ${key}`);
    if (minor === 3) assert.equal(applied.scaleY, 'volume');
    await page.locator('#f_wind').fill('7');
    await page.locator('#updateConstraint').click();
    const edited = await findConstraint('root');
    for (const [key, value] of Object.entries(globals)) assert.equal(edited[key], value);
    await saveAs('form-globals-' + minor);
    const formPreset = await readPreset('form-globals-' + minor);
    for (const [key, value] of Object.entries(globals)) assert.equal(formPreset.values[key], value);
    report.checks.push(`4.${minor} context save -> apply to new bone -> numeric edit -> form preset preserves true/false Globals`);

    if (minor === 3) {
      for (const mode of ['uniform', 'volume']) {
        await page.locator('#scaleYMode').selectOption(mode);
        await saveAs('form-mode-' + mode);
        const stored = await readPreset('form-mode-' + mode);
        assert.equal(stored.values.scaleY, mode);
        assert.equal(Object.hasOwn(stored.values, 'scaleYMode'), false);
        await page.locator('#scaleYMode').selectOption('none');
        await preset('form-mode-' + mode).click();
        assert.equal(await page.locator('#scaleYMode').inputValue(), mode);
        assert.equal((await findConstraint('root')).scaleY, mode);
      }
      await page.reload();
      await page.waitForFunction(() => window.__spineTool);
      await page.locator('#fileInput').setInputFiles(['demo-43.json', 'demo.atlas', 'demo.png'].map(n => path.join(fixtures, n)));
      await page.waitForFunction(() => window.__spineTool.runtime.active && window.__spineTool.runtime.texturedPages === 1);

      await page.locator('[data-tree-name="root"]').click();
      for (const mode of ['uniform', 'volume']) {
        await preset('form-mode-' + mode).click();
        assert.equal((await findConstraint('root')).scaleY, mode);
        await page.locator('#presetFile').setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ presets: [{ name: 'legacy-' + mode, values: { ...saved.values, scaleY: undefined, scaleYMode: mode } }] })) });
        await preset('legacy-' + mode).click();
        assert.equal(await page.locator('#scaleYMode').inputValue(), mode);
        assert.equal((await findConstraint('root')).scaleY, mode);
      }
      await page.locator('#scaleYMode').selectOption('none');
      await page.locator('#updateConstraint').click();
      assert.equal(Object.hasOwn(await findConstraint('root'), 'scaleY'), false);
      report.checks.push('4.3 uniform/volume form save, persisted reload, legacy scaleYMode import and none removal');
    }

    const destination = path.join(output, `preset-export-4${minor}.json`);
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, destination);
    assert.equal(await page.evaluate(() => window.__spineTool.exportJson()), true);
    const exported = JSON.parse(await fs.readFile(destination, 'utf8'));
    const exportedConstraint = (exported.constraints || exported.physics).find(c => c.bone === 'root');
    for (const [key, value] of Object.entries(globals)) assert.equal(exportedConstraint[key], value);
    assert.equal(Object.hasOwn(exportedConstraint, 'scaleYMode'), false);
    report.checks.push(`4.${minor} real native save/readback preserves Global parameters and valid schema`);

    await page.evaluate(() => {
      const r = window.__spineTool.runtime;
      window.__oldAtlasTextures = r.atlas.pages.map(p => ({ texture: p.texture, handle: p.texture?.texture })).filter(p => p.texture);
    });
    const countResources = () => page.evaluate(() => {
      const r = window.__spineTool.runtime;
      return { total: r.context.restorables.length, textures: r.context.restorables.filter(x => x instanceof r.spine.GLTexture).length, pages: r.texturedPages };
    });
    const before = await countResources();
    for (let i = 0; i < 12; i++) await preset(name).click();
    const after = await countResources();
    assert.deepEqual(after, before, `4.${minor} texture resources grew after repeated presets`);
    assert.deepEqual(await page.evaluate(() => {
      const r = window.__spineTool.runtime;
      return window.__oldAtlasTextures.map(p => ({ registered: r.context.restorables.includes(p.texture), alive: r.context.gl.isTexture(p.handle) }));
    }), [{ registered: false, alive: false }]);
    report.resources.push({ version: `4.${minor}`, before, after, presetApplications: 12 });
    report.checks.push(`4.${minor} repeated presets keep GPU resource count stable and delete old texture handles`);

    const failed = await page.evaluate(() => {
      const t = window.__spineTool, r = t.runtime, prototype = r.spine.SkeletonJson.prototype, original = prototype.readSkeletonData;
      const retained = r.context.restorables.length, oldData=JSON.stringify(t.getData()), oldSkeleton=r.skeleton, oldAtlas=r.atlas;
      prototype.readSkeletonData = () => { throw Error('injected skeleton parse failure'); };
      let rejected=false;try { t.applyPhysics(); } catch(error){rejected=/injected skeleton parse failure/.test(error.message)} finally { prototype.readSkeletonData = original; }
      const canvas = document.querySelector('#rigCanvas'), pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      return { rejected,dataUnchanged:JSON.stringify(t.getData())===oldData,atlas: r.atlas === oldAtlas, skeleton: r.skeleton === oldSkeleton, active: r.active, hitTargets: t.selection.pose.length, overlayEmpty: !pixels.some((value, index) => index % 4 === 3 && value), resources: r.context.restorables.length, retained };
    });
    assert.equal(failed.atlas, true);
    assert.equal(failed.skeleton, true);
    assert.equal(failed.rejected, true);
    assert.equal(failed.dataUnchanged, true);
    assert.equal(failed.active, true);
    assert(failed.hitTargets>0);
    assert.equal(failed.overlayEmpty, false);
    assert.equal(failed.resources, failed.retained);
    await page.evaluate(() => window.__spineTool.refreshRuntime());
    assert.deepEqual(await countResources(), before);
    assert.equal(await page.evaluate(() => window.__spineTool.runtime.error), '');
    for (let i = 0; i < 3; i++) {
      const failure = await page.evaluate(async () => {
        const t = window.__spineTool, r = t.runtime, prototype = r.spine.SkeletonJson.prototype, original = prototype.readSkeletonData;
        prototype.readSkeletonData = () => { throw Error('injected runtime load failure'); };
        try { await t.refreshRuntime(); } finally { prototype.readSkeletonData = original; }
        const canvas = document.querySelector('#rigCanvas'), pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        return {
          active: r.active, skeleton: r.skeleton, hitTargets: t.selection.pose.length,
          overlayEmpty: !pixels.some((value, index) => index % 4 === 3 && value),
          error: document.querySelector('#toast').textContent
        };
      });
      assert.equal(failure.active, false);
      assert.equal(failure.skeleton, null);
      assert.equal(failure.hitTargets, 0);
      assert.equal(failure.overlayEmpty, true, 'runtime failure must not fall back to a hand-built wire preview');
      assert.match(failure.error, /injected runtime load failure/);
      assert.equal(await page.evaluate(() => window.__spineTool.runtime.context.restorables.filter(x => x instanceof window.__spineTool.runtime.spine.GLTexture).length), 0);
      await page.evaluate(() => window.__spineTool.refreshRuntime());
      await page.waitForFunction(() => window.__spineTool.runtime.active && window.__spineTool.runtime.texturedPages === 1);
      assert.deepEqual(await countResources(), before);
    }
    report.checks.push(`4.${minor} runtime failures release textures and clear hit targets without wire fallback; recovery renders again`);
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
}
main().catch(error => { report.passed = false; report.failure = error.stack; process.exitCode = 1; }).finally(async () => {
  if (app) await app.close().catch(() => {});
  await fs.writeFile(path.join(output, 'preset-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});