import type {
  PreferencesStore,
  StoredPreferences,
} from '../application/settings/preferences-store.js';
import { SerialQueue } from '../shared/serial-queue.js';
import { readJsonFile } from '../files/json-file.js';
import { writeFileAtomically } from '../files/write-file-atomically.js';
import { storedPreferences } from './stored-preferences.js';

/**
 * The app's preferences as one small JSON file. A missing or unparsable file
 * reads as empty; any other read error is reported, so a locked file is never
 * mistaken for an empty one and overwritten. Changes apply one at a time.
 */
export class PreferencesFile implements PreferencesStore {
  private readonly changes = new SerialQueue();

  constructor(private readonly path: string) {}

  async read(): Promise<StoredPreferences> {
    return storedPreferences(await readJsonFile(this.path));
  }

  change(update: (current: StoredPreferences) => StoredPreferences): Promise<StoredPreferences> {
    return this.changes.run(async () => {
      const next = update(await this.read());
      await writeFileAtomically(this.path, JSON.stringify(next, null, 2));
      return next;
    });
  }
}
