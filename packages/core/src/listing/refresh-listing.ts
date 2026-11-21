import { requireDesign } from '../catalog/catalog-queries.js';
import type { CatalogQuery } from '../ports/catalog-repositories.js';
import type { ListingRepository } from '../ports/listings.js';
import type { MarketplaceListings } from '../ports/marketplace.js';
import type { Clock } from '../ports/system.js';
import type { Listing } from './listing.js';
import { requireListing } from './require-listing.js';

export interface RefreshListingDeps {
  readonly query: Pick<CatalogQuery, 'getDesign'>;
  readonly listings: Pick<ListingRepository, 'findByDesign' | 'save' | 'remove'>;
  readonly marketplace: Pick<MarketplaceListings, 'state'>;
  readonly clock: Clock;
}

/**
 * Brings the stored state in line with the marketplace, where the seller may
 * have published, paused or deleted the listing. A deleted listing is
 * forgotten, so the design can get a new one; then it resolves to `null`.
 */
export class RefreshListing {
  constructor(private readonly deps: RefreshListingDeps) {}

  async execute(designId: string): Promise<Listing | null> {
    const { design } = await requireDesign(this.deps.query, designId);
    const listing = await requireListing(this.deps.listings, design.id);

    const state = await this.deps.marketplace.state(listing.marketplaceId);
    if (state === undefined) {
      await this.deps.listings.remove(listing.id);
      return null;
    }
    if (state === listing.state) return listing;
    // Published on Etsy directly: the time it was noticed is the closest known.
    const publishedAt = listing.publishedAt ?? (state === 'active' ? this.deps.clock.now() : null);
    const refreshed: Listing = { ...listing, state, publishedAt };
    await this.deps.listings.save(refreshed);
    return refreshed;
  }
}
