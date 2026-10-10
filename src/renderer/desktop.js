'use strict';
(() => {
  if (!window.desktop) return;
  const tool = window.__spineTool;
  const errors = error => tool.toast(error.message || String(error), true);
  let importing = false;
  const receive = async (picked, kind, approval) => {
    const files = picked.map(item => new File([item.bytes], item.name));
    if (kind === 'presets') { if (files[0]) tool.importPresetFile(files[0]); }
    else await tool.handleFiles(files, picked.find(item => item.source)?.source, approval);
  };
  const pick = async kind => {
    if (importing) return;
    importing = true;
    try {
      const approval = kind === 'project' ? await tool.prepareProjectImport() : null;
      if (kind === 'project' && !approval) return;
      const picked = await window.desktop.openFiles(kind, kind === 'project' ? tool.getSaveState().source?.id : undefined);
      await receive(picked, kind, approval);
    } catch (error) { errors(error); }
    finally { importing = false; }
  };
  const intercept = (id, kind) => {
    document.getElementById(id).addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      pick(kind);
    }, true);
  };
  intercept('dropbox', 'project');

  intercept('importPresets', 'presets');
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.repeat || document.querySelector('dialog[open]') ) return;
    if (window.shortcutSettings.matches('open',event)) { event.preventDefault(); pick('project'); }
    if (window.shortcutSettings.matches('save',event) && tool.getData()) { event.preventDefault(); if(tool.getSaveState().source)tool.saveOriginal();else tool.exportJson(); }
  });
  // Dropping files outside the import area must not navigate away from the app.
  window.addEventListener('dragover', event => event.preventDefault());
  window.addEventListener('drop', async event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    document.getElementById('dropbox').classList.remove('drag');
    if (importing) return;
    importing = true;
    const files = Array.from(event.dataTransfer.files);
    try {
      const hasJson = files.length > 0;
      const approval = hasJson ? await tool.prepareProjectImport() : null;
      if (hasJson && !approval) return;
      await receive(await window.desktop.importDropped(files, tool.getSaveState().source?.id), 'project', approval);
    } catch (error) { errors(error); }
    finally { importing = false; }
  }, true);
})();