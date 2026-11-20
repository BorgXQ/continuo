import assert from 'node:assert/strict';
import test from 'node:test';
import { loopArcs, loopDescription } from '../app/renderer/loopMapData.ts';
import { ANALYSIS_VERSION, type AnalysisResult } from '../app/shared/analysis.ts';

const analysis: AnalysisResult = {
  analysisVersion: ANALYSIS_VERSION, bars: [[1, 3], [3, 5], [5, 7], [7, 9]],
  sampleRate: 44100, tempo: 120, transitions: 3, startBar: 0,
  routes: { 2: [{ target: 3, probability: .95 }, { target: 1, probability: .05 }],
    3: [{ target: 0, probability: 1 }, { target: 2, probability: 0 }] },
};

test('map reflects playback mode, not just the existence of analysis', () => {
  assert.deepEqual(loopArcs('once', 12, analysis), []);
  assert.deepEqual(loopArcs('loop', 12, analysis), [{ source: 12, target: 0 }]);
  assert.deepEqual(loopArcs('loop', 12), [{ source: 12, target: 0 }]);
  assert.deepEqual(loopArcs('procedural', 12), []);
  assert.deepEqual(loopArcs('procedural', 12, { ...analysis, startBar: null }), []);
  assert.deepEqual(loopArcs('loop', NaN), []);
});

test('procedural arcs use source ends and destination starts from playable alternatives', () => {
  const arcs = loopArcs('procedural', 12, analysis);
  assert.deepEqual(arcs, [{ source: 7, target: 3, sourceBar: 3, targetBar: 2 },
    { source: 9, target: 1, sourceBar: 4, targetBar: 1 }]);
  assert.equal(loopDescription(arcs[0]), 'Bar 3 → 2 · 00:07 → 00:03 · back 2 bars');
  assert.equal(loopDescription(loopArcs('loop', 12)[0]), 'Full-track loop · 00:12 → 00:00');
});
