import type {
  PreferencesStore,
  StoredPreferences,
} from '../application/settings/preferences-store.js';
import { storedPreferences } from '../storage/stored-preferences.js';

/**
 * Keeps the preferences in plain memory; `stored` is what the file would hold,
 * damaged or not, and reads drop what the file would drop.
 */
export class MemoryPreferences implements PreferencesStore {
  constructor(public stored: unknown = {}) {}

  read(): Promise<StoredPreferences> {
    return Promise.resolve(storedPreferences(this.stored));
  }

  /** Applied at once, so changes made together still apply one after another. */
  change(update: (current: StoredPreferences) => StoredPreferences): Promise<StoredPreferences> {
    const next = update(storedPreferences(this.stored));
    this.stored = next;
    return Promise.resolve(next);
  }
}
