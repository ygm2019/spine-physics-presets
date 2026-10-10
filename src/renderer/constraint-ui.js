'use strict';
window.constraintUI = (() => {
  let menu = null, restoreFocus = null;
  function closeMenu(focus = false) {
    if (!menu) return;
    menu.remove();
    menu = null;
    if (focus) restoreFocus?.focus();
  }
  document.addEventListener('pointerdown', e => { if (menu && !menu.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', e => { if (menu && e.key === 'Escape') { e.preventDefault(); closeMenu(true); } });
  window.addEventListener('blur', () => closeMenu());
  window.addEventListener('resize', () => closeMenu());
  document.addEventListener('scroll', () => closeMenu(), true);
  function showMenu(x, y, actions, origin, id = 'constraintMenu') {
    closeMenu();
    restoreFocus = origin;
    menu = document.createElement('div');
    menu.id = id;
    menu.className = 'constraint-menu';
    menu.setAttribute('role', 'menu');
    for (const action of actions) {
      const button = document.createElement('button');
      button.setAttribute('role', 'menuitem');
      button.dataset.action = action.id;
      button.disabled = !!action.disabled;
      const label = document.createElement('span');
      label.textContent = action.label;
      button.append(label);
      if (action.shortcut) {
        const key = document.createElement('kbd');
        key.textContent = action.shortcut;
        button.append(key);
      }
      button.addEventListener('click', () => { closeMenu(true); action.run(); });
      menu.append(button);
    }
    menu.addEventListener('contextmenu', e => e.preventDefault());
    menu.addEventListener('keydown', e => {
      const buttons = [...menu.querySelectorAll('button:not(:disabled)')];
      const i = buttons.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }
    });
    document.body.append(menu);
    const box = menu.getBoundingClientRect();
    menu.style.left = Math.max(6, Math.min(x, innerWidth - box.width - 6)) + 'px';
    menu.style.top = Math.max(6, Math.min(y, innerHeight - box.height - 6)) + 'px';
    menu.querySelector('button:not(:disabled)')?.focus();
  }
  function bindReorder(container, { selector, keyOf, context, start, drop, horizontal = false }) {
    let gesture = null, frame = 0, suppressClick = false;
    const rows = () => [...container.querySelectorAll(selector)];
    function clearMarks() {
      container.classList.remove('reordering');
      rows().forEach(row => row.classList.remove('drag-source', 'drop-before', 'drop-after'));
    }
    function clear() {
      const previous = gesture; gesture = null;
      cancelAnimationFrame(frame); frame = 0; clearMarks();
      if (previous && container.hasPointerCapture(previous.id)) container.releasePointerCapture(previous.id);
      return previous;
    }
    function cancel() {
      if (!gesture) return;
      gesture.cancelled = true; gesture.target = null;
      cancelAnimationFrame(frame); frame = 0; clearMarks();
    }
    function updateTarget() {
      const g = gesture; clearMarks();
      if (!g || g.cancelled || !g.moved) return;
      if (g.context !== context()) { cancel(); return; }
      container.classList.add('reordering');
      const items = rows(), source = items.find(row => keyOf(row) === g.key);
      if (!source) { cancel(); return; }
      source.classList.add('drag-source');
      const bounds = container.getBoundingClientRect(); g.target = null;
      if (g.x < bounds.left || g.x >= bounds.right || g.y < bounds.top || g.y >= bounds.bottom) return;
      let target = null, distance = Infinity;
      for (const row of items) {
        const r = row.getBoundingClientRect();
        const dx = Math.max(r.left - g.x, 0, g.x - r.right), dy = Math.max(r.top - g.y, 0, g.y - r.bottom);
        const d = dx * dx + dy * dy;
        if (d < distance) { distance = d; target = row; }
      }
      if (!target || keyOf(target) === g.key) return;
      const r = target.getBoundingClientRect(), before = horizontal ? g.x < r.left + r.width / 2 : g.y < r.top + r.height / 2;
      g.target = { key: keyOf(target), before };
      target.classList.add(before ? 'drop-before' : 'drop-after');
    }
    function tick() {
      frame = 0; const g = gesture;
      if (!g || g.cancelled || !g.moved) return;
      const r = container.getBoundingClientRect();
      if (g.x >= r.left && g.x < r.right && g.y >= r.top && g.y < r.bottom) {
        if (container.scrollHeight > container.clientHeight) container.scrollTop += g.y < r.top + 18 ? -8 : g.y > r.bottom - 18 ? 8 : 0;
      }
      updateTarget();
      if (gesture && !gesture.cancelled) frame = requestAnimationFrame(tick);
    }
    container.addEventListener('pointerdown', e => {
      suppressClick = false;
      const row = e.target.closest(selector);
      if (gesture || e.button !== 0 || !row || !container.contains(row)) return;
      gesture = { id: e.pointerId, key: keyOf(row), context: context(), startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, moved: false, cancelled: false, target: null };
    });
    container.addEventListener('pointermove', e => {
      const g = gesture; if (!g || e.pointerId !== g.id || g.cancelled) return;
      g.x = e.clientX; g.y = e.clientY;
      if (!g.moved) {
        if (Math.hypot(g.x - g.startX, g.y - g.startY) <= 4) return;
        if (g.context !== context()) { cancel(); return; }
        g.moved = true; container.setPointerCapture(g.id); closeMenu(); start?.(g.key);
        frame = requestAnimationFrame(tick);
      }
      e.preventDefault(); updateTarget();
    });
    container.addEventListener('pointerup', e => {
      const g = gesture; if (!g || e.pointerId !== g.id || e.button !== 0) return;
      g.x = e.clientX; g.y = e.clientY; updateTarget();
      suppressClick = g.moved || g.cancelled;
      clear();
      if (g.moved && !g.cancelled && g.target && g.context === context()) drop(g.key, g.target.key, g.target.before);
    });
    container.addEventListener('click', e => { if (suppressClick && e.detail !== 0) { suppressClick = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    container.addEventListener('dragstart', e => e.preventDefault());
    container.addEventListener('pointercancel', () => { suppressClick = !!gesture?.moved; clear(); });
    container.addEventListener('lostpointercapture', () => { if (gesture) { suppressClick = gesture.moved; clear(); } });
    window.addEventListener('pointerup', e => { if (gesture && e.pointerId === gesture.id) clear(); });
    window.addEventListener('pointercancel', e => { if (gesture && e.pointerId === gesture.id) clear(); });
    document.addEventListener('keydown', e => { if (gesture && e.key === 'Escape') { e.preventDefault(); cancel(); } });
    window.addEventListener('blur', () => { suppressClick = !!gesture?.moved; clear(); });
  }
  function sort(entries, activeKey) {
    closeMenu();
    return new Promise(resolve => {
      const ordered = entries.slice();
      let active = activeKey || ordered[0]?.key, dragged = null;
      const modal = document.createElement('dialog');
      modal.id = 'constraintSortDialog';
      modal.className = 'app-dialog constraint-sort-dialog';
      const title = document.createElement('h2');
      title.textContent = '约束排序';
      const list = document.createElement('div');
      list.className = 'sort-list';
      list.setAttribute('role', 'listbox');
      list.setAttribute('aria-label', '约束计算顺序');
      const controls = document.createElement('div');
      controls.className = 'sort-controls';
      const buttons = [];
      function move(destination) {
        const source = ordered.findIndex(e => e.key === active);
        if (source < 0 || destination < 0 || destination >= ordered.length || source === destination) return;
        ordered.splice(destination, 0, ordered.splice(source, 1)[0]);
        render(true);
      }
      for (const [id, symbol, label, position] of [
        ['top', '⇈', '置顶（最先计算）', () => 0],
        ['up', '↑', '上移（更早计算）', () => ordered.findIndex(e => e.key === active) - 1],
        ['down', '↓', '下移（更晚计算）', () => ordered.findIndex(e => e.key === active) + 1],
        ['bottom', '⇊', '置底（最后计算）', () => ordered.length - 1]
      ]) {
        const button = document.createElement('button');
        button.textContent = symbol;
        button.title = label;
        button.setAttribute('aria-label', label);
        button.dataset.sortMove = id;
        button.onclick = () => move(position());
        buttons.push(button);
        controls.append(button);
      }
      function render(focus = false) {
        list.replaceChildren();
        const kinds = { physics: '物理', ik: 'IK', transform: '变换', path: '路径', slider: '滑块' };
        ordered.forEach((entry, i) => {
          const row = document.createElement('div');
          row.className = 'sort-row' + (entry.key === active ? ' selected' : '');
          row.draggable = true;
          row.tabIndex = entry.key === active ? 0 : -1;
          row.dataset.sortKey = entry.key;
          row.setAttribute('role', 'option');
          row.setAttribute('aria-selected', String(entry.key === active));
          row.title = entry.constraint.name + ' · ' + (entry.constraint.bone || entry.constraint.bones?.join('、') || '');
          for (const [className, text] of [['constraint-order', String(i + 1)], ['sort-kind', kinds[entry.kind] || entry.kind], ['sort-name', entry.constraint.name]]) {
            const span = document.createElement('span');
            span.className = className;
            span.textContent = text;
            row.append(span);
          }
          row.onclick = () => { active = entry.key; render(true); };
          row.onkeydown = e => {
            if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); move(i + (e.key === 'ArrowUp' ? -1 : 1)); }
            else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); active = ordered[Math.max(0, Math.min(ordered.length - 1, i + (e.key === 'ArrowUp' ? -1 : 1)))]?.key; render(true); }
          };
          row.ondragstart = e => { active = entry.key; dragged = entry.key; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', entry.key); };
          row.ondragover = e => { if (!dragged) return; e.preventDefault(); row.classList.toggle('drop-before', e.clientY < row.getBoundingClientRect().top + row.clientHeight / 2); row.classList.toggle('drop-after', !row.classList.contains('drop-before')); };
          row.ondragleave = () => row.classList.remove('drop-before', 'drop-after');
          row.ondrop = e => {
            if (!dragged) return;
            e.preventDefault();
            const source = ordered.findIndex(e => e.key === dragged);
            let destination = i + (e.clientY >= row.getBoundingClientRect().top + row.clientHeight / 2 ? 1 : 0);
            if (source < destination) destination--;
            active = dragged;
            dragged = null;
            move(destination);
            render(true);
          };
          row.ondragend = () => { dragged = null; list.querySelectorAll('.sort-row').forEach(r => r.classList.remove('drop-before', 'drop-after')); };
          list.append(row);
        });
        const index = ordered.findIndex(e => e.key === active);
        buttons[0].disabled = buttons[1].disabled = index <= 0;
        buttons[2].disabled = buttons[3].disabled = index < 0 || index >= ordered.length - 1;
        if (focus) { const row = list.querySelector('.selected'); row?.focus(); row?.scrollIntoView({ block: 'nearest' }); }
      }
      const actions = document.createElement('div');
      actions.className = 'dialog-actions';
      const finish = accepted => { modal.close(); modal.remove(); resolve(accepted ? ordered.map(e => e.key) : null); };
      const cancel = document.createElement('button');
      cancel.textContent = '取消';
      cancel.onclick = () => finish(false);
      const ok = document.createElement('button');
      ok.className = 'primary';
      ok.textContent = '确定';
      ok.onclick = () => finish(true);
      actions.append(cancel, ok);
      modal.addEventListener('cancel', e => { e.preventDefault(); finish(false); });
      modal.append(title, list, controls, actions);
      document.body.append(modal);
      render();
      modal.showModal();
      list.querySelector('.selected')?.focus();
    });
  }
  return { showMenu, closeMenu, sort, bindReorder };
})();