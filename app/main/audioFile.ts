import { open } from 'node:fs/promises';
import { Readable } from 'node:stream';

// Stream only the requested bytes. Chromium sniffs the actual media container.
export async function audioFileResponse(request: Request, path: string, size: number, modified: number): Promise<Response> {
  const file = await open(path, 'r');
  let transferred = false;
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size !== size || Math.trunc(stat.mtimeMs) !== modified) {
      return new Response('Audio file changed; locate it again.', { status: 409 });
    }
    const headers = new Headers({ 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
    let start = 0;
    let end = size - 1;
    const range = request.headers.get('range');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match && (match[1] || match[2])) {
        start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
        end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
      } else start = size;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
        headers.set('Content-Range', `bytes */${size}`);
        return new Response(null, { status: 416, headers });
      }
      headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    }
    headers.set('Content-Length', String(Math.max(0, end - start + 1)));
    if (request.method === 'HEAD' || size === 0) return new Response(null, { headers, status: range ? 206 : 200 });
    const stream = file.createReadStream({ start, end, autoClose: true });
    const abort = () => stream.destroy();
    request.signal.addEventListener('abort', abort, { once: true });
    stream.once('close', () => request.signal.removeEventListener('abort', abort));
    if (request.signal.aborted) stream.destroy();
    transferred = true;
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { headers, status: range ? 206 : 200 });
  } finally {
    if (!transferred) await file.close();
  }
}
