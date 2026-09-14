import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { AnalysisBridge, AnalysisEvent } from '../shared/analysis';

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
