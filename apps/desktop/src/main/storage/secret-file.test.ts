import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describeSecretStoreContract } from '../testing/secret-store-contract.js';
import { SecretFile, type Encryption } from './secret-file.js';

/** Reverses the bytes, so stored values are never the plain text. */
class FakeEncryption implements Encryption {
  available = true;

  isEncryptionAvailable(): boolean {
    return this.available;
  }

  encryptString(text: string): Buffer {
    return Buffer.from(text).reverse();
  }

  decryptString(data: Buffer): string {
    if (data.length === 0) throw new Error('cannot decrypt');
    return Buffer.from(data).reverse().toString();
  }
}

let dir: string;
let path: string;
let encryption: FakeEncryption;
let secrets: SecretFile;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pod-secrets-'));
  path = join(dir, 'secrets.json');
  encryption = new FakeEncryption();
  secrets = new SecretFile(path, encryption);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describeSecretStoreContract('SecretFile', () => ({
  store: secrets,
  setKeychain: (available) => {
    encryption.available = available;
  },
}));

describe('SecretFile', () => {
  it('keeps secrets encrypted in the file', async () => {
    await secrets.update({ set: { printful: 'token-123' } });

    expect(readFileSync(path, 'utf8')).not.toContain('token-123');
  });

  it.skipIf(process.platform === 'win32')('keeps the file readable by the user only', async () => {
    await secrets.update({ set: { printful: 'token' } });

    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it.each([
    ['not JSON', '{'],
    ['not an object', '"text"'],
    ['unknown names and values', '{"other":"x","printful":5}'],
  ])('reads a file that is %s as empty', async (_case, content) => {
    writeFileSync(path, content);

    expect(await secrets.get('printful')).toBeUndefined();
  });

  it('treats an entry that no longer decrypts as missing', async () => {
    writeFileSync(path, JSON.stringify({ printful: '' }));

    expect(await secrets.get('printful')).toBeUndefined();
  });

  it('reports read errors other than a missing file', async () => {
    const folder = new SecretFile(dir, encryption);

    await expect(folder.get('printful')).rejects.toThrow();
  });
});
