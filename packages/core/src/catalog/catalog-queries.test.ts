import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError, ValidationError } from '../errors.js';
import { DEFAULT_PAGE_SIZE } from '../pagination.js';
import { sampleConcept, sampleDesign } from '../testing/contract/index.js';
import { InMemoryCatalog } from '../testing/index.js';
import { GetDesign, ListDesigns, MAX_SEARCH_CHARACTERS } from './catalog-queries.js';
import { DEFAULT_PRODUCT_FAMILIES } from './default-families.js';
import { ProductFamilyCatalog } from './product-family.js';

describe('catalog queries', () => {
  let catalog: InMemoryCatalog;
  let listDesigns: ListDesigns;

  beforeEach(async () => {
    catalog = new InMemoryCatalog();
    listDesigns = new ListDesigns(catalog, new ProductFamilyCatalog(DEFAULT_PRODUCT_FAMILIES));
    await catalog.concepts.save(sampleConcept('01', 'Lantern Harbor'));
    for (const key of ['01-phone-case', '01-mug', '01-blanket'])
      await catalog.designs.save(sampleDesign(key));
  });

  describe('ListDesigns', () => {
    it('asks for the default page size without a cursor', async () => {
      const spy = vi.spyOn(catalog, 'listDesigns');

      await listDesigns.execute();

      expect(spy).toHaveBeenCalledWith(
        { familyId: undefined, search: undefined },
        { limit: DEFAULT_PAGE_SIZE },
      );
    });

    it('passes family, trimmed search and paging through', async () => {
      const page = await listDesigns.execute({ familyId: 'mug', search: ' lantern ', limit: 1 });

      expect(page.items.map((item) => item.designKey)).toEqual(['01-mug']);
      expect(page.total).toBe(1);
      const all = await listDesigns.execute({ search: 'lantern', limit: 2 });
      const next = await listDesigns.execute({
        search: 'lantern',
        limit: 2,
        cursor: all.nextCursor ?? undefined,
      });
      expect([...all.items, ...next.items].map((item) => item.designKey)).toEqual([
        '01-blanket',
        '01-mug',
        '01-phone-case',
      ]);
    });

    it('treats a blank search as no search', async () => {
      expect((await listDesigns.execute({ search: '   ' })).total).toBe(3);
    });

    it('rejects an unknown product family', async () => {
      await expect(listDesigns.execute({ familyId: 'lamp' })).rejects.toBeInstanceOf(
        ValidationError,
      );
    });

    it('limits search length in characters, not code units', async () => {
      const emoji = '🎄'.repeat(MAX_SEARCH_CHARACTERS);

      expect((await listDesigns.execute({ search: emoji })).total).toBe(0);
      await expect(listDesigns.execute({ search: `${emoji}x` })).rejects.toBeInstanceOf(
        ValidationError,
      );
    });

    it('rejects an invalid limit or cursor', async () => {
      await expect(listDesigns.execute({ limit: 0 })).rejects.toBeInstanceOf(ValidationError);
      await expect(listDesigns.execute({ cursor: 'nope' })).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('GetDesign', () => {
    it('returns the design with its concept and revisions', async () => {
      const details = await new GetDesign(catalog).execute(sampleDesign('01-mug').id);

      expect(details.design.concept.name).toBe('Lantern Harbor');
      expect(details.revisions.map((revision) => revision.revision)).toEqual([1]);
    });

    it('fails for an unknown id', async () => {
      await expect(new GetDesign(catalog).execute('missing')).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
