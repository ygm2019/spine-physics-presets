'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {transform,targets}=require('../src/renderer/joystick-model.js');
const base={name:'hair',bone:'hair',inertia:.5,strength:100,mass:1,damping:.85,x:0,y:.2,rotate:.6,scaleX:.3,shearX:.4,
  wind:4,gravity:-2,mix:.7,fps:30,limit:6500,scaleY:'volume',dampingGlobal:true,skin:true,custom:{keep:1}};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('zero travel preserves every field, including omitted defaults',()=>{
 const minimal={name:'a',bone:'a'};assert.deepEqual(transform(minimal),minimal);assert.deepEqual(transform(base),base);
});
test('horizontal changes speed and drag while retaining relative damping',()=>{
 const c=transform(base,{dx:960});close(c.mass,2);close(c.strength,50);assert.ok(c.inertia>base.inertia);
 close(Math.sqrt(c.strength/c.mass)/Math.sqrt(base.strength/base.mass),.5);
 const z=p=>{const r=p.damping**(60/p.fps),a=p.strength/p.mass/p.fps**2,log=Math.log(r),theta=Math.acos((1+r-a)/(2*Math.sqrt(r)));return -log/Math.hypot(log,2*theta)};
 close(z(c),z(base));
});
test('vertical only changes damping, both directions and endpoint escape',()=>{
 for(const minor of [2,3]){
  const c=transform(base,{dy:540,minor});assert.ok(c.damping<base.damping);assert.deepEqual({...c,damping:base.damping},base);
  assert.ok(transform(base,{dy:-540,minor}).damping>base.damping);
 }
 assert.ok(transform({...base,damping:1},{dy:540}).damping<1);
 assert.ok(transform({...base,damping:0},{dy:-540}).damping>0);
});
test('proportional differences survive multi-object adjustment',()=>{
 const c=transform(base,{dx:60}),d=transform({...base,inertia:1,strength:200,mass:2},{dx:60});
 close(d.inertia/c.inertia,2);close(d.strength/c.strength,2);close(d.mass/c.mass,2);
});
test('channels are opt-in, disabled zero remains disabled, unrelated data preserved',()=>{
 const plain=transform(base,{dx:960});for(const k of ['x','y','rotate','scaleX','shearX','wind','gravity','mix','fps','limit','scaleY','dampingGlobal','skin','custom'])assert.deepEqual(plain[k],base[k]);
 const linked=transform(base,{dx:960,links:{translate:true,rotate:true,scale:true}});
 assert.equal(linked.x,0);for(const k of ['y','rotate','scaleX'])assert.ok(linked[k]>base[k]);assert.equal(linked.shearX,base.shearX);
 assert.ok(transform({...base,rotate:2},{dx:960,links:{rotate:true}}).rotate>=2);
 assert.ok(transform({...base,rotate:.9},{dx:500,links:{rotate:true}}).rotate<=1);
});
test('main zeros remain zero, values finite at large travel, original is immutable',()=>{
 const saved=structuredClone(base);
 for(const dx of [-1e9,1e9])for(const dy of [-1e9,1e9]){
  const c=transform({...base,strength:0,inertia:0},{dx,dy});assert.equal(c.strength,0);assert.equal(c.inertia,0);
  assert.ok(c.mass>0);for(const key of ['strength','mass','inertia','damping'])assert.ok(Number.isFinite(c[key]));assert.ok(c.damping>=0&&c.damping<=1);
 }
 assert.deepEqual(base,saved);assert.throws(()=>transform(base,{dx:Infinity}));assert.throws(()=>transform({...base,mass:0},{dx:10}));
});
test('one continuous gesture is evaluated from its snapshot, returning to start is exact',()=>{
 transform(base,{dx:200,dy:100});assert.deepEqual(transform(base,{dx:0,dy:0}),base);
});
test('target resolution skips missing, disambiguates explicit selection and never creates',()=>{
 const c={name:'a1',bone:'a',type:'physics'},root={bones:[{name:'a'},{name:'b'}],constraints:[c,{...c,name:'a2'}]};
 assert.deepEqual(targets(root,['a','b'],[],3),{chosen:[],missing:['b'],ambiguous:['a']});
 assert.deepEqual(targets(root,['a','b'],['a2'],3),{chosen:[root.constraints[1]],missing:['b'],ambiguous:[]});
 const root42={physics:[{name:'one',bone:'a'}]};assert.equal(targets(root42,['a'],[],2).chosen.length,1);
});
test('experimental identity cannot join stable profiles or update feed',()=>{
 const identity=require('../src/desktop/experiment-identity.cjs'),pkg=require('../package.json');
 assert.equal(identity.experimental,true);assert.notEqual(identity.appId,'local.yugongmang.spinephysics');assert.equal(identity.appId,pkg.build.appId);
 assert.ok(!pkg.build.publish);assert.match(pkg.version,/joystick/);assert.match(identity.profile,/Joystick/);
});

test('half-screen travel calibrates percentages at different resolutions',()=>{
 for(const width of [1280,1920,2560,3840]){const c=transform(base,{dx:width/2,travelX:width/2});close(c.mass/base.mass,2);}
 assert.ok(transform(base,{dx:120}).mass<base.mass*1.1);
 assert.throws(()=>transform(base,{dx:1,travelX:0}));
});
