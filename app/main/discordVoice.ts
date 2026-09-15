import { Readable } from 'node:stream';
import { createAudioPlayer, createAudioResource, entersState, joinVoiceChannel, NoSubscriberBehavior, StreamType, VoiceConnectionStatus, type VoiceConnection } from '@discordjs/voice';
import type { Guild } from 'discord.js';

export interface VoiceOutput { channelId: string | null; ready: boolean; error: string | null }

export class DiscordVoice {
  private connection?: VoiceConnection;
  private input?: Readable;
  private pending?: AbortController;
  private player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
  state: VoiceOutput = { channelId: null, ready: false, error: null };

  constructor(private readonly publish: () => void) {
    this.player.on('error', () => this.leave('Discord audio failed. Device output restored.'));
  }

  leave(error: string | null = null): void {
    const previous = this.connection;
    this.connection = undefined;
    this.pending?.abort();
    this.pending = undefined;
    this.player.stop(true);
    this.input?.destroy();
    this.input = undefined;
    if (previous && previous.state.status !== VoiceConnectionStatus.Destroyed) previous.destroy();
    this.state = { channelId: null, ready: false, error };
    this.publish();
  }

  async join(guild: Guild, channelId: string): Promise<void> {
    this.leave();
    let connection: VoiceConnection;
    try {
      connection = joinVoiceChannel({ guildId: guild.id, channelId, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true, selfMute: false });
    } catch { this.leave('Cannot join Discord voice. Device output restored.'); return; }
    this.connection = connection;
    this.state = { channelId, ready: false, error: null };
    this.publish();
    const fail = () => { if (this.connection === connection) this.leave('Discord voice disconnected. Device output restored.'); };
    connection.on('error', fail);
    connection.on(VoiceConnectionStatus.Destroyed, fail);
    connection.on(VoiceConnectionStatus.Disconnected, fail);
    const pending = new AbortController();
    this.pending = pending;
    const timeout = setTimeout(() => pending.abort(), 20000);
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, pending.signal);
      if (this.connection !== connection) return;
      this.input = new Readable({ read() {}, highWaterMark: 3840 * 5 });
      this.player.play(createAudioResource(this.input, { inputType: StreamType.Raw }));
      connection.subscribe(this.player);
      this.state = { channelId, ready: true, error: null };
      this.publish();
    } catch { if (this.connection === connection) this.leave('Cannot start Discord voice. Check channel permissions and your network.'); }
    finally { clearTimeout(timeout); if (this.pending === pending) this.pending = undefined; }
  }

  write(channelId: unknown, bytes: unknown): void {
    if (!this.state.ready || channelId !== this.state.channelId || !(bytes instanceof Uint8Array) || bytes.byteLength !== 3840 || !this.input) return;
    // Bound latency when the encoder or transport cannot keep up.
    if (this.input.readableLength >= 3840 * 5) return;
    this.input.push(Buffer.from(bytes));
  }
}
