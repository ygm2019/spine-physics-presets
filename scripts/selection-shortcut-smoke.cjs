'use strict';
const { _electron: electron } = require('playwright-core');
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
(async () => {
  const profile = await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'spine-shortcut-'));
  const env = { ...process.env, SPINE_PHYSICS_TEST: '1', SPINE_PHYSICS_TEST_DATA: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.argv[2] || require('electron'), args: process.argv[2] ? [] : [root], env });
  try {
    const page = await app.firstWindow(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.waitForFunction(() => window.__spineTool);
    for (const minor of [2, 3]) {
      const fixture = JSON.parse(await fs.readFile(path.join(root, `tests/fixtures/demo-4${minor}.json`), 'utf8'));
      fixture.bones.push({ name: 'top', parent: 'body', length: 20 }, { name: 'upper', parent: 'top', length: 20 }, { name: 'mid', parent: 'upper', length: 20 }, { name: 'tip', parent: 'mid', length: 20 });
      await page.evaluate(f => window.__spineTool.loadSkeleton(f, 'shortcut.json'), fixture);
      await page.waitForFunction(() => window.__spineTool.runtime.active);
      await page.locator('#expandBones').click();
      const selected = () => page.evaluate(() => [...window.__spineTool.selection.names]);
      const before = await page.evaluate(() => JSON.stringify(window.__spineTool.getData()));
      for (const input of ['#constraintName', '#f_strength', '#f_rotate']) {
        await page.locator('[data-tree-name="mid"]').click();
        await page.locator(input).focus();
        await page.evaluate(() => window.getSelection().removeAllRanges());
        await page.keyboard.press('Control+a');
        assert.deepEqual(await selected(), ['mid', 'tip'], `4.${minor} ${input} selects bones`);
        assert.equal(await page.evaluate(() => window.getSelection().toString()), '', 'does not select page text');
        if (input === '#constraintName') assert.equal(await page.locator(input).evaluate(el => el.selectionStart === 0 && el.selectionEnd === el.value.length), false, 'does not select the entire name');
        await page.keyboard.press('Control+a');
        assert.deepEqual(await selected(), ['top', 'upper', 'mid', 'tip'], 'continues the bone cycle from the focused input');
      }
      assert.equal(await page.evaluate(() => JSON.stringify(window.__spineTool.getData())), before, 'selection does not edit project');
      await page.locator('[data-tree-name="mid"]').click();
      await page.locator('#f_strength').focus();
      await page.locator('#f_strength').evaluate(el => { el.value = '73'; el.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.keyboard.press('Control+a');
      assert.equal(await page.evaluate(minor => window.constraintModel.physics(window.__spineTool.getData(), minor).find(c => c.bone === 'mid')?.strength, minor), 73, 'pending input is committed to the original bone');
      assert.equal(await page.evaluate(minor => window.constraintModel.physics(window.__spineTool.getData(), minor).some(c => c.bone === 'tip'), minor), false, 'does not apply pending input to newly selected descendants');
    }
    assert.deepEqual(errors, []);
    console.log('Ctrl+A Electron smoke passed: 4.2/4.3, naming and number fields, cycle continuation, no page/text selection, read-only selection and pending edit target.');
  } finally { await app.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
