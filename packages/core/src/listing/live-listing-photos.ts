import { requireDesign } from '../catalog/catalog-queries.js';
import type { CatalogQuery } from '../ports/catalog-repositories.js';
import type { ListingRepository } from '../ports/listings.js';
import type { ListingPhoto, MarketplaceListings } from '../ports/marketplace.js';
import type { PrintPreview, PrintSync } from '../ports/print-sync.js';
import { requireListing } from './require-listing.js';

export interface LiveListingPhotosDeps {
  readonly query: Pick<CatalogQuery, 'getDesign'>;
  readonly listings: Pick<ListingRepository, 'findByDesign'>;
  readonly marketplace: Pick<MarketplaceListings, 'photos'>;
  readonly printSync: Pick<PrintSync, 'previews'>;
}

/** What buyers and the print provider see now, read from them rather than from what was sent. */
export interface LivePhotos {
  readonly marketplace: readonly ListingPhoto[];
  /** `undefined` while the provider has not imported the listing yet. */
  readonly print: readonly PrintPreview[] | undefined;
}

/**
 * Reads the photos the listing shows and the pictures the print provider keeps
 * of its files, so the seller can see what went out before publishing.
 */
export class LiveListingPhotos {
  constructor(private readonly deps: LiveListingPhotosDeps) {}

  async execute(designId: string): Promise<LivePhotos> {
    const { design } = await requireDesign(this.deps.query, designId);
    const listing = await requireListing(this.deps.listings, design.id);
    const [marketplace, print] = await Promise.all([
      this.deps.marketplace.photos(listing.marketplaceId),
      this.deps.printSync.previews(listing.marketplaceId),
    ]);
    return { marketplace, print };
  }
}
