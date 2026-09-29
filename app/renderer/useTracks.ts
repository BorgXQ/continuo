import { useEffect, useRef, useState } from 'react';
import type { AnalysisResult } from '../shared/analysis';
import { loadAudioWorklet, prepareAudio } from './preparedAudio';
import { TrackPlayer } from './trackPlayer';
import { isAudioFile } from '../shared/audioFormats';
import type { PlayMode } from './proceduralEngine';
import type { SavedTrack } from '../shared/library';
import { useSettings } from './useSettings';
import { AudioOutput } from './audioOutput';

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
  focusedAt: number;
  stopping: boolean;
  fadeOut: (seconds: number) => boolean;
  setMode: (mode: PlayMode, analysis?: AnalysisResult) => void;
  setCrossfade: (seconds: number) => void;
  gain: GainNode;
  analyser: AnalyserNode;
  started: number;
  mode: PlayMode;
  dispose: () => void;
}

const SLOT_COUNT = 96;

export function useTracks(outputChannel: string | null = null) {
  const [slots, renderSlots] = useState<(Track | null)[]>(Array(SLOT_COUNT).fill(null));
  const slotState = useRef(slots);
  const loaded = useRef(false);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<Record<string, Playback>>({});
  const [error, setError] = useState('');
  const settings = useSettings(setError);
  const context = useRef<AudioContext | null>(null);
  const output = useRef<AudioOutput | null>(null);
  const selectedOutput = useRef(outputChannel);
  selectedOutput.current = outputChannel;
  useEffect(() => { output.current?.select(outputChannel); }, [outputChannel]);
  const module = useRef<Promise<void> | null>(null);
  const sessions = useRef(new Map<string, Playback>());
  const jobs = useRef(new Map<string, string>());
  const lastSaved = useRef('');

  useEffect(() => {
    for (const session of sessions.current.values()) session.setCrossfade(settings.values.crossfade);
  }, [settings.values.crossfade]);

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

  function finish(id: string) {
    sessions.current.get(id)?.dispose();
    sessions.current.delete(id);
    setPlaying(Object.fromEntries(sessions.current));
  }

  function stop(id: string) {
    const session = sessions.current.get(id);
    if (!session) return;
    if (!session.stopping && session.fadeOut(settings.current.current.fadeOut)) {
      setPlaying(Object.fromEntries(sessions.current));
    } else finish(id);
  }

  function focus(id: string) {
    const session = sessions.current.get(id);
    if (!session) return;
    session.focusedAt = performance.now();
    setPlaying(Object.fromEntries(sessions.current));
  }

  function audioContext(): AudioContext {
    const ctx = context.current ??= new AudioContext({ sampleRate: 48000 });
    if (!output.current) {
      output.current = new AudioOutput(ctx);
      output.current.select(selectedOutput.current);
    }
    return ctx;
  }

  async function toggle(track: Track) {
    if (loading || settings.loading || track.missing) return;
    if (busy(track.id)) return;
    const previous = sessions.current.get(track.id);
    if (previous && !previous.stopping) return stop(track.id);
    if (previous) finish(track.id);
    if (track.mode === 'procedural' && track.analysis?.startBar == null) return;
    const ctx = audioContext();
    const gain = ctx.createGain();
    gain.gain.value = track.volume / 100;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 8192;
    gain.connect(analyser).connect(output.current!.input);
    const url = track.file ? URL.createObjectURL(track.file) : `continuo-audio://track/${encodeURIComponent(track.id)}`;
    const player = new TrackPlayer(ctx, gain, url,
      () => { if (track.file) URL.revokeObjectURL(url); },
      async () => {
        module.current ??= loadAudioWorklet(ctx).catch(error => { module.current = null; throw error; });
        const file = track.file ?? new File([new Uint8Array(await window.library!.read(track.id))], track.path);
        return prepareAudio(ctx, file, module.current);
      },
      () => { if (current()) finish(track.id); },
      cause => fail(`Cannot play ${track.name}: ${cause instanceof Error ? cause.message : String(cause)}`),
      cause => {
        if (!current()) return;
        session.mode = 'once';
        player.setMode('once');
        patch(track.id, { mode: 'once' });
        setPlaying(Object.fromEntries(sessions.current));
        setError(`Cannot enable procedural playback: ${String(cause)}`);
      });
    const session: Playback = {
      focusedAt: performance.now(),
      stopping: false,
      fadeOut: seconds => {
        session.stopping = player.fadeOut(seconds);
        return session.stopping;
      },
      gain, analyser, mode: track.mode, started: performance.now(),
      setMode: (mode, result) => {
        session.mode = mode;
        player.setMode(mode, result);
      },
      setCrossfade: seconds => player.setCrossfade(seconds),
      dispose: () => {
        player.dispose();
        gain.disconnect();
        analyser.disconnect();
      },
    };
    sessions.current.set(track.id, session);
    setPlaying(Object.fromEntries(sessions.current));
    const current = () => sessions.current.get(track.id) === session;
    const fail = (message: string) => {
      if (!current()) return;
      finish(track.id);
      setError(message);
    };
    try {
      await Promise.all([output.current!.ready, ctx.resume()]);
      if (!current()) return;
      player.setCrossfade(settings.current.current.crossfade);
      await player.start(session.mode, track.analysis, settings.current.current.fadeIn);
      if (!current()) return;
      session.started = performance.now();
      setPlaying(Object.fromEntries(sessions.current));
    } catch (cause) {
      fail(`Cannot play ${track.name}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  function add(files: File[], start: number) {
    if (!loaded.current) return;
    const accepted = files.filter(file => isAudioFile(file.name));
    if (accepted.length !== files.length) setError('Select a supported audio file extension.');
    const available = slotState.current.slice(start).filter(track => track === null).length;
    if (accepted.length > available) setError(`Only ${available} soundtrack slots are available from this position.`);
    const tracks: Track[] = accepted.slice(0, available).map(file => {
      return {
        id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, ''),
        file, path: window.analysis?.filePath(file) ?? '',
        size: file.size, modified: file.lastModified,
        mode: 'once', volume: 100, shortcut: null,
      };
    });
    setSlots(previous => {
      const next = [...previous];
      let position = start;
      for (const track of tracks) {
        while (next[position]) position++;
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
    finish(track.id);
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
    if (!isAudioFile(file.name)) { setError('Select a supported audio file extension.'); return; }
    void cancelAnalysis(track);
    for (const [job, id] of jobs.current) if (id === track.id) jobs.current.delete(job);
    finish(track.id);
    const replacement: Track = {
      ...track, file, path: window.analysis?.filePath(file) ?? '', size: file.size, modified: file.lastModified,
      missing: false, analysis: undefined, job: undefined, mode: track.mode === 'procedural' ? 'once' : track.mode,
    };
    patch(track.id, replacement);
  }

  useEffect(() => {
    let disposed = false;
    if (window.library) {
      void window.library.load().then(tracks => {
        if (disposed) return;
        const restored: (Track | null)[] = Array(Math.max(SLOT_COUNT, (tracks.at(-1)?.slot ?? 0) + 1)).fill(null);
        for (const track of tracks) restored[track.slot] = track;
        slotState.current = restored;
        renderSlots(restored);
        lastSaved.current = JSON.stringify(snapshot());
        loaded.current = true;
        setLoading(false);
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
    const active = sessions.current;
    const pending = jobs.current;
    return () => {
      unsubscribe?.();
      for (const id of pending.keys()) void window.analysis?.cancel(id).catch(() => {});
      pending.clear();
      active.forEach(session => session.dispose());
      active.clear();
      void context.current?.close();
      context.current = null;
      output.current = null;
      module.current = null;
    };
  }, []);

  return { slots, loading, settings, playing, error, setError, add, toggle, stop, focus, update, remove, swap, analyze, cancelAnalysis, cycleMode, locate };
}
