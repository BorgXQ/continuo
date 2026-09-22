import assert from 'node:assert/strict';
import test from 'node:test';
import { ProceduralEngine } from '../app/renderer/proceduralEngine.ts';
import type { AnalysisResult } from '../app/shared/analysis.ts';

function graph(routes: AnalysisResult['routes'], startBar: number | null = 0): AnalysisResult {
  return {
    bars: [[0, 0.02], [0.02, 0.04], [0.04, 0.06]],
    sampleRate: 1000, tempo: 120, transitions: 1, routes, startBar,
  };
}

test('natural edges preserve consecutive samples across render blocks', () => {
  const audio = Float32Array.from({ length: 60 }, (_, i) => i);
  const engine = new ProceduralEngine([audio], 1000, graph({
    0: [{ target: 1, probability: 1 }],
    1: [{ target: 2, probability: 1 }],
    2: [{ target: 0, probability: 1 }],
  }));
  const first = new Float32Array(17);
  const second = new Float32Array(28);
  engine.render([first]);
  engine.render([second]);
  assert.deepEqual([...first, ...second], [...audio.slice(0, 45)]);
});

test('artificial edges blend destination pre-roll and preserve the full destination head', () => {
  const audio = Float32Array.from({ length: 60 }, (_, i) => i);
  const engine = new ProceduralEngine([audio, audio.map(value => -value)], 1000, graph({
    0: [{ target: 2, probability: 1 }],
    2: [{ target: 0, probability: 1 }],
  }));
  const output = [new Float32Array(21), new Float32Array(21)];
  engine.setCrossfade(0.01);
  engine.render(output);
  for (let i = 0; i < 21; i++) {
    const angle = (i - 10) / 9 * Math.PI / 2;
    const expected = i < 10 ? i : i < 20 ? i * Math.cos(angle) + (i + 20) * Math.sin(angle) : 40;
    assert(Math.abs(output[0][i] - expected) < 0.00001);
    assert.equal(output[1][i], -output[0][i]);
  }
});

test('default crossfade is 100 ms and updates do not alter a planned overlap', () => {
  const audio = Float32Array.from({ length: 1000 }, (_, i) => i);
  const result = { ...graph({ 0: [{ target: 2, probability: 1 }] }), bars: [[0, 0.3], [0.3, 0.6], [0.6, 0.9]] as [number, number][] };
  const engine = new ProceduralEngine([audio], 1000, result);
  engine.render([new Float32Array(250)]);
  engine.setCrossfade(0);
  engine.render([new Float32Array(50)]);
  assert.equal(engine.currentSample, 600);
});

test('zero crossfade still takes alternative edges without consuming the destination', () => {
  const audio = Float32Array.from({ length: 60 }, (_, i) => i);
  const engine = new ProceduralEngine([audio], 1000, graph({ 0: [{ target: 2, probability: 1 }] }));
  engine.setCrossfade(0);
  const output = new Float32Array(21);
  engine.render([output]);
  assert.deepEqual([...output], [...audio.slice(0, 20), 40]);
  for (const value of [-1, NaN, Infinity]) assert.throws(() => engine.setCrossfade(value));
});

test('route choice honors probabilities supplied by the Python navigator', () => {
  const audio = Float32Array.from({ length: 60 }, (_, i) => i);
  const routes = {
    0: [{ target: 1, probability: 0.95 }, { target: 2, probability: 0.05 }],
    1: [{ target: 2, probability: 1 }],
    2: [{ target: 0, probability: 1 }],
  };
  for (const [random, expected] of [[0.5, 20], [0.99, 40]]) {
    const engine = new ProceduralEngine([audio], 1000, graph(routes), () => random);
    const output = new Float32Array(21);
    engine.render([output]);
    assert.equal(output[20], expected);
  }
});

test('rejects graphs without a safe start or playable bar boundaries', () => {
  assert.throws(() => new ProceduralEngine([new Float32Array(60)], 1000, graph({}, null)), /non-terminating/);
  assert.throws(() => new ProceduralEngine([new Float32Array(0)], 1000, graph({})), /boundaries/);
});

test('switching all modes preserves the current sample without resetting playback', () => {
  const audio = Float32Array.from({ length: 60 }, (_, i) => i);
  const engine = new ProceduralEngine([audio], 1000);
  engine.setAnalysis(graph({ 0: [{ target: 2, probability: 1 }], 2: [{ target: 0, probability: 1 }] }));
  for (const mode of ['once', 'loop', 'procedural', 'once', 'loop', 'procedural'] as const) {
    const position = engine.currentSample;
    engine.setMode(mode);
    assert.equal(engine.currentSample, position);
    const output = new Float32Array(1);
    engine.render([output]);
    assert.equal(output[0], position);
  }
});

