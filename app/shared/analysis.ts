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
  start: (id: string, path: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  onUpdate: (listener: (event: AnalysisEvent) => void) => () => void;
}
