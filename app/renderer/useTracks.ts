import { useEffect, useRef, useState } from 'react';

export interface Track {
  id: string;
  name: string;
  url: string;
  loop: boolean;
  volume: number;
  shortcut: string | null;
}

export interface Playback {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  analyser: AnalyserNode;
  started: number;
}

export const PAGE_SIZE = 16;

export function useTracks() {
  const [slots, setSlots] = useState<(Track | null)[]>(Array(PAGE_SIZE * 6).fill(null));
  const [playing, setPlaying] = useState<Record<string, Playback>>({});
  const [error, setError] = useState('');
  const context = useRef<AudioContext | null>(null);
  const sessions = useRef(new Map<string, Playback>());
  const urls = useRef(new Set<string>());

  function stop(id: string) {
    const session = sessions.current.get(id);
    if (session) {
      session.audio.pause();
      session.audio.removeAttribute('src');
      session.audio.load();
      session.source.disconnect();
      session.gain.disconnect();
      session.analyser.disconnect();
      sessions.current.delete(id);
    }
    setPlaying(Object.fromEntries(sessions.current));
  }

  async function toggle(track: Track) {
    if (sessions.current.has(track.id)) return stop(track.id);
    const ctx = context.current ??= new AudioContext();
    const audio = new Audio(track.url);
    audio.loop = track.loop;
    const source = ctx.createMediaElementSource(audio);
    const gain = ctx.createGain();
    gain.gain.value = track.volume / 100;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser).connect(gain).connect(ctx.destination);
    const session = { audio, source, gain, analyser, started: performance.now() };
    sessions.current.set(track.id, session);
    audio.onended = () => stop(track.id);
    audio.onerror = () => {
      if (sessions.current.get(track.id) !== session) return;
      stop(track.id);
      setError(`Cannot play ${track.name}. Select a valid MP3 file.`);
    };
    try {
      await ctx.resume();
      if (sessions.current.get(track.id) !== session) return;
      await audio.play();
      if (sessions.current.get(track.id) !== session) return;
      session.started = performance.now();
      setPlaying(Object.fromEntries(sessions.current));
    } catch {
      if (sessions.current.get(track.id) !== session) return;
      stop(track.id);
      setError(`Cannot play ${track.name}. Select a valid MP3 file.`);
    }
  }

  function add(files: File[], start: number) {
    const accepted = files.filter(file => /\.mp3$/i.test(file.name));
    if (accepted.length !== files.length) setError('Only MP3 files can be added.');
    const tracks = accepted.map(file => {
      const url = URL.createObjectURL(file);
      urls.current.add(url);
      return {
        id: crypto.randomUUID(), name: file.name.replace(/\.mp3$/i, ''),
        url, loop: false, volume: 100, shortcut: null,
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

  function update(id: string, changes: Partial<Pick<Track, 'name' | 'loop' | 'volume' | 'shortcut'>>) {
    const session = sessions.current.get(id);
    if (session && changes.loop !== undefined) session.audio.loop = changes.loop;
    if (session && changes.volume !== undefined) session.gain.gain.value = changes.volume / 100;
    setSlots(previous => previous.map(track => track?.id === id ? { ...track, ...changes } : track));
  }

  function remove(track: Track) {
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
    const active = sessions.current;
    const objectUrls = urls.current;
    return () => {
      active.forEach(session => {
        session.audio.pause();
        session.audio.removeAttribute('src');
        session.audio.load();
        session.source.disconnect();
        session.gain.disconnect();
        session.analyser.disconnect();
      });
      active.clear();
      objectUrls.forEach(url => URL.revokeObjectURL(url));
      objectUrls.clear();
      void context.current?.close();
      context.current = null;
    };
  }, []);

  return { slots, playing, error, setError, add, toggle, stop, update, remove, swap };
}
