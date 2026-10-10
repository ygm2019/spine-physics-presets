'use strict';
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.SPINE_TEST_OUTPUT || path.join(root, '.tree-output'));
const packaged = process.argv[2];
const report = { mode: packaged ? 'packaged-exe' : 'development', checks: [], errors: [], passed: false };
let app;
async function main() {
  await fs.mkdir(output, { recursive: true });
  const work = await fs.mkdtemp(path.join(output, 'tree-'));
  const env = { ...process.env, SPINE_PHYSICS_TEST: '1', SPINE_PHYSICS_TEST_DATA: path.join(work, 'profile') };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: packaged || require('electron'), args: packaged ? [] : [root], env, timeout: 60000 });
  const page = await app.firstWindow();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('dialog', () => {});
  await page.waitForFunction(() => window.__spineTool && window.desktop);
  const rows = () => page.locator('#treeList [data-tree-name]').evaluateAll(elements => elements.map(el => ({ name: el.dataset.treeName, padding: Number.parseFloat(getComputedStyle(el).paddingLeft) })));
  const names = async () => (await rows()).map(row => row.name);
  const state = () => page.evaluate(() => {
    const t = window.__spineTool, s = t.getSaveState();
    return { selected: [...t.selection.names], data: t.getData(), history: t.getHistoryState(), revision: s.revision, saved: s.saved, source: s.source?.id };
  });
  for (const minor of [2, 3]) {
    const fixture = JSON.parse(await fs.readFile(path.join(root, `tests/fixtures/demo-4${minor}.json`), 'utf8'));
    fixture.bones.push({ name: 'hair', parent: 'body', y: 35, length: 28 }, { name: 'hair_tip', parent: 'hair', y: 28, length: 18 }, { name: 'ribbon', parent: 'body', x: 20, length: 30 }, { name: 'ribbon_end', parent: 'ribbon', x: 30, length: 16 }, { name: 'leg', parent: 'root', x: -20, length: 24 });
    const file = path.join(work, `tree-4${minor}.json`), original = JSON.stringify(fixture, null, 2);
    await fs.writeFile(file, original);
    await app.evaluate(({ dialog }, filePath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] }); }, file);
    await page.locator('#dropbox').click();
    await page.waitForFunction(minor => window.__spineTool.runtime.active && window.__spineTool.runtime.key === 40 + minor, minor);
    await page.locator('#expandBones').click();
    const fullyOpen = await rows();
    assert.deepEqual(fullyOpen, [{ name: 'root', padding: 5 }, { name: 'body', padding: 18 }, { name: 'head', padding: 31 }, { name: 'hair', padding: 31 }, { name: 'hair_tip', padding: 44 }, { name: 'ribbon', padding: 31 }, { name: 'ribbon_end', padding: 44 }, { name: 'leg', padding: 18 }]);
    await page.locator('[data-tree-name="hair_tip"]').click();
    const selectedBefore = await state();
    await page.locator('#collapseBones').click();
    assert.deepEqual(await rows(), [{ name: 'root', padding: 5 }], 'Collapse must hide all descendants instead of appending flat rows');
    assert.deepEqual(await state(), selectedBefore, 'Collapse must preserve hidden selection, JSON, history and save state');
    await page.locator('#collapseBones').click();
    assert.deepEqual(await rows(), [{ name: 'root', padding: 5 }]);
    await page.screenshot({ path: path.join(output, `collapsed-4${minor}.png`) });
    await page.locator('[data-toggle-tree="root"]').click();
    assert.deepEqual(await rows(), [{ name: 'root', padding: 5 }, { name: 'body', padding: 18 }, { name: 'leg', padding: 18 }]);
    await page.locator('[data-toggle-tree="body"]').click();
    assert.deepEqual(await names(), ['root', 'body', 'head', 'hair', 'ribbon', 'leg']);
    await page.locator('[data-toggle-tree="hair"]').click();
    await page.locator('[data-toggle-tree="ribbon"]').click();
    assert.deepEqual(await rows(), fullyOpen);
    await page.locator('[data-toggle-tree="hair"]').click();
    assert.deepEqual(await names(), ['root', 'body', 'head', 'hair', 'ribbon', 'ribbon_end', 'leg']);
    await page.locator('[data-toggle-tree="body"]').click();
    assert.deepEqual(await names(), ['root', 'body', 'leg']);
    await page.locator('[data-toggle-tree="body"]').click();
    assert.deepEqual(await names(), ['root', 'body', 'head', 'hair', 'ribbon', 'ribbon_end', 'leg'], 'Reopening a parent preserves independently collapsed child state');
    await page.locator('#expandBones').click();
    assert.deepEqual(await rows(), fullyOpen);
    assert.equal(await page.locator('[data-tree-name="hair_tip"]').evaluate(el => el.classList.contains('multi-selected')), true);
    assert.deepEqual(await state(), selectedBefore);
    await page.screenshot({ path: path.join(output, `expanded-4${minor}.png`) });
    report.checks.push(`4.${minor} global/branch collapse hides descendants, root reopen is one level, expand restores indentation, and hidden selection/data/history/revision stay unchanged`);

    await page.locator('[data-tree-name="hair"]').click();
    await page.locator('#collapseBones').click();
    for (const expected of [['hair', 'hair_tip'], ['head', 'hair', 'hair_tip', 'ribbon', 'ribbon_end'], fixture.bones.map(bone => bone.name)]) {
      await page.keyboard.press('Control+a');
      assert.deepEqual((await state()).selected, expected);
      assert.deepEqual(await names(), ['root'], 'Selection must not reveal collapsed descendants');
    }
    await page.locator('#clearSelection').click();
    assert.deepEqual((await state()).selected, []);
    assert.equal(await fs.readFile(file, 'utf8'), original);
    assert.equal((await state()).revision, 0);
    assert.equal((await state()).history.undo, 0);
    assert.equal((await state()).history.redo, 0);
    assert.equal((await fs.readdir(work)).some(name => name.startsWith(path.basename(file) + '.backup')), false);
    report.checks.push(`4.${minor} chain-head Ctrl+A includes hidden bones without reopening the tree or writing JSON`);
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
}
main().catch(error => { report.failure = error.stack; process.exitCode = 1; }).finally(async () => {
  if (app) await app.close().catch(() => {});
  await fs.writeFile(path.join(output, 'tree-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});