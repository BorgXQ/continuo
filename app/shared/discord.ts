export interface DiscordChannel {
  id: string;
  name: string;
  serverId: string;
  serverName: string;
}

export interface DiscordState {
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
  getToken: () => Promise<string>;
  getState: () => Promise<DiscordState>;
  connect: (token?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  onUpdate: (listener: (state: DiscordState) => void) => () => void;
}
