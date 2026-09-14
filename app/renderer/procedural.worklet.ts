import { ProceduralEngine } from './proceduralEngine';

declare const sampleRate: number;
declare class AudioWorkletProcessor { readonly port: MessagePort }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class ProceduralProcessor extends AudioWorkletProcessor {
  private engine?: ProceduralEngine;
  private failed = false;

  constructor() {
    super();
    this.port.onmessage = event => {
      if (event.data.stop) {
        this.engine = undefined;
        this.failed = true;
        return;
      }
      try {
        this.engine = new ProceduralEngine(event.data.channels, sampleRate, event.data.analysis);
        this.port.postMessage({ state: 'ready' });
      } catch (error) {
        this.failed = true;
        this.port.postMessage({ state: 'failed', message: String(error) });
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    try { this.engine?.render(outputs[0]); }
    catch (error) {
      this.failed = true;
      outputs[0].forEach(channel => channel.fill(0));
      this.port.postMessage({ state: 'failed', message: String(error) });
    }
    return !this.failed;
  }
}

registerProcessor('procedural-player', ProceduralProcessor);
