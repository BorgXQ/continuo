import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DiscordCredentials } from '../app/main/discordCredentials.ts';

test('credentials survive store recreation and explicit removal; insecure storage is rejected', () => {
  const directory = mkdtempSync(join(tmpdir(), 'continuo-credentials-'));
  const path = join(directory, 'token.enc');
  const encryption = {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptString: (value: string) => Buffer.from(value.split('').reverse().join('')),
    decryptString: (value: Buffer) => value.toString().split('').reverse().join(''),
  };
  try {
    const store = new DiscordCredentials(path, encryption, 'linux');
    assert.equal(store.load(), null);
    store.save('private-token');
    assert(!readFileSync(path).includes('private-token'));
    assert.equal(new DiscordCredentials(path, encryption, 'linux').load(), 'private-token');
    store.clear();
    assert.equal(store.load(), null);
    encryption.getSelectedStorageBackend = () => 'basic_text';
    assert.throws(() => store.save('private-token'));
    encryption.isEncryptionAvailable = () => false;
    assert.throws(() => store.save('private-token'));
    assert.equal(store.load(), null);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
