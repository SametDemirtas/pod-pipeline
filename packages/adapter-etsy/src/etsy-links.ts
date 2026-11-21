import type { MarketplaceLinks } from '@pod/core';

/** Where Etsy shows a listing to buyers and to the seller. */
export const ETSY_LINKS: MarketplaceLinks = {
  listingUrl: (listingId) => `https://www.etsy.com/listing/${listingId}`,
  editUrl: (listingId) => `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`,
  draftsUrl: () => 'https://www.etsy.com/your/shops/me/tools/listings/state:draft',
};
