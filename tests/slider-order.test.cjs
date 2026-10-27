'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../src/renderer/constraint-model.js');
const bones = [{ name:'root' },{ name:'driver',parent:'root' },{ name:'eye',parent:'root' },{ name:'lash',parent:'eye' },{ name:'target',parent:'root' }];
const physics = (name,bone) => ({ type:'physics',name,bone,rotate:.5 });
const slider = (name='blink', extra={}) => ({type:'slider',name,animation:name,...extra});
function rig(constraints, animations={blink:{bones:{eye:{rotate:[{value:10}]}}}}, extra={}) {
  return structuredClone({skeleton:{spine:'4.3.26'},bones,slots:[{name:'slot',bone:'root'}],constraints,animations,...extra});
}
const names = root => model.entries(root,3).map(e=>e.constraint.name);
function sorted(root, expected) {
  const original=structuredClone(root), result=model.autoSort(root,3);
  assert.equal(result.ok,true,result.errors.join('\n'));assert.deepEqual(names(root),expected);
  assert.deepEqual(root.animations,original.animations);
  assert.deepEqual(root.skins,original.skins);
  for(const c of root.constraints)assert.deepEqual(c,original.constraints.find(o=>o.type===c.type&&o.name===c.name));
  assert.equal(model.autoSort(root,3).changed,false,'idempotent');
}
function rejected(root, pattern) {
  const original=structuredClone(root), result=model.autoSort(root,3);
  assert.equal(result.ok,false);assert.match(result.errors.join('\n'),pattern);assert.deepEqual(root,original);
}
test('slider animation writers precede same-bone and descendant physics',()=>{
  sorted(rig([physics('lashP','lash'),physics('eyeP','eye'),slider()]),['blink','eyeP','lashP']);
});
test('slider driver is a read, not the constrained output bone',()=>{
  const root=rig([physics('eyeP','eye'),slider('blink',{bone:'driver',property:'rotate',local:true}),physics('driverP','driver')]);
  sorted(root,['driverP','blink','eyeP']);
  assert.deepEqual(model.affectedBones(root,'slider',root.constraints[1]),['eye']);
});
for(const local of [false,true])test(`slider ${local?'local':'world'} driver ancestor dependency`,()=>{
  const root=rig([slider('blink',{bone:'driver',property:'rotate',local}),physics('parentP','target')],undefined,{bones:bones.map(b=>b.name==='driver'?{...b,parent:'target'}:b)});
  sorted(root,local?['blink','parentP']:['parentP','blink']);
});
test('slider without a source bone is valid',()=>sorted(rig([slider('blink',{time:.25}),physics('p','eye')]),['blink','p']));
test('empty and slot-only slider animations are valid',()=>{
  sorted(rig([slider()],{blink:{}}),['blink']);
  sorted(rig([slider()],{blink:{slots:{slot:{rgba:[{color:'ffffffff'}]}}}}),['blink']);
});
for(const kind of ['ik','transform','path','physics','slider'])test(`slider animation parameter dependency for ${kind}`,()=>{
  const c=kind==='ik'?{type:kind,name:'c',bones:['lash'],target:'target'}:kind==='transform'?{type:kind,name:'c',bones:['lash'],source:'target'}:kind==='path'?{type:kind,name:'c',bones:['lash'],slot:'slot'}:kind==='physics'?physics('c','eye'):slider('c');
  const animations={blink:{[kind]:{c:{mix:[{value:.7}]}}},c:{bones:{eye:{rotate:[{}]}}}};
  sorted(rig([c,slider()],animations),['blink','c']);
});
test('global physics timelines precede all physics and preserve their data',()=>{
  sorted(rig([physics('p1','eye'),physics('p2','driver'),slider()],{blink:{physics:{'':{wind:[{value:5}]}}}}),['blink','p1','p2']);
});
for(const tracks of [{slots:{slot:{attachment:[{name:'path'}]}}},{attachments:{default:{slot:{path:{deform:[{}]}}}}}])test('slider attachment/path deformations precede path constraint',()=>{
  sorted(rig([{type:'path',name:'pathC',bones:['lash'],slot:'slot'},slider()],{blink:tracks}),['blink','pathC']);
});
test('multiple sliders writing the same bone or constraint retain their original order',()=>{
  sorted(rig([physics('p','eye'),slider('a'),slider('b')],{a:{bones:{eye:{rotate:[{}]}},physics:{p:{wind:[{}]}}},b:{bones:{eye:{translate:[{}]}},physics:{p:{wind:[{}]}}}}),['a','b','p']);
});
test('missing animation including inherited property names is rejected atomically',()=>{
  rejected(rig([slider('missing')]),/缺失动画/);
  rejected(rig([slider('__proto__')],{}),/缺失动画/);
});
test('missing driver, animated bones, slots and keyed constraints fail without mutation',()=>{
  rejected(rig([slider('blink',{bone:'missing'})]),/缺失骨骼/);
  rejected(rig([slider()],{blink:{bones:{missing:{rotate:[{}]}}}}),/缺失骨骼/);
  rejected(rig([slider()],{blink:{slots:{missing:{attachment:[{}]}}}}),/缺失插槽/);
  rejected(rig([slider()],{blink:{ik:{missing:{mix:[{}]}}}}),/缺失 ik 约束/);
});
test('invalid animation collections fail atomically',()=>{
  for(const field of ['bones','slots','attachments','ik'])rejected(rig([slider()],{blink:{[field]:[]}}),/轨道无效/);
});
test('cyclic slider parameter dependencies are reported and leave the full document unchanged',()=>{
  rejected(rig([slider('a'),slider('b')],{a:{slider:{b:{time:[{}]}}},b:{slider:{a:{time:[{}]}}}}),/循环依赖/);
});
test('slider source/bone/skin/timeline/unknown metadata survives sort and physics deletion',()=>{
  const root=rig([physics('p','eye'),slider('blink',{skin:true,loop:true,additive:true,property:'rotate',bone:'driver',from:20,to:0,scale:-.03,max:.66,local:true,custom:{keep:1}})],undefined,{skins:[{name:'default',slider:['blink'],physics:['p'],attachments:{}}]});
  const original=structuredClone(root);sorted(root,['blink','p']);model.removePhysics(root,3,['p']);
  assert.deepEqual(root.constraints,[original.constraints[1]]);assert.deepEqual(root.skins[0].slider,['blink']);assert.deepEqual(root.animations,original.animations);
});
