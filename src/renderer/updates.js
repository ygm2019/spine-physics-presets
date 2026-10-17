'use strict';
(() => {
  const api = window.desktop;
  const button = document.getElementById('updateNotice');
  if (!api?.getUpdateState || !button) return;
  function render(state) {
    button.hidden = !state.version;
    button.disabled = ['downloading', 'installing'].includes(state.status);
    button.textContent = state.status === 'downloaded' ? '更新已下载 · 点击重启安装'
      : state.status === 'downloading' ? `正在下载更新 ${state.percent}%`
      : state.status === 'installing' ? '正在重启更新…'
      : state.message || `发现新版 v${state.version} · 点击更新`;
  }
  api.onUpdateState(render);
  api.getUpdateState().then(render).catch(() => {});
  button.addEventListener('click', async () => {
    button.disabled = true;
    try { render(await api.activateUpdate()); }
    catch { button.disabled = false; window.__spineTool.toast('更新暂时不可用，请稍后重试。', true); }
  });
})();
