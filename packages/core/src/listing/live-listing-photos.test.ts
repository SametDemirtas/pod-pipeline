import { beforeEach, describe, expect, it } from 'vitest';
import type { DesignId } from '../catalog/model.js';
import { NotFoundError } from '../errors.js';
import { sampleConcept, sampleDesign, sampleListing } from '../testing/contract/index.js';
import {
  FakeMarketplace,
  FakePrintSync,
  InMemoryCatalog,
  InMemoryListings,
} from '../testing/index.js';
import { LiveListingPhotos } from './live-listing-photos.js';

const MUG = 'design-01-mug' as DesignId;
const PHOTO = {
  url: 'https://etsy/full.jpg',
  thumbnailUrl: 'https://etsy/small.jpg',
  width: 2000,
  height: 2000,
};
const PREVIEW = {
  kind: 'preview',
  url: 'https://printful/p.png',
  thumbnailUrl: 'https://printful/t.png',
};

describe('LiveListingPhotos', () => {
  let marketplace: FakeMarketplace;
  let printSync: FakePrintSync;
  let photos: LiveListingPhotos;

  beforeEach(async () => {
    const catalog = new InMemoryCatalog();
    await catalog.concepts.save(sampleConcept('01'));
    await catalog.designs.save(sampleDesign('01-mug'));
    const listings = new InMemoryListings();
    await listings.save(sampleListing(MUG));
    marketplace = new FakeMarketplace();
    printSync = new FakePrintSync();
    photos = new LiveListingPhotos({ query: catalog, listings, marketplace, printSync });
  });

  it('reads the photos the listing shows and the print pictures of its files', async () => {
    marketplace.shownPhotos.set('1234567890', [PHOTO]);
    printSync.importListing('1234567890', ['p-1']);
    printSync.shownPreviews.set('1234567890', [PREVIEW]);

    expect(await photos.execute(MUG)).toEqual({ marketplace: [PHOTO], print: [PREVIEW] });
  });

  it('says when the print provider has not imported the listing yet', async () => {
    expect(await photos.execute(MUG)).toEqual({ marketplace: [], print: undefined });
  });

  it('refuses a design without a listing', async () => {
    await expect(photos.execute('design-02-mug')).rejects.toBeInstanceOf(NotFoundError);
  });
});
