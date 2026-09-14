import { useEffect, useRef, useState } from 'react';
import type { AnalysisResult } from '../shared/analysis';
import { loadAudioWorklet, prepareAudio, type PreparedAudio } from './preparedAudio';
import type { PlayMode } from './proceduralEngine';
import type { SavedTrack } from '../shared/library';

export type { PlayMode } from './proceduralEngine';
export const MODE_LABELS: Record<PlayMode, string> = { once: 'One Time', loop: 'Normal Loop', procedural: 'Procedural Loop' };

export interface Track {
  id: string;
  name: string;
  file?: File;
  size: number;
  modified: number;
  missing?: boolean;
  path: string;
  mode: PlayMode;
  volume: number;
  shortcut: string | null;
  analysis?: AnalysisResult;
  job?: { id: string; state: 'queued' | 'running'; progress: number; stage: string };
}

export interface Playback {
  setMode: (mode: PlayMode, analysis?: AnalysisResult) => void;
  gain: GainNode;
  analyser: AnalyserNode;
  started: number;
  mode: PlayMode;
  dispose: () => void;
}

export const PAGE_SIZE = 16;

export function useTracks() {
  const [slots, renderSlots] = useState<(Track | null)[]>(Array(PAGE_SIZE * 6).fill(null));
  const slotState = useRef(slots);
  const loaded = useRef(false);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<Record<string, Playback>>({});
  const [error, setError] = useState('');
  const context = useRef<AudioContext | null>(null);
  const module = useRef<Promise<void> | null>(null);
  const prepared = useRef(new Map<string, Promise<PreparedAudio>>());
  const sessions = useRef(new Map<string, Playback>());
  const jobs = useRef(new Map<string, string>());
  const lastSaved = useRef('');

  function snapshot(): SavedTrack[] {
    return slotState.current.flatMap((track, slot) => track ? [{
      id: track.id, slot, name: track.name, path: track.path, mode: track.mode,
      volume: track.volume, shortcut: track.shortcut, size: track.size,
      modified: track.modified, analysis: track.analysis,
    }] : []);
  }

  function setSlots(change: (previous: (Track | null)[]) => (Track | null)[]) {
    slotState.current = change(slotState.current);
    renderSlots(slotState.current);
    if (!loaded.current || !window.library) return;
    const tracks = snapshot();
    const serialized = JSON.stringify(tracks);
    if (serialized === lastSaved.current) return;
    lastSaved.current = serialized;
    void window.library.save(tracks).catch(cause => {
      lastSaved.current = '';
      setError(`Cannot save library: ${String(cause)}`);
    });
  }

  function patch(id: string, changes: Partial<Track>) {
    setSlots(previous => previous.map(track => track?.id === id ? { ...track, ...changes } : track));
  }

  function busy(id: string) { return [...jobs.current.values()].includes(id); }

  function stop(id: string) {
    sessions.current.get(id)?.dispose();
    sessions.current.delete(id);
    setPlaying(Object.fromEntries(sessions.current));
  }

  function prepare(track: Track): Promise<PreparedAudio> {
    const existing = prepared.current.get(track.id);
    if (existing) return existing;
    const ctx = context.current ??= new AudioContext({ sampleRate: 44100 });
    module.current ??= loadAudioWorklet(ctx).catch(error => {
      module.current = null;
      throw error;
    });
    const file = track.file ? Promise.resolve(track.file) : window.library!.read(track.id)
      .then(bytes => new File([new Uint8Array(bytes)], track.name + '.mp3', { type: 'audio/mpeg', lastModified: track.modified }))
      .catch(cause => { patch(track.id, { missing: true }); throw cause; });
    const promise = Promise.all([file, module.current]).then(([file]) => prepareAudio(ctx, file, Promise.resolve())).then(audio => {
      if (prepared.current.get(track.id) !== promise) {
        audio.dispose();
        throw new Error('Track preparation was cancelled.');
      }
      return audio;
    }).catch(error => {
      if (prepared.current.get(track.id) === promise) prepared.current.delete(track.id);
      throw error;
    });
    prepared.current.set(track.id, promise);
    return promise;
  }

  async function toggle(track: Track) {
    if (loading || track.missing) return;
    if (busy(track.id)) return;
    if (sessions.current.has(track.id)) return stop(track.id);
    if (track.mode === 'procedural' && track.analysis?.startBar == null) return;
    const ready = prepare(track);
    const ctx = context.current!;
    const gain = ctx.createGain();
    gain.gain.value = track.volume / 100;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.connect(gain).connect(ctx.destination);
    let audio: PreparedAudio | undefined;
    let analysis = track.analysis;
    const token = crypto.randomUUID();
    const session: Playback = {
      gain, analyser, mode: track.mode, started: performance.now(),
      setMode: (mode, result) => {
        session.mode = mode;
        analysis = result;
        if (!audio) return;
        if (result && result !== audio.analysis) {
          audio.node.port.postMessage({ analysis: result });
          audio.analysis = result;
        }
        audio.node.port.postMessage({ mode });
      },
      dispose: () => {
        if (audio) {
          audio.node.port.postMessage({ stop: true });
          audio.node.port.onmessage = null;
          audio.node.onprocessorerror = null;
          audio.node.disconnect();
        }
        gain.disconnect();
        analyser.disconnect();
      },
    };
    sessions.current.set(track.id, session);
    const current = () => sessions.current.get(track.id) === session;
    const fail = (message: string) => {
      if (!current()) return;
      stop(track.id);
      if (audio) {
        prepared.current.delete(track.id);
        audio.dispose();
      }
      setError(message);
    };
    try {
      const [player] = await Promise.all([ready, ctx.resume()]);
      if (!current()) return;
      audio = player;
      audio.node.connect(analyser);
      audio.node.onprocessorerror = () => fail('Audio processing failed.');
      audio.node.port.onmessage = event => {
        if (event.data.state === 'ended' && event.data.token === token && current()) stop(track.id);
        else if (event.data.state === 'failed') fail(String(event.data.message));
      };
      session.setMode(session.mode, analysis);
      audio.node.port.postMessage({ play: true, token });
      session.started = performance.now();
      setPlaying(Object.fromEntries(sessions.current));
    } catch (cause) {
      fail(`Cannot play ${track.name}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  function add(files: File[], start: number) {
    if (!loaded.current) return;
    const accepted = files.filter(file => /\.mp3$/i.test(file.name));
    if (accepted.length !== files.length) setError('Only MP3 files can be added.');
    const tracks: Track[] = accepted.map(file => {
      return {
        id: crypto.randomUUID(), name: file.name.replace(/\.mp3$/i, ''),
        file, path: window.analysis?.filePath(file) ?? '',
        size: file.size, modified: file.lastModified,
        mode: 'once', volume: 100, shortcut: null,
      };
    });
    for (const track of tracks) void prepare(track).catch(() => {});
    void context.current?.resume().catch(() => {});
    setSlots(previous => {
      const next = [...previous];
      let position = start;
      for (const track of tracks) {
        while (next[position]) position++;
        while (position >= next.length) next.push(...Array(PAGE_SIZE).fill(null));
        next[position++] = track;
      }
      return next;
    });
  }

  function update(id: string, changes: Partial<Pick<Track, 'name' | 'volume' | 'shortcut'>>) {
    const session = sessions.current.get(id);
    if (session && changes.volume !== undefined) session.gain.gain.value = changes.volume / 100;
    patch(id, changes);
  }

  function cycleMode(track: Track) {
    if (busy(track.id) || track.missing) return;
    const mode: PlayMode = track.mode === 'once' ? 'loop'
      : track.mode === 'loop' && track.analysis?.startBar != null ? 'procedural' : 'once';
    patch(track.id, { mode });
    const session = sessions.current.get(track.id);
    if (!session) return;
    session.setMode(mode, track.analysis);
    setPlaying(Object.fromEntries(sessions.current));
  }

  async function analyze(track: Track) {
    if (busy(track.id) || track.missing) return;
    if (!window.analysis) { setError('Analysis is available in the desktop app.'); return; }
    const id = crypto.randomUUID();
    jobs.current.set(id, track.id);
    patch(track.id, { job: { id, state: 'queued', progress: 0, stage: 'Queued' } });
    try { await window.analysis.start(id, track.path); }
    catch (cause) {
      if (!jobs.current.has(id)) return;
      jobs.current.delete(id);
      patch(track.id, { job: undefined });
      setError(String(cause));
    }
  }

  async function cancelAnalysis(track: Track) {
    const id = [...jobs.current].find(([, trackId]) => trackId === track.id)?.[0];
    if (!id) return;
    try { await window.analysis?.cancel(id); }
    catch (cause) { setError(String(cause)); }
  }

  function remove(track: Track) {
    void cancelAnalysis(track);
    for (const [job, id] of jobs.current) if (id === track.id) jobs.current.delete(job);
    stop(track.id);
    const audio = prepared.current.get(track.id);
    prepared.current.delete(track.id);
    void audio?.then(player => player.dispose()).catch(() => {});
    setSlots(previous => previous.map(item => item?.id === track.id ? null : item));
  }

  function swap(from: number, to: number) {
    if (from === to || !loaded.current) return;
    const next = [...slotState.current];
    [next[from], next[to]] = [next[to], next[from]];
    slotState.current = next;
    renderSlots(next);
    lastSaved.current = '';
    void window.library?.move(from, to).catch(cause => setError(`Cannot save track position: ${String(cause)}`));
  }

  function locate(track: Track, file: File) {
    if (!/\.mp3$/i.test(file.name)) { setError('Select an MP3 file.'); return; }
    void cancelAnalysis(track);
    for (const [job, id] of jobs.current) if (id === track.id) jobs.current.delete(job);
    stop(track.id);
    const previous = prepared.current.get(track.id);
    prepared.current.delete(track.id);
    void previous?.then(audio => audio.dispose()).catch(() => {});
    const replacement: Track = {
      ...track, file, path: window.analysis?.filePath(file) ?? '', size: file.size, modified: file.lastModified,
      missing: false, analysis: undefined, job: undefined, mode: track.mode === 'procedural' ? 'once' : track.mode,
    };
    patch(track.id, replacement);
    void prepare(replacement).catch(() => {});
  }

  useEffect(() => {
    let disposed = false;
    if (window.library) {
      void window.library.load().then(tracks => {
        if (disposed) return;
        const restored: (Track | null)[] = Array(Math.max(PAGE_SIZE * 6, Math.ceil(((tracks.at(-1)?.slot ?? 0) + 1) / PAGE_SIZE) * PAGE_SIZE)).fill(null);
        for (const track of tracks) restored[track.slot] = track;
        slotState.current = restored;
        renderSlots(restored);
        lastSaved.current = JSON.stringify(snapshot());
        loaded.current = true;
        setLoading(false);
        for (const track of restored) if (track && !track.missing) void prepare(track).catch(() => {});
      }).catch(cause => {
        if (!disposed) setError(`Cannot load library: ${String(cause)}. Restart the app to retry.`);
      });
    } else { loaded.current = true; setLoading(false); }
    const flush = (event: BeforeUnloadEvent) => {
      if (loaded.current && window.library) {
        const failure = window.library.flush(snapshot());
        if (failure) {
          event.preventDefault();
          event.returnValue = '';
          setError(`Cannot save library: ${failure}`);
        }
      }
    };
    window.addEventListener('beforeunload', flush);
    return () => { disposed = true; window.removeEventListener('beforeunload', flush); };
  }, []);

  useEffect(() => {
    const unsubscribe = window.analysis?.onUpdate(event => {
      const trackId = jobs.current.get(event.id);
      if (!trackId) return;
      if (event.state === 'queued' || event.state === 'running') {
        patch(trackId, { job: { id: event.id, state: event.state, progress: event.progress, stage: event.stage } });
        return;
      }
      jobs.current.delete(event.id);
      if (event.state === 'complete') {
        setSlots(previous => previous.map(track => track?.id === trackId ? {
          ...track, analysis: event.result, job: undefined,
          mode: event.result.startBar === null && track.mode === 'procedural' ? 'once' : track.mode,
        } : track));
        if (event.result.startBar === null) setError('Analysis completed, but no safe procedural loop was found for this track.');
      } else {
        patch(trackId, { job: undefined });
        if (event.state === 'failed') setError(event.message);
      }
    });
    const players = prepared.current;
    const active = sessions.current;
    const pending = jobs.current;
    return () => {
      unsubscribe?.();
      for (const id of pending.keys()) void window.analysis?.cancel(id).catch(() => {});
      pending.clear();
      active.forEach(session => session.dispose());
      active.clear();
      players.forEach(player => { void player.then(audio => audio.dispose()).catch(() => {}); });
      players.clear();
      void context.current?.close();
      context.current = null;
      module.current = null;
    };
  }, []);

  return { slots, loading, playing, error, setError, add, toggle, stop, update, remove, swap, analyze, cancelAnalysis, cycleMode, locate };
}
