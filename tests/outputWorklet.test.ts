import assert from 'node:assert/strict';
import test from 'node:test';

test('output passes local stereo, captures clipped 20 ms PCM, and bounds pending messages', async () => {
  const packets: ArrayBuffer[] = [];
  let Processor: any;
  Object.assign(globalThis, {
    AudioWorkletProcessor: class { port = { onmessage: (_event: any) => {}, postMessage: (value: ArrayBuffer) => packets.push(value.slice(0)) }; },
    registerProcessor: (_name: string, value: any) => { Processor = value; },
  });
  await import('../app/renderer/output.worklet.ts');
  const processor = new Processor();
  const input = [new Float32Array(128).fill(0.5), new Float32Array(128).fill(-2)];
  const output = [new Float32Array(128), new Float32Array(128)];
  processor.process([input], [output]);
  assert.equal(output[0][0], 0.5);
  assert.equal(output[1][0], -2);
  assert.equal(packets.length, 0);
  processor.port.onmessage({ data: { remote: true } });
  for (let i = 0; i < 100; i++) processor.process([input], [output]);
  assert.equal(output[0][0], 0);
  assert.equal(packets.length, 5);
  assert.equal(packets[0].byteLength, 3840);
  assert.deepEqual([...new Int16Array(packets[0]).slice(0, 2)], [16384, -32768]);
  processor.port.onmessage({ data: { ack: true } });
  for (let i = 0; i < 8; i++) processor.process([input], [output]);
  assert.equal(packets.length, 6);
  processor.port.onmessage({ data: { remote: false } });
  processor.process([input], [output]);
  assert.equal(output[0][0], 0.5);
});
