import assert from 'node:assert/strict';
import test from 'node:test';
import { TrackPlayer } from '../app/renderer/trackPlayer.ts';

class Media {
  static last: Media;
  currentTime = 0;
  paused = true;
  loop = false;
  constructor() { Media.last = this; }
  async play() { this.paused = false; }
  pause() { this.paused = true; }
  removeAttribute() {}
  load() {}
}
const node = () => ({ connect() { return this; }, disconnect() {}, gain: {
  value: 1, cancelScheduledValues() {}, setValueAtTime() {}, setValueCurveAtTime() {},
} });

test('ordinary streaming never decodes; procedural handoff preserves position and disposes buffers', async () => {
  Object.assign(globalThis, { Audio: Media });
  const ctx = { currentTime: 0, createGain: node, createMediaElementSource: node };
  let prepared = 0, disposed = 0, released = 0;
  let resolve!: (value: any) => void;
  const messages: any[] = [];
  const audio = { node: { ...node(), port: { postMessage: (message: any) => messages.push(message) } }, dispose() { disposed++; } };
  const player = new TrackPlayer(ctx as any, node() as any, 'blob:test', () => { released++; },
    () => { prepared++; return new Promise(done => { resolve = done; }); }, () => {}, assert.fail, assert.fail);
  await player.start('once', undefined, 0);
  player.setMode('loop');
  assert.equal(prepared, 0);
  assert(Media.last.loop);
  const analysis = { startBar: 0 } as any;
  player.setMode('procedural', analysis);
  assert(!Media.last.paused);
  Media.last.currentTime = 42;
  resolve(audio);
  await new Promise(setImmediate);
  assert(Media.last.paused);
  assert.equal(messages[0].seek, 42);
  player.setMode('once');
  assert.equal(messages.at(-1).mode, 'once');
  assert.equal(prepared, 1);
  player.dispose();
  player.dispose();
  await new Promise(setImmediate);
  assert.equal(disposed, 1);
  assert.equal(released, 1);
});

test('stopping during preparation prevents late activation', async () => {
  Object.assign(globalThis, { Audio: Media });
  let resolve!: (value: any) => void;
  let disposed = false;
  const player = new TrackPlayer({ currentTime: 0, createGain: node, createMediaElementSource: node } as any,
    node() as any, 'blob:test', () => {}, () => new Promise(done => { resolve = done; }), () => {}, assert.fail, assert.fail);
  await player.start('procedural', { startBar: 0 } as any, 0);
  player.dispose();
  resolve({ dispose() { disposed = true; }, node: { connect: assert.fail } });
  await new Promise(setImmediate);
  assert(disposed);
});
