import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { LibraryStore } from '../app/main/libraryStore.ts';
import type { SavedTrack } from '../app/shared/library.ts';

function track(id = 'track1', slot = 0): SavedTrack {
  return { id, slot, name: 'Track', path: join(tmpdir(), 'song.mp3'), mode: 'procedural', volume: 125,
    shortcut: 'KeyA', size: 1234, modified: 123456,
    analysis: { bars: [[0, 2], [2, 4], [4, 6]], sampleRate: 44100, tempo: 120, transitions: 2, startBar: 0,
      routes: { 0: [{ target: 1, probability: 0.95 }, { target: 2, probability: 0.05 }],
        1: [{ target: 2, probability: 1 }], 2: [{ target: 0, probability: 1 }] } } };
}

test('SQLite survives reopen and reconstructs natural edges without audio storage', () => {
  const directory = mkdtempSync(join(tmpdir(), 'infiticum-db-'));
  const path = join(directory, 'library.sqlite');
  try {
    const store = new LibraryStore(path);
    assert.deepEqual(store.load(), []);
    store.save([track()]);
    store.close();
    const raw = new DatabaseSync(path);
    const row = raw.prepare('SELECT analysis FROM tracks').get()!;
    const stored = JSON.parse(String(row.analysis));
    assert.equal(stored.routes, undefined);
    assert.deepEqual(stored.alternatives, [[0, 2, 0.05], [2, 0, 1]]);
    assert(raw.prepare('PRAGMA table_info(tracks)').all().every(column => column.type !== 'BLOB'));
    raw.close();
    const restored = new LibraryStore(path);
    assert.deepEqual(restored.load(), [track()]);
    restored.close();
  } finally { rmSync(directory, { recursive: true }); }
});

test('updates, swaps and deletion are committed atomically', () => {
  const store = new LibraryStore(':memory:');
  try {
    store.save([track('a', 0), track('b', 1)]);
    const changed = { ...track('a', 1), name: 'Renamed', volume: 0, shortcut: null };
    store.save([changed, track('b', 0)]);
    assert.deepEqual(store.load(), [track('b', 0), changed]);
    assert.throws(() => store.save([track('a', 0), track('b', 0)]));
    assert.deepEqual(store.load(), [track('b', 0), changed]);
    const broken = { ...track(), analysis: { ...track().analysis!, routes: null } } as unknown as SavedTrack;
    assert.throws(() => store.save([broken]));
    assert.deepEqual(store.load(), [track('b', 0), changed]);
    store.save([]);
    assert.deepEqual(store.load(), []);
  } finally { store.close(); }
});

test('unanalyzed and no-loop tracks round-trip; invalid metadata is rejected', () => {
  const store = new LibraryStore(':memory:');
  try {
    const plain = { ...track(), mode: 'once' as const, analysis: undefined };
    const noLoop = { ...track('b', 50), mode: 'loop' as const,
      analysis: { ...track().analysis!, routes: {}, startBar: null, transitions: 0 } };
    store.save([plain, noLoop]);
    assert.deepEqual(store.load(), [plain, noLoop]);
    for (const fields of [{ volume: 151 }, { slot: -1 }, { path: 'relative.mp3' }, { name: '' }]) {
      assert.throws(() => store.save([{ ...plain, ...fields }]));
    }
    assert.deepEqual(store.file(plain.id), { path: plain.path, size: plain.size, modified: plain.modified });
    assert.throws(() => store.file('unknown'));
  } finally { store.close(); }
});

test('moving tiles updates positions without rewriting analysis', () => {
  const store = new LibraryStore(':memory:');
  try {
    store.save([track('a', 0), track('b', 1)]);
    store.move(0, 1);
    assert.deepEqual(store.load(), [track('b', 0), track('a', 1)]);
    store.move(1, 40);
    assert.deepEqual(store.load(), [track('b', 0), track('a', 40)]);
    store.move(40, 40);
    assert.throws(() => store.move(-1, 0));
    assert.deepEqual(store.load(), [track('b', 0), track('a', 40)]);
  } finally { store.close(); }
});
