import type { DesignId } from '../catalog/model.js';
import { NotFoundError } from '../errors.js';
import type { ListingRepository } from '../ports/listings.js';
import type { Listing } from './listing.js';

/** The design's listing, or `NotFoundError` when it has none. */
export async function requireListing(
  listings: Pick<ListingRepository, 'findByDesign'>,
  designId: DesignId,
): Promise<Listing> {
  const listing = await listings.findByDesign(designId);
  if (!listing) throw new NotFoundError('Listing', designId);
  return listing;
}
