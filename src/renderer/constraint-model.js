'use strict';
((host, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else host.constraintModel = api;
})(globalThis, () => {
  const kinds = ['ik', 'transform', 'path', 'physics', 'slider'];
  const numericKeys = ['x', 'y', 'rotate', 'scaleX', 'shearX', 'limit', 'fps', 'inertia', 'strength', 'damping', 'mass', 'wind', 'gravity', 'mix'];
  const globalKeys = ['inertiaGlobal', 'strengthGlobal', 'dampingGlobal', 'massGlobal', 'windGlobal', 'gravityGlobal', 'mixGlobal'];
  const keyOf = (kind, c) => JSON.stringify([kind, c.name]);
  function entries(root, minor) {
    const result = minor >= 3
      ? (root.constraints || []).map(c => ({ kind: c.type, constraint: c, key: keyOf(c.type, c) }))
      : kinds.flatMap(kind => (root[kind] || []).map(c => ({ kind, constraint: c, key: keyOf(kind, c) })));
    // 4.3 ignores order fields; the unified array is the update sequence.
    return minor >= 3 ? result : result.sort((a, b) => (Number(a.constraint.order) || 0) - (Number(b.constraint.order) || 0));
  }
  function physics(root, minor) { return entries(root, minor).filter(e => e.kind === 'physics').map(e => e.constraint); }
  function reorder(root, minor, keys) {
    const all = entries(root, minor), byKey = new Map(all.map(e => [e.key, e]));
    if (keys.length !== all.length || new Set(keys).size !== keys.length || keys.some(k => !byKey.has(k))) throw Error('Invalid constraint permutation');
    const ordered = keys.map(k => byKey.get(k).constraint);
    if (minor >= 3) root.constraints = ordered;
    else ordered.forEach((c, order) => { c.order = order; });
  }
  function normalizeOrder(root, minor) { if (minor < 3) reorder(root, minor, entries(root, minor).map(e => e.key)); }
  function moveRelative(root, minor, key, targetKey, before = true) {
    if (minor !== 2 && minor !== 3) throw Error('Unsupported constraint version');
    const keys = entries(root, minor).map(e => e.key), source = keys.indexOf(key);
    if (source < 0 || !keys.includes(targetKey) || new Set(keys).size !== keys.length) throw Error('Invalid constraint identity');
    if (key === targetKey) return false;
    const next = keys.slice(); next.splice(source, 1);
    next.splice(next.indexOf(targetKey) + (before ? 0 : 1), 0, key);
    if (next.every((value, i) => value === keys[i])) return false;
    reorder(root, minor, next);
    return true;
  }
  // Independent dependency heuristic, not Spine editor Reset parity.
  function automaticOrder(root, minor) {
    const errors = [], fail = () => ({ ok: false, errors, keys: [], changed: false });
    const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
    if (!object(root)) { errors.push('骨架数据不是对象。'); return fail(); }
    if (minor !== 2 && minor !== 3) { errors.push('仅支持 Spine 4.2 / 4.3。'); return fail(); }
    if (!Array.isArray(root.bones)) { errors.push('缺少骨骼数组。'); return fail(); }
    if (minor === 3 ? !Array.isArray(root.constraints) : kinds.some(k => root[k] !== undefined && !Array.isArray(root[k]))) {
      errors.push('约束集合不是数组。'); return fail();
    }
    const raw = minor === 3 ? root.constraints : kinds.flatMap(k => root[k] || []);
    if (raw.some(c => !c || typeof c !== 'object' || typeof c.name !== 'string' || !c.name)) {
      errors.push('约束数据无效或名称为空。'); return fail();
    }
    if (!Array.isArray(root.slots || []) || !Array.isArray(root.skins || [])) { errors.push('插槽或皮肤集合不是数组。'); return fail(); }
    const slotNames = new Set();
    for (const slot of root.slots || []) {
      if (!object(slot) || typeof slot.name !== 'string' || !slot.name || slotNames.has(slot.name)) errors.push('插槽数据无效或名称重复。');
      else slotNames.add(slot.name);
    }
    for (const skin of root.skins || []) {
      if (!object(skin) || (skin.attachments !== undefined && !object(skin.attachments))) { errors.push('皮肤数据无效。'); continue; }
      for (const attachments of Object.values(skin.attachments || {})) {
        if (!object(attachments) || Object.values(attachments).some(a => !object(a))) errors.push('皮肤附件数据无效。');
      }
    }
    const bones = new Map(), ancestors = new Map(), all = entries(root, minor);
    for (const b of root.bones) {
      if (!b || typeof b.name !== 'string' || !b.name || bones.has(b.name)) errors.push('骨骼名称为空或重复。');
      else bones.set(b.name, b);
    }
    for (const name of bones.keys()) {
      const seen = new Set(); let current = name;
      while (current !== undefined && current !== null) {
        if (seen.has(current)) { errors.push(`骨骼层级存在循环：${name}。`); break; }
        if (!bones.has(current)) { errors.push(`缺少父骨骼：${current}。`); break; }
        seen.add(current); current = bones.get(current).parent;
      }
      ancestors.set(name, seen);
    }
    const keys = new Set();
    for (const e of all) {
      if (!e.constraint || typeof e.constraint.name !== 'string' || !e.constraint.name || keys.has(e.key)) errors.push('约束名称为空或同类型重名。');
      keys.add(e.key);
      if (!['ik', 'transform', 'path', 'physics'].includes(e.kind)) errors.push(`暂不支持「${e.constraint.name}」的 ${e.kind || '未知'} 约束自动排序。`);
    }
    if (errors.length) return fail();
    const nodes = all.map(e => ({ ...e, writes: new Set(), reads: new Set() }));
    const slots = new Map((root.slots || []).map(s => [s.name, s]));
    const addRead = (node, name, local = false) => {
      if (!bones.has(name)) { errors.push(`「${node.constraint.name}」引用了缺失骨骼：${name}。`); return; }
      for (const ancestor of local ? [name] : ancestors.get(name)) node.reads.add(ancestor);
    };
    for (const node of nodes) {
      const c = node.constraint, targets = node.kind === 'physics' ? [c.bone] : c.bones;
      if (!Array.isArray(targets) || !targets.length) { errors.push(`「${c.name}」没有受约束骨骼。`); continue; }
      if (node.kind === 'ik' && (targets.length > 2 || new Set(targets).size !== targets.length)) {
        errors.push(`「${c.name}」的 IK 只能约束 1 或 2 根不同骨骼。`); continue;
      }
      for (const name of targets) {
        if (!bones.has(name)) errors.push(`「${c.name}」引用了缺失骨骼：${name}。`);
        else node.writes.add(name);
      }
      // The targets' own pre-constraint pose is not an inter-constraint dependency.
      for (const name of node.writes) for (const ancestor of ancestors.get(name)) {
        if (!node.writes.has(ancestor)) node.reads.add(ancestor);
      }
      if (node.kind === 'ik') addRead(node, c.target);
      if (node.kind === 'transform') addRead(node, minor === 3 ? c.source : c.target, !!(minor === 3 ? c.localSource : c.local));
      if (node.kind === 'path') {
        const slotName = minor === 3 ? c.slot : c.target, slot = slots.get(slotName);
        if (!slot) { errors.push(`「${c.name}」引用了缺失插槽：${slotName}。`); continue; }
        if (!bones.has(slot.bone)) { errors.push(`「${c.name}」引用了缺失骨骼：${slot.bone}。`); continue; }
        let foundPath = false;
        for (const skin of root.skins || []) for (const attachment of Object.values(skin.attachments?.[slotName] || {})) {
          if (attachment.type !== 'path') continue;
          foundPath = true;
          const vertices = attachment.vertices, count = attachment.vertexCount;
          if (!Number.isInteger(count) || count < 1 || !Array.isArray(vertices) || vertices.some(v => !Number.isFinite(v))) {
            errors.push(`「${c.name}」的路径顶点数据无效。`); continue;
          }
          if (vertices.length === count * 2) { addRead(node, slot.bone); continue; }
          let offset = 0, valid = true;
          for (let v = 0; v < count; v++) {
            const weights = vertices[offset++];
            if (!Number.isInteger(weights) || weights < 1 || offset + weights * 4 > vertices.length) { valid = false; break; }
            for (let w = 0; w < weights; w++, offset += 4) {
              const index = vertices[offset];
              if (!Number.isInteger(index) || index < 0 || index >= root.bones.length) { valid = false; break; }
              addRead(node, root.bones[index].name);
            }
            if (!valid) break;
          }
          if (!valid || offset !== vertices.length) errors.push(`「${c.name}」的路径权重数据无效。`);
        }
        if (!foundPath) addRead(node, slot.bone);
      }
    }
    if (errors.length) return fail();
    const edges = nodes.map(() => new Set()), writers = new Map();
    nodes.forEach((node, i) => { for (const name of node.writes) { if (!writers.has(name)) writers.set(name, []); writers.get(name).push(i); } });
    nodes.forEach((node, i) => {
      for (const name of node.reads) for (const producer of writers.get(name) || []) if (producer !== i) edges[producer].add(i);
    });
    for (const group of writers.values()) for (const i of group) for (const j of group) {
      if (nodes[i].kind !== 'physics' && nodes[j].kind === 'physics') edges[i].add(j);
    }
    function reaches(start, end) {
      const stack = [start], visited = new Set();
      while (stack.length) {
        const i = stack.pop(); if (i === end) return true;
        if (visited.has(i)) continue;
        visited.add(i); for (const next of edges[i]) stack.push(next);
      }
      return false;
    }
    // Preserve overlapping writers unless a real dependency requires the opposite.
    for (const group of writers.values()) for (let a = 0; a < group.length; a++) for (let b = a + 1; b < group.length; b++) {
      const i = group[a], j = group[b];
      if ((nodes[i].kind === 'physics') !== (nodes[j].kind === 'physics')) continue;
      if (!reaches(j, i)) edges[i].add(j);
    }
    const indegree = nodes.map(() => 0), ordered = [], ready = [];
    for (const targets of edges) for (const i of targets) indegree[i]++;
    indegree.forEach((n, i) => { if (!n) ready.push(i); });
    while (ready.length) {
      const i = ready.shift(); ordered.push(i);
      for (const next of edges[i]) if (--indegree[next] === 0) {
        let low = 0, high = ready.length;
        while (low < high) { const middle = (low + high) >>> 1; if (ready[middle] < next) low = middle + 1; else high = middle; }
        ready.splice(low, 0, next);
      }
    }
    if (ordered.length !== nodes.length) {
      // Report an actual cycle, not downstream constraints merely blocked by it.
      const color = nodes.map(() => 0);
      for (let start = 0; start < nodes.length; start++) {
        if (!indegree[start] || color[start]) continue;
        const stack = [{ i: start, next: [...edges[start]], pos: 0 }]; color[start] = 1;
        while (stack.length) {
          const frame = stack[stack.length - 1];
          if (frame.pos === frame.next.length) { color[frame.i] = 2; stack.pop(); continue; }
          const next = frame.next[frame.pos++];
          if (color[next] === 1) {
            const cycle = stack.slice(stack.findIndex(f => f.i === next)).map(f => nodes[f.i].constraint.name);
            errors.push(`循环依赖：${[...cycle, nodes[next].constraint.name].join(' → ')}。原顺序未改动。`); return fail();
          }
          if (!color[next]) { color[next] = 1; stack.push({ i: next, next: [...edges[next]], pos: 0 }); }
        }
      }
    }
    const result = ordered.map(i => nodes[i].key);
    return { ok: true, errors: [], keys: result, changed: result.some((key, i) => key !== all[i].key), dependencies: edges.reduce((n, e) => n + e.size, 0) };
  }
  function autoSort(root, minor) {
    const result = automaticOrder(root, minor);
    if (result.ok) reorder(root, minor, result.keys);
    return result;
  }
  function defaults(minor) {
    return { x: 0, y: 0, rotate: 0, scaleX: 0, shearX: 0, limit: 5000, fps: 60, inertia: minor >= 3 ? 0.5 : 1, strength: 100, damping: minor >= 3 ? 0.85 : 1, mass: 1, wind: 0, gravity: 0, mix: 1 };
  }
  // Spine displays damping loss; JSON stores the velocity retained.
  function toDisplay(key, value, scale = 1) { return (key === 'damping' ? 1 - value : value) * scale; }
  function fromDisplay(key, value, scale = 1) {
    const fraction = value / scale;
    return key === 'damping' ? Number((1 - fraction).toPrecision(12)) : fraction;
  }
  function scaleYMode(values = {}) {
    const mode = values.scaleY ?? values.scaleYMode ?? 'none';
    return mode === 'uniform' || mode === 'volume' ? mode : 'none';
  }
  function parameters(c, minor) {
    const base = defaults(minor), values = {};
    numericKeys.forEach(k => { values[k] = c[k] ?? base[k]; });
    globalKeys.forEach(k => { values[k] = c[k] ?? false; });
    values.scaleY = minor >= 3 ? scaleYMode(c) : 'none';
    return values;
  }
  function paste(c, values, minor) {
    numericKeys.forEach(k => { if (Object.hasOwn(values, k)) c[k] = values[k]; });
    globalKeys.forEach(k => { if (Object.hasOwn(values, k)) c[k] = !!values[k]; });
    if (minor >= 3) {
      const mode = scaleYMode(values);
      if (mode === 'none') delete c.scaleY;
      else if (mode === 'uniform' || mode === 'volume') c.scaleY = mode;
    }
  }
  function removePhysics(root, minor, names) {
    const removed = new Set(names);
    if (minor >= 3) root.constraints = (root.constraints || []).filter(c => c.type !== 'physics' || !removed.has(c.name));
    else root.physics = (root.physics || []).filter(c => !removed.has(c.name));
    for (const skin of root.skins || []) {
      if (Array.isArray(skin.physics)) skin.physics = skin.physics.filter(n => !removed.has(n));
    }
    for (const animation of Object.values(root.animations || {})) {
      if (!animation.physics || typeof animation.physics !== 'object') continue;
      for (const name of removed) delete animation.physics[name];
    }
    normalizeOrder(root, minor);
  }
  return { entries, physics, reorder, normalizeOrder, moveRelative, automaticOrder, autoSort, defaults, toDisplay, fromDisplay, scaleYMode, parameters, paste, removePhysics };
});