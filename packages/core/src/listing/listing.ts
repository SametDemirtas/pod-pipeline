import type { DesignId } from '../catalog/model.js';
import type { FitMode } from '../print/placement.js';

export type ListingId = string & { readonly __brand: 'ListingId' };

/** One marketplace product of a listing and the print variant it is made as. */
export interface ListingProductLink {
  readonly sku: string;
  /** The marketplace's id of the product, which the print provider's sync refers to. */
  readonly productId: string;
  readonly variantId: string;
}

/** `inactive` covers listings the seller paused, that expired or that sold out. */
const LISTING_STATES = ['draft', 'active', 'inactive'] as const;
export type ListingState = (typeof LISTING_STATES)[number];

export function isListingState(value: string): value is ListingState {
  return (LISTING_STATES as readonly string[]).includes(value);
}

/** A design's listing on the marketplace, as this app created it. */
export interface Listing {
  readonly id: ListingId;
  readonly designId: DesignId;
  readonly designRevision: number;
  /** The marketplace's id of the listing. */
  readonly marketplaceId: string;
  readonly state: ListingState;
  readonly printArea: string;
  readonly fit: FitMode;
  readonly products: readonly ListingProductLink[];
  /** When the print provider was told which product and file each variant is. */
  readonly linkedAt: Date | null;
  readonly createdAt: Date;
  readonly publishedAt: Date | null;
}

/** Whether the print provider has the current revision; an older one would print the old file. */
export function isLinkCurrent(listing: Listing, designRevision: number): boolean {
  return listing.linkedAt !== null && listing.designRevision === designRevision;
}