test('leaving procedural mode mid-crossfade finishes the overlap, then continues from the destination', () => {
  const audio = Float32Array.from({ length: 60 }, (_, i) => i);
  const result = graph({ 0: [{ target: 2, probability: 1 }], 2: [{ target: 0, probability: 1 }] });
  const engine = new ProceduralEngine([audio], 1000, result);
  const reference = new ProceduralEngine([audio], 1000, result);
  engine.render([new Float32Array(15)]);
  reference.render([new Float32Array(15)]);
  engine.setMode('once');
  const output = new Float32Array(5);
  const expected = new Float32Array(5);
  engine.render([output]);
  reference.render([expected]);
  assert.deepEqual(output, expected);
  const tail = new Float32Array(21);
  engine.render([tail]);
  assert.deepEqual([...tail], [...audio.slice(40), 0]);
  assert(engine.ended);
});

test('entering procedural mode during the fade window waits for the next bar', () => {
  const audio = Float32Array.from({ length: 60 }, (_, i) => i);
  const engine = new ProceduralEngine([audio], 1000);
  engine.setAnalysis(graph({ 0: [{ target: 2, probability: 1 }], 2: [{ target: 0, probability: 1 }] }));
  engine.render([new Float32Array(15)]);
  engine.setMode('procedural');
  const output = new Float32Array(10);
  engine.render([output]);
  assert.deepEqual(output, audio.slice(15, 25));
});

test('one-time ends, normal loop wraps, and stop resets the cursor for replay', () => {
  const audio = Float32Array.from({ length: 60 }, (_, i) => i + 1);
  const engine = new ProceduralEngine([audio], 1000);
  const output = new Float32Array(65);
  engine.render([output]);
  assert.deepEqual([...output], [...audio, 0, 0, 0, 0, 0]);
  engine.reset();
  engine.setMode('loop');
  engine.render([output]);
  assert.deepEqual([...output], [...audio, ...audio.slice(0, 5)]);
  assert(!engine.ended);
});

test('switching in an unsafe tail preserves it and finds the graph after wrapping', () => {
  const audio = Float32Array.from({ length: 60 }, (_, i) => i);
  const engine = new ProceduralEngine([audio], 1000);
  engine.setAnalysis(graph({ 0: [{ target: 0, probability: 1 }] }));
  engine.render([new Float32Array(45)]);
  engine.setMode('procedural');
  const output = new Float32Array(25);
  engine.render([output]);
  assert.deepEqual([...output], [...audio.slice(45), ...audio.slice(0, 10)]);
  engine.render([new Float32Array(10)]);
  assert.equal(engine.currentSample, 0);
});

test('replacing analysis during an overlap does not interrupt the crossfade', () => {
  const audio = Float32Array.from({ length: 60 }, (_, i) => i);
  const result = graph({ 0: [{ target: 2, probability: 1 }], 2: [{ target: 0, probability: 1 }] });
  const engine = new ProceduralEngine([audio], 1000, result);
  const reference = new ProceduralEngine([audio], 1000, result);
  engine.render([new Float32Array(15)]);
  reference.render([new Float32Array(15)]);
  engine.setAnalysis(graph({ 0: [{ target: 0, probability: 1 }], 2: [{ target: 2, probability: 1 }] }));
  engine.setMode('loop');
  const output = new Float32Array(5);
  const expected = new Float32Array(5);
  engine.render([output]);
  reference.render([expected]);
  assert.deepEqual(output, expected);
  assert.equal(engine.currentSample, 40);
});

test('repeated jumps preserve downbeat spacing across render blocks, including a file-start target', () => {
  const audio = new Float32Array(60);
  audio[0] = audio[40] = 1;
  const engine = new ProceduralEngine([audio], 1000, graph({
    0: [{ target: 2, probability: 1 }], 2: [{ target: 0, probability: 1 }],
  }));
  const samples: number[] = [];
  for (const size of [13, 8, 7, 19, 34]) {
    const block = new Float32Array(size);
    engine.render([block]);
    samples.push(...block);
  }
  assert.deepEqual(samples.flatMap((value, index) => value === 1 ? [index] : []), [0, 20, 40, 60, 80]);
  assert(samples.every(Number.isFinite));
});

test('short pre-roll limits the overlap without reading negative samples', () => {
  const audio = Float32Array.from({ length: 43 }, (_, i) => i + 1);
  const result = { ...graph({ 1: [{ target: 0, probability: 1 }] }, 1), bars: [[0.003, 0.023], [0.023, 0.043]] as [number, number][] };
  const engine = new ProceduralEngine([audio], 1000, result);
  const output = new Float32Array(21);
  engine.render([output]);
  assert.deepEqual([...output.slice(0, 17)], [...audio.slice(23, 40)]);
  assert(Math.abs(output[18] - (42 + 2) * Math.SQRT1_2) < 0.00001);
  assert(Math.abs(output[19] - 3) < 0.00001);
  assert.equal(output[20], 4);
});
