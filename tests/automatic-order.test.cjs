'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../src/renderer/constraint-model.js');
const bones = [{ name: 'root' }, { name: 'a', parent: 'root' }, { name: 'b', parent: 'a' }, { name: 'c', parent: 'b' }, { name: 'source', parent: 'root' }, { name: 'driver', parent: 'root' }];
const p = (name, bone) => ({ type: 'physics', name, bone, rotate: 0.5, unknown: { keep: true } });
const t = (name, bone, source) => ({ type: 'transform', name, bones: [bone], source, properties: { rotate: { to: { rotate: {} } } } });
const ik = (name, targets, target) => ({ type: 'ik', name, bones: targets, target });
const path = (name, targets) => ({ type: 'path', name, bones: targets, slot: 'slot' });
function rig(minor, constraints, extras = {}) {
  const root = structuredClone({ bones, slots: [{ name: 'slot', bone: 'source' }], ...extras });
  root.skeleton = { spine: `4.${minor}.0` };
  if (minor === 3) root.constraints = structuredClone(constraints);
  else constraints.forEach((input, order) => {
    const c = structuredClone(input), type = c.type;
    delete c.type; c.order = order;
    if (type === 'transform') { c.target = c.source; delete c.source; delete c.properties; }
    if (type === 'path') { c.target = c.slot; delete c.slot; }
    (root[type] ||= []).push(c);
  });
  return root;
}
const names = (root, minor) => model.entries(root, minor).map(e => e.constraint.name);
function expectSort(minor, constraints, expected, extras) {
  const root = rig(minor, constraints, extras), original = structuredClone(root), refs = new Map(model.entries(root, minor).map(e => [e.key, e.constraint]));
  const preview = model.automaticOrder(root, minor);
  assert.equal(preview.ok, true, JSON.stringify(preview));
  assert.deepEqual(root, original, 'planning must not mutate the input');
  const result = model.autoSort(root, minor);
  assert.equal(result.ok, true);
  assert.deepEqual(names(root, minor), expected);
  for (const e of model.entries(root, minor)) assert.equal(e.constraint, refs.get(e.key));
  if (minor === 2) assert.deepEqual(model.entries(root, minor).map(e => e.constraint.order), expected.map((_, i) => i));
  assert.equal(model.autoSort(root, minor).changed, false, 'sorting must be idempotent');
  return root;
}
function expectFailure(root, minor, pattern) {
  const original = structuredClone(root), result = model.autoSort(root, minor);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), pattern);
  assert.deepEqual(root, original, 'failure must be atomic');
}
for (const minor of [2, 3]) {
  test(`4.${minor} orders physics along a parent-child chain`, () => {
    expectSort(minor, [p('child', 'c'), p('parent', 'b'), p('ancestor', 'a')], ['ancestor', 'parent', 'child']);
  });
  test(`4.${minor} follows source and IK-target producer dependencies`, () => {
    expectSort(minor, [ik('ik', ['a'], 'source'), t('from_source', 'driver', 'source'), p('source', 'source')], ['source', 'ik', 'from_source']);
  });
  test(`4.${minor} follows ancestors of a source bone`, () => {
    expectSort(minor, [t('from_child', 'driver', 'c'), p('ancestor', 'a')], ['ancestor', 'from_child']);
  });
  test(`4.${minor} local transform sources do not acquire world ancestor dependencies`, () => {
    const local=t('local_a','a','b');if(minor===2)local.local=true;else local.localSource=true;
    expectSort(minor,[t('world_s','s','a'),local],['local_a','world_s'],{bones:[{name:'root'},{name:'s',parent:'root'},{name:'b',parent:'s'},{name:'a',parent:'root'}]});
  });
  test(`4.${minor} weighted-only paths do not depend on their slot bone`, () => {
    const extras={bones:[{name:'root'},{name:'a',parent:'root'},{name:'b',parent:'root'}],slots:[{name:'slot',bone:'b'}],skins:[{attachments:{slot:{curve:{type:'path',vertexCount:6,vertices:Array.from({length:6},(_,i)=>[1,0,i*10,0,1]).flat()}}}}]};
    expectSort(minor,[t('follow_a','b','a'),path('path_a',['a'])],['path_a','follow_a'],extras);
    extras.skins.push({attachments:{slot:{curve:{type:'path',vertexCount:6,vertices:Array.from({length:12},(_,i)=>i*10)}}}});
    expectFailure(rig(minor,[t('follow_a','b','a'),path('path_a',['a'])],extras),minor,/循环依赖/);
  });
  test(`4.${minor} rejects unsupported IK bone counts and malformed skin/slot objects`, () => {
    expectFailure(rig(minor,[ik('invalid',['a','b','c'],'source')]),minor,/IK 只能/);
    expectFailure(rig(minor,[ik('invalid',['a','a'],'source')]),minor,/IK 只能/);
    expectFailure(rig(minor,[p('p','a')],{slots:[null]}),minor,/插槽数据/);
    expectFailure(rig(minor,[p('p','a')],{skins:[null]}),minor,/皮肤数据/);
    expectFailure(rig(minor,[path('p',['a'])],{skins:[{attachments:{slot:{curve:null}}}]}),minor,/附件数据/);
  });
  test(`4.${minor} puts same-bone drivers before physics, not all physics last`, () => {
    expectSort(minor, [p('source', 'source'), p('a_physics', 'a'), t('a_transform', 'a', 'source'), ik('b_ik', ['b'], 'source')], ['source', 'a_transform', 'a_physics', 'b_ik']);
  });
  test(`4.${minor} keeps two-bone IK before both physics constraints`, () => {
    expectSort(minor, [p('child', 'b'), p('parent', 'a'), ik('ik2', ['a', 'b'], 'source')], ['ik2', 'parent', 'child']);
  });
  test(`4.${minor} preserves unrelated and same-bone writer order`, () => {
    expectSort(minor, [p('z', 'a'), p('a', 'driver'), p('m', 'source')], ['z', 'a', 'm']);
    expectSort(minor, [t('z', 'a', 'source'), t('a', 'a', 'driver'), p('p2', 'a'), p('p1', 'a')], ['z', 'a', 'p2', 'p1']);
  });
  test(`4.${minor} lets hard dependencies override overlapping writer preference`, () => {
    expectSort(minor, [t('first', 'b', 'source'), { ...t('second', 'b', 'driver'), bones: ['b', 'source'] }], ['second', 'first']);
    expectSort(minor, [t('first', 'b', 'source'), t('second', 'b', 'driver'), t('producer', 'source', 'driver')], ['producer', 'first', 'second']);
  });
  test(`4.${minor} orders path-slot and all skin path-weight producers`, () => {
    const weighted = [1, 5, 0, 0, 1, 1, 5, 20, 0, 1];
    expectSort(minor, [path('path', ['a']), p('source', 'source'), p('driver', 'driver')], ['source', 'driver', 'path'], {
      skins: [{ name: 'default', attachments: { slot: { unweighted: { type: 'path', vertexCount: 2, vertices: [0, 0, 20, 0] } } } },
        { name: 'alternate', attachments: { slot: { weighted: { type: 'path', vertexCount: 2, vertices: weighted } } } }]
    });
  });
  test(`4.${minor} detects cycles without altering any fields`, () => {
    expectFailure(rig(minor, [t('first', 'a', 'source'), t('second', 'source', 'a'), p('downstream', 'b')]), minor, /循环依赖：first → second → first/);
  });
  test(`4.${minor} rejects missing references and malformed weights`, () => {
    expectFailure(rig(minor, [p('missing', 'not-a-bone')]), minor, /缺失骨骼/);
    expectFailure(rig(minor, [t('missing', 'a', 'not-a-bone')]), minor, /缺失骨骼/);
    expectFailure(rig(minor, [path('missing', ['a'])], { slots: [] }), minor, /缺失插槽/);
    expectFailure(rig(minor, [path('bad', ['a'])], { skins: [{ attachments: { slot: { bad: { type: 'path', vertexCount: 2, vertices: [1, 99, 0, 0, 1, 1, 5, 0, 0, 1] } } } }] }), minor, /路径权重数据无效/);
    expectFailure(rig(minor, [path('bad', ['a'])], { skins: [{ attachments: { slot: { bad: { type: 'path', vertexCount: 2, vertices: [1] } } } }] }), minor, /路径权重数据无效/);
  });
  test(`4.${minor} rejects duplicate identities, bad hierarchy and unsupported constraints`, () => {
    expectFailure(rig(minor, [p('duplicate', 'a'), p('duplicate', 'b')]), minor, /重名/);
    expectFailure(rig(minor, [p('p', 'a')], { bones: [{ name: 'a', parent: 'b' }, { name: 'b', parent: 'a' }] }), minor, /层级存在循环/);
    expectFailure(rig(minor, [p('p', 'a')], { bones: [{ name: 'a', parent: 'missing' }] }), minor, /缺少父骨骼/);
    expectFailure(rig(minor, [{ type: 'slider', name: 'slider', bone: 'source' }]), minor, /暂不支持/);
  });
  test(`4.${minor} preserves parameters, unknown fields, skins and animations`, () => {
    const root = expectSort(minor, [p('child', 'b'), p('parent', 'a')], ['parent', 'child'], { skins: [{ name: 'skin', physics: ['child'], unknown: 7 }], animations: { idle: { physics: { child: { wind: [{ value: 4 }] } } } }, custom: [1, 2] });
    assert.deepEqual(model.physics(root, minor)[0].unknown, { keep: true });
    assert.equal(root.skins[0].unknown, 7);
    assert.deepEqual(root.custom, [1, 2]);
    assert.equal(root.animations.idle.physics.child.wind[0].value, 4);
    assert.equal(model.physics(root, minor)[1].rotate, 0.5);
  });
  test(`4.${minor} plans empty constraints and rejects malformed collections`, () => {
    const empty = rig(minor, []);
    if (minor === 3) empty.constraints = [];
    assert.deepEqual(model.automaticOrder(empty, minor).keys, []);
    const bad = rig(minor, []); if (minor === 3) bad.constraints = [null]; else bad.physics = [null];
    expectFailure(bad, minor, /约束数据无效/);
  });
}