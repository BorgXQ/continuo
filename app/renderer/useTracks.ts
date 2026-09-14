import { useEffect, useRef, useState } from 'react';
import type { AnalysisResult } from '../shared/analysis';
import workletUrl from './procedural.worklet.ts?worker&url';

export type PlayMode = 'once' | 'loop' | 'procedural';
export const MODE_LABELS: Record<PlayMode, string> = { once: 'One Time', loop: 'Normal Loop', procedural: 'Procedural Loop' };

export interface Track {
  id: string;
  name: string;
  url: string;
  file: File;
  path: string;
  mode: PlayMode;
  volume: number;
  shortcut: string | null;
  analysis?: AnalysisResult;
  job?: { id: string; state: 'queued' | 'running'; progress: number; stage: string };
}

export interface Playback {
  audio?: HTMLAudioElement;
  gain: GainNode;
  analyser: AnalyserNode;
  started: number;
  mode: PlayMode;
  dispose: () => void;
}

export const PAGE_SIZE = 16;

export function useTracks() {
  const [slots, setSlots] = useState<(Track | null)[]>(Array(PAGE_SIZE * 6).fill(null));
  const [playing, setPlaying] = useState<Record<string, Playback>>({});
  const [error, setError] = useState('');
  const context = useRef<AudioContext | null>(null);
  const module = useRef<Promise<void> | null>(null);
  const sessions = useRef(new Map<string, Playback>());
  const jobs = useRef(new Map<string, string>());
  const urls = useRef(new Set<string>());

  function patch(id: string, changes: Partial<Track>) {
    setSlots(previous => previous.map(track => track?.id === id ? { ...track, ...changes } : track));
  }

  function busy(id: string) { return [...jobs.current.values()].includes(id); }

  function stop(id: string) {
    sessions.current.get(id)?.dispose();
    sessions.current.delete(id);
    setPlaying(Object.fromEntries(sessions.current));
  }

  async function toggle(track: Track) {
    if (busy(track.id)) return;
    if (sessions.current.has(track.id)) return stop(track.id);
    if (track.mode === 'procedural' && track.analysis?.startBar == null) return;
    const ctx = context.current ??= new AudioContext({ sampleRate: 44100 });
    const gain = ctx.createGain();
    gain.gain.value = track.volume / 100;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.connect(gain).connect(ctx.destination);
    let source: AudioNode | undefined;
    let worklet: AudioWorkletNode | undefined;
    let finishLoading: (() => void) | undefined;
    const session: Playback = {
      gain, analyser, mode: track.mode, started: performance.now(),
      dispose: () => {
        if (session.audio) {
          session.audio.onended = null;
          session.audio.onerror = null;
          session.audio.pause();
          session.audio.removeAttribute('src');
          session.audio.load();
        }
        finishLoading?.();
        worklet?.port.postMessage({ stop: true });
        worklet?.port.close();
        source?.disconnect();
        gain.disconnect();
        analyser.disconnect();
      },
    };
    sessions.current.set(track.id, session);
    const current = () => sessions.current.get(track.id) === session;
    const fail = (message: string) => {
      if (!current()) return;
      stop(track.id);
      setError(message);
    };
    try {
      await ctx.resume();
      if (!current()) return;
      if (track.mode === 'procedural') {
        const buffer = await ctx.decodeAudioData(await track.file.arrayBuffer());
        if (!current()) return;
        module.current ??= ctx.audioWorklet.addModule(workletUrl).catch(error => {
          module.current = null;
          throw error;
        });
        await module.current;
        if (!current()) return;
        worklet = new AudioWorkletNode(ctx, 'procedural-player', {
          numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [buffer.numberOfChannels],
        });
        source = worklet;
        source.connect(analyser);
        worklet.onprocessorerror = () => fail('Procedural audio processing failed.');
        const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index).slice());
        await new Promise<void>((resolve, reject) => {
          finishLoading = resolve;
          worklet!.port.onmessage = event => {
            if (event.data.state === 'ready') resolve();
            else {
              reject(new Error(event.data.message));
              fail(String(event.data.message));
            }
          };
          worklet!.port.postMessage({ channels, analysis: track.analysis }, channels.map(channel => channel.buffer));
        });
      } else {
        const audio = new Audio(track.url);
        session.audio = audio;
        audio.loop = track.mode === 'loop';
        source = ctx.createMediaElementSource(audio);
        source.connect(analyser);
        audio.onended = () => { if (current()) stop(track.id); };
        audio.onerror = () => fail(`Cannot play ${track.name}. Select a valid MP3 file.`);
        await audio.play();
      }
      if (!current()) return;
      session.started = performance.now();
      setPlaying(Object.fromEntries(sessions.current));
    } catch (cause) {
      fail(`Cannot play ${track.name}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  function add(files: File[], start: number) {
    const accepted = files.filter(file => /\.mp3$/i.test(file.name));
    if (accepted.length !== files.length) setError('Only MP3 files can be added.');
    const tracks: Track[] = accepted.map(file => {
      const url = URL.createObjectURL(file);
      urls.current.add(url);
      return {
        id: crypto.randomUUID(), name: file.name.replace(/\.mp3$/i, ''),
        url, file, path: window.analysis?.filePath(file) ?? '',
        mode: 'once', volume: 100, shortcut: null,
      };
    });
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
    if (busy(track.id)) return;
    const mode: PlayMode = track.mode === 'once' ? 'loop'
      : track.mode === 'loop' && track.analysis?.startBar != null ? 'procedural' : 'once';
    patch(track.id, { mode });
    const session = sessions.current.get(track.id);
    if (!session) return;
    if (session.audio && mode !== 'procedural') {
      session.audio.loop = mode === 'loop';
      session.mode = mode;
      setPlaying(Object.fromEntries(sessions.current));
    } else {
      stop(track.id);
      void toggle({ ...track, mode });
    }
  }

  async function analyze(track: Track) {
    if (busy(track.id)) return;
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
    URL.revokeObjectURL(track.url);
    urls.current.delete(track.url);
    setSlots(previous => previous.map(item => item?.id === track.id ? null : item));
  }

  function swap(from: number, to: number) {
    setSlots(previous => {
      const next = [...previous];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }

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
    const objectUrls = urls.current;
    const pending = jobs.current;
    return () => {
      unsubscribe?.();
      for (const id of pending.keys()) void window.analysis?.cancel(id).catch(() => {});
      pending.clear();
      active.forEach(session => session.dispose());
      active.clear();
      objectUrls.forEach(url => URL.revokeObjectURL(url));
      objectUrls.clear();
      void context.current?.close();
      context.current = null;
      module.current = null;
    };
  }, []);

  return { slots, playing, error, setError, add, toggle, stop, update, remove, swap, analyze, cancelAnalysis, cycleMode };
}
