import type { AnalysisResult } from './analysis';

export interface AudioSettings { crossfade: number; fadeIn: number; fadeOut: number; jumpProbability: number }
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { crossfade: 0.15, fadeIn: 0, fadeOut: 0, jumpProbability: 5 };

export function isJumpProbability(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 100;
}

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
  loadSettings: () => Promise<AudioSettings>;
  saveSettings: (settings: AudioSettings) => Promise<void>;
  flushSettings: (settings: AudioSettings) => string | null;
  load: () => Promise<(SavedTrack & { missing: boolean })[]>;
  save: (tracks: SavedTrack[]) => Promise<void>;
  move: (from: number, to: number) => Promise<void>;
  flush: (tracks: SavedTrack[]) => string | null;
  read: (id: string) => Promise<Uint8Array>;
}
