'use strict';
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const fixtures = path.join(root, 'tests/fixtures');
const output = path.resolve(process.env.SPINE_TEST_OUTPUT || path.join(root, '.scale-output'));
const report = { mode: process.argv[2] ? 'packaged-exe' : 'development', checks: [], poses: [], errors: [] };
let app;

function fixture(minor, mode = 'none', withPhysics = true) {
  const data = {
    skeleton: { spine: minor === 2 ? '4.2.120' : '4.3.13' },
    bones: [{ name: 'root' }, { name: 'head', parent: 'root', length: 100 }, { name: 'tip', parent: 'head', x: 100 }],
    slots: [{ name: 'head_slot', bone: 'head', attachment: 'head_img' }],
    skins: [{ name: 'default', attachments: { head_slot: { head_img: { path: 'head_img', width: 100, height: 20, x: 50 } } } }]
  };
  const constraint = { name: 'head_physics', bone: 'head', x: 0, y: 0, rotate: 0, scaleX: 1, shearX: 0, limit: 5000, fps: 60, inertia: 1, strength: 10, damping: 0.8, mass: 1, wind: 0, gravity: 0, mix: 1 };
  if (minor === 3 && mode !== 'none') constraint.scaleY = mode;
  if (minor === 2) { data.ik = []; data.transform = []; data.path = []; data.slider = []; data.physics = withPhysics ? [{ ...constraint, order: 0 }] : []; }
  else data.constraints = withPhysics ? [{ ...constraint, type: 'physics' }] : [];
  return data;
}
function close(actual, expected, label) { assert(Math.abs(actual - expected) < 1e-5, `${label}: ${actual} != ${expected}`); }

