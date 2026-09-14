import { app, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { mkdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LibraryStore } from './libraryStore';
import type { AudioSettings, SavedTrack } from '../shared/library';

export function registerLibrary(): void {
  mkdirSync(app.getPath('userData'), { recursive: true });
  const store = new LibraryStore(join(app.getPath('userData'), 'library.sqlite'));
  function authorize(event: IpcMainEvent | IpcMainInvokeEvent) {
    if (event.senderFrame !== event.sender.mainFrame) throw new Error('Library requests must come from the main window.');
  }
  ipcMain.handle('settings:load', event => { authorize(event); return store.loadSettings(); });
  ipcMain.handle('settings:save', (event, settings: AudioSettings) => { authorize(event); store.saveSettings(settings); });
  ipcMain.on('settings:flush', (event, settings: AudioSettings) => {
    try { authorize(event); store.saveSettings(settings); event.returnValue = null; }
    catch (error) { event.returnValue = String(error); }
  });
  ipcMain.handle('library:load', event => {
    authorize(event);
    const tracks = store.load().map(track => {
      try {
        const stat = statSync(track.path);
        if (!stat.isFile()) return { ...track, missing: true };
        if (stat.size !== track.size || Math.trunc(stat.mtimeMs) !== track.modified) {
          return { ...track, size: stat.size, modified: Math.trunc(stat.mtimeMs), analysis: undefined,
            mode: track.mode === 'procedural' ? 'once' as const : track.mode, missing: false };
        }
        return { ...track, missing: false };
      } catch { return { ...track, missing: true }; }
    });
    store.save(tracks);
    return tracks;
  });
  ipcMain.handle('library:save', (event, tracks: SavedTrack[]) => { authorize(event); store.save(tracks); });
  ipcMain.handle('library:move', (event, from: number, to: number) => { authorize(event); store.move(from, to); });
  ipcMain.on('library:flush', (event, tracks: SavedTrack[]) => {
    try { authorize(event); store.save(tracks); event.returnValue = null; }
    catch (error) { event.returnValue = String(error); }
  });
  ipcMain.handle('library:read', async (event, id: string) => {
    authorize(event);
    const track = store.file(id);
    const stat = statSync(track.path);
    if (stat.size !== track.size || Math.trunc(stat.mtimeMs) !== track.modified) throw new Error('The MP3 has changed. Locate the file again before playing.');
    return new Uint8Array(await readFile(track.path));
  });
  app.on('will-quit', () => store.close());
}
