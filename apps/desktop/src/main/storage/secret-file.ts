import {
  SECRET_NAMES,
  SecretStorageUnavailableError,
  type SecretChanges,
  type SecretName,
  type SecretStore,
} from '../application/connections/secret-store.js';
import { readJsonFile } from '../files/json-file.js';
import { writeFileAtomically } from '../files/write-file-atomically.js';
import { SerialQueue } from '../shared/serial-queue.js';

/** The part of Electron's `safeStorage` the file needs; it encrypts with the OS keychain. */
export interface Encryption {
  isEncryptionAvailable(): boolean;
  encryptString(text: string): Buffer;
  decryptString(data: Buffer): string;
}

type Entries = Partial<Record<SecretName, string>>;

/**
 * Connection secrets, encrypted one by one and kept in a file only the user
 * can read. An entry that no longer decrypts, for example after the keychain
 * was reset, reads as missing so the user can connect again.
 */
export class SecretFile implements SecretStore {
  private readonly changes = new SerialQueue();

  constructor(
    private readonly path: string,
    private readonly encryption: Encryption,
  ) {}

  async get(name: SecretName): Promise<string | undefined> {
    return this.decrypt((await this.readEntries())[name]);
  }

  /**
   * Rewrites one secret from its current value in the same queued step, so no
   * other change can land between reading and writing. `undefined` keeps it.
   */
  async edit(
    name: SecretName,
    rewrite: (current: string | undefined) => string | undefined,
  ): Promise<void> {
    this.assertWritable();
    await this.change((entries) => {
      const next = rewrite(this.decrypt(entries[name]));
      if (next === undefined) return entries;
      return { ...entries, [name]: this.encryption.encryptString(next).toString('base64') };
    });
  }

  private decrypt(encrypted: string | undefined): string | undefined {
    if (encrypted === undefined || !this.encryption.isEncryptionAvailable()) return undefined;
    try {
      return this.encryption.decryptString(Buffer.from(encrypted, 'base64'));
    } catch {
      return undefined;
    }
  }

  /** Throws when secrets cannot be protected, so callers can stop before doing any work. */
  assertWritable(): void {
    if (!this.encryption.isEncryptionAvailable()) throw new SecretStorageUnavailableError();
  }

  async update(changes: SecretChanges): Promise<void> {
    const values = Object.entries(changes.set ?? {});
    if (values.length > 0) this.assertWritable();
    const encrypted: Entries = Object.fromEntries(
      values.map(([name, value]) => [
        name,
        this.encryption.encryptString(value).toString('base64'),
      ]),
    );
    const removed = new Set<string>(changes.remove ?? []);
    await this.change((entries) => ({
      ...Object.fromEntries(Object.entries(entries).filter(([name]) => !removed.has(name))),
      ...encrypted,
    }));
  }

  private change(update: (entries: Entries) => Entries): Promise<void> {
    return this.changes.run(async () => {
      const next = update(await this.readEntries());
      await writeFileAtomically(this.path, JSON.stringify(next), 0o600);
    });
  }

  private async readEntries(): Promise<Entries> {
    const parsed = await readJsonFile(this.path);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [SecretName, string] =>
          (SECRET_NAMES as readonly string[]).includes(entry[0]) && typeof entry[1] === 'string',
      ),
    );
  }
}
