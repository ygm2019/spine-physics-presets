'use strict';
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.SPINE_TEST_OUTPUT || path.join(root, '.save-output'));
let app;
const packaged = process.argv[2];
const report = { mode: packaged ? 'packaged-exe' : 'development', checks: [], errors: [] };
async function main() {
  await fs.mkdir(output, { recursive: true });
  const work = await fs.mkdtemp(path.join(output, 'projects-'));
  const env = { ...process.env, SPINE_PHYSICS_TEST: '1', SPINE_PHYSICS_TEST_DATA: path.join(work, 'profile') };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: packaged || require('electron'), args: packaged ? [] : [root], env, timeout: 60000 });
  const page = await app.firstWindow();
  page.on('pageerror', error => report.errors.push(error.message));
  // Electron handles beforeunload through will-prevent-unload, not a CDP dialog.
  page.on('dialog', () => {});
  await page.waitForFunction(() => window.__spineTool && window.desktop);
  await app.evaluate(({ dialog }) => {
    global.__saveDialogs = [];
    dialog.showSaveDialog = async (_window, options) => { global.__saveDialogs.push(options);return { canceled: true }; };
  });
  const saved = async () => {
    await page.waitForFunction(() => { const s=window.__spineTool.getSaveState();return s.revision>0&&!s.saving&&s.saved===s.revision&&!s.error; });
  };
  const row = name => page.locator(`[data-constraint-name="${name}"]`);
  const pick = async files => {
    await app.evaluate(({ dialog }, files) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files }); }, files);
    await page.locator('#dropbox').click();
    await page.waitForFunction(name => window.__spineTool.getSaveState().source?.name===name&&window.__spineTool.runtime.active, path.basename(files[0]));
    await page.locator('#expandBones').click();
  };
  const diskMatches = async file => {
    await saved();
    assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), await page.evaluate(() => window.__spineTool.getData()));
  };
  const update = async (wind, file) => {
    await row('head_physics').click();
    await page.locator('#f_wind').fill(String(wind));
    await page.locator('#updateConstraint').click();
    if (file) await diskMatches(file);
  };
  for (const minor of [2, 3]) {
    const file = path.join(work, `工程-4${minor}.json`);
    const fixture = JSON.parse(await fs.readFile(path.join(root, `tests/fixtures/demo-4${minor}.json`), 'utf8'));
    fixture.extraMetadata = { keep: 'unknown' };
    const original = Buffer.from(JSON.stringify(fixture));
    await fs.writeFile(file, original);
    await pick([file, path.join(root, 'tests/fixtures/demo.atlas'), path.join(root, 'tests/fixtures/demo.png')]);
    assert.deepEqual(await fs.readFile(file), original);
    assert.equal(await page.locator('#saveStatus').textContent(), '已载入原 JSON');
    await page.locator('[data-tree-name="head"]').click();
    await page.locator('#f_wind').fill('13');
    await page.locator('#refreshData').click();
    assert.deepEqual(await fs.readFile(file), original, 'selection, form-only edits and refresh do not write');
    await update(31, file);
    const backup = await page.evaluate(() => window.__spineTool.getSaveState().backup);
    assert.deepEqual(await fs.readFile(backup), original);
    await page.locator('[data-tree-name="body"]').click();
    await page.locator('#presetList .preset-btn').first().click();
    await diskMatches(file);
    assert.equal(await page.locator('#saveStatus').textContent(), '已自动保存');
    await row('head_physics').click();await page.keyboard.press('Control+c');
    const bodyName = await page.evaluate(() => (window.__spineTool.getData().constraints||window.__spineTool.getData().physics).find(c=>c.bone==='body').name);
    await row(bodyName).click();await page.keyboard.press('Control+v');await diskMatches(file);
    const a=await row(bodyName).boundingBox(),b=await row('head_physics').boundingBox();
    await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
    await page.mouse.move(b.x+b.width/2,b.y+3,{steps:8});await page.mouse.up();await diskMatches(file);
    await page.locator('#sortConstraints').click();await diskMatches(file);
    await row(bodyName).click();await page.locator('#deleteConstraint').click();await page.locator('dialog .primary').click();await diskMatches(file);
    assert.equal((JSON.parse(await fs.readFile(file,'utf8')).constraints||JSON.parse(await fs.readFile(file,'utf8')).physics).some(c=>c.name===bodyName),false);
    await page.evaluate(() => {
      const t=window.__spineTool;
      document.querySelector('[data-constraint-name="head_physics"]').click();
      for(const wind of [111,222,333]){document.querySelector('#f_wind').value=wind;document.querySelector('#updateConstraint').click();}
    });
    await diskMatches(file);
    assert.equal((JSON.parse(await fs.readFile(file,'utf8')).constraints||JSON.parse(await fs.readFile(file,'utf8')).physics).find(c=>c.name==='head_physics').wind,333);
    assert.deepEqual(await fs.readFile(backup), original, 'later writes must not replace original backup');
    assert.equal((await app.evaluate(()=>global.__saveDialogs)).length,0,'auto-save never opens Save As');
    report.checks.push(`4.${minor} import is read-only; apply, preset, paste, delete and both order actions auto-save exact JSON; rapid edits keep latest state and original backup`);

    const before = await fs.readFile(file);
    const failed = await page.evaluate(() => {
      const t=window.__spineTool,r=t.runtime,p=r.spine.SkeletonJson.prototype,original=p.readSkeletonData;
      const data=JSON.stringify(t.getData()),revision=t.getSaveState().revision,skeleton=r.skeleton;
      p.readSkeletonData=()=>{throw Error('save parse failure')};
      try{document.querySelector('#updateConstraint').click()}finally{p.readSkeletonData=original}
      return { sameData:JSON.stringify(t.getData())===data,sameRevision:t.getSaveState().revision===revision,sameSkeleton:r.skeleton===skeleton };
    });
    assert.deepEqual(failed,{sameData:true,sameRevision:true,sameSkeleton:true});
    assert.deepEqual(await fs.readFile(file),before);

    await fs.chmod(file,0o444);
    await update(444);
    await page.waitForFunction(()=>!!window.__spineTool.getSaveState().error&&!window.__spineTool.getSaveState().saving);
    assert.equal(await page.locator('#saveStatus').textContent(),'未保存');
    assert.deepEqual(await fs.readFile(file),before);
    await fs.chmod(file,0o666);
    await page.keyboard.press('Control+s');await diskMatches(file);
    report.checks.push(`4.${minor} rejected runtime commit does not write; readonly failure keeps edits and Ctrl+S retries successfully`);

    const external = JSON.stringify({...JSON.parse(await fs.readFile(file,'utf8')),external:true});
    await fs.writeFile(file,external);
    await update(555);
    await page.waitForFunction(()=>!!window.__spineTool.getSaveState().error&&!window.__spineTool.getSaveState().saving);
    assert.equal(await fs.readFile(file,'utf8'),external);
    const source=await page.evaluate(()=>window.__spineTool.getSaveState().source.id);
    await page.locator('#dropbox').click();await page.locator('dialog button').filter({hasText:'取消'}).click();
    assert.equal(await page.evaluate(()=>window.__spineTool.getSaveState().source.id),source);
    const exported=path.join(work,`另存-4${minor}.json`);
    await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath})},exported);
    assert.equal(await page.evaluate(()=>window.__spineTool.exportJson()),true);
    assert.deepEqual(JSON.parse(await fs.readFile(exported,'utf8')),await page.evaluate(()=>window.__spineTool.getData()));
    assert.equal(await fs.readFile(file,'utf8'),external);
    await app.evaluate(({dialog})=>{global.__closePrompts=0;dialog.showMessageBoxSync=()=>{global.__closePrompts++;return 0;}});
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
    await page.waitForFunction(()=>!!window.__spineTool);
    assert.equal(await app.evaluate(()=>global.__closePrompts),1);
    // Explicit discard/reimport resolves the external conflict without writing it back.
    await page.locator('#dropbox').click();await page.locator('dialog .primary').click();
    await page.waitForFunction(id=>window.__spineTool.getSaveState().source.id!==id,source);
    assert.equal(await page.evaluate(()=>window.__spineTool.getData().external),true);
    report.checks.push(`4.${minor} external conflict preserves external file; failed edits survive canceled import and close; Save As recovers edits; explicit reimport loads external state`);
    await app.evaluate(({dialog})=>{dialog.showSaveDialog=async(_window,options)=>{global.__saveDialogs.push(options);return {canceled:true}}});
  }

  // Use native Chromium File objects, not synthetic files with invented paths.
  const dropped=path.join(work,'dropped.json');
  await fs.copyFile(path.join(root,'tests/fixtures/demo-43.json'),dropped);
  await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.id='nativeDropProbe';input.hidden=true;document.body.append(input)});
  await page.locator('#nativeDropProbe').setInputFiles(dropped);
  await page.evaluate(()=>{
    const transfer=new DataTransfer();transfer.items.add(document.querySelector('#nativeDropProbe').files[0]);
    document.querySelector('#dropbox').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
  });
  await page.waitForFunction(()=>window.__spineTool.getSaveState().source?.name==='dropped.json'&&window.__spineTool.runtime.active);
  await update(777,dropped);
  report.checks.push('native filesystem drop binds original file through preload webUtils and auto-saves it once');
  for(const size of [[1440,900],[1060,650]]){
    await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(...size),size);
    await page.waitForTimeout(200);
    await page.evaluate(()=>window.__spineTool.toast('约束已更新，原 JSON 已自动保存。'));
    const valid=await page.evaluate(()=>{
      const bar=document.querySelector('.workspace-file-actions').getBoundingClientRect();
      const toast=document.querySelector('#toast').getBoundingClientRect();
      const intersects=r=>r.left<toast.right&&r.right>toast.left&&r.top<toast.bottom&&r.bottom>toast.top;
      return [...document.querySelectorAll('.workspace-file-actions button,#saveStatus')].every(el=>{const r=el.getBoundingClientRect();return r.left>=bar.left&&r.right<=bar.right&&r.bottom<=innerHeight&&el.scrollWidth<=el.clientWidth&&!intersects(r)})&&[...document.querySelectorAll('.actions button')].every(el=>!intersects(el.getBoundingClientRect()));
    });
    assert.equal(valid,true);
    await page.screenshot({path:path.join(output,`save-window-${size[0]}.png`)});
  }
  assert.deepEqual(report.errors,[]);
  report.passed=true;
}
main().catch(error=>{report.passed=false;report.failure=error.stack;process.exitCode=1}).finally(async()=>{
  if(app){await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1}).catch(()=>{});await app.close().catch(()=>{});}
  await fs.writeFile(path.join(output,'save-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
});