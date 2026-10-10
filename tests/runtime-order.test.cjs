'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const model = require('../src/renderer/constraint-model.js');
for (const minor of [2, 3]) {
  const context = vm.createContext({ console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, `../src/renderer/spine-runtime/spine-webgl-4.${minor}.min.js`), 'utf8'), context);
  const sp = context.spine;
  function skeleton(root, loader = null) {
    const sk = new sp.Skeleton(new sp.SkeletonJson(loader).readSkeletonData(root));
    (sk.setupPose || sk.setToSetupPose).call(sk);
    sk.updateWorldTransform(sp.Physics.pose);
    return sk;
  }
  const worldX = (sk, name) => { const b = sk.bones.find(b => b.data.name === name); return (b.appliedPose || b).worldX; };
  test(`4.${minor} official runtime local-source sorting removes a false cycle and produces the expected pose`, () => {
    const root = { skeleton: { spine: `4.${minor}.0` }, bones: [{ name: 'root' }, { name: 's', parent: 'root', x: 10 }, { name: 'b', parent: 's', x: 7 }, { name: 'a', parent: 'root' }], slots: [], skins: [] };
    if (minor === 2) root.transform = [
      { name: 'world_s', bones: ['s'], target: 'a', order: 0, mixRotate: 0, mixX: 1, mixY: 0, mixScaleX: 0, mixScaleY: 0, mixShearY: 0 },
      { name: 'local_a', bones: ['a'], target: 'b', order: 1, local: true, mixRotate: 0, mixX: 1, mixY: 0, mixScaleX: 0, mixScaleY: 0, mixShearY: 0 }
    ];
    else root.constraints = [
      { type: 'transform', name: 'world_s', bones: ['s'], source: 'a', properties: { x: { to: { x: {} } } } },
      { type: 'transform', name: 'local_a', bones: ['a'], source: 'b', localSource: true, localTarget: true, properties: { x: { to: { x: {} } } } }
    ];
    const result = model.autoSort(root, minor);
    assert.equal(result.ok, true, result.errors.join('\n'));
    assert.deepEqual(model.entries(root, minor).map(e => e.constraint.name), ['local_a', 'world_s']);
    const sk = skeleton(root);
    assert.equal(worldX(sk, 'a'), 7);
    assert.equal(worldX(sk, 's'), 7);
  });
  test(`4.${minor} official runtime weighted path sorting reads weights rather than its slot bone`, () => {
    const root = { skeleton: { spine: `4.${minor}.0` }, bones: [{ name: 'root' }, { name: 'a', parent: 'root', length: 5 }, { name: 'b', parent: 'root', x: 90, y: 20 }], slots: [{ name: 'slot', bone: 'b', attachment: 'curve' }], skins: [{ name: 'default', attachments: { slot: { curve: { type: 'path', vertexCount: 6, vertices: Array.from({ length: 6 }, (_, i) => [1, 0, i * 10, 0, 1]).flat(), lengths: [30, 60], closed: false, constantSpeed: true } } } }] };
    const curve = { name: 'path_a', bones: ['a'], target: 'slot', slot: 'slot', positionMode: 'fixed', spacingMode: 'fixed', rotateMode: 'chain', mixRotate: 0, mixX: 1, mixY: 1, order: 1 };
    const follow = { name: 'follow_a', bones: ['b'], target: 'a', source: 'a', mixRotate: 0, mixX: 1, mixY: 1, mixScaleX: 0, mixScaleY: 0, mixShearY: 0, properties: { x: { to: { x: {} } }, y: { to: { y: {} } } }, order: 0 };
    if (minor === 2) { root.path = [curve]; root.transform = [follow]; }
    else root.constraints = [{ ...follow, type: 'transform' }, { ...curve, type: 'path' }];
    const result = model.autoSort(root, minor);
    assert.equal(result.ok, true, result.errors.join('\n'));
    assert.deepEqual(model.entries(root, minor).map(e => e.constraint.name), ['path_a', 'follow_a']);
    const sk = skeleton(root, { newPathAttachment: (skin, name) => new sp.PathAttachment(name) });
    assert.equal(worldX(sk, 'a'), 10);
    assert.equal(worldX(sk, 'b'), 10);
    const slot = sk.slots[0], attachment = minor === 2 ? slot.attachment : slot.appliedPose.attachment;
    const vertices = new Float32Array(12);
    if (minor === 2) attachment.computeWorldVertices(slot, 0, 12, vertices, 0, 2);
    else attachment.computeWorldVertices(sk, slot, 0, 12, vertices, 0, 2);
    assert.deepEqual(Array.from(vertices), [0, 0, 10, 0, 20, 0, 30, 0, 40, 0, 50, 0]);
  });
}