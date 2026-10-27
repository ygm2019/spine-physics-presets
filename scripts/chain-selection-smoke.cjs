'use strict';
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.SPINE_TEST_OUTPUT || path.join(root, '.chain-output'));
const packaged = process.argv[2];
const report = { mode: packaged ? 'packaged-exe' : 'development', checks: [], errors: [], passed: false };
let app;
async function main() {
  await fs.mkdir(output, { recursive: true });
  const work = await fs.mkdtemp(path.join(output, 'chain-'));
  const env = { ...process.env, SPINE_PHYSICS_TEST: '1', SPINE_PHYSICS_TEST_DATA: path.join(work, 'profile') };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: packaged || require('electron'), args: packaged ? [] : [root], env, timeout: 60000 });
  const page = await app.firstWindow();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('dialog', () => {});
  await page.waitForFunction(() => window.__spineTool && window.desktop);
  const selected = () => page.evaluate(() => [...window.__spineTool.selection.names]);
  const snapshot = () => page.evaluate(() => {
    const t = window.__spineTool, s = t.getSaveState();
    return { data: t.getData(), history: t.getHistoryState(), revision: s.revision, saved: s.saved, backup: s.backup };
  });

  for (const minor of [2, 3]) {
    const fixture = JSON.parse(await fs.readFile(path.join(root, `tests/fixtures/demo-4${minor}.json`), 'utf8'));
    fixture.bones.push(
      { name: 'hair_top', parent: 'body', x: 40, y: 20, rotation: 70, length: 32 },
      { name: 'hair_upper', parent: 'hair_top', x: 32, rotation: -12, length: 32 },
      { name: 'hair_mid', parent: 'hair_upper', x: 32, rotation: -12, length: 32 },
      { name: 'hair_low', parent: 'hair_mid', x: 32, rotation: -12, length: 32 },
      { name: 'hair_tip', parent: 'hair_low', x: 32, rotation: -12, length: 24 },
      { name: 'ribbon', parent: 'body', x: -30, y: 20, rotation: 120, length: 32 },
      { name: 'ribbon_mid', parent: 'ribbon', x: 32, rotation: 12, length: 32 },
      { name: 'ribbon_tip', parent: 'ribbon_mid', x: 32, rotation: 12, length: 24 },
      { name: 'leg', parent: 'root', x: -40, y: 20, rotation: -70, length: 32 }
    );
    const file = path.join(work, `chain-4${minor}.json`), original = JSON.stringify(fixture, null, 2);
    await fs.writeFile(file, original);
    await app.evaluate(({ dialog }, filePath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] }); }, file);
    await page.locator('#dropbox').click();
    await page.waitForFunction(minor => window.__spineTool.runtime.active && window.__spineTool.runtime.key === 40 + minor, minor);
    await page.locator('#expandBones').click();
    await page.locator('#clearActivity').click();
    const before = await snapshot(), tail = ['hair_mid', 'hair_low', 'hair_tip'], whole = ['hair_top', 'hair_upper', ...tail];
    const peers = ['head', ...whole, 'ribbon', 'ribbon_mid', 'ribbon_tip'], all = fixture.bones.map(bone => bone.name);
    // Click the displayed middle bone, not the model API or a synthesized key event.
    const point = await page.evaluate(() => {
      const t = window.__spineTool;
      t.drawRig();
      const p = t.selection.pose.find(pose => pose.name === 'hair_mid'), r = document.querySelector('#rigCanvas').getBoundingClientRect();
      return { x: r.left + (p.x + p.ex) / 2, y: r.top + (p.y + p.ey) / 2 };
    });
    await page.mouse.click(point.x, point.y);
    assert.deepEqual(await selected(), ['hair_mid']);
    // The tree renders hierarchy order, while selection uses source JSON order.
    const checks = [[tail, '已选择当前骨骼及后代。'], [whole, '已选择整串骨骼。'], [peers, '已选择同级骨骼串。'], [all, '已选择全部骨骼。'], [tail, '已选择当前骨骼及后代。']];
    for (let i = 0; i < checks.length; i++) {
      await page.keyboard.press('Control+a');
      assert.deepEqual(await selected(), checks[i][0]);
      assert.equal(await page.locator('#toast').textContent(), checks[i][1]);
      assert.equal(await page.locator('#selectionCount').textContent(), `${checks[i][0].length} 已选`);
      const highlight = await page.locator('.tree-row.multi-selected').evaluateAll(rows => rows.map(row => row.dataset.treeName));
      assert.deepEqual(new Set(highlight), new Set(checks[i][0]));
      if (i < 4) await page.screenshot({ path: path.join(output, `chain-4${minor}-${i + 1}.png`) });
    }
    assert.deepEqual(await snapshot(), before);
    report.checks.push(`4.${minor} real canvas middle click then Ctrl+A selects tail / whole chain / peer chains / all / original tail, with correct tree highlights and messages`);

    await page.locator('[data-tree-name="hair_mid"]').click();
    await page.locator('#collapseBones').click();
    for (const names of [tail, whole, peers, all]) {
      await page.keyboard.press('Control+a');
      assert.deepEqual(await selected(), names);
      assert.deepEqual(await page.locator('#treeList [data-tree-name]').evaluateAll(rows => rows.map(row => row.dataset.treeName)), ['root']);
    }
    await page.locator('#expandBones').click();
    await page.locator('[data-tree-name="hair_top"]').click();
    for (const names of [whole, peers, all, whole]) { await page.keyboard.press('Control+a'); assert.deepEqual(await selected(), names); }
    report.checks.push(`4.${minor} hidden ancestors still complete the chain without opening collapsed branches; chain-head selection skips redundant completion`);

    await page.locator('[data-tree-name="hair_mid"]').click();
    await page.locator('[data-tree-name="ribbon_mid"]').click({ modifiers: ['Control'] });
    for (const names of [['hair_mid', 'hair_low', 'hair_tip', 'ribbon_mid', 'ribbon_tip'], [...whole, 'ribbon', 'ribbon_mid', 'ribbon_tip'], peers, all]) { await page.keyboard.press('Control+a'); assert.deepEqual(await selected(), names); }
    await page.locator('[data-tree-name="hair_mid"]').click();
    await page.keyboard.press('Control+a');
    const input = page.locator('#constraintName');
    assert.notEqual(await input.inputValue(), '', 'Native text selection requires a nonempty input');
    await input.focus();
    await page.keyboard.press('Control+a');
    assert.deepEqual(await selected(), whole);
    assert.equal(await input.evaluate(el => el.selectionStart === 0 && el.selectionEnd === el.value.length), false);
    await input.evaluate(el => el.blur());
    await page.keyboard.press('Control+a');
    assert.deepEqual(await selected(), peers, 'Input Ctrl+A advances the same bone-selection cycle');
    await page.keyboard.press('Control+Shift+a');
    assert.deepEqual(await selected(), []);
    await page.keyboard.press('Control+a');
    assert.deepEqual(await selected(), all);
    await page.locator('[data-tree-name="ribbon_mid"]').click();
    await page.keyboard.press('Control+a');
    assert.deepEqual(await selected(), ['ribbon_mid', 'ribbon_tip'], 'Manual selection resets original seeds');
    assert.deepEqual(await snapshot(), before);
    assert.equal(await page.locator('#activityLog li').count(), 0);
    assert.equal(await fs.readFile(file, 'utf8'), original);
    report.checks.push(`4.${minor} multi-chain completion, bone-selection Ctrl+A from an input, manual reset and empty-selection all preserve JSON, save revision, history and activity log`);
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
}
main().catch(error => { report.failure = error.stack; process.exitCode = 1; }).finally(async () => {
  await fs.writeFile(path.join(output, 'chain-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (app) await app.close().catch(() => {});
});
