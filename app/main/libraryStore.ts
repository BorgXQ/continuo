import { DatabaseSync } from 'node:sqlite';
import { isAbsolute } from 'node:path';
import type { AnalysisResult } from '../shared/analysis';
import type { AudioSettings, SavedTrack } from '../shared/library';

// Natural edges follow consecutive safe bars and need not be stored.
function encode(result: AnalysisResult): string {
  const { routes, ...metadata } = result;
  return JSON.stringify({
    ...metadata, safeBars: Object.keys(routes).map(Number),
    alternatives: Object.entries(routes).flatMap(([source, edges]) => edges
      .filter(edge => edge.target !== Number(source) + 1)
      .map(edge => [Number(source), edge.target, edge.probability])),
  });
}

function decode(value: string): AnalysisResult {
  const { safeBars, alternatives, ...metadata } = JSON.parse(value) as Omit<AnalysisResult, 'routes'> & {
    safeBars: number[]; alternatives: [number, number, number][];
  };
  const routes: AnalysisResult['routes'] = Object.fromEntries(safeBars.map(bar => [bar, []]));
  for (const [source, target, probability] of alternatives) routes[source].push({ target, probability });
  for (const bar of safeBars) {
    if (routes[bar + 1]) routes[bar].unshift({ target: bar + 1, probability: routes[bar].length ? 0.95 : 1 });
  }
  return { ...metadata, routes };
}

export class LibraryStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    const version = this.db.prepare('PRAGMA user_version').get()!.user_version;
    if (version !== 0 && version !== 1 && version !== 2) { this.db.close(); throw new Error('Unsupported library database version.'); }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY, slot INTEGER NOT NULL UNIQUE,
        name TEXT NOT NULL, path TEXT NOT NULL, mode TEXT NOT NULL,
        volume REAL NOT NULL, shortcut TEXT, size INTEGER NOT NULL,
        modified INTEGER NOT NULL, analysis TEXT
      );
      CREATE TABLE IF NOT EXISTS audio_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        fade_in REAL NOT NULL CHECK (fade_in >= 0),
        fade_out REAL NOT NULL CHECK (fade_out >= 0)
      );
      INSERT OR IGNORE INTO audio_settings VALUES (1, 0, 0);
      PRAGMA user_version = 2;
    `);
  }

  load(): SavedTrack[] {
    return this.db.prepare('SELECT * FROM tracks ORDER BY slot').all().map(row => ({
      id: String(row.id), slot: Number(row.slot), name: String(row.name), path: String(row.path),
      mode: row.mode as SavedTrack['mode'], volume: Number(row.volume),
      shortcut: row.shortcut === null ? null : String(row.shortcut),
      size: Number(row.size), modified: Number(row.modified),
      analysis: row.analysis === null ? undefined : decode(String(row.analysis)),
    }));
  }

  loadSettings(): AudioSettings {
    const row = this.db.prepare('SELECT fade_in, fade_out FROM audio_settings WHERE id = 1').get()!;
    return { fadeIn: Number(row.fade_in), fadeOut: Number(row.fade_out) };
  }

  saveSettings(settings: AudioSettings): void {
    if (!settings || ![settings.fadeIn, settings.fadeOut].every(value => Number.isFinite(value) && value >= 0)) {
      throw new Error('Fade durations must be finite, non-negative numbers.');
    }
    this.db.prepare('UPDATE audio_settings SET fade_in = ?, fade_out = ? WHERE id = 1').run(settings.fadeIn, settings.fadeOut);
  }

  file(id: string): { path: string; size: number; modified: number } {
    const row = this.db.prepare('SELECT path, size, modified FROM tracks WHERE id = ?').get(id);
    if (!row) throw new Error('Track is not in the library.');
    return { path: String(row.path), size: Number(row.size), modified: Number(row.modified) };
  }

  save(tracks: SavedTrack[]): void {
    if (!Array.isArray(tracks) || tracks.length > 10000) throw new Error('Invalid library.');
    const ids = new Set<string>();
    const slots = new Set<number>();
    for (const track of tracks) {
      if (!track || typeof track.id !== 'string' || !/^[\w-]{1,80}$/.test(track.id)
        || typeof track.name !== 'string' || !track.name.trim() || track.name.length > 1024
        || typeof track.path !== 'string' || !isAbsolute(track.path) || !/\.mp3$/i.test(track.path)
        || !['once', 'loop', 'procedural'].includes(track.mode)
        || !Number.isFinite(track.volume) || track.volume < 0 || track.volume > 150
        || !Number.isSafeInteger(track.slot) || track.slot < 0 || track.slot > 100000
        || !Number.isSafeInteger(track.size) || track.size < 0
        || !Number.isSafeInteger(track.modified) || track.modified < 0
        || (track.shortcut !== null && (typeof track.shortcut !== 'string' || track.shortcut.length > 80))
        || ids.has(track.id) || slots.has(track.slot)) throw new Error('Invalid track metadata.');
      ids.add(track.id);
      slots.add(track.slot);
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec('DELETE FROM tracks');
      const insert = this.db.prepare('INSERT INTO tracks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      for (const track of tracks) insert.run(track.id, track.slot, track.name, track.path, track.mode,
        track.volume, track.shortcut, track.size, track.modified, track.analysis ? encode(track.analysis) : null);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  move(from: number, to: number): void {
    if (![from, to].every(slot => Number.isSafeInteger(slot) && slot >= 0 && slot <= 100000)) throw new Error('Invalid track position.');
    if (from === to) return;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const update = this.db.prepare('UPDATE tracks SET slot = ? WHERE slot = ?');
      update.run(-1, from);
      update.run(from, to);
      update.run(to, -1);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  close(): void { this.db.close(); }
}
