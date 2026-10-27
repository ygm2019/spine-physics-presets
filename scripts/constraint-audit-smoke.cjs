'use strict';
const {_electron:electron}=require('playwright-core');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),model=require('../src/renderer/constraint-model.js');
function fixture(minor){
  const c=[{type:'physics',name:'headP',bone:'head',rotate:.5},{type:'transform',name:'follow',bones:['followBone'],source:'body',properties:{rotate:{to:{rotate:{}}}}},{type:'physics',name:'bodyP',bone:'body',rotate:.4},{type:'ik',name:'reach',bones:['ikBone'],target:'driver'},{type:'path',name:'curve',bones:['pathBone'],slot:'pathSlot'}];
  const r={skeleton:{spine:`4.${minor}.26`},bones:[{name:'root'},{name:'body',parent:'root',length:40},{name:'head',parent:'body',y:40,length:20},{name:'driver',parent:'root',x:80,y:30},{name:'ikBone',parent:'root',x:60,length:20},{name:'followBone',parent:'root',x:-40,length:20},{name:'pathBone',parent:'root',x:-80,length:20}],slots:[{name:'pathSlot',bone:'root',attachment:'curve'}],skins:[{name:'default',attachments:{pathSlot:{curve:{type:'path',closed:false,constantSpeed:true,vertexCount:6,vertices:[-20,0,0,0,30,0,60,20,90,20,110,20],lengths:[100,100]}}}}],animations:{},auditMetadata:{preserve:true}};
  if(minor===3){c.push({type:'slider',name:'blink',animation:'blink',bone:'driver',property:'rotate',local:true,scale:.03});r.animations.blink={bones:{head:{rotate:[{value:0},{time:1,value:20}]}}};r.constraints=c;}
  else for(const [order,item]of c.entries()){const v={...item,order};delete v.type;if(item.type==='transform'){v.target=v.source;delete v.source;delete v.properties;}if(item.type==='path'){v.target=v.slot;delete v.slot;}(r[item.type]||=[]).push(v);}
  return r;
}
let app;const report={checks:[],errors:[]};
(async()=>{
  const output=process.env.SPINE_TEST_OUTPUT||path.join(root,'.constraint-audit-output');await fs.mkdir(output,{recursive:true});
  const run=await fs.mkdtemp(path.join(output,'run-'));
  const env={...process.env,SPINE_PHYSICS_TEST:'1',SPINE_PHYSICS_TEST_DATA:path.join(run,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  const packaged=process.env.SPINE_AUDIT_EXE;
  app=await electron.launch({executablePath:packaged||require('electron'),args:packaged?[]:[root],env});
  const page=await app.firstWindow();page.on('pageerror',error=>report.errors.push(error.message));
  await page.waitForFunction(()=>window.__spineTool&&window.desktop);
  const cases=[{name:'all-types-42',data:fixture(2)},{name:'all-types-43',data:fixture(3)}];
  if(process.argv[2])cases.push({name:'private-project',data:JSON.parse(await fs.readFile(process.argv[2],'utf8')),assets:process.argv.slice(3)});
  for(const item of cases){
    const folder=path.join(run,item.name);await fs.mkdir(folder);const source=path.join(folder,'project.json');await fs.writeFile(source,JSON.stringify(item.data));
    for(const asset of item.assets||[])await fs.copyFile(asset,path.join(folder,path.basename(asset)));
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},source);
    await page.locator('#dropbox').click();
    await page.waitForFunction(file=>window.__spineTool.getSaveState().source?.path===file&&window.__spineTool.runtime.active,source,{timeout:60000}).catch(async error=>{console.error(await page.evaluate(()=>({save:window.__spineTool.getSaveState(),runtimeError:window.__spineTool.runtime.error})));throw error;});
    const state=await page.evaluate(()=>({error:window.__spineTool.runtime.error,data:window.__spineTool.getData()}));assert.equal(state.error,'');
    const minor=Number(item.data.skeleton.spine.split('.')[1]);
    const beforeAll=model.entries(state.data,minor),types=[...new Set(beforeAll.map(e=>e.kind))];
    assert(types.includes('physics')&&types.includes('ik')&&types.includes('transform'));if(item.name.startsWith('all-types'))assert(types.includes('path'));if(minor===3)assert(types.includes('slider'));
    const existing=new Set(model.physics(state.data,minor).map(c=>c.bone));
    const sliderBone=beforeAll.filter(e=>e.kind==='slider').flatMap(e=>model.affectedBones(state.data,e.kind,e.constraint)).find(name=>!existing.has(name));
    const target=sliderBone||state.data.bones.find(b=>!existing.has(b.name)).name;
    await page.locator('#boneSelect').selectOption(target);
    await page.locator('#f_strength').fill('37');await page.locator('#f_strength').dispatchEvent('change');
    await page.waitForFunction(({count,minor})=>window.constraintModel.physics(window.__spineTool.getData(),minor).length===count+1,{count:model.physics(state.data,minor).length,minor});
    const before=await page.evaluate(()=>structuredClone(window.__spineTool.getData())),expected=structuredClone(before),plan=model.autoSort(expected,minor);
    assert.equal(plan.ok,true,plan.errors.join('\n'));
    await page.locator('#sortConstraints').click();
    assert.equal(await page.locator('dialog[open]').count(),0,'sorting should not open an unsupported-constraint alert');
    const after=await page.evaluate(()=>structuredClone(window.__spineTool.getData()));assert.deepEqual(after,expected);
    assert.deepEqual(after.animations,before.animations);assert.deepEqual(after.skins,before.skins);
    for(const entry of model.entries(after,minor)){const original=model.entries(before,minor).find(e=>e.key===entry.key);const a={...entry.constraint},b={...original.constraint};if(minor===2){delete a.order;delete b.order;}assert.deepEqual(a,b);}
    const runtime=await page.evaluate(()=>{const r=window.__spineTool.runtime;return {active:r.active,error:r.error,finite:r.skeleton.bones.every(b=>{const p=b.appliedPose||b;return [p.worldX,p.worldY,p.a,p.b,p.c,p.d].every(Number.isFinite);})};});
    assert.deepEqual(runtime,{active:true,error:'',finite:true});
    await page.waitForFunction(()=>{const s=window.__spineTool.getSaveState();return !s.saving&&!s.error&&s.saved===s.revision;});
    assert.deepEqual(JSON.parse(await fs.readFile(source,'utf8')),expected,'actual IPC autosave matches sorted data');
    if(plan.changed){await page.locator('#undoProject').click();assert.deepEqual(await page.evaluate(()=>window.__spineTool.getData()),before);await page.locator('#redoProject').click();assert.deepEqual(await page.evaluate(()=>window.__spineTool.getData()),expected);}
    await page.waitForFunction(()=>{const s=window.__spineTool.getSaveState();return !s.saving&&!s.error&&s.saved===s.revision;});
    report.checks.push({case:item.name,types,constraints:beforeAll.length,addedPhysics:true,sortChanged:plan.changed,preview:true,autosave:true,undoRedo:plan.changed?'passed':'not needed for no-op sort'});
    if(item.name==='private-project')await page.screenshot({path:path.join(run,'private-project-preview.png')});
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(app)await app.close().catch(()=>{});});
