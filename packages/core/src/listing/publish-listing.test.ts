import { beforeEach, describe, expect, it } from 'vitest';
import type { DesignId } from '../catalog/model.js';
import { ListingNotLinkedError, NotFoundError } from '../errors.js';
import { sampleConcept, sampleDesign, sampleListing } from '../testing/contract/index.js';
import {
  FakeMarketplace,
  FixedClock,
  InMemoryCatalog,
  InMemoryListings,
} from '../testing/index.js';
import { PublishListing } from './publish-listing.js';

const MUG = 'design-01-mug' as DesignId;

describe('PublishListing', () => {
  let listings: InMemoryListings;
  let marketplace: FakeMarketplace;
  let publish: PublishListing;

  beforeEach(async () => {
    const catalog = new InMemoryCatalog();
    await catalog.concepts.save(sampleConcept('01'));
    await catalog.designs.save(sampleDesign('01-mug'));
    listings = new InMemoryListings();
    marketplace = new FakeMarketplace();
    publish = new PublishListing({
      query: catalog,
      listings,
      marketplace,
      clock: new FixedClock(),
    });
  });

  it('publishes a linked draft once', async () => {
    await listings.save(sampleListing(MUG, { linkedAt: new Date('2026-10-24T11:00:00.000Z') }));

    const published = await publish.execute(MUG);
    const again = await publish.execute(MUG);

    expect(published).toMatchObject({
      state: 'active',
      publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(again).toEqual(published);
    expect(marketplace.published).toEqual(['1234567890']);
  });

  it('refuses a draft the print provider does not know how to make', async () => {
    await listings.save(sampleListing(MUG));

    await expect(publish.execute(MUG)).rejects.toBeInstanceOf(ListingNotLinkedError);
    expect(marketplace.published).toEqual([]);
  });

  it('keeps the draft when the marketplace refuses', async () => {
    await listings.save(sampleListing(MUG, { linkedAt: new Date() }));
    marketplace.failOn = 'publish';

    await expect(publish.execute(MUG)).rejects.toThrow('no payment method');
    expect((await listings.findByDesign(MUG))?.state).toBe('draft');
  });

  it('does not publish again when storing the published listing failed', async () => {
    await listings.save(sampleListing(MUG, { linkedAt: new Date('2026-10-24T11:00:00.000Z') }));
    const save = listings.save.bind(listings);
    listings.save = () => Promise.reject(new Error('disk full'));
    await expect(publish.execute(MUG)).rejects.toThrow('disk full');
    listings.save = save;

    const published = await publish.execute(MUG);

    expect(published.state).toBe('active');
    expect(await listings.findByDesign(MUG)).toEqual(published);
    expect(marketplace.published).toEqual(['1234567890']);
  });

  it('asks to link again after the design changed', async () => {
    await listings.save(
      sampleListing(MUG, { designRevision: 0, linkedAt: new Date('2026-10-24T11:00:00.000Z') }),
    );

    await expect(publish.execute(MUG)).rejects.toBeInstanceOf(ListingNotLinkedError);
  });

  it('needs a listing', async () => {
    await expect(publish.execute(MUG)).rejects.toBeInstanceOf(NotFoundError);
  });
});
