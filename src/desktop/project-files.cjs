'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { readSelectedFiles, validateSave } = require('./file-service.cjs');
const { discoverCompanions } = require('./companion-files.cjs');
const { convertBinary } = require('./binary-import.cjs');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

class ProjectFiles {
  constructor() { this.files = new Map(); }

  async read(paths, kind, retainedId) {
    if (kind === 'project' && retainedId != null && (typeof retainedId !== 'string' || !this.files.has(retainedId))) {
      throw Error('原文件未绑定，请重新导入 JSON。');
    }
    if(kind==='project') {
      paths=await discoverCompanions(paths);
      const binaries=paths.filter(file=>/\.skel(?:\.bytes)?$/i.test(file));
      const jsons=paths.filter(file=>/\.json$/i.test(file));
      if(jsons.length>1||binaries.length>1)throw Error('请一次选择一个骨架及其配套资源。');
      if(!jsons.length&&binaries.length)paths=paths.map(file=>file===binaries[0]?null:file).filter(Boolean).concat(await convertBinary(binaries[0]));
    }
    const result = await readSelectedFiles(paths, kind);
    if (kind !== 'project') return result;
    const selected = paths.filter(file => /\.(json|atlas|atlas\.txt|png|jpe?g|webp)$/i.test(file));
    const index = result.findIndex(file => /\.json$/i.test(file.name));
    if (index < 0) return result;
    const chosen = selected[index];
    const info = await fs.lstat(chosen);
    if (!info.isFile() || info.isSymbolicLink()) throw Error('原 JSON 必须是普通文件，不能是符号链接。');
    const file = await fs.realpath(chosen);
    const current = await this.snapshot(file);
    if (current.hash !== hash(result[index].bytes)) throw Error('JSON 在读取期间发生变化，请重新导入。');
    const id = crypto.randomUUID();
    delete current.bytes;
    const entry = { file, revision: current, backup: null, queue: Promise.resolve(), pending: 0 };
    this.files.set(id, entry);
    // Failed or canceled imports must not evict the still-open project or queued saves.
    while (this.files.size > 8) {
      const disposable = [...this.files].find(([key, value]) => key !== retainedId && key !== id && !value.pending);
      if (!disposable) break;
      this.files.delete(disposable[0]);
    }
    result[index].source = { id, name: result[index].name, path: file };
    return result;
  }

  async snapshot(file) {
    const info = await fs.lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) throw Error('原 JSON 已被替换，停止自动覆盖。');
    const bytes = await fs.readFile(file);
    return { bytes, hash: hash(bytes), dev: info.dev, ino: info.ino, mode: info.mode };
  }

  same(a, b) { return a.hash === b.hash && a.dev === b.dev && a.ino === b.ino; }

  async backup(entry, bytes) {
    if (entry.backup) return;
    const base = entry.file + '.spine-physics-backup';
    for (let index = 0; ; index++) {
      const file = base + (index ? '-' + index : '') + '.bak';
      try {
        await fs.writeFile(file, bytes, { flag: 'wx' });
        entry.backup = file;
        return;
      } catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
  }

  save(payload) {
    if (!payload || typeof payload.id !== 'string' || !this.files.has(payload.id)) {
      return Promise.reject(Error('原文件未绑定，请重新导入 JSON。'));
    }
    const entry = this.files.get(payload.id);
    let text;
    try { ({ text } = validateSave(payload)); }
    catch (error) { return Promise.reject(error); }
    entry.pending++;
    const task = entry.queue.then(() => this.write(entry, text)).finally(() => entry.pending--);
    entry.queue = task.catch(() => {});
    return task;
  }

  async write(entry, text) {
    const directory = path.dirname(entry.file);
    if (await fs.realpath(directory) !== directory) throw Error('原 JSON 所在目录已变化，停止自动覆盖。');
    const current = await this.snapshot(entry.file);
    if (!this.same(current, entry.revision)) throw Error('原 JSON 已被其他程序修改，请重新导入或另存为。');
    if (!(current.mode & 0o222)) throw Error('原 JSON 为只读文件，修改尚未保存。');
    await fs.access(entry.file, require('node:fs').constants.W_OK);
    if (current.hash === hash(text)) return { path: entry.file, backup: entry.backup };
    await this.backup(entry, current.bytes);
    const temporary = path.join(directory, `.${path.basename(entry.file)}.${crypto.randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporary, text, { encoding: 'utf8', flag: 'wx', mode: current.mode & 0o777 });
      // Recheck immediately before replacement; never recreate a deleted source.
      const latest = await this.snapshot(entry.file);
      if (!this.same(latest, entry.revision) || !(latest.mode & 0o222)) throw Error('原 JSON 在保存期间变化，停止自动覆盖。');
      await fs.rename(temporary, entry.file);
      const saved = await this.snapshot(entry.file);
      if (saved.hash !== hash(text)) throw Error('写入后的 JSON 校验失败，修改尚未确认保存。');
      entry.revision = saved;
      // Only the fingerprint is needed between writes.
      delete entry.revision.bytes;
      return { path: entry.file, backup: entry.backup };
    } finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
  }
}

module.exports = { ProjectFiles };
