'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('desktop', Object.freeze({
  openFiles: (kind, retainedId) => ipcRenderer.invoke('files:open', kind, retainedId),
  saveJson: payload => ipcRenderer.invoke('files:save-json', payload),
  saveProject: payload => ipcRenderer.invoke('files:save-project', payload),
  importDropped: (files, retainedId) => {
    const paths = Array.from(files, file => webUtils.getPathForFile(file));
    if (!paths.length || paths.some(file => !file)) return Promise.reject(Error('拖入文件没有本地路径，请通过左上角选择文件。'));
    return ipcRenderer.invoke('files:drop-project', paths, retainedId);
  },
  getInfo: () => ipcRenderer.invoke('app:info')
}));