'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../src/renderer/constraint-model.js');

test('damping displays velocity loss, not the retained velocity stored in JSON', () => {
  for (const [display, json] of [[0, 1], [12, 0.88], [88, 0.12], [100, 0]]) {
    assert.equal(model.fromDisplay('damping', display, 100), json);
    assert(Math.abs(model.toDisplay('damping', json, 100) - display) < 1e-10);
  }
});

test('damping conversion leaves raw presets and other parameter mappings unchanged', () => {
  for (const minor of [2, 3]) {
    const source = { damping: 0.88, dampingGlobal: true, name: 'original', bone: 'head' };
    const values = model.parameters(source, minor);
    assert.equal(values.damping, 0.88);
    const target = { name: 'target', bone: 'body' };
    model.paste(target, values, minor);
    assert.equal(target.damping, 0.88);
    assert.equal(target.dampingGlobal, true);
    assert.equal(source.damping, 0.88);
    assert.equal(model.fromDisplay('damping', model.toDisplay('damping', model.defaults(minor).damping, 100), 100), model.defaults(minor).damping);
  }
  for (const key of ['inertia', 'mass', 'mix', 'rotate']) {
    assert.equal(model.toDisplay(key, 0.12, 100), 12);
    assert.equal(model.fromDisplay(key, 12, 100), 0.12);
  }
  assert.equal(model.fromDisplay('wind', -250), -250);
});