'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../src/renderer/constraint-model.js');

test('scaleY accepts canonical and legacy preset fields with canonical precedence', () => {
  for (const mode of ['none', 'uniform', 'volume']) {
    assert.equal(model.scaleYMode({ scaleY: mode }), mode);
    assert.equal(model.scaleYMode({ scaleYMode: mode }), mode);
  }
  assert.equal(model.scaleYMode({ scaleY: 'none', scaleYMode: 'volume' }), 'none');
  for (const value of [0, 1, true, '', 'unknown']) assert.equal(model.scaleYMode({ scaleY: value }), 'none');
  assert.equal(model.scaleYMode({}), 'none');
});

test('4.3 modes round-trip in parameters and clipboard without emitting scaleYMode', () => {
  for (const mode of ['uniform', 'volume']) {
    const source = { scaleYMode: mode, windGlobal: true, gravityGlobal: false };
    const values = model.parameters(source, 3);
    assert.equal(values.scaleY, mode);
    assert.equal(Object.hasOwn(values, 'scaleYMode'), false);
    const target = { name: 'target', bone: 'body', unknown: true };
    model.paste(target, values, 3);
    assert.equal(target.scaleY, mode);
    assert.equal(target.windGlobal, true);
    assert.equal(target.gravityGlobal, false);
    assert.equal(target.name, 'target');
    assert.equal(target.unknown, true);
    assert.equal(Object.hasOwn(target, 'scaleYMode'), false);
    model.paste(target, { scaleY: 'none' }, 3);
    assert.equal(Object.hasOwn(target, 'scaleY'), false);
  }
  assert.equal(model.parameters({ scaleY: 'volume' }, 2).scaleY, 'none');
});