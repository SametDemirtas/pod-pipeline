import { beforeEach, describe, expect, it } from 'vitest';
import {
  SecretStorageUnavailableError,
  type SecretStore,
} from '../application/connections/secret-store.js';

/** A store under test, and a switch for whether the keychain can protect secrets. */
export interface SecretStoreSubject {
  readonly store: SecretStore;
  readonly setKeychain: (available: boolean) => void;
}

/** What every secret store does, so the app behaves the same on any of them. */
export function describeSecretStoreContract(name: string, make: () => SecretStoreSubject): void {
  describe(`${name} as a secret store`, () => {
    let subject: SecretStoreSubject;
    beforeEach(() => {
      subject = make();
    });

    const current = () => subject;
    describeUpdates(current);
    describeEdits(current);
  });
}

/** Storing and removing secrets, and the keychain they need. */
function describeUpdates(subject: () => SecretStoreSubject): void {
  it('reads back what was stored, and nothing for a name never stored', async () => {
    await subject().store.update({ set: { printful: 'token-123', dropbox: '{"appKey":"k"}' } });

    expect(await subject().store.get('printful')).toBe('token-123');
    expect(await subject().store.get('dropbox')).toBe('{"appKey":"k"}');
    expect(await subject().store.get('s3')).toBeUndefined();
  });

  it('removes one secret and keeps the others', async () => {
    await subject().store.update({ set: { printful: 'a', s3: 'b' } });

    await subject().store.update({ remove: ['printful'] });

    expect(await subject().store.get('printful')).toBeUndefined();
    expect(await subject().store.get('s3')).toBe('b');
  });

  it('applies changes made together one after another', async () => {
    await subject().store.update({ set: { dropbox: 'd' } });

    await Promise.all([
      subject().store.update({ set: { s3: 's' }, remove: ['dropbox'] }),
      subject().store.update({ set: { dropbox: 'e' }, remove: ['s3'] }),
    ]);

    expect([await subject().store.get('dropbox'), await subject().store.get('s3')]).toEqual([
      'e',
      undefined,
    ]);
  });

  it('removes without the keychain, but neither stores nor reads', async () => {
    await subject().store.update({ set: { printful: 'a', s3: 'b' } });
    subject().setKeychain(false);

    expect(() => {
      subject().store.assertWritable();
    }).toThrow(SecretStorageUnavailableError);
    await expect(subject().store.update({ set: { printful: 'c' } })).rejects.toBeInstanceOf(
      SecretStorageUnavailableError,
    );
    await expect(subject().store.edit('printful', () => 'c')).rejects.toBeInstanceOf(
      SecretStorageUnavailableError,
    );
    expect(await subject().store.get('printful')).toBeUndefined();
    await subject().store.update({ remove: ['s3'] });
    subject().setKeychain(true);

    expect(await subject().store.get('printful')).toBe('a');
    expect(await subject().store.get('s3')).toBeUndefined();
  });
}

/** Rewriting a secret from the value it has. */
function describeEdits(subject: () => SecretStoreSubject): void {
  it('rewrites a secret from its value after the changes made before it', async () => {
    const first = subject().store.update({ set: { etsy: 'one' } });
    const edited = subject().store.edit('etsy', (current) => `${current ?? 'none'}+two`);
    await Promise.all([first, edited]);

    expect(await subject().store.get('etsy')).toBe('one+two');
  });

  it('keeps the secret when the rewrite returns nothing', async () => {
    await subject().store.update({ set: { etsy: 'one' } });

    await subject().store.edit('etsy', () => undefined);

    expect(await subject().store.get('etsy')).toBe('one');
  });
}
