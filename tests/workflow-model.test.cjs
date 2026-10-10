'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHistory, createSelectionCycle, visibleBoneRows } = require('../src/renderer/workflow-model.js');
const bones = [{ name: 'root' }, { name: 'body', parent: 'root' }, { name: 'hair', parent: 'body' }, { name: 'tip', parent: 'hair' }, { name: 'ribbon', parent: 'body' }, { name: 'end', parent: 'ribbon' }, { name: 'leg', parent: 'root' }];
test('collapsed bone tree hides descendants rather than flattening them; expansion retains hierarchy order and depth', () => {
  const summary = open => visibleBoneRows(bones, new Set(open)).map(({ bone, depth }) => [bone.name, depth]);
  assert.deepEqual(summary([]), [['root', 0]]);
  assert.deepEqual(summary(['root']), [['root', 0], ['body', 1], ['leg', 1]]);
  assert.deepEqual(summary(['root', 'body', 'hair', 'ribbon']), [['root', 0], ['body', 1], ['hair', 2], ['tip', 3], ['ribbon', 2], ['end', 3], ['leg', 1]]);
  assert.deepEqual(summary(['root', 'body', 'ribbon']), [['root', 0], ['body', 1], ['hair', 2], ['ribbon', 2], ['end', 3], ['leg', 1]]);
  assert.deepEqual(summary(['root', 'hair', 'ribbon']), [['root', 0], ['body', 1], ['leg', 1]], 'open descendants remain hidden beneath a closed ancestor');
});
test('visible rows handle multiple roots and exact names without mutating data or exposing disconnected branches', () => {
  const tree = [...bones, { name: '<second>' }, { name: '子骨骼', parent: '<second>' }, { name: 'orphan', parent: 'missing' }, { name: 'cycle-a', parent: 'cycle-b' }, { name: 'cycle-b', parent: 'cycle-a' }];
  const open = new Set(['<second>', 'cycle-a', 'cycle-b']);
  const before = JSON.stringify(tree);
  assert.deepEqual(visibleBoneRows(tree, open).map(({ bone, depth }) => [bone.name, depth]), [['root', 0], ['<second>', 0], ['子骨骼', 1]]);
  assert.equal(JSON.stringify(tree), before);
  assert.deepEqual([...open], ['<second>', 'cycle-a', 'cycle-b']);
  assert.deepEqual(visibleBoneRows([], open), []);
});
const chainBones = [
  { name: 'root' }, { name: 'body', parent: 'root' }, { name: 'head', parent: 'body' },
  { name: 'hair_top', parent: 'body' }, { name: 'hair_upper', parent: 'hair_top' },
  { name: 'hair_mid', parent: 'hair_upper' }, { name: 'hair_low', parent: 'hair_mid' }, { name: 'hair_tip', parent: 'hair_low' },
  { name: 'ribbon', parent: 'body' }, { name: 'ribbon_mid', parent: 'ribbon' }, { name: 'ribbon_tip', parent: 'ribbon_mid' },
  { name: 'leg', parent: 'root' }
];
test('middle selection expands down, completes its chain upwards, selects peer chains, then all and cycles', () => {
  const cycle = createSelectionCycle(), original = JSON.stringify(chainBones);
  let result = cycle.next(chainBones, ['hair_mid'], 'hair_mid');
  assert.deepEqual(result, { names: ['hair_mid', 'hair_low', 'hair_tip'], anchor: 'hair_mid', stage: 1 });
  result = cycle.next(chainBones, result.names, result.anchor);
  assert.deepEqual(result, { names: ['hair_top', 'hair_upper', 'hair_mid', 'hair_low', 'hair_tip'], anchor: 'hair_mid', stage: 2 });
  result = cycle.next(chainBones, result.names, result.anchor);
  assert.deepEqual(result.names, ['head', 'hair_top', 'hair_upper', 'hair_mid', 'hair_low', 'hair_tip', 'ribbon', 'ribbon_mid', 'ribbon_tip']);
  assert.equal(result.stage, 3);
  result = cycle.next(chainBones, result.names, result.anchor);
  assert.deepEqual(result.names, chainBones.map(bone => bone.name));
  assert.equal(result.stage, 4);
  result = cycle.next(chainBones, result.names, result.anchor);
  assert.deepEqual(result, { names: ['hair_mid', 'hair_low', 'hair_tip'], anchor: 'hair_mid', stage: 1 });
  assert.equal(JSON.stringify(chainBones), original);
});
test('chain head skips only redundant completion and keeps its existing three-press behavior', () => {
  const cycle = createSelectionCycle();
  let result = cycle.next(bones, ['hair'], 'hair');
  assert.deepEqual(result, { names: ['hair', 'tip'], anchor: 'hair', stage: 1 });
  result = cycle.next(bones, result.names, result.anchor);
  assert.deepEqual(result.names, ['hair', 'tip', 'ribbon', 'end']);
  assert.equal(result.stage, 3);
  result = cycle.next(bones, result.names, result.anchor);
  assert.deepEqual(result.names, bones.map(bone => bone.name));
  assert.equal(result.stage, 4);
  result = cycle.next(bones, result.names, result.anchor);
  assert.deepEqual(result.names, ['hair', 'tip']);
});
test('multiple middle seeds complete each chain but never include their branching attachment or unrelated branches', () => {
  const cycle = createSelectionCycle();
  let result = cycle.next(chainBones, ['hair_mid', 'ribbon_mid'], 'ribbon_mid');
  assert.deepEqual(result.names, ['hair_mid', 'hair_low', 'hair_tip', 'ribbon_mid', 'ribbon_tip']);
  result = cycle.next(chainBones, result.names, result.anchor);
  assert.deepEqual(result.names, ['hair_top', 'hair_upper', 'hair_mid', 'hair_low', 'hair_tip', 'ribbon', 'ribbon_mid', 'ribbon_tip']);
  assert.equal(result.anchor, 'ribbon_mid');
  assert.equal(result.stage, 2);
  assert.equal(result.names.includes('body'), false);
  cycle.reset();
  result = cycle.next(chainBones, ['hair_top', 'hair_mid'], 'hair_mid');
  assert.equal(cycle.next(chainBones, result.names, result.anchor).stage, 3, 'nested seeds already cover the whole chain');
});
test('chain completion stops below a skeleton root, works without topological ordering and preserves names', () => {
  const tree = [{ name: '末端', parent: '<mid>' }, { name: 'root' }, { name: '<top>', parent: 'root' }, { name: '<mid>', parent: '<top>' }];
  const cycle = createSelectionCycle();
  let result = cycle.next(tree, ['<mid>'], '<mid>');
  result = cycle.next(tree, result.names, result.anchor);
  assert.deepEqual(result.names, ['末端', '<top>', '<mid>']);
  assert.equal(result.stage, 2);
  assert.equal(result.names.includes('root'), false, 'a root with one child is still an attachment boundary');
  result = cycle.next(tree, result.names, result.anchor);
  assert.equal(result.stage, 3);
  assert.deepEqual(result.names, ['末端', '<top>', '<mid>']);
});
test('deep chain completion is iterative and terminates with missing-parent and cyclic input', () => {
  const tree = [{ name: 'root' }, ...Array.from({ length: 6000 }, (_, i) => ({ name: `b${i}`, parent: i ? `b${i - 1}` : 'root' }))];
  const cycle = createSelectionCycle();
  let result = cycle.next(tree, ['b5998'], 'b5998');
  assert.deepEqual(result.names, ['b5998', 'b5999']);
  result = cycle.next(tree, result.names, result.anchor);
  assert.equal(result.names.length, 6000);
  assert.equal(result.names[0], 'b0');
  assert.equal(result.names.includes('root'), false);
  cycle.reset();
  const malformed = [{ name: 'a', parent: 'b' }, { name: 'b', parent: 'a' }, { name: 'orphan', parent: 'missing' }];
  result = cycle.next(malformed, ['a', 'orphan'], 'a');
  for (let i = 0; i < 5; i++) result = cycle.next(malformed, result.names, result.anchor);
  assert(result.names.every(name => malformed.some(bone => bone.name === name)));
});
test('selection cycle resets, supports multiple branches, roots, no selection and ignores stale anchors', () => {
  const cycle = createSelectionCycle();
  assert.deepEqual(cycle.next(bones, ['hair', 'leg'], 'root').names, ['hair', 'tip', 'leg']);
  cycle.reset();
  assert.deepEqual(cycle.next(bones, ['ribbon'], 'ribbon').names, ['ribbon', 'end']);
  cycle.reset();
  assert.equal(cycle.next(bones, [], 'hair').stage, 4);
  cycle.reset();
  assert.deepEqual(cycle.next(bones, ['root'], 'root').names, bones.map(bone => bone.name));
  cycle.reset();
  assert.deepEqual(cycle.next([], [], null).names, []);
});
test('selection traversal terminates on cycles and preserves exact names and file order', () => {
  const cycle = createSelectionCycle();
  assert.deepEqual(cycle.next([{ name: '<a>', parent: 'b' }, { name: 'b', parent: '<a>' }], ['b'], 'b').names, ['<a>', 'b']);
});
test('history skips no-ops, accepts only successful restores, and clears redo after a new edit', () => {
  const history = createHistory();
  assert.equal(history.record('a', 'a', 'none'), false);
  history.record('a', 'b', 'first', { names: ['hair'] });
  history.record('b', 'c', 'second');
  const undo = history.peek('undo');
  assert.equal(undo.text, 'b');
  assert.equal(history.state().undo, 2, 'peek on a rejected runtime restore must not advance');
  history.accept('undo', undo.entry);
  assert.equal(history.peek('redo').text, 'c');
  history.record('b', 'd', 'branch');
  assert.equal(history.peek('redo'), null);
  assert.throws(() => history.accept('undo', undo.entry), /History changed/);
  history.clear();
  assert.deepEqual(history.state(), { undo: 0, redo: 0, undoLabel: '', redoLabel: '' });
});
test('history bounds snapshot memory and retains one oversized edit; context is independent', () => {
  const history = createHistory({ limit: 2, maxBytes: 100 });
  const context = { names: ['hair'] };
  history.record('a', 'b', 'first', context);
  context.names.push('leg');
  assert.deepEqual(history.peek('undo').entry.context.names, ['hair']);
  history.record('b', 'c', 'second');
  history.record('c', 'd', 'third');
  assert.equal(history.state().undo, 2);
  history.record('d', 'x'.repeat(100), 'large');
  assert.equal(history.state().undo, 1);
  assert.equal(history.peek('undo').text, 'd');
});