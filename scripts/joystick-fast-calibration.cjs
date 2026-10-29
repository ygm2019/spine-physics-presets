'use strict';
// Actual five-link forced motion through the bundled official runtimes.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {transform}=require('../src/renderer/joystick-model.js');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../tests/joystick-fast-calibration');fs.mkdirSync(out,{recursive:true});
const profiles=[
 ['标准100',100,{inertia:.5,strength:100,mass:1,damping:.85}],
 ['柔软飘带',100,{inertia:.7,strength:55,mass:1,damping:.88}],
 ['轻巧发梢',100,{inertia:.45,strength:120,mass:.6,damping:.85}],
 ['厚实布料',100,{inertia:.8,strength:65,mass:2,damping:.82}],
 ['低阻尼',100,{inertia:.5,strength:100,mass:1,damping:.97}]
];
const directions=[['baseline',0,0],['heavy',960,0],['light',-960,0],['bouncy',0,-540],['viscous',0,540]];
const results=[],traces=[];
for(const minor of [2,3]){
 const ctx={console};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,`src/renderer/spine-runtime/spine-webgl-4.${minor}.min.js`),'utf8'),ctx);const sp=ctx.spine;
 for(const [profile,length,params] of profiles)for(const [direction,dx,dy] of directions){
  const base={name:'p1',bone:'b1',rotate:1,x:0,y:0,scaleX:0,shearX:0,fps:60,limit:5000,mix:1,wind:0,gravity:0,...params};
  const p=transform(base,{dx,dy,minor}),bones=[{name:'root'},{name:'driver',parent:'root'}],constraints=[];
  for(let i=1;i<=5;i++){
   bones.push({name:'b'+i,parent:i===1?'driver':'b'+(i-1),length,...(i===1?{rotation:-90}:{x:length})});
   constraints.push({...p,name:'p'+i,bone:'b'+i,order:i-1,...(minor===3?{type:'physics'}:{})});
  }
  const keys=Array.from({length:41},(_,f)=>({time:f/30,...(minor===3?{value:-60*Math.cos(2*Math.PI*f/40)}:{x:-60*Math.cos(2*Math.PI*f/40),y:0})}));
  const doc={skeleton:{spine:`4.${minor}.0`,fps:30},bones,[minor===3?'constraints':'physics']:constraints,animations:{fast:{bones:{driver:{[minor===3?'translatex':'translate']:keys}}}}};
  const data=new sp.SkeletonJson({newRegionAttachment(){return null;}}).readSkeletonData(doc),sk=new sp.Skeleton(data),state=new sp.AnimationState(new sp.AnimationStateData(data));
  state.setAnimation(0,'fast',true);state.apply(sk);sk.updateWorldTransform(sp.Physics.reset);
  const trace=[],dt=1/60,driveSteps=960,stopSteps=2400;
  for(let i=1;i<=driveSteps+stopSteps;i++){
   if(i<=driveSteps){state.update(dt);state.apply(sk);}else if(i===driveSteps+1){state.clearTracks();sk.findBone('driver').x=-60;}
   sk.update(dt);sk.updateWorldTransform(sp.Physics.update);
   const pose=b=>b.appliedPose||b;const tip=pose(sk.findBone('b5')),driver=pose(sk.findBone('driver')),x=tip.worldX+tip.a*length,y=tip.worldY+tip.c*length;
   const angles=Array.from({length:5},(_,j)=>{const b=pose(sk.findBone('b'+(j+1)));return Math.atan2(b.a,-b.c);});
   assert.ok([x,y,...angles].every(Number.isFinite),`${minor} ${profile} ${direction}: finite`);
   trace.push({t:i*dt,x,y,driver:driver.worldX,lag:x-driver.worldX,angles});
  }
  const forced=trace.slice(driveSteps-320,driveSteps),after=trace.slice(driveSteps),rms=a=>Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length);
  const angleMax=r=>Math.max(...r.angles.map(a=>Math.abs(a)*180/Math.PI));
  let last=after.findLastIndex(r=>angleMax(r)>.5),crossings=0;
  for(let i=1;i<after.length;i++)if(after[i].angles[0]*after[i-1].angles[0]<0&&Math.max(Math.abs(after[i].angles[0]),Math.abs(after[i-1].angles[0]))>.001)crossings++;
  // Fundamental relative lag against root velocity; signed phase is robust to amplitude.
  const harmonic=key=>{let c=0,s=0;for(const r of forced){c+=r[key]*Math.cos(2*Math.PI*r.t/(40/30));s+=r[key]*Math.sin(2*Math.PI*r.t/(40/30));}return {amplitude:Math.hypot(c,s)*2/forced.length,phase:Math.atan2(-s,c)};};
  const metrics={lagRms:rms(forced.map(r=>r.lag)),rootAngleRmsDegrees:rms(forced.map(r=>r.angles[0]))*180/Math.PI,angleRmsDegrees:rms(forced.flatMap(r=>r.angles))*180/Math.PI,settleSeconds:last<0?0:(last+1)*dt,settled:last<after.length-1,residualRms:rms(after.slice(0,240).flatMap(r=>r.angles))*180/Math.PI,crossings,tipHarmonic:harmonic('x'),driverHarmonic:harmonic('driver')};
  results.push({minor,profile,direction,params:p,...metrics});traces.push({minor,profile,direction,length,trace});
 }
}
const checks=[];
for(const minor of [2,3])for(const [profile] of profiles){
 const get=d=>results.find(r=>r.minor===minor&&r.profile===profile&&r.direction===d),b=get('baseline');
 assert.ok(get('heavy').rootAngleRmsDegrees>b.rootAngleRmsDegrees,`${minor} ${profile}: heavy root drag increases`);
 assert.ok(get('light').rootAngleRmsDegrees<b.rootAngleRmsDegrees,`${minor} ${profile}: light root follows more tightly`);
 assert.ok(get('heavy').settleSeconds>b.settleSeconds,`${minor} ${profile}: heavy returns more slowly`);
 assert.ok(get('light').settleSeconds<b.settleSeconds,`${minor} ${profile}: light returns faster`);
 assert.ok(get('bouncy').crossings>get('viscous').crossings,`${minor} ${profile}: bouncy has more root rebounds`);
 checks.push(`4.${minor} ${profile}: heavy/light root drag and settling, up/down rebound ordering`);
}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({status:'PASS',checks,scope:'Official runtimes; 5 links of 100 units; 40 frames at 30 FPS; ±60 horizontal cosine sampled per animation frame; 12 continuous cycles then 40 seconds held; 60 physics FPS. No monotonic tip-amplitude or global independent-axis guarantee.',results},null,2));
fs.writeFileSync(path.join(out,'traces.json'),JSON.stringify(traces));
console.table(results.filter(r=>r.minor===3).map(({profile,direction,lagRms,settleSeconds,residualRms,crossings})=>({profile,direction,lag:+lagRms.toFixed(1),settle:+settleSeconds.toFixed(2),residual:+residualRms.toFixed(2),crossings})));
