'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { ProjectFiles } = require('../src/desktop/project-files.cjs');

async function fixture(t) {
  const parent = path.join(process.env.TMPDIR || path.join(__dirname, '../.test-output'), 'project-save-tests');
  await fs.mkdir(parent, { recursive: true });
  const dir = await fs.mkdtemp(path.join(parent, 'save-'));
  const file = path.join(dir, 'original.json'), bytes = Buffer.from('{ "original": true }\r\n');
  await fs.writeFile(file, bytes);
  t.after(async () => { await fs.chmod(file, 0o666).catch(() => {}); await fs.rm(dir, { recursive: true, force: true }); });
  const service = new ProjectFiles(), picked = await service.read([file], 'project');
  return { service, file, dir, bytes, id: picked[0].source.id };
}

test('binds only project JSON and does not write on import', async t => {
  const { service, file, dir, bytes, id } = await fixture(t);
  assert.equal(typeof id, 'string');
  assert.deepEqual(await fs.readFile(file), bytes);
  assert.deepEqual(await fs.readdir(dir), ['original.json']);
  assert.equal((await service.read([file], 'presets'))[0].source, undefined);
  await assert.rejects(service.save({ id: file, text: '{}' }), /未绑定/);
  await assert.rejects(service.save({ id, text: 'broken' }));
  assert.deepEqual(await fs.readFile(file), bytes);
});

test('backs up original bytes once and serializes rapid saves with disk verification', async t => {
  const { service, file, dir, bytes, id } = await fixture(t);
  const requests = [1, 2, 3].map(value => service.save({ id, text: JSON.stringify({ value, unknown: { keep: true } }), path: path.join(dir, 'unauthorized.json') }));
  const results = await Promise.all(requests);
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { value: 3, unknown: { keep: true } });
  assert.deepEqual(await fs.readFile(results[0].backup), bytes);
  assert(results.every(result => result.backup === results[0].backup));
  assert.deepEqual((await fs.readdir(dir)).sort(), ['original.json', 'original.json.spine-physics-backup.bak']);
});

test('retains the open source across more than eight unaccepted imports without growing the capability cache', async t => {
  const { service, file, dir, bytes, id } = await fixture(t);
  const rejected = path.join(dir, 'rejected.json');
  await fs.writeFile(rejected, '{"skeleton":{"spine":"99.0"}}');
  for (let index = 0; index < 24; index++) {
    await service.read([rejected], 'project', id);
    assert(service.files.has(id));
    assert(service.files.size <= 8);
  }
  await service.save({ id, text: '{"stillBound":true}' });
  assert.equal(await fs.readFile(file, 'utf8'), '{"stillBound":true}');
  assert.deepEqual(await fs.readFile(file + '.spine-physics-backup.bak'), bytes);
  assert.equal(await fs.readFile(rejected, 'utf8'), '{"skeleton":{"spine":"99.0"}}');
  const count = service.files.size;
  await assert.rejects(service.read([rejected], 'project', file), /未绑定/);
  await assert.rejects(service.read([rejected], 'project', {}), /未绑定/);
  assert.equal(service.files.size, count);
});

test('queued saves retain their capability while unrelated imports churn the cache', async t => {
  const { service, file, id } = await fixture(t);
  let release, started;
  const gate = new Promise(resolve => release = resolve), ready = new Promise(resolve => started = resolve);
  const write = service.write;
  service.write = async function(...args) { started();await gate;return write.apply(this, args); };
  const task = service.save({ id, text: '{"pending":1}' });
  t.after(() => release());
  await ready;
  for (let index = 0; index < 16; index++) await service.read([file], 'project');
  assert(service.files.has(id));
  const latest = service.save({ id, text: '{"pending":2}' });
  release();await Promise.all([task, latest]);
  assert.equal(await fs.readFile(file, 'utf8'), '{"pending":2}');
  assert.equal(service.files.get(id).pending, 0);
});

test('never overwrites an existing backup', async t => {
  const { service, file, id, bytes } = await fixture(t);
  await fs.writeFile(file + '.spine-physics-backup.bak', 'prior backup');
  const result = await service.save({ id, text: '{}' });
  assert.equal(await fs.readFile(file + '.spine-physics-backup.bak', 'utf8'), 'prior backup');
  assert.deepEqual(await fs.readFile(result.backup), bytes);
  assert.equal(result.backup, file + '.spine-physics-backup-1.bak');
});

test('rejects external changes and missing files instead of overwriting or recreating them', async t => {
  const { service, file, id } = await fixture(t);
  await fs.writeFile(file, '{"external":true}');
  await assert.rejects(service.save({ id, text: '{}' }), /其他程序修改/);
  assert.equal(await fs.readFile(file, 'utf8'), '{"external":true}');
  await fs.unlink(file);
  await assert.rejects(service.save({ id, text: '{}' }), /ENOENT/);
  await assert.rejects(fs.stat(file), /ENOENT/);
});

test('rejects readonly documents and can retry after restoring write access', async t => {
  const { service, file, id, bytes } = await fixture(t);
  await fs.chmod(file, 0o444);
  await assert.rejects(service.save({ id, text: '{"retry":true}' }), /只读/);
  assert.deepEqual(await fs.readFile(file), bytes);
  await fs.chmod(file, 0o666);
  await service.save({ id, text: '{"retry":true}' });
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { retry: true });
});

test('failed backup and mid-save source changes leave the original untouched and clean temp files', async t => {
  const { service, file, dir, id, bytes } = await fixture(t);
  const backup = service.backup;
  service.backup = async () => { throw Error('backup failure'); };
  await assert.rejects(service.save({ id, text: '{}' }), /backup failure/);
  assert.deepEqual(await fs.readFile(file), bytes);
  service.backup = async (...args) => { await backup.apply(service, args); await fs.writeFile(file, '{"external":2}'); };
  await assert.rejects(service.save({ id, text: '{}' }), /保存期间变化/);
  assert.equal(await fs.readFile(file, 'utf8'), '{"external":2}');
  assert(!(await fs.readdir(dir)).some(name => name.endsWith('.tmp')));
});