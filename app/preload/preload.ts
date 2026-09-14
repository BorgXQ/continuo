import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { AnalysisBridge, AnalysisEvent } from '../shared/analysis';
import type { LibraryBridge } from '../shared/library';

const bridge: AnalysisBridge = {
  filePath: file => webUtils.getPathForFile(file),
  start: (id, path) => ipcRenderer.invoke('analysis:start', id, path),
  cancel: id => ipcRenderer.invoke('analysis:cancel', id),
  onUpdate: listener => {
    const receive = (_event: Electron.IpcRendererEvent, update: AnalysisEvent) => listener(update);
    ipcRenderer.on('analysis:update', receive);
    return () => ipcRenderer.removeListener('analysis:update', receive);
  },
};

contextBridge.exposeInMainWorld('analysis', bridge);

const library: LibraryBridge = {
  load: () => ipcRenderer.invoke('library:load'),
  save: tracks => ipcRenderer.invoke('library:save', tracks),
  flush: tracks => ipcRenderer.sendSync('library:flush', tracks),
  read: id => ipcRenderer.invoke('library:read', id),
};
contextBridge.exposeInMainWorld('library', library);
