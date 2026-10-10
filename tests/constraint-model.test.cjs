'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../src/renderer/constraint-model.js');
const fixture = minor => minor === 2 ? {
  ik: [{ name: 'ik', order: 0, extra: 'keep' }],
  transform: [{ name: 'transform', order: 2 }],
  physics: [{ name: 'head', bone: 'head', order: 3 }, { name: 'body', bone: 'body', order: 1 }]
} : { constraints: [
  { type: 'ik', name: 'ik', order: 9, extra: 'keep' },
  { type: 'physics', name: 'body', bone: 'body', order: 8 },
  { type: 'transform', name: 'transform', order: 0 },
  { type: 'physics', name: 'head', bone: 'head', order: 1 }
] };

for (const minor of [2, 3]) {
  test(`4.${minor} exposes the runtime's global order, not names or physics array indices`, () => {
    const root = fixture(minor);
    assert.deepEqual(model.entries(root, minor).map(e => e.constraint.name), ['ik', 'body', 'transform', 'head']);
    assert.deepEqual(model.physics(root, minor).map(c => c.name), ['body', 'head']);
  });
  test(`4.${minor} reorders across constraint types without changing identities`, () => {
    const root = fixture(minor), entries = model.entries(root, minor), ik = entries[0].constraint;
    model.reorder(root, minor, entries.map(e => e.key).reverse());
    const actual = model.entries(root, minor);
    assert.deepEqual(actual.map(e => e.constraint.name), ['head', 'transform', 'body', 'ik']);
    assert.equal(actual[3].constraint, ik);
    assert.equal(ik.extra, 'keep');
    if (minor === 2) assert.deepEqual(actual.map(e => e.constraint.order), [0, 1, 2, 3]);
    else assert.equal(ik.order, 9, 'ignored input metadata is preserved');
    assert.throws(() => model.reorder(root, minor, ['missing']), /permutation/);
  });
  test(`4.${minor} moves one constraint around a target while retaining every other relative order`, () => {
    const root=fixture(minor),all=model.entries(root,minor),refs=all.map(e=>e.constraint);
    assert.equal(model.moveRelative(root,minor,all[3].key,all[1].key,true),true);
    assert.deepEqual(model.entries(root,minor).map(e=>e.constraint.name),['ik','head','body','transform']);
    assert.deepEqual(model.entries(root,minor).map(e=>e.constraint),[refs[0],refs[3],refs[1],refs[2]]);
    const unchanged=structuredClone(root);
    assert.equal(model.moveRelative(root,minor,all[3].key,all[1].key,true),false);
    assert.equal(model.moveRelative(root,minor,all[3].key,all[3].key,false),false);
    assert.deepEqual(root,unchanged);
    assert.equal(model.moveRelative(root,minor,all[3].key,all[1].key,false),true);
    assert.deepEqual(model.entries(root,minor).map(e=>e.constraint.name),['ik','body','head','transform']);
    const before=structuredClone(root);
    assert.throws(()=>model.moveRelative(root,minor,'missing',all[1].key),/identity/);
    assert.deepEqual(root,before);
    if(minor===2)assert.deepEqual(model.entries(root,minor).map(e=>e.constraint.order),[0,1,2,3]);
    else assert.equal(refs[0].order,9);
  });
  test(`4.${minor} deletes physics references but retains other constraints and global tracks`, () => {
    const root = fixture(minor);
    root.skins = [{ name: 'default', physics: ['head', 'body'], bones: ['head'], ik: ['ik'] }];
    root.animations = { idle: { physics: { head: { wind: [{ value: 1 }] }, body: { mix: [{ value: 1 }] }, '': { reset: [{}] } }, ik: { ik: [{}] } } };
    model.removePhysics(root, minor, ['head']);
    assert.deepEqual(model.physics(root, minor).map(c => c.name), ['body']);
    assert.deepEqual(root.skins[0].physics, ['body']);
    assert.deepEqual(root.skins[0].bones, ['head']);
    assert.deepEqual(Object.keys(root.animations.idle.physics), ['body', '']);
    assert.deepEqual(root.animations.idle.ik, { ik: [{}] });
    assert.equal(model.entries(root, minor).length, 3);
    if (minor === 2) assert.deepEqual(model.entries(root, minor).map(e => e.constraint.order), [0, 1, 2]);
  });
  test(`4.${minor} copies only parameters, retains identity, unknown data, exact overflow values`, () => {
    const source = { name: 'source', bone: 'a', order: 7, wind: -350, mix: 1.8, scaleY: 'volume', windGlobal: true };
    const target = { name: 'target', bone: 'b', order: 0, skin: true, unknown: { keep: 1 } };
    const values = model.parameters(source, minor);
    model.paste(target, values, minor);
    assert.equal(target.name, 'target');
    assert.equal(target.bone, 'b');
    assert.equal(target.order, 0);
    assert.equal(target.skin, true);
    assert.deepEqual(target.unknown, { keep: 1 });
    assert.equal(target.wind, -350);
    assert.equal(target.mix, 1.8);
    assert.equal(target.windGlobal, true);
    assert.equal(target.inertia, minor === 3 ? 0.5 : 1);
    assert.equal(target.scaleY, minor === 3 ? 'volume' : undefined);
    model.paste(target, { scaleY: 'none' }, minor);
    assert.equal(target.scaleY, undefined);
  });
}