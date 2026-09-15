import type { AnalysisBridge } from '../shared/analysis';
import type { LibraryBridge } from '../shared/library';
import type { DiscordBridge } from '../shared/discord';

declare global {
  interface Window { analysis?: AnalysisBridge; library?: LibraryBridge; discord?: DiscordBridge }
}
