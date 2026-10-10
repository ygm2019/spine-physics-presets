'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.workflowModel = api;
})(typeof window === 'object' ? window : globalThis, () => {
  function createHistory({ limit = 80, maxBytes = 32 * 1024 * 1024 } = {}) {
    let entries = [], cursor = 0;
    const cost = entry => (entry.before.length + entry.after.length) * 2;
    return {
      clear() { entries = []; cursor = 0; },
      record(before, after, label, context) {
        if (before === after) return false;
        entries.splice(cursor);
        entries.push({ before, after, label, context: structuredClone(context) });
        let bytes = entries.reduce((sum, entry) => sum + cost(entry), 0);
        while (entries.length > 1 && (entries.length > limit || bytes > maxBytes)) bytes -= cost(entries.shift());
        cursor = entries.length;
        return true;
      },
      peek(direction) {
        const entry = direction === 'undo' ? entries[cursor - 1] : entries[cursor];
        return entry ? { entry, text: direction === 'undo' ? entry.before : entry.after } : null;
      },
      accept(direction, entry) {
        if (this.peek(direction)?.entry !== entry) throw Error('History changed during restore');
        cursor += direction === 'undo' ? -1 : 1;
      },
      state() { return { undo: cursor, redo: entries.length - cursor, undoLabel: entries[cursor - 1]?.label || '', redoLabel: entries[cursor]?.label || '' }; }
    };
  }
  function visibleBoneRows(bones, open) {
    const children = new Map();
    for (const bone of bones) {
      const parent = bone.parent || null;
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(bone);
    }
    const rows = [], visited = new Set();
    const pending = (children.get(null) || []).map(bone => ({ bone, depth: 0 })).reverse();
    while (pending.length) {
      const row = pending.pop();
      if (visited.has(row.bone.name)) continue;
      visited.add(row.bone.name);
      rows.push(row);
      if (open.has(row.bone.name)) {
        const next = children.get(row.bone.name) || [];
        for (let index = next.length - 1; index >= 0; index--) pending.push({ bone: next[index], depth: row.depth + 1 });
      }
    }
    return rows;
  }
  function createSelectionCycle() {
    let seeds = [], stage = 0;
    return {
      reset() { seeds = []; stage = 0; },
      next(bones, selected, anchor) {
        const byName = new Map(bones.map(bone => [bone.name, bone]));
        if (!stage) seeds = [...new Set(selected)].filter(name => byName.has(name));
        if (!seeds.length && selected.includes(anchor) && byName.has(anchor)) seeds = [anchor];
        const children = new Map();
        for (const bone of bones) {
          const parent = bone.parent || null;
          if (!children.has(parent)) children.set(parent, []);
          children.get(parent).push(bone.name);
        }
        const descendants = roots => {
          const chosen = new Set(roots), pending = [...chosen];
          while (pending.length) {
            for (const name of children.get(pending.pop()) || []) {
              if (!chosen.has(name)) { chosen.add(name); pending.push(name); }
            }
          }
          return chosen;
        };
        stage = seeds.length ? stage % 4 + 1 : 4;
        const heads = stage === 2 || stage === 3 ? seeds.map(name => {
          let bone = byName.get(name);
          const visited = new Set([name]);
          // A shared branching parent or the skeleton root is an attachment, not part of this chain.
          while (bone) {
            const parent = byName.get(bone.parent);
            if (!parent || !parent.parent || children.get(parent.name)?.length !== 1 || visited.has(parent.name)) break;
            visited.add(parent.name);
            bone = parent;
          }
          return bone.name;
        }) : [];
        let chosen;
        if (stage === 1) chosen = descendants(seeds);
        if (stage === 2) {
          chosen = descendants(heads);
          const first = descendants(seeds);
          if (chosen.size === first.size && [...chosen].every(name => first.has(name))) stage = 3;
        }
        if (stage === 3) {
          const parents = new Set(heads.map(name => byName.get(name).parent || null));
          chosen = descendants(bones.filter(bone => parents.has(bone.parent || null)).map(bone => bone.name));
        }
        if (stage === 4) chosen = new Set(bones.map(bone => bone.name));
        return { names: bones.filter(bone => chosen.has(bone.name)).map(bone => bone.name), anchor: seeds.includes(anchor) ? anchor : seeds[0] || bones[0]?.name || null, stage };
      }
    };
  }
  return { createHistory, createSelectionCycle, visibleBoneRows };
});