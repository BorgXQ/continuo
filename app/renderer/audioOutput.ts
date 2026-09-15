import workletUrl from './output.worklet.ts?worker&url';

export class AudioOutput {
  readonly input: GainNode;
  private node?: AudioWorkletNode;
  private channelId: string | null = null;
  readonly ready: Promise<void>;

  constructor(context: AudioContext) {
    this.input = context.createGain();
    this.input.channelCount = 2;
    this.input.channelCountMode = 'explicit';
    this.ready = context.audioWorklet.addModule(workletUrl).then(() => {
      this.node = new AudioWorkletNode(context, 'continuo-output', { outputChannelCount: [2] });
      this.node.port.onmessage = event => {
        const channelId = this.channelId;
        const done = () => this.node?.port.postMessage({ ack: true });
        if (!channelId || !window.discord) { done(); return; }
        void window.discord.sendAudio(channelId, new Uint8Array(event.data)).catch(() => this.select(null)).finally(done);
      };
      this.input.connect(this.node).connect(context.destination);
      this.select(this.channelId);
    });
  }

  select(channelId: string | null): void {
    this.channelId = channelId;
    this.node?.port.postMessage({ remote: channelId !== null });
  }
}
