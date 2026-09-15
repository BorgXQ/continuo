import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

interface Encryption {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend(): string;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export class DiscordCredentials {
  constructor(private readonly path: string, private readonly encryption: Encryption, private readonly platform = process.platform) {}

  private check(): void {
    if (!this.encryption.isEncryptionAvailable() || (this.platform === 'linux' && this.encryption.getSelectedStorageBackend() === 'basic_text')) {
      throw new Error('Secure credential storage is unavailable.');
    }
  }

  load(): string | null {
    if (!existsSync(this.path)) return null;
    this.check();
    return this.encryption.decryptString(readFileSync(this.path));
  }

  save(token: string): void {
    this.check();
    const encrypted = this.encryption.encryptString(token);
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    try {
      writeFileSync(temporary, encrypted, { mode: 0o600 });
      renameSync(temporary, this.path);
    } finally { rmSync(temporary, { force: true }); }
  }

  clear(): void { rmSync(this.path, { force: true }); }
}
