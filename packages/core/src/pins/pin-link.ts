import type { Listing } from '../listing/listing.js';
import type { MarketplaceLinks } from '../ports/marketplace.js';

/** Where a pin leads: the design's listing once buyers can see it. */
export function listingLink(
  listing: Listing | undefined | null,
  links: Pick<MarketplaceLinks, 'listingUrl'>,
): string | null {
  return listing?.state === 'active' ? links.listingUrl(listing.marketplaceId) : null;
}
