import type { DesignId } from '../catalog/model.js';
import type { Listing, ListingId } from '../listing/listing.js';

export interface ListingRepository {
  /**
   * Inserts or replaces the listing with the same id. Rejects with
   * `ConflictError` when another listing has the same design or marketplace id.
   */
  save(listing: Listing): Promise<void>;
  /** A design has at most one listing. */
  findByDesign(designId: DesignId): Promise<Listing | undefined>;
  /** Forgets a listing, e.g. after the seller deleted it on the marketplace. */
  remove(id: ListingId): Promise<void>;
}
