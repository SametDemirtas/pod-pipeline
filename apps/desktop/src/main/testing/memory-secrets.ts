import {
  SecretStorageUnavailableError,
  type SecretChanges,
  type SecretName,
  type SecretStore,
} from '../application/connections/secret-store.js';

/** Stores secrets in plain memory; `writable = false` acts like a missing keychain. */
export class MemorySecrets implements SecretStore {
  readonly entries = new Map<SecretName, string>();
  writable = true;

  /** Nothing reads without the keychain, as stored secrets cannot be decrypted then. */
  get(name: SecretName): Promise<string | undefined> {
    return Promise.resolve(this.writable ? this.entries.get(name) : undefined);
  }

  assertWritable(): void {
    if (!this.writable) throw new SecretStorageUnavailableError();
  }

  /** Applied at once, like a queued change; a refusal rejects, as the file's does. */
  update(changes: SecretChanges): Promise<void> {
    return new Promise((resolve) => {
      if (Object.keys(changes.set ?? {}).length > 0) this.assertWritable();
      for (const name of changes.remove ?? []) this.entries.delete(name);
      for (const [name, value] of Object.entries(changes.set ?? {})) {
        this.entries.set(name as SecretName, value);
      }
      resolve();
    });
  }

  edit(
    name: SecretName,
    rewrite: (current: string | undefined) => string | undefined,
  ): Promise<void> {
    return new Promise((resolve) => {
      this.assertWritable();
      const next = rewrite(this.entries.get(name));
      if (next !== undefined) this.entries.set(name, next);
      resolve();
    });
  }
}
