import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Square } from 'lucide-react';
import type { Playback, Track } from './useTracks';
import { MODE_LABELS } from './useTracks';

function Spectrum({ session }: { session?: Playback }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current!;
    const ctx = element.getContext('2d')!;
    const bins = new Uint8Array(session?.analyser.frequencyBinCount ?? 128);
    const binWidth = session ? session.analyser.context.sampleRate / session.analyser.fftSize : 1;
    const low = Math.max(20, binWidth);
    const high = Math.min(20000, bins.length * binWidth);
    const edges = Array.from({ length: 25 }, (_, i) =>
      Math.min(bins.length, Math.round(low * (high / low) ** (i / 24) / binWidth)));
    let frame = 0;
    function draw() {
      const { width, height } = element.getBoundingClientRect();
      const scale = window.devicePixelRatio;
      element.width = Math.round(width * scale);
      element.height = Math.round(height * scale);
      ctx.scale(scale, scale);
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = '#323a35';
      ctx.beginPath();
      ctx.moveTo(0, height - 1);
      ctx.lineTo(width, height - 1);
      ctx.stroke();
      if (session) {
        session.analyser.getByteFrequencyData(bins);
        ctx.fillStyle = '#97cda5';
        for (let i = 0; i < 24; i++) {
          const start = edges[i];
          const end = Math.max(start + 1, edges[i + 1]);
          // Preserve narrow frequency peaks while covering every bin in the band.
          let peak = 0;
          for (let bin = start; bin < end; bin++) peak = Math.max(peak, bins[bin]);
          const value = peak / 255;
          const barHeight = value * (height - 8);
          ctx.fillRect(i * width / 24, height - barHeight, Math.max(2, width / 24 - 5), barHeight);
        }
      }
      frame = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(frame);
  }, [session]);
  return <canvas ref={canvas} className="spectrum" aria-label={session ? 'Live frequency spectrum' : 'Empty frequency spectrum'} />;
}

function Elapsed({ started }: { started: number }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const tick = () => setSeconds(Math.floor((performance.now() - started) / 1000));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [started]);
  return <>{Math.floor(seconds / 60).toString().padStart(2, '0')}:{(seconds % 60).toString().padStart(2, '0')}</>;
}

interface Props {
  tracks: Track[];
  playing: Record<string, Playback>;
  stop: (id: string) => void;
  focus: (id: string) => void;
  volume: (id: string, value: number) => void;
}

function VolumeControl({ track, change }: { track: Track; change: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return <>
    <div className="volume-label">
      <label htmlFor={`volume-${track.id}`}>Volume</label>
      <span className="volume-value"><input
        aria-label={`Volume percentage for ${track.name}`} type="number" min="0" max="150" step="1"
        value={draft ?? track.volume}
        onFocus={event => { setDraft(event.currentTarget.value); event.currentTarget.select(); }}
        onChange={event => setDraft(event.currentTarget.value)}
        onBlur={event => {
          const value = event.currentTarget.valueAsNumber;
          if (Number.isFinite(value)) change(Math.max(0, Math.min(150, Math.round(value))));
          setDraft(null);
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') event.currentTarget.value = String(track.volume);
          if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
        }}
      />%</span>
    </div>
    <input id={`volume-${track.id}`} aria-label={`Volume for ${track.name}`} type="range" min="0" max="150" value={track.volume}
      onChange={event => {
        const value = Number(event.target.value);
        change(Math.abs(value - 100) <= 3 ? 100 : value);
      }}
      onKeyDown={event => {
        // Keep keyboard steps precise so snapping cannot trap the slider at 100%.
        if (['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(event.key)) {
          event.preventDefault();
          change(Math.max(0, Math.min(150, track.volume + (['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : 1))));
        }
      }}
    />
  </>;
}

export function NowPlaying({ tracks, playing, stop, focus, volume }: Props) {
  const [expanded, setExpanded] = useState(false);
  const current = tracks[0];
  const visible = expanded ? tracks : current ? [current] : [];
  return (
    <section className={`panel now-playing ${expanded ? 'expanded' : ''}`} aria-labelledby="now-title">
      <h2 id="now-title" className="panel-title">
        <button onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls="playing-list">
          NOW PLAYING {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          {tracks.length > 0 && <span className="count">{tracks.length.toString().padStart(2, '0')}</span>}
        </button>
      </h2>
      <div className="playing-list" id="playing-list">
        {visible.length ? visible.map(track => (
          <div className={`playing-row ${current?.id === track.id ? 'selected' : ''}`} key={track.id}>
            <Spectrum session={playing[track.id]} />
            <button className="track-metadata" aria-label={`Focus ${track.name}`} title={`Focus ${track.name}`} onClick={() => { focus(track.id); setExpanded(false); }}>
              <span className="metadata-label">Track</span><span className="track-name">{track.name}</span>
              <span className="metadata-label">Time</span><span><Elapsed started={playing[track.id].started} /></span>
              <span className="metadata-label">Status</span><span className="status">{playing[track.id].stopping ? 'Fading out' : MODE_LABELS[playing[track.id].mode]}</span>
            </button>
            <div className="track-controls">
              <VolumeControl track={track} change={value => volume(track.id, value)} />
              <button className="stop-button" title={playing[track.id].stopping ? `Stop ${track.name} immediately` : `Stop ${track.name}`} aria-label={`Stop ${track.name}`} onClick={() => stop(track.id)}><Square size={15} /> Stop</button>
            </div>
          </div>
        )) : (
          <div className="playing-row empty-playing">
            <Spectrum />
            <div className="track-metadata">
              <span className="metadata-label">Track</span><span>No track playing</span>
              <span className="metadata-label">Time</span><span>--:--</span>
              <span className="metadata-label">Status</span><span>Idle</span>
            </div>
            <div className="track-controls">
              <label htmlFor="idle-volume">Volume <output>100%</output></label>
              <input id="idle-volume" aria-label="Volume" type="range" min="0" max="150" value="100" disabled />
              <button className="stop-button" disabled><Square size={15} /> Stop</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
