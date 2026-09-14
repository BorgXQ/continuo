import type { AnalysisResult } from '../shared/analysis';

export type PlayMode = 'once' | 'loop' | 'procedural';

export class ProceduralEngine {
  private position = 0;
  private bounds: [number, number][] = [];
  private bar = -1;
  private next: number | null = null;
  private mode: PlayMode;
  private pendingMode: PlayMode | null = null;
  private fading = false;
  private pendingAnalysis?: AnalysisResult;
  private planUntil = 0;
  private readonly fade: number;
  ended = false;

  constructor(
    private readonly channels: Float32Array[],
    private readonly sampleRate: number,
    private analysis?: AnalysisResult,
    private readonly random: () => number = Math.random,
  ) {
    this.fade = Math.round(sampleRate * 0.01);
    this.mode = analysis ? 'procedural' : 'once';
    if (analysis) {
      if (analysis.startBar === null) throw new Error('No non-terminating route exists.');
      this.setAnalysis(analysis);
      this.position = this.bounds[analysis.startBar][0];
    }
  }

  setAnalysis(analysis: AnalysisResult): void {
    if (this.fading) { this.pendingAnalysis = analysis; return; }
    this.analysis = analysis;
    this.bounds = analysis.bars.map(([start, end]) => [
      Math.max(0, Math.min(this.channels[0].length, Math.round(start * this.sampleRate))),
      Math.max(0, Math.min(this.channels[0].length, Math.round(end * this.sampleRate))),
    ]);
    if (this.bounds.some(([start, end]) => end <= start)) throw new Error('Invalid decoded bar boundaries.');
    this.bar = -1;
    this.next = null;
    this.planUntil = 0;
  }

  setMode(mode: PlayMode): void {
    if (mode === 'procedural' && this.analysis?.startBar == null) throw new Error('No non-terminating route exists.');
    // Complete any audible overlap before changing continuation rules.
    if (this.fading) { this.pendingMode = mode; return; }
    this.mode = mode;
    this.bar = -1;
    this.next = null;
    this.planUntil = 0;
  }

  reset(): void {
    this.position = 0;
    this.bar = -1;
    this.next = null;
    this.pendingMode = null;
    this.fading = false;
    if (this.pendingAnalysis) {
      const analysis = this.pendingAnalysis;
      this.pendingAnalysis = undefined;
      this.setAnalysis(analysis);
    }
    this.planUntil = 0;
    this.ended = false;
  }

  get currentSample(): number { return this.position; }

  private choose(bar: number): number | null {
    const routes = this.analysis?.routes[bar];
    if (!routes?.length) return null;
    let value = this.random();
    for (const route of routes) {
      value -= route.probability;
      if (value < 0) return route.target;
    }
    return routes[routes.length - 1].target;
  }

  render(output: Float32Array[]): void {
    for (let frame = 0; frame < output[0].length; frame++) {
      if (this.position >= this.channels[0].length) {
        if (this.mode === 'once') this.ended = true;
        else { this.position = 0; this.planUntil = 0; }
      }
      if (this.ended) {
        for (const channel of output) channel.fill(0, frame);
        return;
      }
      if (this.mode === 'procedural' && this.position >= this.planUntil) {
        this.bar = this.bounds.findIndex(([start, end]) => this.position >= start && this.position < end);
        this.planUntil = this.bar >= 0 ? this.bounds[this.bar][1]
          : this.bounds.find(([start]) => start > this.position)?.[0] ?? this.channels[0].length;
        this.next = this.choose(this.bar);
        // Do not enter a newly selected crossfade halfway through its overlap.
        if (this.bar >= 0 && this.position > this.bounds[this.bar][1] - this.fade) this.next = null;
      }
      const end = this.bar >= 0 ? this.bounds[this.bar][1] : 0;
      const target = this.next === null ? null : this.bounds[this.next];
      const overlap = target && this.next !== this.bar + 1
        ? Math.min(this.fade, end - this.bounds[this.bar][0], target[1] - target[0]) : 0;
      const offset = this.position - (end - overlap);
      this.fading = overlap > 0 && offset >= 0;
      const angle = overlap <= 1 ? 0 : offset / (overlap - 1) * Math.PI / 2;
      for (let channel = 0; channel < output.length; channel++) {
        const audio = this.channels[channel];
        output[channel][frame] = this.fading
          ? audio[this.position] * Math.cos(angle) + audio[target![0] + offset] * Math.sin(angle)
          : audio[this.position];
      }
      this.position++;
      if (this.fading && this.position >= end) {
        this.position = target![0] + overlap;
        this.bar = -1;
        this.next = null;
        this.planUntil = 0;
        this.fading = false;
        if (this.pendingAnalysis) {
          const analysis = this.pendingAnalysis;
          this.pendingAnalysis = undefined;
          this.setAnalysis(analysis);
        }
        if (this.pendingMode) {
          const mode = this.pendingMode;
          this.pendingMode = null;
          this.setMode(mode);
        }
      }
    }
  }
}
