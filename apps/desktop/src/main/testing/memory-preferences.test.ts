import { MemoryPreferences } from './memory-preferences.js';
import { describePreferencesStoreContract } from './preferences-store-contract.js';

describePreferencesStoreContract('MemoryPreferences', () => {
  const store = new MemoryPreferences();
  return {
    store,
    seed: (raw) => {
      store.stored = raw;
    },
  };
});
