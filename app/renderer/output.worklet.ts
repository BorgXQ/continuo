declare const AudioWorkletProcessor: { new(): { port: MessagePort } };
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class OutputProcessor extends AudioWorkletProcessor {
  private remote = false;
  private pending = 0;
  private frame = new Int16Array(1920);
  private offset = 0;

  constructor() {
    super();
    this.port.onmessage = event => {
      if (typeof event.data.remote === 'boolean') { this.remote = event.data.remote; this.offset = 0; }
      if (event.data.ack) this.pending = Math.max(0, this.pending - 1);
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0];
    const output = outputs[0];
    for (let i = 0; i < output[0].length; i++) {
      for (let channel = 0; channel < 2; channel++) {
        const sample = input[channel]?.[i] ?? input[0]?.[i] ?? 0;
        output[channel][i] = this.remote ? 0 : sample;
        if (this.remote) this.frame[this.offset + channel] = Math.round(Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767));
      }
      if (this.remote) {
        this.offset += 2;
        if (this.offset === this.frame.length) {
          if (this.pending < 5) {
            this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
            this.frame = new Int16Array(1920);
            this.pending++;
          }
          this.offset = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('continuo-output', OutputProcessor);
export {};
