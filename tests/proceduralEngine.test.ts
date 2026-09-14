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

test('artificial edges use a 10 ms equal-power crossfade and consume the destination head', () => {
  const audio = Float32Array.from({ length: 60 }, (_, i) => i);
  const engine = new ProceduralEngine([audio, audio.map(value => -value)], 1000, graph({
    0: [{ target: 2, probability: 1 }],
    2: [{ target: 0, probability: 1 }],
  }));
  const output = [new Float32Array(21), new Float32Array(21)];
  engine.render(output);
  for (let i = 0; i < 21; i++) {
    const angle = (i - 10) / 9 * Math.PI / 2;
    const expected = i < 10 ? i : i < 20 ? i * Math.cos(angle) + (i + 30) * Math.sin(angle) : 50;
    assert(Math.abs(output[0][i] - expected) < 0.00001);
    assert.equal(output[1][i], -output[0][i]);
  }
});

test('route choice honors probabilities supplied by the Python navigator', () => {
  const audio = Float32Array.from({ length: 60 }, (_, i) => i);
  const routes = {
    0: [{ target: 1, probability: 0.95 }, { target: 2, probability: 0.05 }],
    1: [{ target: 2, probability: 1 }],
    2: [{ target: 0, probability: 1 }],
  };
  for (const [random, expected] of [[0.5, 20], [0.99, 50]]) {
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
