'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {transform}=require('../src/renderer/joystick-model.js');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../tests/joystick-calibration');fs.mkdirSync(out,{recursive:true});
const ctx={console};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'src/renderer/spine-runtime/spine-webgl-4.3.min.js'),'utf8'),ctx);
const sp=ctx.spine,base={name:'test',bone:'test',type:'physics',rotate:1,inertia:.5,strength:100,mass:1,damping:.85,fps:60};
const scenarios=[['baseline',0,0],['heavy',960,0],['light',-960,0],['bouncy',0,-540],['viscous',0,540]];
const results=[];
for(const [name,dx,dy] of scenarios){
 const constraint=transform(base,{dx,dy}),doc={skeleton:{spine:'4.3.26'},bones:[{name:'root'},{name:'test',parent:'root',length:100,rotation:-90}],constraints:[constraint]};
 const sd=new sp.SkeletonJson({newRegionAttachment(){return null;}}).readSkeletonData(doc),sk=new sp.Skeleton(sd),pc=sk.physics[0];
 sk.updateWorldTransform(sp.Physics.reset);sk.update(1/60);sk.updateWorldTransform(sp.Physics.update);
 pc.rotateOffset=.2;pc.rotateVelocity=0;
 const samples=[],peaks=[];let previous=.2,velocity=0,firstTrough=0;
 for(let i=0;i<720;i++){
  sk.update(1/60);sk.updateWorldTransform(sp.Physics.update);
  const offset=pc.rotateOffset;assert.ok(Number.isFinite(offset));
  const nextVelocity=offset-previous;
  if(velocity>0&&nextVelocity<0&&offset>0&&offset>.000001&&(!peaks.length||(i+1)/60-peaks.at(-1)>.1))peaks.push((i+1)/60);
  if(firstTrough===0&&velocity<0&&nextVelocity>0&&offset<0)firstTrough=Math.abs(offset/.2);
  samples.push(offset);previous=offset;if(Math.abs(nextVelocity)>1e-12)velocity=nextVelocity;
 }
 results.push({name,constraint,period:peaks.length>=2?peaks[1]-peaks[0]:null,firstTroughRatio:firstTrough,maxOffset:Math.max(...samples.map(Math.abs))});
}
const find=name=>results.find(r=>r.name===name),normal=find('baseline');
assert.ok(find('heavy').period>normal.period*1.7&&find('heavy').period<normal.period*2.3,'heavy approximately doubles free oscillation period');
assert.ok(find('light').period<normal.period*.65&&find('light').period>normal.period*.35,'light approximately halves free oscillation period');
assert.ok(Math.abs(find('heavy').firstTroughRatio-normal.firstTroughRatio)<.025,'horizontal preserves approximate relative overshoot');
assert.ok(Math.abs(find('light').firstTroughRatio-normal.firstTroughRatio)<.025,'light preserves approximate relative overshoot');
assert.ok(find('bouncy').firstTroughRatio>normal.firstTroughRatio,'up increases residual bounce');
assert.ok(find('viscous').firstTroughRatio<normal.firstTroughRatio,'down reduces residual bounce');
const report={status:'PASS',scope:'Official bundled Spine 4.3 runtime, small-angle free response; not a guarantee for every forced animation or geometry',results};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
