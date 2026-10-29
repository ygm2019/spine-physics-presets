'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),output=path.resolve(root,'../tests/joystick');
const report={checks:[],errors:[]};fs.mkdirSync(output,{recursive:true});
const ok=label=>{report.checks.push(label);console.log('PASS '+label);};
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
 const page=await browser.newPage({viewport:{width:1680,height:1080},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.message));await page.goto(pathToFileURL(path.join(root,'src/renderer/index.html')).href);await page.waitForFunction(()=>window.__spineTool);
 const get=()=>page.evaluate(()=>structuredClone(window.__spineTool.getData()));
 const history=()=>page.evaluate(()=>window.__spineTool.getHistoryState().undo);
 const pick=names=>page.evaluate(names=>{document.querySelector('#clearSelection').click();for(const name of names){document.querySelector(`[data-tree-name="${name}"]`).dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true}));}},names);
 const down=async()=>{await page.locator('#joystickPad').scrollIntoViewIfNeeded();const r=await page.locator('#joystickPad').boundingBox();const p={x:r.x+r.width/2,y:r.y+r.height/2};await page.mouse.move(p.x,p.y);await page.mouse.down();return p;};
 const drag=async(dx,dy)=>{const p=await down();await page.mouse.move(p.x+dx,p.y+dy,{steps:6});await page.mouse.up();};
 for(const minor of [2,3]){
  const fixture=JSON.parse(fs.readFileSync(path.join(root,`tests/fixtures/demo-4${minor}.json`),'utf8'));
  const physics=minor===3?fixture.constraints:fixture.physics;
  const original=physics[0];physics.push({...original,name:'body_physics',bone:'body',inertia:.4,strength:17,mass:1.3,damping:.91,x:0,y:.3,rotate:.5,scaleX:0,wind:3.1});
  fixture.animations={motion:{bones:{body:{translate:[{x:0},{time:1,x:40},{time:2,x:0}]}}}};
  await page.evaluate(f=>{window.__writes=[];window.desktop={saveProject:async req=>{window.__writes.push(JSON.parse(req.text));return{backup:'fixture-backup'}}};window.__spineTool.loadSkeleton(f,'fixture.json',{id:'fixture'});},fixture);
  await page.waitForFunction(()=>window.__spineTool.runtime.active);
  await page.locator('#expandBones').click();await pick(['body','head','root']);
  for(const id of ['joystickTranslate','joystickRotate','joystickScale'])assert.equal(await page.locator('#'+id).isChecked(),false);
  const before=await get(),n=await history();
  await page.evaluate(()=>{window.__runtimeBefore=window.__spineTool.runtime.skeleton;});
  const p=await down();await page.mouse.move(p.x+60,p.y-30,{steps:5});
  assert.equal(await page.evaluate(()=>window.__spineTool.getJoystickState().active),true);
  assert.deepEqual(await get(),before,'preview must not change source data');assert.equal(await history(),n);
  assert.equal(await page.evaluate(()=>window.__writes.length),0,'no autosave until release');
  const live=await page.evaluate(()=>{const sk=window.__spineTool.runtime.skeleton;return(sk.physics||sk.physicsConstraints).map(c=>({name:c.data.name,massInverse:(c.appliedPose||c).massInverse,strength:(c.appliedPose||c).strength}));});
  assert.ok(live.every(c=>Number.isFinite(c.massInverse)&&Number.isFinite(c.strength)));
  const liveAgain=await page.evaluate(()=>JSON.stringify((window.__spineTool.runtime.skeleton.physics||window.__spineTool.runtime.skeleton.physicsConstraints).map(c=>[(c.appliedPose||c).strength,(c.appliedPose||c).massInverse])));
  await page.waitForTimeout(160);
  assert.equal(await page.evaluate(()=>JSON.stringify((window.__spineTool.runtime.skeleton.physics||window.__spineTool.runtime.skeleton.physicsConstraints).map(c=>[(c.appliedPose||c).strength,(c.appliedPose||c).massInverse]))),liveAgain,'holding still cannot accumulate');
  assert.match(await page.locator('#joystickStatus').textContent(),/跳过 1 根/);
  await page.mouse.up();const after=await get();assert.equal(await history(),n+1);
  assert.equal(await page.evaluate(()=>window.__spineTool.runtime.skeleton===window.__runtimeBefore),true,'commit must keep the same simulation');
  assert.equal(await page.evaluate(()=>window.__spineTool.getJoystickState().active),false);
  const arr=d=>minor===3?d.constraints:d.physics;
  for(const c of arr(after)){
   const b=arr(before).find(x=>x.name===c.name),expected=await page.evaluate(({c,minor})=>window.joystickModel.transform(c,{dx:60,dy:-30,minor,travelX:Math.max(320,screen.availWidth/2),travelY:Math.max(240,screen.availHeight/2)}),{c:b,minor});
   assert.deepEqual(c,expected);for(const key of ['x','y','rotate','scaleX','shearX','wind','gravity','mix','fps','limit'])assert.equal(c[key],b[key]);
  }
  await page.waitForFunction(()=>{const s=window.__spineTool.getSaveState();return !s.saving&&s.saved===s.revision&&window.__writes.length===1;});
  await page.locator('#undoProject').click();assert.deepEqual(await get(),before);
  await page.locator('#redoProject').click();assert.deepEqual(await get(),after);ok(`4.${minor}: relative batch, skip missing, live preview, hold, one undo/autosave, no runtime rebuild`);
  const base=await get(),h=await history();
  const e=await down();await page.mouse.move(e.x+75,e.y+60);await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await get(),base);assert.equal(await history(),h);ok(`4.${minor}: Escape rollback`);
  const b=await down();await page.mouse.move(b.x-45,b.y-30);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();assert.deepEqual(await get(),base);assert.equal(await history(),h);ok(`4.${minor}: blur rollback`);
  const c=await down();await page.mouse.move(c.x+40,c.y);await page.evaluate(()=>document.querySelector('#joystickPad').dispatchEvent(new Event('pointercancel')));await page.mouse.up();assert.deepEqual(await get(),base);ok(`4.${minor}: pointer cancel rollback`);
  const f=await down();await page.mouse.move(f.x+30,f.y);await page.evaluate(()=>{const sp=window.__spineTool.runtime.spine;window.__reader=sp.SkeletonJson.prototype.readSkeletonData;sp.SkeletonJson.prototype.readSkeletonData=function(){throw Error('injected validation failure');};});
  await page.mouse.up();await page.evaluate(()=>{window.__spineTool.runtime.spine.SkeletonJson.prototype.readSkeletonData=window.__reader;});assert.deepEqual(await get(),base);assert.equal(await history(),h);assert.match(await page.locator('#joystickStatus').textContent(),/未提交/);ok(`4.${minor}: failed final validation is atomic`);
  await page.locator('#joystickTranslate').check();await page.locator('#joystickRotate').check();await page.locator('#joystickScale').check();
  await drag(80,0);const linked=await get();
  for(const cc of arr(linked)){const bb=arr(base).find(c=>c.name===cc.name);for(const key of ['x','y','rotate','scaleX']){if(bb[key]===0)assert.equal(cc[key],0);else if(bb[key]>0&&bb[key]<1)assert.ok(cc[key]>=bb[key]);}assert.equal(cc.shearX,bb.shearX);}
  ok(`4.${minor}: opt-in channels and preserved disabled zeros`);
  await page.locator('#joystickPad').focus();const keyCount=await history();await page.keyboard.press('ArrowLeft');assert.equal(await history(),keyCount+1);await page.keyboard.press('Control+z');assert.deepEqual(await get(),linked);ok(`4.${minor}: keyboard nudge and undo`);
  for(const id of ['joystickTranslate','joystickRotate','joystickScale'])await page.locator('#'+id).uncheck();
  await page.locator('[data-animation="motion"]').click();await page.waitForTimeout(130);
  const time=await page.evaluate(()=>window.__spineTool.runtime.animationState.tracks[0].trackTime);
  await drag(20,15);await page.waitForTimeout(100);assert.ok(await page.evaluate(t=>window.__spineTool.runtime.animationState.tracks[0].trackTime>t,time));ok(`4.${minor}: playing animation advances across final commit`);
  const multiple=structuredClone(fixture);(minor===3?multiple.constraints:multiple.physics).push({...original,name:'head_other',bone:'head'});
  await page.evaluate(f=>window.__spineTool.loadSkeleton(f,'multiple.json'),multiple);await page.waitForFunction(()=>window.__spineTool.runtime.active);await page.locator('#expandBones').click();await pick(['head']);
  const unchanged=await get();await drag(60,0);assert.deepEqual(await get(),unchanged);assert.match(await page.locator('#joystickStatus').textContent(),/明确选择/);
  await page.locator('[data-constraint-name="head_other"]').click();await drag(30,0);const changed=await get();assert.deepEqual(arr(changed).find(c=>c.name===original.name),arr(unchanged).find(c=>c.name===original.name));assert.notDeepEqual(arr(changed).find(c=>c.name==='head_other'),arr(unchanged).find(c=>c.name==='head_other'));ok(`4.${minor}: multiple constraints require explicit target`);
  // The joystick supplements the complete original inspector. Verify editing
  // actual controls after using it, not just the continued presence of markup.
  for(const key of ['x','y','rotate','scaleX','shearX','limit','fps','inertia','strength','damping','mass','wind','gravity','mix']){
   assert.equal(await page.locator('#f_'+key).count(),1);assert.equal(await page.locator(`[data-range="${key}"]`).count(),1);
  }
  await pick(['body']);await page.locator('#f_strength').fill('42');await page.locator('#f_strength').dispatchEvent('change');
  assert.equal(arr(await get()).find(c=>c.bone==='body').strength,42);
  await page.locator('#f_damping').fill('17');await page.locator('#f_damping').dispatchEvent('change');
  assert.ok(Math.abs(arr(await get()).find(c=>c.bone==='body').damping-.83)<1e-9);
  await page.locator('[data-range="wind"]').evaluate(el=>{el.value='9';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(arr(await get()).find(c=>c.bone==='body').wind,9);ok(`4.${minor}: all original inspector inputs/sliders retained and manually editable after joystick`);
  const precise={inertia:.4482704905,strength:121.8626728,damping:.8953488984,mass:.590828996};
  const roundtrip=await page.evaluate(v=>{const t=window.__spineTool;t.setForm(v);return{values:t.valuesFromForm(),shown:Object.fromEntries(Object.keys(v).map(k=>[k,document.querySelector('#f_'+k).value]))};},precise);
  for(const key of Object.keys(precise)){assert.equal(roundtrip.values[key],precise[key],'display formatting must preserve original precision');assert.match(roundtrip.shown[key],/^-?\d+(?:\.\d)?$/);}
  await page.locator('#f_inertia').fill('44.8');await page.locator('#f_inertia').dispatchEvent('change');
  assert.ok(Math.abs(await page.evaluate(()=>window.__spineTool.valuesFromForm().inertia)-.448)<1e-12,'intentional edit to displayed value must replace hidden precision');
  ok(`4.${minor}: one decimal display, raw precision retained, intentional input replaces cache`);
  await page.evaluate(f=>{window.desktop.saveProject=async()=>{throw Error('injected save failure')};window.__spineTool.loadSkeleton(f,'save-failure.json',{id:'save-failure-source'});},fixture);
  await page.waitForFunction(()=>window.__spineTool.runtime.active);await page.locator('#expandBones').click();await pick(['body']);
  const saveBefore=await get();await drag(45,0);await page.waitForFunction(()=>window.__spineTool.getSaveState().error==='injected save failure');
  assert.notDeepEqual(await get(),saveBefore,'save failure must retain the user edit for retry');
  assert.equal(await page.locator('#saveOriginal').count(),0);assert.equal(await page.locator('#exportJson').count(),0);assert.match(await page.locator('#saveStatus').textContent(),/未保存/);
  await page.evaluate(async()=>{window.desktop.saveProject=async()=>({backup:'retry-backup'});await window.__spineTool.saveOriginal();});
  assert.equal(await page.evaluate(()=>window.__spineTool.getSaveState().error),'');
  assert.equal(await page.evaluate(()=>{const s=window.__spineTool.getSaveState();return s.saved===s.revision}),true);ok(`4.${minor}: failed autosave retains edited data and retry succeeds`);
 }
 assert.deepEqual(report.errors,[]);await page.screenshot({path:path.join(output,'interface.png'),fullPage:true});report.status='PASS';
 }finally{await browser.close();fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));}
})().catch(error=>{console.error(error);process.exitCode=1;});
