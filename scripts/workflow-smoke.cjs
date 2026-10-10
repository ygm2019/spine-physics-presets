'use strict';
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.SPINE_TEST_OUTPUT || path.join(root, '.workflow-output'));
let app;
const report = { mode: process.argv[2] ? 'packaged-exe' : 'development', checks: [], errors: [] };
async function main() {
  await fs.mkdir(output, { recursive: true });
  const work = await fs.mkdtemp(path.join(output, 'workflow-'));
  const env = { ...process.env, SPINE_PHYSICS_TEST: '1', SPINE_PHYSICS_TEST_DATA: path.join(work, 'profile') };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: process.argv[2] || require('electron'), args: process.argv[2] ? [] : [root], env, timeout: 60000 });
  const page = await app.firstWindow();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('dialog', () => {});
  await page.waitForFunction(() => window.__spineTool && window.desktop);
  const selection = () => page.evaluate(() => [...window.__spineTool.selection.names]);
  const history = () => page.evaluate(() => window.__spineTool.getHistoryState());
  const data = () => page.evaluate(() => window.__spineTool.getData());
  const blur = () => page.evaluate(() => document.activeElement?.blur());
  const key = async command => { await blur(); await page.keyboard.press(command); };
  const saved = async file => {
    await page.waitForFunction(() => { const s = window.__spineTool.getSaveState(); return s.saved === s.revision && !s.saving && !s.error; });
    assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), await data());
  };
  const pick = async file => {
    const old = await page.evaluate(() => window.__spineTool.getSaveState().source?.id);
    await app.evaluate(({ dialog }, filePath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] }); }, file);
    await page.locator('#dropbox').click();
    await page.waitForFunction(old => { const t = window.__spineTool; return t.runtime.active && t.getSaveState().source?.id !== old; }, old);
    await page.locator('#expandBones').click();
  };
  for (const minor of [2, 3]) {
  const fixture = JSON.parse(await fs.readFile(path.join(root, `tests/fixtures/demo-4${minor}.json`), 'utf8'));
  fixture.bones.push(
    { name: 'hair', parent: 'body', y: 35, length: 28 },
    { name: 'hair_tip', parent: 'hair', y: 28, length: 18 },
    { name: 'ribbon', parent: 'body', x: 20, length: 30 },
    { name: 'ribbon_end', parent: 'ribbon', x: 30, length: 16 },
    { name: 'leg', parent: 'root', x: -20, length: 24 }
  );
  fixture.unknownMetadata = { keep: ['original', 17] };
  fixture.skins[0].physics = ['head_physics'];
  fixture.animations = { idle: { physics: { head_physics: { wind: [{ time: 0, value: 2 }] } } } };
  const file = path.join(work, `workflow-4${minor}.json`), original = JSON.stringify(fixture, null, 2);
  await fs.writeFile(file, original);
  await pick(file);
  assert.equal((await history()).undo, 0);
  await page.locator('#clearActivity').click();
  await page.locator('[data-tree-name="hair"]').click();
  await page.keyboard.press('Control+a');
  assert.deepEqual(await selection(), ['hair', 'hair_tip']);
  await page.keyboard.press('Control+a');
  assert.deepEqual(await selection(), ['head', 'hair', 'hair_tip', 'ribbon', 'ribbon_end']);
  await page.keyboard.press('Control+a');
  assert.deepEqual(await selection(), fixture.bones.map(bone => bone.name));
  assert.match(await page.locator('#toast').textContent(), /全部骨骼/);
  await page.keyboard.press('Control+a');
  assert.deepEqual(await selection(), ['hair', 'hair_tip'], 'fourth press must reuse the original seeds');
  await page.locator('[data-tree-name="ribbon"]').click();await page.keyboard.press('Control+a');
  assert.deepEqual(await selection(), ['ribbon', 'ribbon_end'], 'manual selection resets the cycle');
  await page.keyboard.press('Control+i');
  assert.deepEqual(await selection(), fixture.bones.filter(b => !['ribbon', 'ribbon_end'].includes(b.name)).map(b => b.name));
  await page.keyboard.press('Control+Shift+a');
  assert.deepEqual(await selection(), []);
  assert.equal(await page.locator('#activityLog li').count(), 0, 'selection must not flood the log');
  assert.equal(await fs.readFile(file, 'utf8'), original, 'selection does not save');
  report.checks.push(`4.${minor} chain-head Ctrl+A skips redundant completion, cycles from original seeds; manual reset, inverse and clear do not write or log selections`);

  await page.locator('[data-constraint-name="head_physics"]').click();
  await page.locator('#f_wind').fill('31');
  await page.keyboard.press('Control+Enter');
  await saved(file);
  const physics = root => minor === 2 ? root.physics : root.constraints.filter(c => c.type === 'physics');
  assert.equal(physics(await data()).find(item => item.name === 'head_physics').wind, 31);
  assert.equal((await page.evaluate(() => window.__spineTool.getHistoryState())).undo, 1);
  await page.keyboard.press('Control+z');
  assert.equal((await history()).undo, 1, 'text input Ctrl+Z does not undo project');
  await key('Control+z');await saved(file);
  assert.equal((await history()).redo, 1);
  assert.deepEqual(await data(), {...fixture, ...(minor === 2 ? { ik: [], transform: [], path: [], slider: [] } : {})});
  await key('Control+y');await saved(file);
  assert.equal(physics(await data())[0].wind, 31);
  await key('Control+z');await saved(file);
  await key('Control+Shift+z');await saved(file);
  assert.equal(physics(await data())[0].wind, 31);
  await key('Control+z');await saved(file);
  await page.locator('#f_wind').fill('44');await page.keyboard.press('Control+Enter');await saved(file);
  assert.equal((await history()).redo, 0);
  assert.equal(physics(await data())[0].wind, 44);
  assert.equal(await page.locator('#activityLog li').count() > 0, true);
  const backup = await page.evaluate(() => window.__spineTool.getSaveState().backup);
  assert.equal(await fs.readFile(backup, 'utf8'), original);
  report.checks.push(`4.${minor} Ctrl+Enter auto-saves; project undo, both redo shortcuts and branching preserve complete JSON and first backup; input Ctrl+Z stays native`);

  const unchanged = await data(), count = (await history()).undo;
  await page.locator('#updateConstraint').click();await saved(file);
  assert.equal((await history()).undo, count, 'no-op commits must not add history');
  const failed = await page.evaluate(() => {
    const t = window.__spineTool, r = t.runtime, p = r.spine.SkeletonJson.prototype, read = p.readSkeletonData;
    const before = JSON.stringify(t.getData()), h = JSON.stringify(t.getHistoryState()), revision = t.getSaveState().revision, skeleton = r.skeleton;
    p.readSkeletonData = () => { throw Error('workflow restore failure'); };
    try { document.querySelector('#undoProject').click(); } finally { p.readSkeletonData = read; }
    return { sameData: JSON.stringify(t.getData()) === before, sameHistory: JSON.stringify(t.getHistoryState()) === h, sameRevision: t.getSaveState().revision === revision, sameSkeleton: r.skeleton === skeleton };
  });
  assert.deepEqual(failed, { sameData: true, sameHistory: true, sameRevision: true, sameSkeleton: true });
  assert.match(await page.locator('#activityLog').textContent(), /workflow restore failure/);
  assert.deepEqual(await data(), unchanged);
  await page.locator('#deleteConstraint').click();await page.locator('dialog .primary').click();await saved(file);
  assert.equal(physics(await data()).length, 0);
  assert.equal((await data()).skins[0].physics.length, 0);
  assert.equal((await data()).animations.idle.physics.head_physics, undefined);
  await key('Control+z');await saved(file);assert.deepEqual(await data(), unchanged);
  await key('Control+y');await saved(file);assert.equal(physics(await data()).length, 0);
  await key('Control+z');await saved(file);
  report.checks.push(`4.${minor} no-op edits skip history, failed official runtime restore retains live skeleton/cursor/revision; deletion undo restores skin references and animation tracks`);

  await page.locator('[data-tree-name="hair"]').click();await page.keyboard.press('Control+a');
  const beforeBatch = await data(), beforeHistory = (await history()).undo;
  await page.locator('#presetList .preset-btn').first().click();await saved(file);
  const afterBatch = await data();
  assert.equal(physics(afterBatch).length, 3);
  assert.equal((await history()).undo, beforeHistory + 1);
  await key('Control+z');await saved(file);assert.deepEqual(await data(), beforeBatch);
  await key('Control+y');await saved(file);assert.deepEqual(await data(), afterBatch);
  await page.locator('[data-constraint-name="head_physics"]').click();await page.keyboard.press('Control+c');
  const hairName = physics(afterBatch).find(c => c.bone === 'hair').name;
  await page.locator(`[data-constraint-name="${hairName}"]`).click();await page.keyboard.press('Control+v');await saved(file);
  await key('Control+z');await saved(file);assert.deepEqual(await data(), afterBatch);
  const tipName = physics(afterBatch).find(c => c.bone === 'hair_tip').name;
  const a = await page.locator(`[data-constraint-name="${tipName}"]`).boundingBox(), b = await page.locator(`[data-constraint-name="${hairName}"]`).boundingBox();
  await page.mouse.move(a.x + 60, a.y + 12);await page.mouse.down();await page.mouse.move(b.x + 60, b.y + 2, { steps: 8 });await page.mouse.up();await saved(file);
  const manualOrder = await data();assert.notDeepEqual(manualOrder, afterBatch);
  await key('Control+z');await saved(file);assert.deepEqual(await data(), afterBatch);
  await key('Control+y');await saved(file);assert.deepEqual(await data(), manualOrder);
  await page.locator('#sortConstraints').click();await saved(file);
  const sorted = await data();assert.notDeepEqual(sorted, manualOrder);
  await key('Control+z');await saved(file);assert.deepEqual(await data(), manualOrder);
  report.checks.push(`4.${minor} batch presets are one undo step; paste, manual cross-type order and automatic dependency order round-trip through undo/redo`);

  const beforeFocus = await data(), focusHistory = await history();
  await page.locator('[data-tree-name="hair"]').click();
  await key('f');
  const visible = await page.evaluate(() => {
    const t=window.__spineTool, r=document.querySelector('.preview-stage').getBoundingClientRect();
    return t.selection.pose.filter(p=>t.selection.names.includes(p.name)).every(p=>p.x>=-1&&p.ex>=-1&&p.x<=r.width+1&&p.ex<=r.width+1&&p.y>=-1&&p.ey>=-1&&p.y<=r.height+1&&p.ey<=r.height+1);
  });
  assert.equal(visible, true);assert.deepEqual(await data(), beforeFocus);assert.deepEqual(await history(), focusHistory);
  const canvas = await page.locator('#rigCanvas').boundingBox();
  await page.mouse.move(canvas.x+15,canvas.y+15);await page.mouse.down({button:'right'});await page.mouse.move(canvas.x+80,canvas.y+80,{steps:4});
  await page.keyboard.press('Escape');await page.mouse.up({button:'right'});
  assert.deepEqual(await selection(), ['hair'], 'Esc cancels box before clearing selection');
  await key('Escape');assert.deepEqual(await selection(), []);
  await page.locator('[data-tree-name="hair"]').click();
  await page.locator('#presetList .preset-btn').first().click({button:'right'});await page.keyboard.press('Escape');
  assert.deepEqual(await selection(), ['hair'], 'Esc closes preset menu before clearing selection');
  await page.locator('#helpBtn').click();await page.keyboard.press('Control+z');assert.deepEqual(await history(), focusHistory);
  await page.keyboard.press('Escape');
  report.checks.push(`4.${minor} F frames selected bones without edits; Esc cancels box/menu first; open dialogs block project shortcuts`);

  const exported = path.join(work, `save-as-4${minor}.json`);
  await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath})},exported);
  await key('Control+Shift+s');
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('已保存 JSON：'));
  assert.deepEqual(JSON.parse(await fs.readFile(exported,'utf8')),await data());
  const focusedExport = path.join(work, `save-as-input-4${minor}.json`);
  await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath})},focusedExport);
  const beforeFocusedExport = await data(), historyBeforeExport = await history();
  await page.locator('#f_wind').focus();
  await page.keyboard.press('Control+Shift+s');
  await page.waitForFunction(filePath=>document.querySelector('#toast').textContent.includes(filePath),focusedExport);
  assert.deepEqual(JSON.parse(await fs.readFile(focusedExport,'utf8')),beforeFocusedExport);
  assert.deepEqual(await history(),historyBeforeExport,'input Save As must not commit form values');
  report.checks.push(`4.${minor} input-focused Ctrl+Shift+S writes complete committed JSON without entering history`);
  const diskBeforeFailure = await fs.readFile(file,'utf8');
  const redoBeforeFailure=(await history()).redo;
  await fs.chmod(file,0o444);await key('Control+z');
  await page.waitForFunction(()=>!!window.__spineTool.getSaveState().error&&!window.__spineTool.getSaveState().saving);
  assert.equal(await fs.readFile(file,'utf8'),diskBeforeFailure);
  assert.equal((await history()).redo,redoBeforeFailure+1);
  await fs.chmod(file,0o666);await key('Control+s');await saved(file);
  const external = JSON.stringify({...await data(),external:true});await fs.writeFile(file,external);
  await key('Control+y');
  await page.waitForFunction(()=>!!window.__spineTool.getSaveState().error&&!window.__spineTool.getSaveState().saving);
  assert.equal(await fs.readFile(file,'utf8'),external,'redo never overwrites an external conflict');
  assert.equal(await fs.readFile(backup,'utf8'),original);
  await page.locator('#dropbox').click();await page.locator('dialog button').filter({hasText:'取消'}).click();
  assert.equal((await data()).external,undefined);
  await page.locator('#dropbox').click();await page.locator('dialog .primary').click();
  await page.waitForFunction(()=>window.__spineTool.getData().external&&window.__spineTool.getHistoryState().undo===0);
  assert.equal((await history()).redo,0);
  report.checks.push(`4.${minor} Save As shortcut writes full JSON; readonly undo keeps in-memory edits and retry works; conflicting redo never overwrites external data; reimport clears history`);

  const input = page.locator('#constraintName');
  await page.locator('#expandBones').click();
  await page.locator('[data-tree-name="hair"]').click();
  await page.keyboard.press('Control+a');
  await input.focus();
  await page.keyboard.press('Control+a');
  assert.deepEqual(await selection(), ['hair', 'hair_tip']);
  assert.equal(await input.evaluate(el=>el.selectionStart===0&&el.selectionEnd===el.value.length),true);
  for (const size of [[1440,900],[1060,650]]) {
  await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(...size),size);
  await page.waitForTimeout(150);
  await page.locator('#updateConstraint').scrollIntoViewIfNeeded();
  const layout = await page.evaluate(() => {
    const activity = document.querySelector('.activity-panel').getBoundingClientRect();
    const footer = document.querySelector('.workspace-file-actions').getBoundingClientRect();
    const controls = [...document.querySelectorAll('.activity-panel button,.workspace-file-actions button')].map(el => { const r = el.getBoundingClientRect(); return r.left >= footer.left - 1 && r.right <= footer.right + 1 && r.bottom <= innerHeight + 1; });
    return { activityBottom: activity.bottom, footerTop: footer.top, controls };
  });
  assert.equal(layout.activityBottom <= layout.footerTop + 1, true);
  assert.equal(layout.controls.every(Boolean), true);
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.icon-action img')].every(el=>el.complete&&el.naturalWidth>0)),true);
  await page.screenshot({path:path.join(output,`workflow-4${minor}-${size[0]}.png`)});
  }
  await page.evaluate(()=>{const t=window.__spineTool;t.toast('<img src=x onerror=alert(1)>',true);t.toast('<img src=x onerror=alert(1)>',true)});
  assert.equal(await page.locator('#activityLog img').count(),0);
  assert.equal(await page.locator('#activityLog li').last().getAttribute('data-count'),'2');
  await page.evaluate(()=>{for(let i=0;i<320;i++)window.__spineTool.toast('entry '+i)});
  assert.equal(await page.locator('#activityLog li').count(),300);
  await page.locator('#clearActivity').click();assert.equal(await page.locator('#activityLog li').count(),0);
  report.checks.push(`4.${minor} minimum/large layout controls and local icons are in bounds; input Ctrl+A selects text; log safely renders strings, merges repeats, caps 300 and clears`);

  const unboundFile = path.join(work, `unbound-4${minor}.json`);
  await fs.writeFile(unboundFile, original);
  await page.evaluate(() => {
    const p = window.__spineTool.runtime.spine.SkeletonJson.prototype;
    window.__workflowReader = p;
    window.__workflowRead = p.readSkeletonData;
    p.readSkeletonData = () => { throw Error('unbound runtime import failure'); };
  });
  await page.locator('#fileInput').setInputFiles(unboundFile);
  await page.waitForFunction(() => {
    const t=window.__spineTool;
    return !t.getSaveState().source&&!t.runtime.active&&t.runtime.error.includes('unbound runtime import failure');
  });
  assert.equal((await history()).undo,0);
  await page.locator('[data-constraint-name="head_physics"]').click();
  await page.locator('#f_wind').fill('63');
  const rejectedData=await data(),rejectedHistory=await history();
  const rejectedRevision=await page.evaluate(()=>window.__spineTool.getSaveState().revision);
  await page.keyboard.press('Control+Enter');
  assert.deepEqual(await data(),rejectedData);
  assert.deepEqual(await history(),rejectedHistory);
  assert.equal(await page.evaluate(()=>window.__spineTool.getSaveState().revision),rejectedRevision);
  assert.match(await page.locator('#toast').textContent(),/官方预览尚未就绪/);
  await page.evaluate(async()=>{window.__workflowReader.readSkeletonData=window.__workflowRead;await window.__spineTool.refreshRuntime()});
  await page.waitForFunction(()=>window.__spineTool.runtime.active);

  const immediate=await page.evaluate(fixture=>{
    const t=window.__spineTool;
    t.loadSkeleton(structuredClone(fixture),'immediate-unbound.json');
    const before=JSON.stringify(t.getData()),h=JSON.stringify(t.getHistoryState()),revision=t.getSaveState().revision;
    document.querySelector('[data-constraint-name="head_physics"]').click();
    const input=document.querySelector('#f_wind');input.value='71';
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true}));
    return {inactive:!t.runtime.active,unbound:!t.getSaveState().source,sameData:JSON.stringify(t.getData())===before,sameHistory:JSON.stringify(t.getHistoryState())===h,sameRevision:t.getSaveState().revision===revision};
  },fixture);
  assert.deepEqual(immediate,{inactive:true,unbound:true,sameData:true,sameHistory:true,sameRevision:true});
  await page.waitForFunction(()=>window.__spineTool.runtime.active);
  await page.locator('#f_wind').fill('63');
  const failedUnbound=await page.evaluate(()=>{
    const t=window.__spineTool,r=t.runtime,p=r.spine.SkeletonJson.prototype,read=p.readSkeletonData;
    const before=JSON.stringify(t.getData()),h=JSON.stringify(t.getHistoryState()),revision=t.getSaveState().revision,skeleton=r.skeleton;
    p.readSkeletonData=()=>{throw Error('unbound runtime commit failure')};
    try{document.querySelector('#updateConstraint').click()}finally{p.readSkeletonData=read}
    return {sameData:JSON.stringify(t.getData())===before,sameHistory:JSON.stringify(t.getHistoryState())===h,sameRevision:t.getSaveState().revision===revision,sameSkeleton:r.skeleton===skeleton};
  });
  assert.deepEqual(failedUnbound,{sameData:true,sameHistory:true,sameRevision:true,sameSkeleton:true});
  assert.match(await page.locator('#toast').textContent(),/unbound runtime commit failure/);
  await page.keyboard.press('Control+Enter');
  assert.equal((await history()).undo,1);
  const unboundEdit=await data();assert.equal(physics(unboundEdit)[0].wind,63);
  for(const direction of ['undo','redo']){
    const inactiveRestore=await page.evaluate(direction=>{
      const t=window.__spineTool,r=t.runtime,before=JSON.stringify(t.getData()),h=JSON.stringify(t.getHistoryState()),revision=t.getSaveState().revision;
      r.active=false;
      try{document.querySelector(direction==='undo'?'#undoProject':'#redoProject').click()}finally{r.active=true}
      return {sameData:JSON.stringify(t.getData())===before,sameHistory:JSON.stringify(t.getHistoryState())===h,sameRevision:t.getSaveState().revision===revision};
    },direction);
    assert.deepEqual(inactiveRestore,{sameData:true,sameHistory:true,sameRevision:true});
    await key(direction==='undo'?'Control+z':'Control+y');
    assert.equal((await history())[direction==='undo'?'redo':'undo'],1);
  }
  assert.deepEqual(await data(),unboundEdit);
  assert.equal(await fs.readFile(unboundFile,'utf8'),original,'unbound edits never overwrite the imported file');
  await key('Control+z');
  const failedUnboundRedo=await page.evaluate(()=>{
    const t=window.__spineTool,r=t.runtime,p=r.spine.SkeletonJson.prototype,read=p.readSkeletonData;
    const before=JSON.stringify(t.getData()),h=JSON.stringify(t.getHistoryState()),revision=t.getSaveState().revision,skeleton=r.skeleton;
    p.readSkeletonData=()=>{throw Error('unbound runtime redo failure')};
    try{document.querySelector('#redoProject').click()}finally{p.readSkeletonData=read}
    return {sameData:JSON.stringify(t.getData())===before,sameHistory:JSON.stringify(t.getHistoryState())===h,sameRevision:t.getSaveState().revision===revision,sameSkeleton:r.skeleton===skeleton};
  });
  assert.deepEqual(failedUnboundRedo,{sameData:true,sameHistory:true,sameRevision:true,sameSkeleton:true});
  await key('Control+y');assert.deepEqual(await data(),unboundEdit);
  report.checks.push(`4.${minor} fileInput unbound import failure and immediate import reject edits; unbound commit/undo/redo require successful official runtime transactions and preserve cursor/revision/data on failure`);
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
}
main().catch(error => {
  report.passed = false;
  report.failure = error.stack;
  process.exitCode = 1;
}).finally(async () => {
  if (app) { await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1}).catch(()=>{});await app.close().catch(() => {}); }
  await fs.writeFile(path.join(output, 'workflow-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});