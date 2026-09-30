import assert from 'node:assert/strict';
import { mkdtemp, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { audioFileResponse } from '../app/main/audioFile.ts';
import { isAudioFile } from '../app/shared/audioFormats.ts';

test('common extensions are case insensitive; non-audio extensions are rejected', () => {
  for (const name of ['song.MP3', 'sound.m4a', 'sound.flac', 'sound.opus', 'sound.wav']) assert(isAudioFile(name));
  for (const name of ['song.mp3.exe', 'song', 'song.txt']) assert(!isAudioFile(name));
});

test('local audio serves full, bounded, open, suffix and invalid ranges', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'continuo-stream-'));
  const path = join(directory, 'audio.mp3');
  try {
    await writeFile(path, '0123456789');
    const { size, mtimeMs } = await stat(path);
    const get = (range?: string, method = 'GET') => audioFileResponse(new Request('https://local/track', {
      method, headers: range ? { Range: range } : {},
    }), path, size, Math.trunc(mtimeMs));
    assert.equal(await (await get()).text(), '0123456789');
    for (const [range, expected] of [['bytes=2-4', '234'], ['bytes=7-', '789'], ['bytes=-3', '789'], ['bytes=8-99', '89']]) {
      const response = await get(range);
      assert.equal(response.status, 206);
      assert.equal(response.headers.get('content-length'), String(expected.length));
      assert.equal(await response.text(), expected);
    }
    for (const range of ['bytes=99-', 'bytes=5-2', 'bytes=-0', 'bytes=0-1,3-4', 'garbage']) {
      assert.equal((await get(range)).status, 416);
    }
    assert.equal(await (await get(undefined, 'HEAD')).text(), '');
    assert.equal((await get(undefined, 'POST')).status, 405);
    assert.equal((await audioFileResponse(new Request('https://local/track'), path, 999, Math.trunc(mtimeMs))).status, 409);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
