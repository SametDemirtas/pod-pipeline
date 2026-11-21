import type { Encryption } from './secret-file.js';

/** Electron's `safeStorage`; the backend is only reported on Linux. */
export interface SafeStorage extends Encryption {
  getSelectedStorageBackend?(): string;
}

/**
 * Without a keyring, Electron on Linux encrypts with a key built into the app,
 * which protects nothing, so that case counts as no encryption at all.
 */
export function keychainEncryption(storage: SafeStorage, platform: NodeJS.Platform): Encryption {
  const builtInKey = () =>
    platform === 'linux' && storage.getSelectedStorageBackend?.() === 'basic_text';
  return {
    isEncryptionAvailable: () => storage.isEncryptionAvailable() && !builtInKey(),
    encryptString: (text) => storage.encryptString(text),
    decryptString: (data) => storage.decryptString(data),
  };
}
