import { app, BrowserWindow, ipcMain, safeStorage, type IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';
import { DiscordConnection } from './discordConnection';
import { DiscordCredentials } from './discordCredentials';
import { DiscordVoice } from './discordVoice';

export function registerDiscord(): void {
  const credentials = new DiscordCredentials(join(app.getPath('userData'), 'discord-token.enc'), safeStorage);
  let pendingToken: string | null = null;
  let retainedToken: string | null = null;
  let storageError: string | null = null;
  const snapshot = () => ({ ...connection.getState(), output: voice.state, hasToken: retainedToken !== null, error: connection.getState().error ?? storageError });
  const broadcast = () => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed()) window.webContents.send('discord:update', snapshot());
    }
  };
  const voice = new DiscordVoice(broadcast);
  const connection = new DiscordConnection(state => {
    if (state.status === 'connected' && pendingToken !== null) {
      try { credentials.save(pendingToken); }
      catch { storageError = 'Connected for this session only. Secure token storage is unavailable; automatic login could not be saved.'; }
      pendingToken = null;
    }
    if (state.status === 'disconnected') pendingToken = null;
    if (state.status !== 'connected' && voice.state.channelId) voice.leave();
    if (voice.state.channelId && !state.channels.some(channel => channel.id === voice.state.channelId)) voice.leave('Voice channel is no longer available.');
    broadcast();
  });
  const authorize = (event: IpcMainInvokeEvent) => {
    if (event.senderFrame !== event.sender.mainFrame || !BrowserWindow.fromWebContents(event.sender)) {
      throw new Error('Discord requests must come from the main window.');
    }
  };
  ipcMain.handle('discord:state', event => { authorize(event); return snapshot(); });
  ipcMain.handle('discord:token', event => { authorize(event); return retainedToken ?? ''; });
  ipcMain.handle('discord:output', async (event, channelId: unknown) => {
    authorize(event);
    if (channelId === null) { voice.leave(); return; }
    if (typeof channelId !== 'string') throw new Error('Invalid voice channel.');
    await voice.join(connection.voiceGuild(channelId), channelId);
  });
  ipcMain.handle('discord:audio', (event, channelId: unknown, bytes: unknown) => { authorize(event); voice.write(channelId, bytes); });
  app.on('window-all-closed', () => voice.leave());
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
  app.on('before-quit', () => { voice.leave(); connection.disconnect(); });
}
