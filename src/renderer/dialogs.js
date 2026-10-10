'use strict';
// Chromium desktop windows do not implement window.prompt.
window.appDialogs = (() => {
  let pending = Promise.resolve();
  function show({ title, message, value, confirm = false, sections }) {
    const run = () => new Promise(resolve => {
      const modal = document.createElement('dialog');
      modal.className = 'app-dialog';
      const heading = document.createElement('h2');
      heading.textContent = title;
      modal.append(heading);
      if (sections) {
        modal.id = 'usageHelp';
        modal.classList.add('usage-dialog');
        const content = document.createElement('div');
        content.className = 'usage-content';
        content.tabIndex = 0;
        content.setAttribute('role', 'region');
        content.setAttribute('aria-label', title);
        for (const section of sections) {
          const label = document.createElement('h3');
          label.textContent = section.title;
          content.append(label);
          if (section.items) {
            const list = document.createElement(section.ordered ? 'ol' : 'ul');
            for (const item of section.items) {
              const row = document.createElement('li');
              row.textContent = item;
              list.append(row);
            }
            content.append(list);
          } else {
            const table = document.createElement('table');
            table.setAttribute('aria-label', section.title);
            const head = document.createElement('thead'), header = document.createElement('tr');
            for (const column of section.columns) {
              const cell = document.createElement('th');
              cell.scope = 'col';
              cell.textContent = column;
              header.append(cell);
            }
            head.append(header);
            const body = document.createElement('tbody');
            for (const cells of section.rows) {
              const row = document.createElement('tr');
              for (const value of cells) {
                const cell = document.createElement('td');
                cell.textContent = value;
                row.append(cell);
              }
              body.append(row);
            }
            table.append(head, body);
            content.append(table);
          }
        }
        modal.append(content);
      } else {
        const text = document.createElement('p');
        text.textContent = message || '';
        modal.append(text);
      }
      let input;
      if (value !== undefined) {
        input = document.createElement('input');
        input.value = value;
        input.setAttribute('aria-label', title);
        modal.append(input);
      }
      const actions = document.createElement('div');
      actions.className = 'dialog-actions';
      const finish = accepted => {
        modal.close();
        modal.remove();
        resolve(input ? (accepted ? input.value : null) : accepted);
      };
      if (confirm || input) {
        const cancel = document.createElement('button');
        cancel.textContent = '取消';
        cancel.onclick = () => finish(false);
        actions.append(cancel);
      }
      const ok = document.createElement('button');
      ok.className = 'primary';
      ok.textContent = '确定';
      ok.onclick = () => finish(true);
      actions.append(ok);
      modal.append(actions);
      modal.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
      modal.addEventListener('keydown', event => {
        if (event.key === 'Enter' && event.target === input) { event.preventDefault(); finish(true); }
      });
      document.body.append(modal);
      modal.showModal();
      if (input) { input.focus(); input.select(); } else ok.focus();
    });
    const result = pending.then(run);
    pending = result.catch(() => {});
    return result;
  }
  return {
    prompt: (message, value = '') => show({ title: message, value }),
    confirm: message => show({ title: '确认', message, confirm: true }),
    alert: (message, title = '使用说明') => show({ title, message }),
    guide: (sections, title = '使用说明') => show({ title, sections })
  };
})();