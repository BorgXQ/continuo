import { BrowserWindow, ipcMain } from 'electron';
import { readFile, open } from 'node:fs/promises';
import { join } from 'node:path';

export const CONVERSION_ERROR = 'This file could not be decoded completely for analysis. Convert a copy to a standard MP3 or PCM WAV using an external audio tool, then add it again.';

/** The isolated window can be destroyed to cancel Chromium's non-abortable decoder. */
export async function decodeWithElectron(path: string, duration: number, wavPath: string, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const window = new BrowserWindow({ show: false, webPreferences: {
    preload: join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true,
    nodeIntegration: false, backgroundThrottling: false,
  } });
  const file = await open(wavPath, 'wx').catch(error => { window.destroy(); throw error; });
  let written = 0;
  let expectedBytes = 0;
  let failure: Error | undefined;
  let writing = false;
  const destroy = () => { if (!window.isDestroyed()) window.destroy(); };
  const timeout = setTimeout(() => { failure = new Error('Audio decoding timed out.'); destroy(); }, 120_000);
  signal.addEventListener('abort', destroy, { once: true });
  const authorize = (event: Electron.IpcMainInvokeEvent) => {
    if (event.sender !== window.webContents || event.senderFrame !== event.sender.mainFrame) throw new Error('Invalid decoder request.');
    signal.throwIfAborted();
  };
  ipcMain.handle('analysis:decode-read', async event => {
    authorize(event);
    return new Uint8Array(await readFile(path, { signal }));
  });
  ipcMain.handle('analysis:decode-write', async (event, chunk: unknown) => {
    authorize(event);
    if (writing || !(chunk instanceof Uint8Array) || !chunk.byteLength || chunk.byteLength > 262144 || written + chunk.byteLength > expectedBytes) {
      throw new Error('Invalid decoded audio chunk.');
    }
    writing = true;
    try {
      let offset = 0;
      while (offset < chunk.length) {
        const result = await file.write(chunk, offset, chunk.length - offset, 44 + written + offset);
        if (!result.bytesWritten) throw new Error('Cannot write decoded audio.');
        offset += result.bytesWritten;
      }
      written += chunk.length;
    } finally { writing = false; }
  });
  try {
    signal.throwIfAborted();
    await window.loadURL("data:text/html,<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'\">");
    const info = await window.webContents.executeJavaScript(`(async () => {
      const bytes = await window.analysisDecoder.read();
      const context = new OfflineAudioContext(1, 1, 44100);
      const audio = await context.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      window.decodedAnalysis = audio;
      return { frames: audio.length, rate: audio.sampleRate, duration: audio.duration };
    })()`);
    signal.throwIfAborted();
    if (info.rate !== 44100 || !Number.isSafeInteger(info.frames) || info.frames <= 0
      || !Number.isFinite(info.duration) || Math.abs(info.duration - duration) > 0.1) throw new Error('Decoded duration differs from playback.');
    expectedBytes = info.frames * 4;
    const header = Buffer.alloc(44);
    header.write('RIFF'); header.writeUInt32LE(36 + expectedBytes, 4); header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16); header.writeUInt16LE(3, 20); header.writeUInt16LE(1, 22);
    header.writeUInt32LE(44100, 24); header.writeUInt32LE(44100 * 4, 28);
    header.writeUInt16LE(4, 32); header.writeUInt16LE(32, 34);
    header.write('data', 36); header.writeUInt32LE(expectedBytes, 40);
    await file.writeFile(header);
    await window.webContents.executeJavaScript(`(async () => {
      const audio = window.decodedAnalysis;
      const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
      for (let start = 0; start < audio.length; start += 65536) {
        const count = Math.min(65536, audio.length - start);
        const bytes = new Uint8Array(count * 4);
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < count; i++) {
          let value = 0;
          for (const channel of channels) value += channel[start + i] / channels.length;
          if (!Number.isFinite(value)) throw new Error('Non-finite decoded samples.');
          view.setFloat32(i * 4, value, true);
        }
        await window.analysisDecoder.write(bytes);
      }
      window.decodedAnalysis = null;
    })()`);
    signal.throwIfAborted();
    if (failure) throw failure;
    if (written !== expectedBytes) throw new Error('Incomplete decoded audio.');
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', destroy);
    destroy();
    ipcMain.removeHandler('analysis:decode-read');
    ipcMain.removeHandler('analysis:decode-write');
    await file.close();
  }
}
