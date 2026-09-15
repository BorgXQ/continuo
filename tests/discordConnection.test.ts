import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { ChannelType, Events, type Client } from 'discord.js';
import { DiscordConnection } from '../app/main/discordConnection.ts';

class FakeClient extends EventEmitter {
  token: string | null = null;
  user = { tag: 'Continuo#0001', bot: true };
  destroyed = false;
  guilds = { cache: new Map() };
  login = async (token: string) => { this.token = token; return token; };
  destroy = async () => { this.destroyed = true; };
  isReady = () => true;
}

function setup(timeout = 30000) {
  const client = new FakeClient();
  const updates: unknown[] = [];
  const connection = new DiscordConnection(state => updates.push(state), () => client as unknown as Client, timeout);
  return { client, updates, connection };
}

test('real readiness, not successful login alone, determines connected status', async () => {
  const { connection, client, updates } = setup();
  try {
    connection.connect('private-token');
    await Promise.resolve();
    assert.equal(connection.getState().status, 'connecting');
    client.emit(Events.ClientReady);
    assert.equal(connection.getState().status, 'connected');
    assert.equal(connection.getState().botName, 'Continuo#0001');
    assert(!JSON.stringify(updates).includes('private-token'));
  } finally { connection.disconnect(); }
  assert(client.destroyed);
  assert.equal(client.token, null);
});

test('channel discovery excludes text, stage and permission-denied channels and refreshes', () => {
  const { connection, client } = setup();
  const channel = (id: string, type: ChannelType, allowed = true) => ({ id, name: id, type, permissionsFor: () => ({ has: () => allowed }) });
  const channels = new Map([
    ['voice', channel('voice', ChannelType.GuildVoice)],
    ['text', channel('text', ChannelType.GuildText)],
    ['stage', channel('stage', ChannelType.GuildStageVoice)],
    ['denied', channel('denied', ChannelType.GuildVoice, false)],
  ]);
  client.guilds.cache.set('server', { id: 'server', name: 'Campaign', available: true, members: { me: {} }, channels: { cache: channels } });
  try {
    connection.connect('token');
    client.emit(Events.ClientReady);
    assert.deepEqual(connection.getState().channels.map(channel => channel.id), ['voice']);
    channels.delete('voice');
    client.emit(Events.ChannelDelete);
    assert.deepEqual(connection.getState().channels, []);
  } finally { connection.disconnect(); }
});

test('login errors are sanitized and cancel ignores late readiness events', async () => {
  const { connection, client, updates } = setup();
  client.login = async () => { throw new Error('secret-token https://example.com'); };
  connection.connect('secret-token');
  await Promise.resolve();
  assert.equal(connection.getState().status, 'disconnected');
  assert(connection.getState().error);
  assert(!JSON.stringify(updates).includes('secret-token'));
  client.emit(Events.ClientReady);
  assert.equal(connection.getState().status, 'disconnected');

  const second = setup();
  second.connection.connect('token');
  second.connection.disconnect();
  second.client.emit(Events.ClientReady);
  assert.equal(second.connection.getState().status, 'disconnected');
});

test('pending login expires and reconnecting status recovers on resume', async () => {
  const { connection, client } = setup(10);
  connection.connect('token');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(connection.getState().status, 'disconnected');
  assert.match(connection.getState().error!, /timed out/);
  connection.connect('token');
  client.emit(Events.ClientReady);
  client.emit(Events.ShardReconnecting);
  assert.equal(connection.getState().status, 'reconnecting');
  client.emit(Events.ShardResume);
  assert.equal(connection.getState().status, 'connected');
  connection.disconnect();
});

test('invalid token input and duplicate connections do not replace a session', () => {
  const { connection } = setup();
  for (const value of [null, '', 'a b', 'x'.repeat(4097)]) assert.throws(() => connection.connect(value));
  connection.connect('token');
  assert.throws(() => connection.connect('another-token'));
  connection.disconnect();
});
