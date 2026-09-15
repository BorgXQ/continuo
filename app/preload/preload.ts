import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { AnalysisBridge, AnalysisEvent } from '../shared/analysis';
import type { LibraryBridge } from '../shared/library';
import type { DiscordBridge, DiscordState } from '../shared/discord';

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
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: settings => ipcRenderer.invoke('settings:save', settings),
  flushSettings: settings => ipcRenderer.sendSync('settings:flush', settings),
  load: () => ipcRenderer.invoke('library:load'),
  save: tracks => ipcRenderer.invoke('library:save', tracks),
  move: (from, to) => ipcRenderer.invoke('library:move', from, to),
  flush: tracks => ipcRenderer.sendSync('library:flush', tracks),
  read: id => ipcRenderer.invoke('library:read', id),
};
contextBridge.exposeInMainWorld('library', library);

const discord: DiscordBridge = {
  getState: () => ipcRenderer.invoke('discord:state'),
  connect: token => ipcRenderer.invoke('discord:connect', token),
  disconnect: () => ipcRenderer.invoke('discord:disconnect'),
  onUpdate: listener => {
    const receive = (_event: Electron.IpcRendererEvent, state: DiscordState) => listener(state);
    ipcRenderer.on('discord:update', receive);
    return () => ipcRenderer.removeListener('discord:update', receive);
  },
};
contextBridge.exposeInMainWorld('discord', discord);
