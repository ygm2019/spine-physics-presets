'use strict';
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.SPINE_TEST_OUTPUT || path.join(root, '.import-race-output'));
const packaged = process.argv[2];
const report = { mode: packaged ? 'packaged-exe' : 'development', checks: [], errors: [] };
let app;
async function main() {
  await fs.mkdir(output, { recursive: true });
  const work = await fs.mkdtemp(path.join(output, 'projects-'));
  const env = { ...process.env, SPINE_PHYSICS_TEST: '1', SPINE_PHYSICS_TEST_DATA: path.join(work, 'profile') };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: packaged || require('electron'), args: packaged ? [] : [root], env, timeout: 60000 });
  const page = await app.firstWindow();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('dialog', () => {});
  await page.waitForFunction(() => window.__spineTool && window.desktop);
  await app.evaluate(() => {
    const fs = process.getBuiltinModule('fs/promises');
    global.__readFileOriginal = fs.readFile;
    global.__readGates = new Map();
    fs.readFile = async function(file, ...args) {
      const gate = global.__readGates.get(String(file));
      if (gate && !gate.started) { gate.started = true; await gate.promise; }
      return global.__readFileOriginal.call(this, file, ...args);
    };
  });
  const gate = file => app.evaluate((_electron, file) => {
    const gate = { started: false };gate.promise = new Promise(resolve => gate.release = resolve);
    global.__readGates.set(file, gate);
  }, file);
  const started = async file => {
    for (let i = 0; i < 100; i++) {
      if (await app.evaluate((_electron, file) => !!global.__readGates.get(file)?.started, file)) return;
      await page.waitForTimeout(20);
    }
    throw Error('read gate did not start: ' + file);
  };
  const release = file => app.evaluate((_electron, file) => global.__readGates.get(file).release(), file);
  const pick = async files => {
    await app.evaluate(({ dialog }, files) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files }); }, files);
    await page.locator('#dropbox').click();
  };
  const drop = async files => {
    await page.evaluate(() => {
      if (!document.querySelector('#raceDropInput')) { const input=document.createElement('input');input.type='file';input.multiple=true;input.hidden=true;input.id='raceDropInput';document.body.append(input); }
    });
    await page.locator('#raceDropInput').setInputFiles(files);
    await page.evaluate(() => {
      const transfer=new DataTransfer();for(const file of document.querySelector('#raceDropInput').files)transfer.items.add(file);
      document.querySelector('#dropbox').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
    });
  };
  const waitSource = file => page.waitForFunction(name => window.__spineTool.getSaveState().source?.name===name&&window.__spineTool.runtime.active, path.basename(file));
  const update = async wind => {
    await page.locator('[data-constraint-name="head_physics"]').click();
    await page.locator('#f_wind').fill(String(wind));
    await page.locator('#updateConstraint').click();
  };
  for (const minor of [2, 3]) {
    for (const route of ['picker', 'drop']) {
      const dir=path.join(work, `4${minor}-${route}`);await fs.mkdir(dir);
      const oldFile=path.join(dir,'old.json'),newFile=path.join(dir,'new.json'),atlas=path.join(dir,'new.atlas');
      const original=await fs.readFile(path.join(root,`tests/fixtures/demo-4${minor}.json`));
      await fs.writeFile(oldFile,original);await fs.writeFile(newFile,original);await fs.writeFile(atlas,'staged asset must not leak on cancel');
      await pick([oldFile,path.join(root,'tests/fixtures/demo.atlas'),path.join(root,'tests/fixtures/demo.png')]);await waitSource(oldFile);
      const oldSource=await page.evaluate(()=>window.__spineTool.getSaveState().source.id);
      const oldAtlas=await page.evaluate(()=>window.__spineTool.runtime.assets.atlasText);
      const importFiles=route==='picker'?pick:drop;
      await gate(newFile);await importFiles([newFile,atlas]);await started(newFile);
      await fs.chmod(oldFile,0o444);await update(400+minor);
      await page.waitForFunction(()=>!!window.__spineTool.getSaveState().error&&!window.__spineTool.getSaveState().saving);
      const dirty=await page.evaluate(()=>({data:window.__spineTool.getData(),state:window.__spineTool.getSaveState()}));
      await release(newFile);
      await page.locator('dialog[open]').waitFor({timeout:5000});
      assert.match(await page.locator('dialog p').textContent(),/原 JSON 尚未保存/);
      await page.locator('dialog button').filter({hasText:'取消'}).click();
      assert.deepEqual(await page.evaluate(()=>({data:window.__spineTool.getData(),state:window.__spineTool.getSaveState()})),dirty);
      assert.equal(await page.evaluate(()=>window.__spineTool.runtime.assets.atlasText),oldAtlas);
      assert.deepEqual(await fs.readFile(oldFile),original);assert.deepEqual(await fs.readFile(newFile),original);
      assert.equal(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented}),true);
      for (let attempt = 0; attempt < 10; attempt++) {
        await gate(newFile);await importFiles([newFile,atlas]);
        await page.locator('dialog[open]').waitFor();await page.locator('dialog .primary').click();
        await started(newFile);await update(500+attempt);
        await page.waitForFunction(()=>!!window.__spineTool.getSaveState().error&&!window.__spineTool.getSaveState().saving);
        const retained=await page.evaluate(()=>({data:window.__spineTool.getData(),state:window.__spineTool.getSaveState()}));
        await release(newFile);await page.locator('dialog[open]').waitFor();
        await page.locator('dialog button').filter({hasText:'取消'}).click();
        assert.deepEqual(await page.evaluate(()=>({data:window.__spineTool.getData(),state:window.__spineTool.getSaveState()})),retained);
        assert.equal(await page.evaluate(()=>window.__spineTool.runtime.assets.atlasText),oldAtlas);
      }
      await fs.chmod(oldFile,0o666);await page.keyboard.press('Control+s');
      await page.waitForFunction(()=>{const s=window.__spineTool.getSaveState();return !s.error&&!s.saving&&s.saved===s.revision});
      assert.deepEqual(JSON.parse(await fs.readFile(oldFile,'utf8')),await page.evaluate(()=>window.__spineTool.getData()));
      report.checks.push(`4.${minor} ${route}: edit/save failure during native read prompts at replacement; cancel preserves old data, binding, resources and close guard; retry writes old file only`);
      report.checks.push(`4.${minor} ${route}: more than eight canceled replacements retain the original save capability, resources and edits; original-only retry succeeds`);

      await gate(newFile);await importFiles([newFile]);await started(newFile);
      await gate(oldFile);await update(700+minor);await started(oldFile);
      await release(newFile);
      await page.waitForTimeout(120);
      assert.equal(await page.evaluate(()=>window.__spineTool.getSaveState().source.id),oldSource,'replacement must wait for the pending old save');
      assert.equal(await page.locator('dialog[open]').count(),0);
      const edited=await page.evaluate(()=>window.__spineTool.getData());
      await release(oldFile);await waitSource(newFile);
      assert.deepEqual(JSON.parse(await fs.readFile(oldFile,'utf8')),edited);
      assert.deepEqual(await fs.readFile(newFile),original);
      assert.equal(await page.evaluate(()=>window.__spineTool.getSaveState().revision),0);
      report.checks.push(`4.${minor} ${route}: replacement waits for a save begun during import; old edits reach their original path, new import remains read-only`);
      const invalid=path.join(dir,'invalid.json'),invalidText='{"skeleton":{"spine":"99.0"},"bones":[{"name":"root"}]}';
      await fs.writeFile(invalid,invalidText);
      const acceptedSource=await page.evaluate(()=>window.__spineTool.getSaveState().source.id);
      for(let attempt=0;attempt<12;attempt++){
        await page.evaluate(()=>window.__spineTool.toast('waiting for invalid import'));
        await importFiles([invalid]);
        await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('检测到 Spine 99.0'));
        assert.equal(await page.evaluate(()=>window.__spineTool.getSaveState().source.id),acceptedSource);
      }
      await update(900+minor);
      await page.waitForFunction(()=>{const s=window.__spineTool.getSaveState();return s.revision>0&&!s.saving&&!s.error&&s.saved===s.revision});
      assert.deepEqual(JSON.parse(await fs.readFile(newFile,'utf8')),await page.evaluate(()=>window.__spineTool.getData()));
      assert.equal(await fs.readFile(invalid,'utf8'),invalidText);
      assert.deepEqual(JSON.parse(await fs.readFile(oldFile,'utf8')),edited);
      assert.deepEqual(await fs.readFile(newFile+'.spine-physics-backup.bak'),original);
      report.checks.push(`4.${minor} ${route}: twelve invalid imports keep the accepted binding; subsequent auto-save and original-byte backup succeed without writing rejected or old projects`);
    }
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
}
main().catch(error=>{report.passed=false;report.failure=error.stack;process.exitCode=1}).finally(async()=>{
  if(app){
    await app.evaluate(({dialog})=>{for(const gate of global.__readGates?.values()||[])gate.release();if(global.__readFileOriginal)process.getBuiltinModule('fs/promises').readFile=global.__readFileOriginal;dialog.showMessageBoxSync=()=>1}).catch(()=>{});
    await app.close().catch(()=>{});
  }
  await fs.writeFile(path.join(output,'import-race-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
});