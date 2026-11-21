import { requireDesign } from '../catalog/catalog-queries.js';
import { ListingNotLinkedError } from '../errors.js';
import type { CatalogQuery } from '../ports/catalog-repositories.js';
import type { ListingRepository } from '../ports/listings.js';
import type { MarketplaceListings } from '../ports/marketplace.js';
import type { Clock } from '../ports/system.js';
import { isLinkCurrent, type Listing } from './listing.js';
import { requireListing } from './require-listing.js';

export interface PublishListingDeps {
  readonly query: Pick<CatalogQuery, 'getDesign'>;
  readonly listings: Pick<ListingRepository, 'findByDesign' | 'save'>;
  readonly marketplace: Pick<MarketplaceListings, 'state' | 'publish'>;
  readonly clock: Clock;
}

/**
 * Makes a linked draft, or a listing that went inactive, public. Only a person
 * may ask for this: the marketplace charges a fee each time, so a listing
 * found already public there is only recorded as such.
 */
export class PublishListing {
  constructor(private readonly deps: PublishListingDeps) {}

  async execute(designId: string): Promise<Listing> {
    const { design } = await requireDesign(this.deps.query, designId);
    const listing = await requireListing(this.deps.listings, design.id);
    if (listing.state === 'active') return listing;
    if (!isLinkCurrent(listing, design.revision)) {
      throw new ListingNotLinkedError(listing.marketplaceId);
    }

    // Published before while storing that failed, or by the seller on the marketplace.
    if ((await this.deps.marketplace.state(listing.marketplaceId)) !== 'active') {
      await this.deps.marketplace.publish(listing.marketplaceId);
    }
    const published: Listing = {
      ...listing,
      state: 'active',
      publishedAt: this.deps.clock.now(),
    };
    await this.deps.listings.save(published);
    return published;
  }
}
