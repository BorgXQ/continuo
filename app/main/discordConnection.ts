import { ChannelType, Client, Events, GatewayIntentBits, PermissionFlagsBits } from 'discord.js';
import type { DiscordState } from '../shared/discord';

const permissions = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak];

export class DiscordConnection {
  private client: Client | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private state: DiscordState = { revision: 0, hasToken: false, status: 'disconnected', botName: null, channels: [], error: null };

  constructor(
    private readonly publish: (state: DiscordState) => void,
    private readonly createClient = () => new Client({
      intents: [GatewayIntentBits.Guilds],
      rest: { timeout: 15000, retries: 0 },
    }),
    private readonly timeout = 30000,
  ) {}

  getState(): DiscordState { return this.state; }

  private update(change: Partial<DiscordState>): void {
    this.state = { ...this.state, ...change, revision: this.state.revision + 1 };
    this.publish(this.state);
  }

  disconnect(error: string | null = null): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const client = this.client;
    this.client = null;
    if (client) {
      // Clear our reference before closing sockets so late events cannot revive a session.
      void client.destroy().catch(() => {});
      client.token = null;
    }
    this.update({ status: 'disconnected', botName: null, channels: [], error });
  }

  connect(value: unknown): void {
    if (this.client) throw new Error('Disconnect the current bot before connecting again.');
    if (typeof value !== 'string' || !value.trim() || value.length > 4096 || /\s/.test(value.trim())) {
      throw new Error('Enter a Discord bot token.');
    }
    const client = this.createClient();
    this.client = client;
    const current = () => this.client === client;
    const fail = (message: string) => { if (current()) this.disconnect(message); };
    const refresh = () => {
      if (!current() || this.state.status !== 'connected') return;
      const channels: DiscordState['channels'] = [];
      for (const guild of client.guilds.cache.values()) {
        if (!guild.available || !guild.members.me) continue;
        for (const channel of guild.channels.cache.values()) {
          if (channel.type === ChannelType.GuildVoice && channel.permissionsFor(guild.members.me)?.has(permissions)) {
            channels.push({ id: channel.id, name: channel.name, serverId: guild.id, serverName: guild.name });
          }
        }
      }
      channels.sort((a, b) => a.serverName.localeCompare(b.serverName) || a.serverId.localeCompare(b.serverId) || a.name.localeCompare(b.name));
      this.update({ channels });
    };
    const ready = () => {
      if (!current()) return;
      if (!client.user?.bot) { fail('A Discord bot token is required. User accounts are not supported.'); return; }
      clearTimeout(this.timer);
      this.timer = undefined;
      this.update({ status: 'connected', botName: client.user?.tag ?? null, error: null });
      refresh();
    };
    const reconnect = () => {
      if (!current()) return;
      this.update({ status: 'reconnecting', channels: [] });
      if (!this.timer) this.timer = setTimeout(() => fail('Discord reconnection timed out. Try connecting again.'), this.timeout);
    };

    client.on(Events.ClientReady, ready);
    client.on(Events.ShardResume, ready);
    client.on(Events.ShardReady, () => { if (client.isReady()) ready(); });
    client.on(Events.ShardDisconnect, reconnect);
    client.on(Events.ShardReconnecting, reconnect);
    // Never forward raw library errors: they can contain request or credential details.
    client.on(Events.Error, () => fail('Discord connection failed. Check your token and network, then retry.'));
    client.on(Events.ShardError, () => fail('Discord network connection failed. Please retry.'));
    client.on(Events.Invalidated, () => fail('Discord session expired. Connect again.'));
    client.on(Events.GuildCreate, refresh);
    client.on(Events.GuildDelete, refresh);
    client.on(Events.GuildUpdate, refresh);
    client.on(Events.GuildUnavailable, refresh);
    client.on(Events.ChannelCreate, refresh);
    client.on(Events.ChannelDelete, refresh);
    client.on(Events.ChannelUpdate, refresh);
    client.on(Events.GuildRoleCreate, refresh);
    client.on(Events.GuildRoleDelete, refresh);
    client.on(Events.GuildRoleUpdate, refresh);
    client.on(Events.GuildMemberUpdate, refresh);
    this.update({ status: 'connecting', botName: null, channels: [], error: null });
    this.timer = setTimeout(() => fail('Discord connection timed out. Check your network and try again.'), this.timeout);
    try {
      void client.login(value.trim()).catch(() => fail('Unable to log in to Discord. Check the bot token and network connection.'));
    } catch {
      fail('Unable to log in to Discord. Check the bot token and network connection.');
    }
  }
}
