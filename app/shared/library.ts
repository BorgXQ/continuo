import type { AnalysisResult } from './analysis';

export interface SavedTrack {
  id: string;
  slot: number;
  name: string;
  path: string;
  mode: 'once' | 'loop' | 'procedural';
  volume: number;
  shortcut: string | null;
  size: number;
  modified: number;
  analysis?: AnalysisResult;
}

export interface LibraryBridge {
  load: () => Promise<(SavedTrack & { missing: boolean })[]>;
  save: (tracks: SavedTrack[]) => Promise<void>;
  flush: (tracks: SavedTrack[]) => string | null;
  read: (id: string) => Promise<Uint8Array>;
}
