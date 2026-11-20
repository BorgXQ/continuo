import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Playback } from './useTracks';
import { loopArcs, loopDescription, trackTime } from './loopMap';

export function LoopMap({ name, session, close }: { name: string; session: Playback; close: () => void }) {
  const [duration, setDuration] = useState(0);
  const position = useRef(0);
  const playhead = useRef<SVGLineElement>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [height, setHeight] = useState(100);
  const plot = useRef<SVGSVGElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const id = useId().replace(/:/g, '');
  const arcs = useMemo(() => loopArcs(session.mode, duration, session.analysis), [session.mode, duration, session.analysis]);
  const active = hovered ?? selected;
  const inspected = active === null ? undefined : arcs[active];
  const summary = session.mode === 'once' ? 'One-time playback' : !duration ? 'Loading duration…'
    : session.mode === 'loop' ? '1 full-track loop' : `${arcs.length} ${arcs.length === 1 ? 'loop' : 'loops'} found`;
  const details = inspected ? loopDescription(inspected) : summary;
  const x = (seconds: number) => 35 + Math.max(0, Math.min(1, duration ? seconds / duration : 0)) * 830;
  const center = height / 2;

  useEffect(() => {
    const update = () => {
      const timeline = session.getTimeline();
      const length = Number.isFinite(timeline.duration) && timeline.duration > 0 ? timeline.duration : 0;
      position.current = Number.isFinite(timeline.currentTime) ? timeline.currentTime : 0;
      setDuration(length);
      // Move only the playhead; do not rerender every arc on each playback tick.
      const coordinate = String(35 + Math.max(0, Math.min(1, length ? position.current / length : 0)) * 830);
      playhead.current?.setAttribute('x1', coordinate);
      playhead.current?.setAttribute('x2', coordinate);
    };
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [session]);
  useEffect(() => { setSelected(null); setHovered(null); }, [arcs]);
  useEffect(() => { back.current?.focus(); }, []);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setHeight(Math.max(1, 900 * entry.contentRect.height / entry.contentRect.width));
    });
    observer.observe(plot.current!);
    return () => observer.disconnect();
  }, []);

  return <div className="loop-map-view" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
  }}>
    <div className="loop-map-heading">
      <button ref={back} className="loop-map-back" aria-label={`${name} — return to frequency spectrum`} onClick={close}>
        <span aria-hidden="true">← </span>{name}
      </button>
      <span className={`loop-map-details ${inspected ? '' : 'status'}`} aria-live="polite">| {details}</span>
    </div>
    <svg ref={plot} className="loop-map-plot" viewBox={`0 0 900 ${height}`} role="group" aria-label={`${name}: track timeline and loops`}>
      <line x1={35} x2={865} y1={center} y2={center} stroke="#65756b" strokeWidth={1.5} />
      {Array.from({ length: 9 }, (_, i) => {
        const seconds = duration * i / 8;
        return <g key={i}>
          <line x1={35 + i * 830 / 8} x2={35 + i * 830 / 8} y1={center - 4} y2={center + 4} stroke="#65756b" />
          <text x={35 + i * 830 / 8} y={center + 18} fill="#8c9e92" fontSize={11} textAnchor="middle">{duration ? trackTime(seconds) : '–'}</text>
        </g>;
      })}
      {arcs.map((arc, index) => {
        const start = x(arc.source), end = x(arc.target);
        const rise = Math.min(height * .46, 16 + Math.abs(start - end) * .05) * (index % 2 ? 1 : -1);
        const path = `M ${start} ${center} C ${start} ${center + rise}, ${end} ${center + rise}, ${end} ${center}`;
        const color = `hsl(${(index * 47 + 145) % 360} 60% 67%)`;
        const choose = () => { setHovered(null); setSelected(previous => previous === index ? null : index); };
        return <g key={index} className={`loop-map-arc ${active === index ? 'highlighted' : active !== null ? 'dim' : ''}`}
          role="button" tabIndex={0} aria-label={loopDescription(arc)} aria-pressed={selected === index}
          onClick={choose} onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)}
          onFocus={() => setHovered(index)} onBlur={() => setHovered(null)}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } }}>
          <defs><marker id={`${id}-arrow-${index}`} viewBox="0 0 10 10" refX={8} refY={5} markerWidth={5} markerHeight={5} orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
          </marker></defs>
          <path className="loop-map-hit" d={path} fill="none" stroke="transparent" strokeWidth={14} />
          <path className="loop-map-ink" d={path} fill="none" stroke={color} strokeWidth={1.8} markerEnd={`url(#${id}-arrow-${index})`} />
          <circle cx={start} cy={center} r={2.5} fill={color} pointerEvents="none" />
        </g>;
      })}
      {duration > 0 && <line ref={playhead} x1={x(position.current)} x2={x(position.current)}
        y1={4} y2={height - 4} stroke="#eef5f0" opacity={.8} pointerEvents="none" />}
    </svg>
  </div>;
}
