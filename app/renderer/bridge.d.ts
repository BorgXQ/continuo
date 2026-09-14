import type { AnalysisBridge } from '../shared/analysis';
import type { LibraryBridge } from '../shared/library';

declare global {
  interface Window { analysis?: AnalysisBridge; library?: LibraryBridge }
}
