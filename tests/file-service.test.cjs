'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { validateSave, readSelectedFiles, atomicWrite } = require('../src/desktop/file-service.cjs');
const fixtures = path.join(__dirname, 'fixtures');

test('validates JSON and sanitizes suggested filenames', () => {
  assert.deepEqual(validateSave({ suggestedName: '../骨骼.json', text: '{"bones":[]}' }), { name: '骨骼.json', text: '{"bones":[]}' });
  assert.equal(validateSave({ suggestedName: 'a<>:b', text: '{}' }).name, 'a___b.json');
  assert.throws(() => validateSave({ text: 'not JSON' }));
  assert.throws(() => validateSave({ text: null }));
});

test('accepts valid JSON above the former 128 MiB export limit', () => {
  const text = ' '.repeat(129 * 1024 * 1024) + '{"bones":[]}';
  assert.equal(validateSave({ text }).text, text);
});

test('imports selected project files without exposing paths', async () => {
  const result = await readSelectedFiles(['demo-43.json', 'demo.atlas', 'demo.png'].map(n => path.join(fixtures, n)), 'project');
  assert.deepEqual(result.map(f => f.name), ['demo-43.json', 'demo.atlas', 'demo.png']);
  assert(result.every(f => f.bytes instanceof Uint8Array && !('path' in f)));
  assert.equal(JSON.parse(Buffer.from(result[0].bytes).toString()).skeleton.spine, '4.3.13');
});

test('rejects unknown picker kinds and filters unsupported types', async () => {
  await assert.rejects(readSelectedFiles([], 'untrusted'));
  assert.deepEqual(await readSelectedFiles([__filename], 'presets'), []);
});

test('writes and replaces a document atomically without temporary residue', async () => {
  const parent = path.join(process.env.TMPDIR || path.join(__dirname, '../.test-output'), 'spine-packaging-tests');
  await fs.mkdir(parent, { recursive: true });
  const dir = await fs.mkdtemp(path.join(parent, 'atomic-'));
  try {
    const dest = path.join(dir, '骨骼.json');
    await atomicWrite(dest, '{"first":true}');
    await atomicWrite(dest, '{"second":true}');
    assert.deepEqual(JSON.parse(await fs.readFile(dest, 'utf8')), { second: true });
    assert.deepEqual(await fs.readdir(dir), ['骨骼.json']);
    await assert.rejects(atomicWrite(path.join(dir, 'missing/document.json'), '{}'));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});