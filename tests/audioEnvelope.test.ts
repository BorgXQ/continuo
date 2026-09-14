import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioEnvelope } from '../app/renderer/audioEnvelope.ts';

function render(envelope: AudioEnvelope, frames: number) {
  const channels = [new Float32Array(frames).fill(1), new Float32Array(frames).fill(1)];
  const stopped = envelope.process(channels);
  assert.deepEqual(channels[0], channels[1]);
  return { values: channels[0], stopped };
}

test('zero defaults leave playback unchanged and stop immediately', () => {
  const envelope = new AudioEnvelope(1000);
  envelope.start(0);
  assert.deepEqual([...render(envelope, 4).values], [1, 1, 1, 1]);
  envelope.stop(0);
  const result = render(envelope, 4);
  assert(result.stopped);
  assert.deepEqual([...result.values], [0, 0, 0, 0]);
});

test('S-curve fades ease at both ends, span audio blocks and reach their targets', () => {
  const envelope = new AudioEnvelope(1000);
  envelope.start(0.008);
  assert.deepEqual([...render(envelope, 4).values], [0, 0.04296875, 0.15625, 0.31640625]);
  assert.deepEqual([...render(envelope, 5).values], [0.5, 0.68359375, 0.84375, 0.95703125, 1]);
  envelope.stop(0.004);
  assert.deepEqual([...render(envelope, 2).values], [1, 0.84375]);
  const result = render(envelope, 4);
  assert.deepEqual([...result.values], [0.5, 0.15625, 0, 0]);
  assert(result.stopped);
});

test('stopping during fade-in starts from the current level, without a jump', () => {
  const envelope = new AudioEnvelope(1000);
  envelope.start(0.008);
  render(envelope, 4);
  envelope.stop(0.004);
  assert.deepEqual([...render(envelope, 2).values], [0.5, 0.421875]);
  envelope.stop(10);
  const result = render(envelope, 3);
  assert.deepEqual([...result.values], [0.25, 0.078125, 0]);
  assert(result.stopped);
  envelope.start(0);
  assert.equal(render(envelope, 1).values[0], 1);
});

test('independent tracks can fade in and out simultaneously', () => {
  const incoming = new AudioEnvelope(1000);
  const outgoing = new AudioEnvelope(1000);
  incoming.start(0.004);
  outgoing.start(0);
  outgoing.stop(0.004);
  const a = render(incoming, 5).values;
  const b = render(outgoing, 5).values;
  for (let i = 0; i < a.length; i++) assert.equal(a[i] + b[i], 1);
});
