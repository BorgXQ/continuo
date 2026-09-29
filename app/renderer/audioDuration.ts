/** Read metadata only; never allocate a whole-track decoded audio buffer. */
export function readAudioDuration(url: string, signal: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
    const media = new Audio();
    const finish = (error?: Error) => {
      const duration = media.duration;
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      media.onloadedmetadata = media.onerror = null;
      media.removeAttribute('src');
      media.load();
      if (error) reject(error);
      else resolve(duration);
    };
    const abort = () => finish(new DOMException('Cancelled', 'AbortError'));
    const timeout = setTimeout(() => finish(new Error('Timed out reading audio duration. Analysis was not started.')), 15_000);
    signal.addEventListener('abort', abort, { once: true });
    media.onloadedmetadata = () => finish();
    media.onerror = () => finish(new Error('Cannot read audio duration. Check the file or convert a copy to a standard MP3 or WAV before analyzing.'));
    media.preload = 'metadata';
    media.src = url;
    media.load();
  });
}
