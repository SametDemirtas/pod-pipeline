import type { ListingDto } from '@pod/contracts';
import type { Listing } from '@pod/core';

/** What a listing alone does not know: its address and whether its link is still current. */
export type ListingContext = Pick<ListingDto, 'editUrl' | 'linkCurrent'>;

export function toListingDto(listing: Listing, context: ListingContext): ListingDto {
  return {
    designId: listing.designId,
    listingId: listing.marketplaceId,
    state: listing.state,
    editUrl: context.editUrl,
    printArea: listing.printArea,
    fit: listing.fit,
    products: listing.products.map(({ sku, variantId }) => ({ sku, variantId })),
    linkedAt: listing.linkedAt?.toISOString() ?? null,
    linkCurrent: context.linkCurrent,
    createdAt: listing.createdAt.toISOString(),
    publishedAt: listing.publishedAt?.toISOString() ?? null,
  };
}
