import type { AnalysisBridge } from '../shared/analysis';

declare global {
  interface Window { analysis?: AnalysisBridge }
}
