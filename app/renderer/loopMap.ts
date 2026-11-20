import type { AnalysisResult } from '../shared/analysis';
import type { PlayMode } from './proceduralEngine';

export interface LoopArc {
  source: number;
  target: number;
  sourceBar?: number;
  targetBar?: number;
}

export function loopArcs(mode: PlayMode, duration: number, analysis?: AnalysisResult): LoopArc[] {
  if (!Number.isFinite(duration) || duration <= 0 || mode === 'once') return [];
  if (mode === 'loop') return [{ source: duration, target: 0 }];
  if (!analysis || analysis.startBar === null) return [];
  return Object.entries(analysis.routes).flatMap(([bar, edges]) => {
    const source = Number(bar);
    return edges.filter(edge => edge.probability > 0 && edge.target !== source + 1
      && analysis.bars[source] && analysis.bars[edge.target]).map(edge => ({
      source: analysis.bars[source][1], target: analysis.bars[edge.target][0],
      sourceBar: source + 1, targetBar: edge.target + 1,
    }));
  });
}

export function trackTime(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
}

export function loopDescription(arc: LoopArc): string {
  if (arc.sourceBar === undefined || arc.targetBar === undefined) return `Full-track loop · ${trackTime(arc.source)} → 00:00`;
  return `Bar ${arc.sourceBar} → ${arc.targetBar} · ${trackTime(arc.source)} → ${trackTime(arc.target)} · back ${arc.sourceBar - arc.targetBar + 1} bars`;
}
