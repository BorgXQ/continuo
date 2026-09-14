import type { AnalysisResult } from '../shared/analysis';
import workletUrl from './procedural.worklet.ts?worker&url';

export interface PreparedAudio {
  node: AudioWorkletNode;
  analysis?: AnalysisResult;
  dispose: () => void;
}

export function loadAudioWorklet(context: AudioContext): Promise<void> {
  return context.audioWorklet.addModule(workletUrl);
}

export async function prepareAudio(context: AudioContext, file: File, module: Promise<void>): Promise<PreparedAudio> {
  const [buffer] = await Promise.all([file.arrayBuffer().then(data => context.decodeAudioData(data)), module]);
  if (context.state === 'closed') throw new Error('Audio context is closed.');
  const node = new AudioWorkletNode(context, 'procedural-player', {
    numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [buffer.numberOfChannels],
  });
  const dispose = () => {
    node.port.postMessage({ dispose: true });
    node.port.close();
    node.disconnect();
  };
  try {
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index).slice());
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        context.removeEventListener('statechange', closed);
        if (error) reject(error);
        else resolve();
      };
      const closed = () => { if (context.state === 'closed') finish(new Error('Audio context is closed.')); };
      context.addEventListener('statechange', closed);
      node.onprocessorerror = () => finish(new Error('Audio processor could not start.'));
      node.port.onmessage = event => {
        if (event.data.state === 'ready') finish();
        else finish(new Error(event.data.message));
      };
      node.port.postMessage({ channels }, channels.map(channel => channel.buffer));
    });
    node.onprocessorerror = null;
    node.port.onmessage = null;
    return { node, dispose };
  } catch (error) { dispose(); throw error; }
}
