import { LISTING_RULES } from '@pod/rules';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CheckDesignPrint,
  CreateListingDraft,
  DraftGuard,
  LinkListing,
  LiveListingPhotos,
  PublishListing,
  RefreshListing,
  ReplaceListingPhotos,
  type DesignId,
} from '@pod/core';
import { sampleConcept, sampleDesign, sampleListing } from '@pod/core/testing/contract';
import {
  FakeFileHost,
  FakeMarketplace,
  FakePrintCatalog,
  FakePrintSync,
  FakeShop,
  FixedClock,
  InMemoryCatalog,
  InMemoryDraftChecks,
  InMemoryListings,
  InMemoryMockups,
  SAMPLE_LINKS,
  SequentialIds,
} from '@pod/core/testing';
import { photo } from '../../testing/mockup-fixtures.js';

import { ListingService } from './listing-service.js';
import type { FulfilmentStoreMismatch } from './fulfilment-store-mismatch.js';

const MUG = 'design-01-mug' as DesignId;

describe('ListingService', () => {
  let marketplace: FakeMarketplace;
  let printSync: FakePrintSync;
  let listings: InMemoryListings;
  let catalogChanged: ReturnType<typeof vi.fn<() => void>>;
  let service: ListingService;
  let wrongStore: () => Promise<FulfilmentStoreMismatch | null>;

  beforeEach(async () => {
    const catalog = new InMemoryCatalog();
    await catalog.concepts.save(sampleConcept('01'));
    await catalog.designs.save(sampleDesign('01-mug'));
    await catalog.designs.save(sampleDesign('01-t-shirt'));
    const mockups = new InMemoryMockups();
    await mockups.replace(MUG, { variantId: '1320', printArea: 'default' }, [
      { ...photo, asset: sampleDesign('01-mug').asset },
    ]);
    marketplace = new FakeMarketplace();
    printSync = new FakePrintSync();
    listings = new InMemoryListings();
    catalogChanged = vi.fn<() => void>();
    wrongStore = () => Promise.resolve(null);
    const printCatalog = new FakePrintCatalog();
    const clock = new FixedClock();
    const assets = { pathOf: (key: string) => `/data/${key}` };
    service = new ListingService({
      query: catalog,
      shop: new FakeShop(),
      links: SAMPLE_LINKS,
      listings,
      createDraft: new CreateListingDraft({
        checkPrint: new CheckDesignPrint(catalog, printCatalog),
        mockups,
        assets,
        marketplace,
        listings,
        disclosure: { designsMadeWithAi: () => Promise.resolve(false) },
        guard: new DraftGuard(new InMemoryDraftChecks(), () => undefined),
        clock,
        ids: new SequentialIds('listing'),
        rules: LISTING_RULES,
      }),
      link: new LinkListing({
        query: catalog,
        printCatalog,
        listings,
        printSync,
        fileHost: new FakeFileHost(),
        assets,
        clock,
      }),
      publish: new PublishListing({ query: catalog, listings, marketplace, clock }),
      refresh: new RefreshListing({ query: catalog, listings, marketplace, clock }),
      livePhotos: new LiveListingPhotos({ query: catalog, listings, marketplace, printSync }),
      thumbnail: (url) => Promise.resolve(url.includes('missing') ? null : `data:${url}`),
      replacePhotos: new ReplaceListingPhotos({
        query: catalog,
        listings,
        mockups,
        assets,
        marketplace,
        rules: LISTING_RULES,
      }),
      events: { catalogChanged },
      fulfilmentStoreMismatch: () => wrongStore(),
    });
  });

  const request = {
    designId: MUG,
    fit: 'contain' as const,
    language: 'en-US',
    title: 'Tulip Mug',
    description: 'Spooky.',
    tags: ['tulip mug'],
    price: 1999,
    currency: 'USD',
    variantIds: ['1320', '4830'],
    mockupIds: ['m1'],
    shippingProfileId: '316',
    readinessStateId: '151',
    productionPartnerIds: [],
  };

  it('passes the shop options through', async () => {
    expect(await service.getShopOptions()).toMatchObject({
      shopName: 'ExampleShop',
      draftsUrl: 'https://shop.example/drafts',
    });
  });

  it('creates, links and publishes a listing, announcing each change', async () => {
    expect(await service.getListing({ id: MUG })).toBeNull();

    const draft = await service.createListing({
      ...request,
      tags: ['harry potter mug'],
      translations: [
        {
          language: 'de',
          title: 'Geister Tasse',
          description: 'Handgemacht.',
          tags: ['NFL Tasse'],
        },
      ],
    });
    // Named for the seller, without holding up the draft.
    expect(draft.trademarks).toEqual(['Harry Potter', 'NFL']);
    expect(draft.aiTells).toEqual([
      { language: 'de', category: 'hype', field: 'description', match: 'Handgemacht' },
    ]);
    expect(marketplace.translations.get(`${draft.listingId}/de`)).toEqual({
      title: 'Geister Tasse',
      description: 'Handgemacht.',
      tags: ['NFL Tasse'],
    });
    printSync.importListing(draft.listingId, ['p-PF-1320', 'p-PF-4830']);
    const linked = await service.linkListing({ id: MUG });
    const published = await service.publishListing({ id: MUG });

    expect(marketplace.drafts.get(draft.listingId)?.text).toEqual({
      title: 'Tulip Mug',
      description: 'Spooky.',
      tags: ['harry potter mug'],
    });
    expect(draft).toEqual({
      designId: MUG,
      listingId: '9000',
      state: 'draft',
      editUrl: 'https://shop.example/edit/9000',
      printArea: 'default',
      fit: 'contain',
      products: [
        { sku: 'PF-1320', variantId: '1320' },
        { sku: 'PF-4830', variantId: '4830' },
      ],
      linkedAt: null,
      linkCurrent: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      publishedAt: null,
      trademarks: ['Harry Potter', 'NFL'],
      aiTells: draft.aiTells,
    });
    expect(linked).toMatchObject({ linkedAt: '2026-01-01T00:00:00.000Z', linkCurrent: true });
    expect(published).toMatchObject({ state: 'active', publishedAt: '2026-01-01T00:00:00.000Z' });
    expect(await service.getListing({ id: MUG })).toEqual(published);
    expect(catalogChanged).toHaveBeenCalledTimes(3);

    marketplace.states.set(draft.listingId, 'deleted');
    expect(await service.refreshListing({ id: MUG })).toBeNull();
    expect(await service.getListing({ id: MUG })).toBeNull();
  });

  it("replaces the draft's photos and announces the change", async () => {
    await listings.save(sampleListing(MUG));

    const listing = await service.replaceListingPhotos({ designId: MUG, mockupIds: ['m1'] });

    expect(listing).toMatchObject({ designId: MUG, listingId: '1234567890', state: 'draft' });
    expect(marketplace.images.get('1234567890')).toEqual([
      { absolutePath: '/data/assets/sha-01-mug', mimeType: 'image/png' },
    ]);
    expect(catalogChanged).toHaveBeenCalledTimes(1);
  });

  it('shows what Etsy and Printful have, with small copies of the photos', async () => {
    await listings.save(sampleListing(MUG));
    marketplace.shownPhotos.set('1234567890', [
      {
        url: 'https://etsy/1.jpg',
        thumbnailUrl: 'https://etsy/1-s.jpg',
        width: 2000,
        height: 2000,
      },
      {
        url: 'https://etsy/2.jpg',
        thumbnailUrl: 'https://etsy/missing.jpg',
        width: null,
        height: null,
      },
    ]);

    expect(await service.listingPhotos({ id: MUG })).toEqual({
      marketplace: [
        {
          url: 'https://etsy/1.jpg',
          image: 'data:https://etsy/1-s.jpg',
          width: 2000,
          height: 2000,
        },
        { url: 'https://etsy/2.jpg', image: '', width: null, height: null },
      ],
      print: null,
    });

    printSync.importListing('1234567890', ['p-1']);
    printSync.shownPreviews.set('1234567890', [
      { kind: 'preview', url: 'https://pf/p.png', thumbnailUrl: 'https://pf/t.png' },
    ]);
    expect((await service.listingPhotos({ id: MUG })).print).toEqual([
      { kind: 'preview', url: 'https://pf/p.png', image: 'data:https://pf/t.png' },
    ]);
    expect(catalogChanged).not.toHaveBeenCalled();
  });

  it('refuses to replace the photos of a published listing', async () => {
    await listings.save(sampleListing(MUG, { state: 'active' }));

    await expect(
      service.replaceListingPhotos({ designId: MUG, mockupIds: ['m1'] }),
    ).rejects.toMatchObject({ code: 'LISTING_NOT_DRAFT' });
    expect(marketplace.images.size).toBe(0);
  });

  /** Holds Printful's answer until `finish`, which first waits until the link asked for it. */
  function holdSync() {
    let reached = false;
    let answer: () => void = () => undefined;
    printSync.syncedVariants = () =>
      new Promise((resolve) => {
        reached = true;
        answer = () => {
          resolve(undefined);
        };
      });
    return {
      finish: async () => {
        await vi.waitFor(() => {
          expect(reached).toBe(true);
        });
        answer();
      },
    };
  }

  it('refuses a second change while one runs', async () => {
    await listings.save(sampleListing(MUG));
    const sync = holdSync();

    const first = service.linkListing({ id: MUG });
    await expect(service.linkListing({ id: MUG })).rejects.toMatchObject({
      code: 'LISTING_IN_PROGRESS',
    });
    await sync.finish();
    await expect(first).rejects.toMatchObject({ code: 'LISTING_NOT_SYNCED' });
    expect(catalogChanged).not.toHaveBeenCalled();
  });

  it('says when Printful cannot import the listing because the token is for another store', async () => {
    await listings.save(sampleListing(MUG));
    printSync.syncedVariants = () => Promise.resolve(undefined);
    wrongStore = () =>
      Promise.resolve({
        problem: 'not-marketplace',
        storeName: 'Maple Lane',
        shopName: 'MapleLaneStore',
      });

    await expect(service.linkListing({ id: MUG })).rejects.toMatchObject({
      code: 'PRINTFUL_STORE_NOT_ETSY',
      details: { store: 'Maple Lane', shop: 'MapleLaneStore' },
    });

    wrongStore = () => Promise.reject(new Error('offline'));
    await expect(service.linkListing({ id: MUG })).rejects.toMatchObject({
      code: 'LISTING_NOT_SYNCED',
    });
  });

  it('waits for a change under way when closing and refuses new ones', async () => {
    await listings.save(sampleListing(MUG));
    const sync = holdSync();
    let closed = false;

    const first = service.linkListing({ id: MUG });
    const closing = service.close().then(() => {
      closed = true;
    });
    await expect(service.refreshListing({ id: MUG })).rejects.toThrow('The app is closing');
    expect(closed).toBe(false);
    await sync.finish();
    await closing;
    await expect(first).rejects.toMatchObject({ code: 'LISTING_NOT_SYNCED' });
  });

  it('lets another design change its listing meanwhile', async () => {
    await listings.save(sampleListing(MUG));
    const sync = holdSync();

    const shirt = 'design-01-t-shirt' as DesignId;
    await listings.save(sampleListing(shirt, { marketplaceId: '2' }));

    const first = service.linkListing({ id: MUG });
    expect(await service.refreshListing({ id: shirt })).toMatchObject({ state: 'draft' });
    await sync.finish();
    await expect(first).rejects.toMatchObject({ code: 'LISTING_NOT_SYNCED' });
  });

  it('links a listing linked to the current revision only when asked to link again', async () => {
    await listings.save(
      sampleListing(MUG, { linkedAt: new Date('2026-01-01T00:00:00.000Z'), designRevision: 1 }),
    );
    const synced = vi.spyOn(printSync, 'syncedVariants');

    await service.linkListing({ id: MUG });
    expect(synced).not.toHaveBeenCalled();

    await expect(service.linkListing({ id: MUG, again: true })).rejects.toMatchObject({
      code: 'LISTING_NOT_SYNCED',
    });
    expect(synced).toHaveBeenCalled();
  });

  it('tells whether the link is to the current design revision', async () => {
    const linkedAt = new Date('2026-01-01T00:00:00.000Z');

    await listings.save(sampleListing(MUG, { linkedAt, designRevision: 1 }));
    expect(await service.getListing({ id: MUG })).toMatchObject({ linkCurrent: true });

    await listings.save(sampleListing(MUG, { linkedAt, designRevision: 0 }));
    expect(await service.getListing({ id: MUG })).toMatchObject({ linkCurrent: false });

    const gone = 'design-02-mug' as DesignId;
    await listings.save(sampleListing(gone, { linkedAt, marketplaceId: '2' }));
    expect(await service.getListing({ id: gone })).toMatchObject({ linkCurrent: false });
  });
});
