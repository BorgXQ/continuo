import type { AnalysisResult } from '../shared/analysis';
import type { PlayMode } from './proceduralEngine';
import type { PreparedAudio } from './preparedAudio';

/** Streams ordinary playback; acquires decoded samples only for procedural mode. */
export class TrackPlayer {
  private readonly media = new Audio();
  private readonly source: MediaElementAudioSourceNode;
  private readonly envelope: GainNode;
  private audio?: PreparedAudio;
  private preparing?: Promise<PreparedAudio>;
  private disposed = false;
  private stopping = false;
  private started = false;
  private mode: PlayMode = 'once';
  private crossfade = 0.1;
  private timer?: ReturnType<typeof setTimeout>;
  private ramp = { start: 0, duration: 0, from: 1, to: 1 };

  constructor(
    private readonly context: AudioContext,
    destination: AudioNode,
    url: string,
    private readonly releaseUrl: () => void,
    private readonly prepare: () => Promise<PreparedAudio>,
    private readonly ended: () => void,
    private readonly failed: (error: unknown) => void,
    private readonly modeFailed: (error: unknown) => void,
  ) {
    this.media.crossOrigin = 'anonymous';
    this.media.preload = 'metadata';
    this.media.src = url;
    this.envelope = context.createGain();
    this.source = context.createMediaElementSource(this.media);
    this.source.connect(this.envelope).connect(destination);
    this.media.onended = () => { if (!this.audio) this.ended(); };
    this.media.onerror = () => {
      if (!this.audio && !this.disposed) this.failed(new Error(this.media.error?.message || 'Audio file unavailable or format unsupported.'));
    };
  }

  private fade(to: number, seconds: number): void {
    const now = this.context.currentTime;
    const { start, duration, from, to: previous } = this.ramp;
    const t = duration ? Math.max(0, Math.min(1, (now - start) / duration)) : 1;
    const level = from + (previous - from) * t * t * (3 - 2 * t);
    this.ramp = { start: now, duration: seconds, from: level, to };
    this.envelope.gain.cancelScheduledValues(now);
    this.envelope.gain.setValueAtTime(level, now);
    if (!seconds) { this.envelope.gain.setValueAtTime(to, now); return; }
    const curve = Float32Array.from({ length: 129 }, (_, i) => {
      const x = i / 128;
      return level + (to - level) * x * x * (3 - 2 * x);
    });
    this.envelope.gain.setValueCurveAtTime(curve, now, seconds);
  }

  async start(mode: PlayMode, analysis: AnalysisResult | undefined, fadeIn: number): Promise<void> {
    this.mode = mode;
    this.media.loop = mode === 'loop';
    this.ramp = { start: 0, duration: 0, from: 0, to: 0 };
    this.envelope.gain.value = 0;
    await this.media.play();
    if (this.disposed) return;
    this.started = true;
    this.fade(1, fadeIn);
    this.setMode(this.mode, analysis);
  }

  setMode(mode: PlayMode, analysis?: AnalysisResult): void {
    if (this.disposed || this.stopping) return;
    this.mode = mode;
    if (!this.started) { this.media.loop = mode === 'loop'; return; }
    if (this.audio) {
      if (analysis) this.audio.node.port.postMessage({ analysis });
      this.audio.node.port.postMessage({ mode });
    } else if (mode !== 'procedural') {
      this.media.loop = mode === 'loop';
    } else {
      void this.enableProcedural(analysis).catch(error => {
        if (!this.disposed && this.mode === 'procedural') {
          this.mode = this.media.loop ? 'loop' : 'once';
          this.modeFailed(error);
        }
      });
    }
  }

  private async enableProcedural(analysis?: AnalysisResult): Promise<void> {
    if (!analysis || analysis.startBar === null) throw new Error('No procedural loop is available.');
    this.preparing ??= this.prepare().catch(error => { this.preparing = undefined; throw error; });
    const audio = await this.preparing;
    if (this.disposed || this.stopping || this.mode !== 'procedural' || this.audio) return;
    this.audio = audio;
    audio.node.onprocessorerror = () => this.failed(new Error('Audio processing failed.'));
    audio.node.port.onmessage = event => {
      if (event.data.state === 'ended') this.ended();
      else if (event.data.state === 'failed') this.failed(new Error(String(event.data.message)));
    };
    audio.node.connect(this.envelope);
    audio.node.port.postMessage({ analysis, mode: 'procedural', crossfade: this.crossfade,
      seek: this.media.currentTime, play: true, fadeIn: 0 });
    this.media.pause();
    this.source.disconnect();
    // Once decoded, retain this engine through mode changes to avoid seeking gaps.
  }

  setCrossfade(seconds: number): void {
    this.crossfade = seconds;
    this.audio?.node.port.postMessage({ crossfade: seconds });
  }

  fadeOut(seconds: number): boolean {
    if (!this.started || !seconds || this.disposed) return false;
    this.stopping = true;
    this.fade(0, seconds);
    this.timer = setTimeout(this.ended, seconds * 1000);
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.timer);
    this.media.onended = this.media.onerror = null;
    this.media.pause();
    this.media.removeAttribute('src');
    this.media.load();
    this.source.disconnect();
    this.envelope.disconnect();
    void this.preparing?.then(audio => audio.dispose()).catch(() => {});
    this.releaseUrl();
  }
}
