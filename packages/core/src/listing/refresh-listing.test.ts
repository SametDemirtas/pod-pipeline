import { beforeEach, describe, expect, it } from 'vitest';
import type { DesignId } from '../catalog/model.js';
import { NotFoundError } from '../errors.js';
import { sampleConcept, sampleDesign, sampleListing } from '../testing/contract/index.js';
import {
  FakeMarketplace,
  FixedClock,
  InMemoryCatalog,
  InMemoryListings,
} from '../testing/index.js';
import { RefreshListing } from './refresh-listing.js';

const MUG = 'design-01-mug' as DesignId;

describe('RefreshListing', () => {
  let listings: InMemoryListings;
  let marketplace: FakeMarketplace;
  let refresh: RefreshListing;

  beforeEach(async () => {
    const catalog = new InMemoryCatalog();
    await catalog.concepts.save(sampleConcept('01'));
    await catalog.designs.save(sampleDesign('01-mug'));
    listings = new InMemoryListings();
    await listings.save(sampleListing(MUG));
    marketplace = new FakeMarketplace();
    refresh = new RefreshListing({
      query: catalog,
      listings,
      marketplace,
      clock: new FixedClock(new Date('2026-10-26T12:00:00.000Z')),
    });
  });

  it('keeps a listing whose state did not change', async () => {
    expect(await refresh.execute(MUG)).toEqual(sampleListing(MUG));
  });

  it('takes over a state the seller changed on the marketplace', async () => {
    marketplace.states.set('1234567890', 'inactive');

    expect((await refresh.execute(MUG))?.state).toBe('inactive');
    expect((await listings.findByDesign(MUG))?.state).toBe('inactive');
  });

  it('notes when a listing published on the marketplace was first seen live', async () => {
    marketplace.states.set('1234567890', 'active');

    expect(await refresh.execute(MUG)).toMatchObject({
      state: 'active',
      publishedAt: new Date('2026-10-26T12:00:00.000Z'),
    });
  });

  it('forgets a listing deleted on the marketplace', async () => {
    marketplace.states.set('1234567890', 'deleted');

    expect(await refresh.execute(MUG)).toBeNull();
    expect(await listings.findByDesign(MUG)).toBeUndefined();
  });

  it('needs a listing', async () => {
    await listings.remove(sampleListing(MUG).id);

    await expect(refresh.execute(MUG)).rejects.toBeInstanceOf(NotFoundError);
  });
});
