import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAnalysisDuration } from '../app/shared/analysis.ts';
import { readAudioDuration } from '../app/renderer/audioDuration.ts';

test('analysis permits exactly ten minutes and rejects longer or unknown durations', () => {
  for (const duration of [0.1, 120, 599.999, 600]) assert.doesNotThrow(() => validateAnalysisDuration(duration));
  for (const [duration, formatted] of [[600.001, '00h 10m 01s'], [3600, '01h 00m 00s'], [10520, '02h 55m 20s']] as const) {
    assert.throws(() => validateAnalysisDuration(duration), {
      message: `Error: Track length cannot be over 10 minutes (${formatted}).`,
    });
  }
  for (const duration of [0, -1, NaN, Infinity, undefined, null, '120']) {
    assert.throws(() => validateAnalysisDuration(duration), /Cannot determine/);
  }
});

class MetadataAudio {
  static last: MetadataAudio;
  duration = 120;
  src = '';
  preload = '';
  loads = 0;
  onloadedmetadata: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { MetadataAudio.last = this; }
  removeAttribute() { this.src = ''; }
  load() { this.loads++; }
}

test('duration reads only metadata and releases the media resource on success and failure', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Audio');
  Object.assign(globalThis, { Audio: MetadataAudio });
  try {
    const result = readAudioDuration('blob:audio', new AbortController().signal);
    const media = MetadataAudio.last;
    assert.equal(media.preload, 'metadata');
    media.onloadedmetadata!();
    assert.equal(await result, 120);
    assert.equal(media.src, '');
    assert.equal(media.onloadedmetadata, null);
    assert.equal(media.loads, 2);

    const failed = readAudioDuration('blob:bad', new AbortController().signal);
    MetadataAudio.last.onerror!();
    await assert.rejects(failed, /convert a copy/);
    assert.equal(MetadataAudio.last.src, '');

    const controller = new AbortController();
    const cancelled = readAudioDuration('blob:cancel', controller.signal);
    controller.abort();
    await assert.rejects(cancelled, { name: 'AbortError' });
    assert.equal(MetadataAudio.last.src, '');
    await assert.rejects(readAudioDuration('blob:already-cancelled', controller.signal), { name: 'AbortError' });
  } finally {
    if (original) Object.defineProperty(globalThis, 'Audio', original);
    else Reflect.deleteProperty(globalThis, 'Audio');
  }
});
