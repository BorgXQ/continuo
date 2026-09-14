export class AudioEnvelope {
  private level = 1;
  private target = 1;
  private remaining = 0;
  private initial = 1;
  private duration = 0;
  private stopping = false;

  constructor(private readonly sampleRate: number) {}

  start(seconds: number): void {
    this.stopping = false;
    this.level = seconds > 0 ? 0 : 1;
    this.ramp(1, seconds);
  }

  stop(seconds: number): void {
    if (this.stopping) return;
    this.stopping = true;
    this.ramp(0, seconds);
  }

  private ramp(target: number, seconds: number): void {
    this.target = target;
    this.remaining = Math.max(0, Math.round(seconds * this.sampleRate));
    this.initial = this.level;
    this.duration = this.remaining;
    if (!this.remaining) this.level = target;
  }

  process(channels: Float32Array[]): boolean {
    for (let frame = 0; frame < channels[0].length; frame++) {
      for (const channel of channels) channel[frame] *= this.level;
      if (this.remaining > 0) {
        this.remaining--;
        const t = 1 - this.remaining / this.duration;
        const eased = t * t * (3 - 2 * t); // Smoothstep has zero slope at both ends.
        this.level = this.remaining ? this.initial + (this.target - this.initial) * eased : this.target;
      }
    }
    return this.stopping && this.remaining === 0;
  }
}
