export interface AnalysisResult {
  bars: [number, number][];
  sampleRate: number;
  tempo: number;
  transitions: number;
  routes: Record<number, { target: number; probability: number }[]>;
  startBar: number | null;
}

export type AnalysisEvent =
  | { id: string; state: 'queued' | 'running'; progress: number; stage: string }
  | { id: string; state: 'complete'; result: AnalysisResult }
  | { id: string; state: 'cancelled' }
  | { id: string; state: 'failed'; message: string };

export interface AnalysisBridge {
  filePath: (file: File) => string;
  start: (id: string, path: string, duration: number) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  onUpdate: (listener: (event: AnalysisEvent) => void) => () => void;
}
export const MAX_ANALYSIS_SECONDS = 10 * 60;

export function validateAnalysisDuration(duration: unknown): asserts duration is number {
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
    throw new Error('Cannot determine the audio duration. Analysis requires a readable duration of 10 minutes or less.');
  }
  if (duration > MAX_ANALYSIS_SECONDS) {
    const seconds = Math.ceil(duration);
    const hours = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
    const remainder = String(seconds % 60).padStart(2, '0');
    throw new Error(`Error: Track length cannot be over 10 minutes (${hours}h ${minutes}m ${remainder}s).`);
  }
}
