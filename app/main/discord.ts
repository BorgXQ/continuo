import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { DiscordConnection } from './discordConnection';

export function registerDiscord(): void {
  const connection = new DiscordConnection(state => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed()) window.webContents.send('discord:update', state);
    }
  });
  const authorize = (event: IpcMainInvokeEvent) => {
    if (event.senderFrame !== event.sender.mainFrame || !BrowserWindow.fromWebContents(event.sender)) {
      throw new Error('Discord requests must come from the main window.');
    }
  };
  ipcMain.handle('discord:state', event => { authorize(event); return connection.getState(); });
  ipcMain.handle('discord:connect', (event, token: unknown) => { authorize(event); connection.connect(token); });
  ipcMain.handle('discord:disconnect', event => { authorize(event); connection.disconnect(); });
  app.on('before-quit', () => connection.disconnect());
  app.on('window-all-closed', () => connection.disconnect());
}
