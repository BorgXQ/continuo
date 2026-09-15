export interface DiscordChannel {
  id: string;
  name: string;
  serverId: string;
  serverName: string;
}

export interface DiscordState {
  output?: { channelId: string | null; ready: boolean; error: string | null };
  hasToken: boolean;
  revision: number;
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  botName: string | null;
  channels: DiscordChannel[];
  error: string | null;
}

export const INITIAL_DISCORD_STATE: DiscordState = {
  revision: 0, hasToken: false, status: 'disconnected', botName: null, channels: [], error: null,
};

export interface DiscordBridge {
  selectOutput: (channelId: string | null) => Promise<void>;
  sendAudio: (channelId: string, bytes: Uint8Array) => Promise<void>;
  getToken: () => Promise<string>;
  getState: () => Promise<DiscordState>;
  connect: (token?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  onUpdate: (listener: (state: DiscordState) => void) => () => void;
}
