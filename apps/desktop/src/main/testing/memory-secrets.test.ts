import { MemorySecrets } from './memory-secrets.js';
import { describeSecretStoreContract } from './secret-store-contract.js';

describeSecretStoreContract('MemorySecrets', () => {
  const store = new MemorySecrets();
  return {
    store,
    setKeychain: (available) => {
      store.writable = available;
    },
  };
});
