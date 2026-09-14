import type { AnalysisResult } from '../shared/analysis';

export class ProceduralEngine {
  private bar: number;
  private next: number;
  private position = 0;
  private readonly bounds: [number, number][];
  private readonly fade: number;

  constructor(
    private readonly channels: Float32Array[],
    sampleRate: number,
    private readonly analysis: AnalysisResult,
    private readonly random: () => number = Math.random,
  ) {
    if (analysis.startBar === null) throw new Error('No non-terminating route exists.');
    this.bounds = analysis.bars.map(([start, end]) => [
      Math.max(0, Math.min(channels[0].length, Math.round(start * sampleRate))),
      Math.max(0, Math.min(channels[0].length, Math.round(end * sampleRate))),
    ]);
    if (this.bounds.some(([start, end]) => end <= start)) throw new Error('Invalid decoded bar boundaries.');
    this.fade = Math.round(sampleRate * 0.01);
    this.bar = analysis.startBar;
    this.next = this.choose(this.bar);
  }

  private choose(bar: number): number {
    const routes = this.analysis.routes[bar];
    if (!routes?.length) throw new Error('No safe outgoing transition.');
    let value = this.random();
    for (const route of routes) {
      value -= route.probability;
      if (value < 0) return route.target;
    }
    return routes[routes.length - 1].target;
  }

  render(output: Float32Array[]): void {
    for (let frame = 0; frame < output[0].length; frame++) {
      let [start, end] = this.bounds[this.bar];
      if (this.position >= end - start) {
        this.bar = this.next;
        this.next = this.choose(this.bar);
        this.position = 0;
        [start, end] = this.bounds[this.bar];
      }
      const [nextStart, nextEnd] = this.bounds[this.next];
      const overlap = this.next === this.bar + 1 ? 0 : Math.min(this.fade, end - start, nextEnd - nextStart);
      const fadePosition = this.position - (end - start - overlap);
      const fading = overlap > 0 && fadePosition >= 0;
      const angle = overlap <= 1 ? 0 : fadePosition / (overlap - 1) * Math.PI / 2;
      for (let channel = 0; channel < output.length; channel++) {
        const audio = this.channels[channel];
        output[channel][frame] = fading
          ? audio[start + this.position] * Math.cos(angle) + audio[nextStart + fadePosition] * Math.sin(angle)
          : audio[start + this.position];
      }
      this.position++;
      if (fading && this.position >= end - start) {
        this.bar = this.next;
        this.next = this.choose(this.bar);
        this.position = overlap;
      }
    }
  }
}
