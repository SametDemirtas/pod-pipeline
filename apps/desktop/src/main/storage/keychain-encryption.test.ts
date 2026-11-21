import { describe, expect, it } from 'vitest';
import { keychainEncryption, type SafeStorage } from './keychain-encryption.js';

function storage(backend?: string): SafeStorage {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (text) => Buffer.from(text).reverse(),
    decryptString: (data) => Buffer.from(data).reverse().toString(),
    ...(backend && { getSelectedStorageBackend: () => backend }),
  };
}

describe('keychainEncryption', () => {
  it('encrypts through the system storage', () => {
    const encryption = keychainEncryption(storage(), 'darwin');

    expect(encryption.isEncryptionAvailable()).toBe(true);
    expect(encryption.decryptString(encryption.encryptString('secret'))).toBe('secret');
  });

  it.each([
    ['linux', 'basic_text', false],
    ['linux', 'gnome_libsecret', true],
    ['win32', 'basic_text', true],
  ] as const)('on %s with %s reports available = %s', (platform, backend, available) => {
    expect(keychainEncryption(storage(backend), platform).isEncryptionAvailable()).toBe(available);
  });

  it('is unavailable when the system storage is', () => {
    const encryption = keychainEncryption(
      { ...storage(), isEncryptionAvailable: () => false },
      'darwin',
    );

    expect(encryption.isEncryptionAvailable()).toBe(false);
  });
});
