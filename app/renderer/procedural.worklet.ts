import { ProceduralEngine } from './proceduralEngine';

declare const sampleRate: number;
declare class AudioWorkletProcessor { readonly port: MessagePort }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class ProceduralProcessor extends AudioWorkletProcessor {
  private engine?: ProceduralEngine;
  private playing = false;
  private disposed = false;
  private token = '';

  constructor() {
    super();
    this.port.onmessage = event => {
      try {
        const message = event.data;
        if (message.dispose) { this.engine = undefined; this.disposed = true; return; }
        if (message.channels) {
          this.engine = new ProceduralEngine(message.channels, sampleRate);
          this.port.postMessage({ state: 'ready' });
        }
        if (message.stop) { this.playing = false; this.engine?.reset(); }
        if (message.analysis) this.engine?.setAnalysis(message.analysis);
        if (message.mode) this.engine?.setMode(message.mode);
        if (message.play) { this.token = message.token; this.playing = true; }
      } catch (error) {
        this.playing = false;
        this.port.postMessage({ state: 'failed', message: String(error) });
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    try {
      if (this.playing) {
        this.engine?.render(outputs[0]);
        if (this.engine?.ended) {
          this.playing = false;
          this.engine.reset();
          this.port.postMessage({ state: 'ended', token: this.token });
        }
      }
    } catch (error) {
      this.playing = false;
      outputs[0].forEach(channel => channel.fill(0));
      this.port.postMessage({ state: 'failed', message: String(error) });
    }
    return !this.disposed;
  }
}

registerProcessor('procedural-player', ProceduralProcessor);
