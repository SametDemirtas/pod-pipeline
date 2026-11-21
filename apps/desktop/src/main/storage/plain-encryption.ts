import type { Encryption } from './secret-file.js';

/** Stores secrets as they are, for tests and test builds that have no keychain. */
export const plainEncryption: Encryption = {
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from(text),
  decryptString: (data) => data.toString(),
};
