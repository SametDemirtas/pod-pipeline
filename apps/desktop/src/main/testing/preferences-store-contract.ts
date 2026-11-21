import { beforeEach, describe, expect, it } from 'vitest';
import type { PreferencesStore } from '../application/settings/preferences-store.js';

/** A store under test, and a way to put what an older or damaged app left behind in it. */
export interface PreferencesStoreSubject {
  readonly store: PreferencesStore;
  readonly seed: (raw: unknown) => void;
}

/** What every preferences store does, so the settings read the same from any of them. */
export function describePreferencesStoreContract(
  name: string,
  make: () => PreferencesStoreSubject,
): void {
  describe(`${name} as a preferences store`, () => {
    let subject: PreferencesStoreSubject;
    beforeEach(() => {
      subject = make();
    });

    it('reads nothing before the first change', async () => {
      expect(await subject.store.read()).toEqual({});
    });

    it.each([[[]], ['text'], [{ language: 'xx' }], [{ importFolders: 'x' }]])(
      'reads %j as empty',
      async (raw) => {
        subject.seed(raw);

        expect(await subject.store.read()).toEqual({});
      },
    );

    it('keeps valid fields when another one is damaged, and drops unknown keys', async () => {
      subject.seed({ language: 'fr', importFolders: ['/designs'], future: 1 });

      expect(await subject.store.read()).toEqual({ importFolders: ['/designs'] });
    });

    it('drops models of a service that no longer reads, and keeps those stored alone', async () => {
      subject.seed({ textProvider: 'mistral', textModel: 'mistral-large', sceneModel: 'scenes-2' });

      expect(await subject.store.read()).toEqual({ sceneModel: 'scenes-2' });
    });

    it('applies changes made together one after another, and returns each result', async () => {
      const results = await Promise.all(
        ['a', 'b', 'c'].map((folder) =>
          subject.store.change((current) => ({
            ...current,
            importFolders: [...(current.importFolders ?? []), folder],
          })),
        ),
      );

      expect(results.at(-1)).toEqual({ importFolders: ['a', 'b', 'c'] });
      expect(await subject.store.read()).toEqual({ importFolders: ['a', 'b', 'c'] });
    });
  });
}
