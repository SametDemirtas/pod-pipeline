import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError } from '../../errors.js';
import type { DesignId } from '../../catalog/model.js';
import type { Listing, ListingId } from '../../listing/listing.js';
import type { CatalogWriter } from '../../ports/catalog-repositories.js';
import type { ListingRepository } from '../../ports/listings.js';
import { sampleConcept, sampleDesign } from './samples.js';

export interface ShopListingPersistence {
  readonly catalog: CatalogWriter;
  readonly listings: ListingRepository;
}

const MUG = 'design-01-mug' as DesignId;
const SHIRT = 'design-01-t-shirt' as DesignId;

export function sampleListing(designId: DesignId, overrides: Partial<Listing> = {}): Listing {
  return {
    id: `listing-${designId}` as ListingId,
    designId,
    designRevision: 1,
    marketplaceId: '1234567890',
    state: 'draft',
    printArea: 'default',
    fit: 'contain',
    products: [
      { sku: 'PF-1320', productId: '800000001', variantId: '1320' },
      { sku: 'PF-4830', productId: '800000002', variantId: '4830' },
    ],
    linkedAt: null,
    createdAt: new Date('2026-10-24T10:00:00.000Z'),
    publishedAt: null,
    ...overrides,
  };
}

/** Behaviour every listing repository must share. */
export function describeShopListingContract(
  name: string,
  create: () => Promise<ShopListingPersistence> | ShopListingPersistence,
): void {
  describe(`${name} shop listing contract`, () => {
    let store: ShopListingPersistence;

    beforeEach(async () => {
      store = await create();
      await store.catalog.concepts.save(sampleConcept('01'));
      await store.catalog.designs.save(sampleDesign('01-mug'));
      await store.catalog.designs.save(sampleDesign('01-t-shirt'));
    });

    it('finds nothing for a design without a listing', async () => {
      expect(await store.listings.findByDesign(MUG)).toBeUndefined();
    });

    it('stores a listing with its products and finds it by design', async () => {
      const listing = sampleListing(MUG);
      await store.listings.save(listing);
      await store.listings.save(sampleListing(SHIRT, { marketplaceId: '77' }));

      expect(await store.listings.findByDesign(MUG)).toEqual(listing);
    });

    it('refuses a second listing for a design or a marketplace listing', async () => {
      await store.listings.save(sampleListing(MUG));

      await expect(
        store.listings.save(sampleListing(MUG, { id: 'other' as ListingId, marketplaceId: '1' })),
      ).rejects.toBeInstanceOf(ConflictError);
      await expect(store.listings.save(sampleListing(SHIRT))).rejects.toBeInstanceOf(ConflictError);
    });

    it('forgets a removed listing with its products', async () => {
      await store.listings.save(sampleListing(MUG));

      await store.listings.remove(sampleListing(MUG).id);
      await store.listings.save(sampleListing(MUG, { id: 'again' as ListingId }));

      expect((await store.listings.findByDesign(MUG))?.id).toBe('again');
    });

    it('replaces a listing saved again with the same id', async () => {
      await store.listings.save(sampleListing(MUG));
      const published = sampleListing(MUG, {
        state: 'active',
        designRevision: 2,
        linkedAt: new Date('2026-10-24T11:00:00.000Z'),
        publishedAt: new Date('2026-10-24T12:00:00.000Z'),
        products: [{ sku: 'PF-1320', productId: '800000001', variantId: '1320' }],
      });

      await store.listings.save(published);

      expect(await store.listings.findByDesign(MUG)).toEqual(published);
    });
  });
}
