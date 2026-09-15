import { app, BrowserWindow, ipcMain, safeStorage, type IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';
import { DiscordConnection } from './discordConnection';
import { DiscordCredentials } from './discordCredentials';

export function registerDiscord(): void {
  const credentials = new DiscordCredentials(join(app.getPath('userData'), 'discord-token.enc'), safeStorage);
  let pendingToken: string | null = null;
  let retainedToken: string | null = null;
  let storageError: string | null = null;
  const snapshot = () => ({ ...connection.getState(), hasToken: retainedToken !== null, error: connection.getState().error ?? storageError });
  const connection = new DiscordConnection(state => {
    if (state.status === 'connected' && pendingToken !== null) {
      try { credentials.save(pendingToken); }
      catch { storageError = 'Connected for this session only. Secure token storage is unavailable; automatic login could not be saved.'; }
      pendingToken = null;
    }
    if (state.status === 'disconnected') pendingToken = null;
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed()) window.webContents.send('discord:update', snapshot());
    }
  });
  const authorize = (event: IpcMainInvokeEvent) => {
    if (event.senderFrame !== event.sender.mainFrame || !BrowserWindow.fromWebContents(event.sender)) {
      throw new Error('Discord requests must come from the main window.');
    }
  };
  ipcMain.handle('discord:state', event => { authorize(event); return snapshot(); });
  ipcMain.handle('discord:token', event => { authorize(event); return retainedToken ?? ''; });
  ipcMain.handle('discord:connect', (event, token: unknown) => {
    authorize(event);
    if (connection.getState().status !== 'disconnected') throw new Error('Already connected or connecting.');
    storageError = null;
    const value = token === undefined ? retainedToken : token;
    if (typeof value !== 'string' || !value.trim() || value.length > 4096 || /\s/.test(value.trim())) throw new Error('Enter a Discord bot token.');
    retainedToken = value.trim();
    pendingToken = retainedToken;
    try { connection.connect(retainedToken); }
    catch { pendingToken = null; throw new Error('Unable to start Discord connection.'); }
  });
  ipcMain.handle('discord:disconnect', event => {
    authorize(event);
    credentials.clear();
    storageError = null;
    pendingToken = null;
    connection.disconnect();
  });
  try {
    const token = credentials.load();
    if (token) { retainedToken = token; connection.connect(token); }
  } catch { storageError = 'Saved Discord credentials could not be unlocked. Enter your bot token to reconnect.'; }
  app.on('before-quit', () => connection.disconnect());
}
