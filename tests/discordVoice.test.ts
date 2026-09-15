import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import type { Guild } from 'discord.js';
import { DiscordVoice } from '../app/main/discordVoice.ts';

test('voice defaults to device and leaving cancels a pending join without reviving it', async () => {
  const voice = new DiscordVoice(() => {});
  assert.equal(voice.state.channelId, null);
  let destroyed = false;
  const guild = {
    id: '123',
    voiceAdapterCreator: () => ({ sendPayload: () => true, destroy: () => { destroyed = true; } }),
  } as unknown as Guild;
  const joining = voice.join(guild, '456');
  assert.equal(voice.state.channelId, '456');
  assert.equal(voice.state.ready, false);
  voice.leave();
  await joining;
  assert(destroyed);
  assert.deepEqual(voice.state, { channelId: null, ready: false, error: null });
  assert.equal(new DiscordVoice(() => {}).state.channelId, null);
});

test('audio accepts only current-channel PCM frames and bounds buffering', () => {
  const voice = new DiscordVoice(() => {});
  const input = new Readable({ read() {} });
  Reflect.set(voice, 'input', input);
  voice.state = { channelId: '456', ready: true, error: null };
  voice.write('other', new Uint8Array(3840));
  voice.write('456', new Uint8Array(10));
  voice.write('456', {});
  assert.equal(input.readableLength, 0);
  for (let i = 0; i < 100; i++) voice.write('456', new Uint8Array(3840));
  assert.equal(input.readableLength, 3840 * 5);
  voice.leave();
  assert(input.destroyed);
});
