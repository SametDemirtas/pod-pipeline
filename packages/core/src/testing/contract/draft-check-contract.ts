import { beforeEach, describe, expect, it } from 'vitest';
import type { DraftCheck } from '../../listing/draft-checks.js';
import type { DesignId } from '../../catalog/model.js';
import type { CatalogWriter } from '../../ports/catalog-repositories.js';
import type { DraftCheckRepository } from '../../ports/draft-checks.js';
import { sampleConcept, sampleDesign } from './samples.js';

export interface DraftCheckPersistence {
  readonly catalog: CatalogWriter;
  readonly checks: DraftCheckRepository;
}

const MUG = 'design-01-mug' as DesignId;
const BLANKET = 'design-01-blanket' as DesignId;
const unconfirmed: DraftCheck = {
  step: 'draft',
  code: 'DRAFT_UNCONFIRMED',
  message: 'may exist',
  details: {},
};

/** Behaviour every store of designs whose draft may be on Etsy must share. */
export function describeDraftCheckContract(
  name: string,
  create: () => Promise<DraftCheckPersistence> | DraftCheckPersistence,
): void {
  describe(`${name} draft check contract`, () => {
    let store: DraftCheckPersistence;

    beforeEach(async () => {
      store = await create();
      await store.catalog.concepts.save(sampleConcept('01'));
      await store.catalog.designs.save(sampleDesign('01-mug'));
      await store.catalog.designs.save(sampleDesign('01-blanket'));
    });

    it('keeps why each design waits, replacing an earlier reason', async () => {
      const leftBehind: DraftCheck = {
        ...unconfirmed,
        code: 'DRAFT_LEFT_BEHIND',
        details: { marketplaceId: '77' },
      };
      await store.checks.set(MUG, unconfirmed);
      await store.checks.set(BLANKET, unconfirmed);
      await store.checks.set(BLANKET, leftBehind);

      expect(await store.checks.all()).toEqual(
        new Map<DesignId, DraftCheck>([
          [MUG, unconfirmed],
          [BLANKET, leftBehind],
        ]),
      );
    });

    it('reads why one design waits, and nothing for one that does not', async () => {
      await store.checks.set(MUG, unconfirmed);

      expect(await store.checks.get(MUG)).toEqual(unconfirmed);
      expect(await store.checks.get(BLANKET)).toBeUndefined();
    });

    it('forgets a design once the seller checked, and one never kept', async () => {
      await store.checks.set(MUG, unconfirmed);
      await store.checks.clear(MUG);
      await store.checks.clear(BLANKET);
      expect(await store.checks.get(MUG)).toBeUndefined();

      expect(await store.checks.all()).toEqual(new Map());
    });
  });
}
