import { LISTING_RULES } from '@pod/rules';
import { beforeEach, describe, expect, it } from 'vitest';
import { ListingNotDraftError, NotFoundError, ValidationError } from '../errors.js';
import { sampleConcept, sampleDesign, sampleListing } from '../testing/contract/index.js';
import {
  FakeMarketplace,
  InMemoryCatalog,
  InMemoryListings,
  InMemoryMockups,
} from '../testing/index.js';
import { SHIRT, shirtPhoto } from '../testing/listing-draft-fixture.js';
import { ReplaceListingPhotos } from './replace-listing-photos.js';

describe('ReplaceListingPhotos', () => {
  let listings: InMemoryListings;
  let marketplace: FakeMarketplace;
  let replace: ReplaceListingPhotos;

  beforeEach(async () => {
    const catalog = new InMemoryCatalog();
    await catalog.concepts.save(sampleConcept('01', 'Lantern Harbor'));
    await catalog.designs.save(sampleDesign('01-t-shirt'));
    const mockups = new InMemoryMockups();
    await mockups.replace(SHIRT, { variantId: '4000', printArea: 'front' }, [
      shirtPhoto('m1'),
      {
        ...shirtPhoto('m2'),
        view: 'Lifestyle',
        asset: { ...shirtPhoto('m2').asset, mimeType: 'image/jpeg' },
      },
      { ...shirtPhoto('m3'), scenePrompt: 'On a reading chair', printConfirmed: true },
      { ...shirtPhoto('old'), designRevision: 0 },
    ]);
    listings = new InMemoryListings();
    marketplace = new FakeMarketplace();
    replace = new ReplaceListingPhotos({
      query: catalog,
      listings,
      mockups,
      assets: { pathOf: (key) => `/data/${key}` },
      marketplace,
      rules: LISTING_RULES,
    });
  });

  it("swaps the draft's photos for the chosen ones, in order", async () => {
    const listing = sampleListing(SHIRT);
    await listings.save(listing);

    expect(await replace.execute({ designId: SHIRT, mockupIds: ['m2', 'm1'] })).toEqual(listing);

    expect(marketplace.images.get('1234567890')).toEqual([
      { absolutePath: '/data/ab/m2', mimeType: 'image/jpeg' },
      { absolutePath: '/data/ab/m1', mimeType: 'image/png' },
    ]);
  });

  it.each([
    [[], 'choose at least one'],
    [['m1', 'm1'], 'lists an id twice'],
    [Array.from({ length: 11 }, (_, at) => `m${String(at)}`), 'choose at most 10'],
    [['old'], 'shows an earlier version'],
    [['m3'], 'needs the AI note'],
  ])('refuses the photos %j', async (mockupIds, reason) => {
    await listings.save(sampleListing(SHIRT));

    const replaced = replace.execute({ designId: SHIRT, mockupIds });

    await expect(replaced).rejects.toBeInstanceOf(ValidationError);
    await expect(replaced).rejects.toThrow(reason);
    expect(marketplace.images.size).toBe(0);
  });

  it('refuses a design without a listing', async () => {
    await expect(replace.execute({ designId: SHIRT, mockupIds: ['m1'] })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('leaves a published listing as it is', async () => {
    await listings.save(sampleListing(SHIRT, { state: 'active' }));

    await expect(replace.execute({ designId: SHIRT, mockupIds: ['m1'] })).rejects.toThrow(
      new ListingNotDraftError('1234567890', 'active'),
    );
    expect(marketplace.images.size).toBe(0);
  });

  it.each([
    ['active', 'active'],
    ['deleted', 'deleted'],
  ] as const)('refuses a draft that is %s on the marketplace by now', async (state, named) => {
    await listings.save(sampleListing(SHIRT));
    marketplace.states.set('1234567890', state);

    const replaced = replace.execute({ designId: SHIRT, mockupIds: ['m1'] });

    await expect(replaced).rejects.toBeInstanceOf(ListingNotDraftError);
    await expect(replaced).rejects.toMatchObject({ details: { state: named } });
    expect(marketplace.images.size).toBe(0);
  });

  it('passes on a failed upload', async () => {
    await listings.save(sampleListing(SHIRT));
    marketplace.failOn = 'replaceImages';

    await expect(replace.execute({ designId: SHIRT, mockupIds: ['m1'] })).rejects.toThrow(
      'image too large',
    );
  });
});