async function main() {
  await fs.mkdir(output, { recursive: true });
  const env = { ...process.env, SPINE_PHYSICS_TEST: '1', SPINE_PHYSICS_TEST_DATA: path.join(output, 'profile-' + Date.now()) };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: process.argv[2] || require('electron'), args: process.argv[2] ? [] : [root], env, timeout: 60000 });
  const page = await app.firstWindow();
  page.on('pageerror', e => report.errors.push(e.message));
  await page.waitForFunction(() => window.__spineTool && window.desktop);
  await page.locator('#fileInput').setInputFiles(['demo.atlas', 'demo.png'].map(n => path.join(fixtures, n)));
  await page.waitForFunction(() => window.__spineTool.runtime.assets.images.has('demo.png'));
  const load = async (data, freeze = true) => {
    await page.evaluate(data => window.__spineTool.loadSkeleton(data, 'scale-probe.json'), data);
    await page.waitForFunction(minor => window.__spineTool.runtime.active && window.__spineTool.runtime.key === 40 + minor && window.__spineTool.runtime.texturedPages === 1, Number(data.skeleton.spine.split('.')[1]));
    if (freeze) await page.evaluate(() => { const r = window.__spineTool.runtime; cancelAnimationFrame(r.raf); r.raf = 0; });
  };
  const snapshot = () => page.evaluate(() => {
    const t = window.__spineTool, r = t.runtime, sk = r.skeleton;
    t.drawRig();
    const bone = sk.bones.find(b => b.data.name === 'head'), p = bone.appliedPose || bone;
    const tip = sk.bones.find(b => b.data.name === 'tip'), q = tip.appliedPose || tip;
    const overlay = t.selection.pose.find(b => b.name === 'head');
    const { s, ox, oy } = r.view;
    const slot = sk.slots[0], attachment = slot.appliedPose?.attachment || slot.attachment, vertices = new Float32Array(8);
    if (r.key === 42) attachment.computeWorldVertices(slot, vertices, 0, 2);
    else attachment.computeWorldVertices(slot, attachment.getOffsets(slot.appliedPose), vertices, 0, 2);
    const edge = { x: (vertices[4] + vertices[6]) / 2, y: (vertices[5] + vertices[7]) / 2 };
    const gl = r.context.gl;
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    r.renderer.begin(); r.renderer.drawSkeleton(sk); r.renderer.end();
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let visiblePixels = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) visiblePixels++;
    return { overlay, expected: { x: ox + p.worldX * s, y: oy - p.worldY * s, ex: ox + (p.worldX + p.a * bone.data.length) * s, ey: oy - (p.worldY + p.c * bone.data.length) * s }, matrix: { a: p.a, b: p.b, c: p.c, d: p.d }, worldTip: { x: p.worldX + p.a * bone.data.length, y: p.worldY + p.c * bone.data.length }, child: { x: q.worldX, y: q.worldY }, edge, visiblePixels, data: t.getData() };
  });
  const verify = (state, label) => {
    for (const key of ['x', 'y', 'ex', 'ey']) close(state.overlay[key], state.expected[key], label + '/' + key);
    for (const key of ['x', 'y']) { close(state.child[key], state.worldTip[key], label + '/child/' + key); close(state.edge[key], state.worldTip[key], label + '/attachment/' + key); }
    assert(state.visiblePixels > 100, label + ' must render a nonblank texture');
  };
  const simulate = dx => page.evaluate(dx => {
    const r = window.__spineTool.runtime, sk = r.skeleton, sp = r.spine;
    sk.x = 0; sk.y = 0;
    sk.updateWorldTransform(sp.Physics.reset); sk.update(1 / 60); sk.updateWorldTransform(sp.Physics.update);
    sk.x += dx;
    for (let i = 0; i < 3; i++) { sk.update(1 / 60); sk.updateWorldTransform(sp.Physics.update); }
    window.__spineTool.drawRig();
  }, dx);
  const clickAt = async point => page.locator('#rigCanvas').click({ position: point });
  const selected = () => page.evaluate(() => window.__spineTool.selection.names);

  for (const minor of [2, 3]) {
    // Exercise the inspector write and rebuild, not only a preconfigured fixture.
    const data = fixture(minor); (data.physics || data.constraints)[0].scaleX = 0;
    await load(data);
    await page.locator('[data-constraint-name="head_physics"]').click();
    await page.locator('#f_scaleX').fill('100'); await page.locator('#updateConstraint').click();
    assert.equal(await page.evaluate(() => (window.__spineTool.runtime.skeleton.physicsConstraints || window.__spineTool.runtime.skeleton.physics)[0].data.scaleX), 1);
    const original = await page.evaluate(() => window.__spineTool.getData());
    await simulate(-40);
    const stretched = await snapshot(); verify(stretched, `4.${minor}/stretch`);
    assert(stretched.matrix.a > 1.3);
    await clickAt({ x: stretched.overlay.x + (stretched.overlay.ex - stretched.overlay.x) * 0.9, y: stretched.overlay.y + (stretched.overlay.ey - stretched.overlay.y) * 0.9 });
    assert.deepEqual(await selected(), ['head'], 'stretched portion must be clickable');
    await page.locator('#clearSelection').click();
    assert.deepEqual(await selected(), [], 'box-selection probe starts from an empty selection');
    const canvasBounds = await page.locator('#rigCanvas').boundingBox();
    const boxCenter = { x: canvasBounds.x + stretched.overlay.x + (stretched.overlay.ex - stretched.overlay.x) * 0.9, y: canvasBounds.y + stretched.overlay.y + (stretched.overlay.ey - stretched.overlay.y) * 0.9 };
    await page.mouse.move(boxCenter.x - 4, boxCenter.y - 4); await page.mouse.down({ button: 'right' });
    await page.mouse.move(boxCenter.x + 4, boxCenter.y + 4, { steps: 4 }); await page.mouse.up({ button: 'right' });
    assert.deepEqual(await selected(), ['head'], 'box selection must intersect the stretched portion');
    await page.screenshot({ path: path.join(output, `scale-stretch-4${minor}.png`) });
    await simulate(40);
    const compressed = await snapshot(); verify(compressed, `4.${minor}/compression`);
    assert(compressed.matrix.a < 0.7);
    const oldTip = await page.evaluate(() => { const t = window.__spineTool, b = t.runtime.skeleton.bones[1], p = b.appliedPose || b, v = t.runtime.view; return { x: v.ox + (p.worldX + 90) * v.s, y: v.oy - p.worldY * v.s }; });
    await clickAt(oldTip); assert.deepEqual(await selected(), [], 'compressed-away portion must not remain clickable');
    assert.deepEqual(await page.evaluate(() => window.__spineTool.getData()), original, 'simulation must not bake the pose into JSON');
    const dest = path.join(output, `scale-export-4${minor}.json`);
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, dest);
    await page.locator('#exportJson').click(); await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('已保存 JSON'));
    assert.deepEqual(JSON.parse(await fs.readFile(dest, 'utf8')), original);
    report.poses.push({ minor, stretch: stretched.matrix.a, compression: compressed.matrix.a });
    report.checks.push(`4.${minor} inspector scale -> runtime, physical stretch/compression -> overlay/child/texture, correct click geometry, unchanged native export`);

    await load(fixture(minor), false);
    const canvas = await page.locator('#rigCanvas').boundingBox();
    const start = { x: canvas.x + canvas.width * 0.6, y: canvas.y + 30 };
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(start.x - 80, start.y, { steps: 12 }); await page.mouse.up();
    await page.waitForFunction(() => {
      const t = window.__spineTool, b = t.runtime.skeleton.bones[1], p = b.appliedPose || b;
      return Math.abs(Math.hypot(p.a, p.c) - 1) > 0.05;
    });
    const live = await snapshot(); verify(live, `4.${minor}/live-pointer`);
    assert(Math.abs(live.matrix.a - 1) > 0.05);
    assert.notEqual(await page.evaluate(() => window.__spineTool.runtime.skeleton.x), 0);
    await page.evaluate(() => { const r = window.__spineTool.runtime; cancelAnimationFrame(r.raf); r.raf = 0; });
    report.checks.push(`4.${minor} real model drag and animation frames synchronize physics scale with the overlay`);

    const setups = [
      { label: 'parent-nonuniform-shear', parent: { rotation: 35, scaleX: 1.8, scaleY: 0.6, shearY: 20 }, bone: { rotation: 24, scaleX: 1.3, shearX: 12 } },
      { label: 'mirror', parent: { scaleX: -1.6, rotation: 15 }, bone: { rotation: -20 } },
      { label: 'no-scale-inheritance', parent: { scaleX: 2.4, scaleY: 0.4, rotation: 30 }, bone: { inherit: 'noScale', rotation: 20 } },
      { label: 'zero-scale', parent: {}, bone: { scaleX: 0 } }
    ];
    for (const setup of setups) {
      const staticData = fixture(minor, 'none', false);
      Object.assign(staticData.bones[0], setup.parent); Object.assign(staticData.bones[1], setup.bone);
      await load(staticData);
      const state = await snapshot();
      if (setup.label === 'zero-scale') {
        for (const key of ['x', 'y', 'ex', 'ey']) close(state.overlay[key], state.expected[key], 'zero-scale/' + key);
        close(state.overlay.x, state.overlay.ex, 'collapsed bone x'); close(state.overlay.y, state.overlay.ey, 'collapsed bone y');
      } else verify(state, `4.${minor}/${setup.label}`);
      assert.deepEqual(state.data, staticData);
    }
    report.checks.push(`4.${minor} inherited scale/shear, mirror, noScale and zero scale match the official world matrix`);
    if (minor === 3) for (const mode of ['uniform', 'volume']) {
      await load(fixture(3, mode)); await simulate(-40);
      const state = await snapshot(); verify(state, '4.3/' + mode);
      assert(state.matrix.a > 1.3);
      if (mode === 'uniform') close(state.matrix.d, state.matrix.a, 'uniform Y scale');
      else close(state.matrix.d, 1 / state.matrix.a, 'volume Y scale');
      report.checks.push(`4.3 ${mode} scale matches overlay, texture and child pose`);
    }
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
}
main().catch(error => { report.passed = false; report.failure = error.stack; process.exitCode = 1; }).finally(async () => {
  if (app) await app.close().catch(() => {});
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'scale-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});