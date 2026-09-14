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
          const value = bins[Math.floor(i * bins.length / 24)] / 255;
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
  volume: (id: string, value: number) => void;
}

export function NowPlaying({ tracks, playing, stop, volume }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const current = tracks.find(track => track.id === selected) ?? tracks[0];
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
            <button className="track-metadata" aria-label={`Focus ${track.name}`} title={`Focus ${track.name}`} onClick={() => { setSelected(track.id); setExpanded(false); }}>
              <span className="metadata-label">Track</span><span className="track-name">{track.name}</span>
              <span className="metadata-label">Time</span><span><Elapsed started={playing[track.id].started} /></span>
              <span className="metadata-label">Status</span><span className="status">{MODE_LABELS[playing[track.id].mode]}</span>
            </button>
            <div className="track-controls">
              <label htmlFor={`volume-${track.id}`}>Volume <output>{track.volume}%</output></label>
              <input id={`volume-${track.id}`} aria-label={`Volume for ${track.name}`} type="range" min="0" max="150" value={track.volume} onChange={event => volume(track.id, Number(event.target.value))} />
              <button className="stop-button" title={`Stop ${track.name}`} aria-label={`Stop ${track.name}`} onClick={() => stop(track.id)}><Square size={15} /> Stop</button>
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
