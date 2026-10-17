'use strict';
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.SPINE_TEST_OUTPUT || path.join(root, '.test-output'));
const fixtures = path.join(root, 'tests/fixtures');
const packaged = process.argv[2];
const defaults = require('../src/renderer/default-presets.js').presets;
let app;
const report = { mode: packaged ? 'packaged-exe' : 'development', versions: [], errors: [], checks: [] };

async function main() {
  await fs.mkdir(output, { recursive: true });
  const env = { ...process.env, SPINE_PHYSICS_TEST: '1', SPINE_PHYSICS_TEST_DATA: path.join(output, 'profile-' + Date.now()) };
  await fs.mkdir(env.SPINE_PHYSICS_TEST_DATA, { recursive: true });
  await fs.writeFile(path.join(env.SPINE_PHYSICS_TEST_DATA, 'window-settings.json'), 'null');
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: packaged || require('electron'),
    args: packaged ? [] : [root],
    env,
    timeout: 60000
  });
  const page = await app.firstWindow();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.waitForFunction(() => window.__spineTool && window.desktop);
  const info = await page.evaluate(() => window.desktop.getInfo());
  assert.equal(info.packaged, Boolean(packaged));
  report.info = info;
  const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getNormalBounds());
  // Windows may round outer frame dimensions by a few device pixels.
  assert(Math.abs(bounds.width - 1440) <= 8, JSON.stringify(bounds));
  assert(Math.abs(bounds.height - 900) <= 8, JSON.stringify(bounds));
  report.defaultWindowBounds = bounds;
  report.checks.push('starts with null preferences and restores default window size');
  const isolation = await page.evaluate(() => ({ node: typeof require, process: typeof process, bridge: Object.keys(window.desktop).sort() }));
  assert.equal(isolation.node, 'undefined');
  assert.equal(isolation.process, 'undefined');
  assert.deepEqual(isolation.bridge, ['getInfo', 'importDropped', 'openFiles', 'saveJson', 'saveProject']);
  report.checks.push('sandboxed renderer and native IPC bridge');

  assert.equal(await page.locator('.appbar, .project-status, .heading').count(), 0);
  assert.equal(await page.locator('.preview-toolbar, #renderMode, #pickAssets, #assetInput, #physicsLive, #runtimeStatus').count(), 0);
  assert.equal(await page.locator('#dropbox strong').textContent(), '拖入 Spine 文件');
  assert.equal(await page.locator('#applyNow').count(), 0);
  assert.deepEqual(await page.locator('.workspace-file-actions button').allTextContents(), ['导入预设库', '导出预设库', '快捷键设置', '使用说明', '保存原 JSON', '另存为 JSON']);
  assert.equal(await page.locator('.workspace-file-actions #exportJson').isDisabled(), true);
  await page.locator('#helpBtn').click();
  assert.deepEqual(await page.locator('#usageHelp h3').allTextContents(), ['使用流程', '快捷键', '鼠标操作', '保存与操作范围']);
  assert.equal(await page.locator('#usageHelp ol li').first().textContent(), 'Spine 中点击「导出 → JSON」，勾选「非必要的数据」「纹理图集的打包」。');
  assert.equal(await page.locator('#usageHelp ol li').last().textContent(), '修改成功后自动覆盖导入的原 JSON，首次保存会备份原文件。确认状态为「已自动保存」，回到 Spine 选择「导入 → 导入数据」，选择新项目。');
  assert.deepEqual(await page.locator('#usageHelp table tbody tr').allTextContents(), require('../src/renderer/usage-guide.js').flatMap(section => (section.rows || []).map(row => row.join(''))));
  await page.locator('dialog .primary').click();
  report.checks.push('three top rows removed, importer renamed, four file actions relocated, complete help with five-step workflow and input reference');

  // Stub only the native user choice; exercise the real IPC and disk services.
  await app.evaluate(({ dialog }, { files, destination }) => {
    global.__testDialogs = { open: [], save: [] };
    dialog.showOpenDialog = async (_window, options) => {
      global.__testDialogs.open.push(options);
      return { canceled: false, filePaths: files };
    };
    dialog.showSaveDialog = async (_window, options) => {
      global.__testDialogs.save.push(options);
      return { canceled: false, filePath: destination };
    };
  }, { files: ['demo-43.json', 'demo.atlas', 'demo.png'].map(n => path.join(fixtures, n)), destination: path.join(output, 'export-43.json') });

  await page.locator('#dropbox').click();
  await page.waitForFunction(() => window.__spineTool.runtime.active && window.__spineTool.runtime.texturedPages === 1);
  report.checks.push('project picker -> real IPC -> JSON/atlas/PNG import');

  for (const minor of [3, 2]) {
    await page.locator('#fileInput').setInputFiles(['demo-4' + minor + '.json', 'demo.atlas', 'demo.png'].map(n => path.join(fixtures, n)));
    await page.waitForFunction(m => window.__spineTool.getData()?.skeleton.spine.startsWith('4.' + m) && window.__spineTool.runtime.active && window.__spineTool.runtime.key === 40 + m && window.__spineTool.runtime.texturedPages === 1, minor);
    await page.locator('#expandBones').click();
    await page.evaluate(() => {
      const r = window.__spineTool.runtime, sk = r.skeleton;
      window.__physicsFrames = 0;
      window.__worldTransform = sk.updateWorldTransform;
      sk.updateWorldTransform = function(mode) {
        if (mode === r.spine.Physics.update) window.__physicsFrames++;
        return window.__worldTransform.call(this, mode);
      };
    });
    await page.waitForFunction(() => window.__physicsFrames >= 3);
    await page.evaluate(() => { window.__spineTool.runtime.skeleton.updateWorldTransform = window.__worldTransform; });
    report.checks.push(`Spine 4.${minor} official physics updates run by default without the removed toolbar`);
    const state = await page.evaluate(() => {
      const t = window.__spineTool;
      const gl = t.runtime.context.gl;
      const draw = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      t.drawRig();
      // Force the frame read before Chromium clears the drawing buffer.
      t.runtime.renderer.begin();
      t.runtime.renderer.drawSkeleton(t.runtime.skeleton);
      t.runtime.renderer.end();
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, draw);
      let visible = 0;
      for (let i = 3; i < draw.length; i += 4) if (draw[i]) visible++;
      return { version: t.getData().skeleton.spine, bones: t.runtime.skeleton.bones.length, pages: t.runtime.texturedPages, visiblePixels: visible, error: t.runtime.error };
    });
    assert.equal(state.bones, 3);
    assert(state.visiblePixels > 100, JSON.stringify(state));
    assert.equal(state.error, '');
    report.versions.push(state);
    const canvas = page.locator('#rigCanvas');
    const selectedNames = () => page.evaluate(() => [...window.__spineTool.selection.names].sort());
    const bonePoint = name => page.evaluate(name => {
      const t = window.__spineTool;
      t.drawRig();
      const b = t.selection.pose.find(b => b.name === name);
      return { x: (b.x + b.ex) / 2, y: (b.y + b.ey) / 2 };
    }, name);
    const clickBone = async (name, modifiers = []) => canvas.click({ position: await bonePoint(name), modifiers });
    await clickBone('body');
    assert.deepEqual(await selectedNames(), ['body']);
    await clickBone('head', ['Control']);
    assert.deepEqual(await selectedNames(), ['body', 'head']);
    await clickBone('body', ['Control']);
    assert.deepEqual(await selectedNames(), ['head']);
    await clickBone('head', ['Control']);
    assert.deepEqual(await selectedNames(), []);
    await clickBone('head', ['Control']);
    assert.deepEqual(await selectedNames(), ['head']);
    await clickBone('body');
    assert.deepEqual(await selectedNames(), ['body']);
    await clickBone('head', ['Shift']);
    assert.deepEqual(await selectedNames(), ['head'], 'Shift click no longer toggles bone selection');
    await page.locator('[data-tree-name="body"]').click();
    await page.locator('[data-tree-name="head"]').click({ modifiers: ['Control'] });
    assert.deepEqual(await selectedNames(), ['body', 'head']);
    await page.locator('[data-tree-name="body"]').click({ modifiers: ['Control'] });
    assert.deepEqual(await selectedNames(), ['head']);
    await page.locator('[data-tree-name="body"]').click({ modifiers: ['Shift'] });
    assert.deepEqual(await selectedNames(), ['body'], 'bone tree uses the same Ctrl-only toggle');
    const gestureState = await page.evaluate(() => {
      const t = window.__spineTool;
      const head = t.selection.pose.find(b => b.name === 'head');
      return { end: { x: Math.max(head.x, head.ex) + 15, y: Math.min(head.y, head.ey) - 15 }, model: { x: t.runtime.skeleton.x, y: t.runtime.skeleton.y } };
    });
    const stageBox = await canvas.boundingBox(), start = await bonePoint('body');
    await page.keyboard.down('Control');
    await page.mouse.move(stageBox.x + start.x, stageBox.y + start.y);
    await page.mouse.down();
    assert.deepEqual(await selectedNames(), ['body'], 'Ctrl pointerdown must not toggle before click/drag is resolved');
    await page.mouse.move(stageBox.x + gestureState.end.x, stageBox.y + gestureState.end.y, { steps: 5 });
    assert.equal(await page.locator('#dragSelection').isVisible(), true);
    await page.mouse.up();
    await page.keyboard.up('Control');
    assert.deepEqual(await selectedNames(), ['body', 'head'], 'Ctrl drag from a selected bone appends instead of toggling it off');
    assert.deepEqual(await page.evaluate(() => ({ x: window.__spineTool.runtime.skeleton.x, y: window.__spineTool.runtime.skeleton.y })), gestureState.model);
    await page.locator('[data-tree-name="root"]').click();
    await page.mouse.move(stageBox.x + start.x, stageBox.y + start.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(stageBox.x + gestureState.end.x, stageBox.y + gestureState.end.y, { steps: 5 });
    await page.mouse.up({ button: 'right' });
    assert.deepEqual(await selectedNames(), ['body', 'head'], 'unmodified right drag replaces the selection');
    report.checks.push(`Spine 4.${minor} Ctrl click adds/removes canvas and tree bones; Ctrl drag appends without a click toggle; right drag replaces`);
    await page.locator('[data-tree-name="body"]').click();
    await page.locator('[data-tree-name="head"]').click({ modifiers: ['Control'] });
    assert.equal(await page.evaluate(() => window.__spineTool.selection.names.length), 2);
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.7);
    await page.mouse.wheel(0, -180);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(box.x + box.width * 0.65 + 53, box.y + box.height * 0.7 + 31, { steps: 5 });
    await page.mouse.up({ button: 'middle' });
    // Dragging the model is preview-only; rebuilding must retain its offset.
    const empty = { x: box.x + 30, y: box.y + box.height * 0.6 };
    assert.equal(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.id, empty), 'rigCanvas');
    await page.mouse.move(empty.x, empty.y);
    await page.mouse.down();
    await page.mouse.move(empty.x + 22, empty.y + 14, { steps: 4 });
    await page.mouse.up();
    const snapshotView = () => page.evaluate(() => {
      const t = window.__spineTool;
      const { s, cx, cy, ox, oy } = t.runtime.view;
      const root = t.selection.pose.find(b => b.name === 'root');
      return { s, cx, cy, ox, oy, modelX: t.runtime.skeleton.x, modelY: t.runtime.skeleton.y, rootX: root.x, rootY: root.y };
    });
    await page.waitForTimeout(80);
    const beforePreset = await snapshotView();
    assert.notEqual(beforePreset.modelX, 0);
    await page.locator('#presetList .preset-btn').nth(0).click();
    await page.waitForTimeout(80);
    assert.deepEqual(await snapshotView(), beforePreset, 'preset must preserve camera and model position');
    await page.locator('#presetList .preset-btn').nth(2).click();
    await page.waitForTimeout(80);
    assert.deepEqual(await snapshotView(), beforePreset, 'switching presets must not reframe the workspace');
    await page.locator('#presetList .preset-btn').nth(0).click();
    const batch = await page.evaluate(() => {
      const d = window.__spineTool.getData();
      const list = (d.constraints || d.physics).filter(c => !c.type || c.type === 'physics');
      return list.map(c => ({ bone: c.bone, name: c.name, rotate: c.rotate, damping: c.damping, wind: c.wind })).sort((a,b) => a.bone.localeCompare(b.bone));
    });
    assert.deepEqual(batch.map(c => c.bone), ['body', 'head']);
    assert.equal(batch.find(c => c.bone === 'head').name, 'head_physics');
    assert(batch.every(c => c.rotate === defaults[0].values.rotate && c.damping === defaults[0].values.damping && c.wind === defaults[0].values.wind));
    await page.locator('#boneSelect').selectOption('head');
    for (const [key, value] of Object.entries({ inertia: 180, strength: 250, mass: 1400, wind: -250, gravity: -350, mix: 180, damping: 150 })) {
      await page.locator('#f_' + key).fill(String(value));
    }
    const form = await page.evaluate(() => {
      const t = window.__spineTool;
      const values = t.valuesFromForm();
      t.setForm(values);
      return { values, roundtrip: t.valuesFromForm() };
    });
    assert.equal(form.values.wind, -250);
    assert.equal(form.values.gravity, -350);
    assert.equal(form.values.mix, 1.8);
    assert.equal(form.values.damping, 0);
    assert.deepEqual(form.values, form.roundtrip);
    await page.locator('#f_mix').fill('-10');
    assert.equal(await page.locator('#f_mix').inputValue(), '0');
    await page.locator('#f_mix').fill('180');
    await page.locator('#constraintName').fill('desktop_roundtrip');
    await page.locator('#f_mix').dispatchEvent('change');
    const dest = path.join(output, `export-4${minor}.json`);
    await app.evaluate(({ dialog }, destination) => {
      dialog.showSaveDialog = async (_window, options) => {
        global.__testDialogs.save.push(options);
        return { canceled: false, filePath: destination };
      };
    }, dest);
    await page.locator('.workspace-file-actions #exportJson').click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('已保存 JSON：'));
    const saved = JSON.parse(await fs.readFile(dest, 'utf8'));
    const c = (saved.constraints || saved.physics).find(c => c.name === 'head_physics');
    assert.equal(c.wind, -250);
    assert.equal(c.gravity, -350);
    assert.equal(c.mix, 1.8);
    assert.equal(c.bone, 'head');
    assert.equal((saved.constraints || saved.physics).filter(c => c.bone === 'head').length, 1);
    report.checks.push(`Spine 4.${minor} repeated preset clicks preserve zoom, pan, model offset and screen position`);
    report.checks.push(`Spine 4.${minor} textured rendering, batch presets, unbounded fields and native JSON save`);
  }

  await page.evaluate(() => { window.__dialogResult = 'pending'; window.appDialogs.prompt('Cancel regression', 'original').then(result => window.__dialogResult = result); });
  await page.locator('dialog button').filter({ hasText: '取消' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__dialogResult !== 'pending');
  assert.equal(await page.evaluate(() => window.__dialogResult), null);
  await page.evaluate(() => { window.__dialogResult = 'pending'; window.appDialogs.prompt('Input regression', 'original').then(result => window.__dialogResult = result); });
  await page.locator('dialog input').fill('accepted');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__dialogResult !== 'pending');
  assert.equal(await page.evaluate(() => window.__dialogResult), 'accepted');
  report.checks.push('Enter on Cancel cancels; Enter in naming input confirms');
  await page.locator('#saveAsPreset').click();
  await page.locator('dialog input').fill('桌面测试预设');
  await page.locator('dialog .primary').click();
  await page.locator('.preset-btn').filter({ hasText: '桌面测试预设' }).waitFor();
  await page.reload();
  await page.waitForFunction(() => window.__spineTool);
  await page.locator('.preset-btn').filter({ hasText: '桌面测试预设' }).waitFor();
  report.checks.push('preset naming dialog and persistent preset library');

  const presetFile = path.join(output, 'footer-presets.json');
  await app.evaluate(({ dialog }, destination) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination });
  }, presetFile);
  await page.locator('.workspace-file-actions #exportPresets').click();
  await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('已保存 JSON：'));
  const savedPresets = JSON.parse(await fs.readFile(presetFile, 'utf8'));
  assert.equal(savedPresets.format, 'spine-physics-presets');
  assert(savedPresets.presets.some(p => p.name === '桌面测试预设'));
  await fs.writeFile(presetFile, JSON.stringify({ presets: [{ name: '底部导入测试', values: { wind: 5, damping: 0.88 } }] }));
  await app.evaluate(({ dialog }, source) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });
  }, presetFile);
  await page.locator('.workspace-file-actions #importPresets').click();
  await page.locator('.preset-btn').filter({ hasText: '底部导入测试' }).waitFor();
  report.checks.push('relocated preset import/export buttons exercise real native IPC and disk services');
  await page.locator('#fileInput').setInputFiles(['demo-43.json', 'demo.atlas', 'demo.png'].map(n => path.join(fixtures, n)));
  await page.waitForFunction(() => window.__spineTool.runtime.active);
  for (const [width, height] of [[1440, 900], [1060, 650]]) {
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size), [width, height]);
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__spineTool.toast('界面布局测试：提示不遮挡文件按钮'));
    await page.waitForTimeout(250);
    const layout = await page.evaluate(() => {
      const elements = ['.sidebar', '.preview-panel', '.workspace'].map(s => {
        const b = document.querySelector(s).getBoundingClientRect();
        return { x: b.x, right: b.right, width: b.width };
      });
      const hint = document.querySelector('#boneSelectionHelp');
      const h = hint.getBoundingClientRect(), s = document.querySelector('.preview-stage').getBoundingClientRect();
      const v = document.querySelector('#previewVisibility').getBoundingClientRect();
      const toolbar = document.querySelector('.workspace-file-actions');
      const t = toolbar.getBoundingClientRect(), w = document.querySelector('.workspace').getBoundingClientRect();
      const panel = document.querySelector('#physicsPanel').getBoundingClientRect();
      return {
        width: innerWidth, elements, overflow: document.documentElement.scrollWidth > innerWidth,
        top: document.querySelector('.layout').getBoundingClientRect().top,
        previewGap: s.top - document.querySelector('.preview-head').getBoundingClientRect().bottom,
        fileToolbar: {
          bottom: w.bottom - t.bottom, belowPanel: t.top >= panel.bottom - 1,
          toastClear: [...toolbar.querySelectorAll('button')].every(button => document.querySelector('#toast').getBoundingClientRect().bottom <= button.getBoundingClientRect().top),
          buttonsInside: [...toolbar.querySelectorAll('button')].every(button => {
            const b = button.getBoundingClientRect();
            return b.left >= w.left && b.right <= w.right && b.top >= t.top && b.bottom <= innerHeight && button.scrollWidth <= button.clientWidth;
          })
        },
        selectionHelp: {
          lines: [...hint.querySelectorAll('span')].map(el => el.textContent),
          left: h.left - s.left, bottom: s.bottom - h.bottom,
          inside: h.left >= s.left && h.right <= s.right && h.top >= s.top && h.bottom <= s.bottom,
          overflowing: hint.scrollWidth > hint.clientWidth,
          clearOfVisibility: h.right <= v.left || h.bottom <= v.top,
          pointerEvents: getComputedStyle(hint).pointerEvents,
          target: document.elementFromPoint(h.left + h.width / 2, h.top + h.height / 2)?.id
        }
      };
    });
    assert(!layout.overflow);
    assert(layout.elements.every(e => e.width > 0 && e.x >= 0 && e.right <= layout.width + 1));
    assert.equal(layout.top, 0);
    assert(Math.abs(layout.previewGap) < 0.05, 'removed preview toolbar must not leave an empty row');
    assert.equal(layout.fileToolbar.belowPanel, true);
    assert.equal(layout.fileToolbar.toastClear, true);
    assert.equal(layout.fileToolbar.buttonsInside, true);
    assert(Math.abs(layout.fileToolbar.bottom) < 0.05);
    assert.deepEqual(layout.selectionHelp.lines, ['左键选骨骼 · 点击空白取消', 'Ctrl + 左键点击：增选 / 减选', '右键拖动：框选', 'Ctrl + 左键拖动：追加框选']);
    assert.equal(layout.selectionHelp.inside, true);
    assert.equal(layout.selectionHelp.overflowing, false);
    assert.equal(layout.selectionHelp.clearOfVisibility, true, 'selection help must not be covered by visibility controls');
    assert(Math.abs(layout.selectionHelp.left - 8) < 0.05);
    assert(Math.abs(layout.selectionHelp.bottom - 8) < 0.05);
    assert.equal(layout.selectionHelp.pointerEvents, 'none');
    assert.equal(layout.selectionHelp.target, 'rigCanvas');
    await page.locator('#physicsPanel').evaluate(panel => { panel.scrollTop = panel.scrollHeight; });
    assert.equal(await page.locator('.workspace-file-actions #helpBtn').isVisible(), true);
    assert.equal(await page.locator('.workspace-file-actions #exportJson').isVisible(), true);
    await page.screenshot({ path: path.join(output, `window-${width}.png`) });
  }
  report.checks.push('minimum and full-size desktop layout');
  report.checks.push('bone selection help stays bottom-left at both sizes and lets mouse events reach the canvas');
  assert.deepEqual(report.errors, []);
  report.passed = true;
}

main().catch(error => {
  report.passed = false;
  report.failure = error.stack;
  process.exitCode = 1;
}).finally(async () => {
  if (app) await app.close().catch(() => {});
  await fs.writeFile(path.join(output, 'smoke-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
