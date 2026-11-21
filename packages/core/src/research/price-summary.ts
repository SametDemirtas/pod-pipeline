import type { Market, MarketListing, ReadWarning } from './market.js';

export interface PriceSummary {
  readonly currency: string;
  readonly min: number;
  readonly median: number;
  readonly max: number;
}

/** Shares of the listings a search showed, each from 0 to 1. */
export interface ListingShares {
  readonly adShare: number;
  readonly topSellerShare: number;
  readonly badgeShare: number;
  readonly freeShippingShare: number;
}

/** `count` of `total`, from 0 to 1, to three places. */
export function shareOf(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 1000) / 1000;
}

function median(sorted: readonly number[]): number {
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] ?? 0) + upper) / 2;
}

/** Prices in the currency most listings showed, so amounts are comparable. */
export function priceSummary(listings: readonly MarketListing[]): PriceSummary | null {
  const counts = new Map<string, number>();
  for (const { currency, price } of listings) {
    if (currency !== null && price !== null) counts.set(currency, (counts.get(currency) ?? 0) + 1);
  }
  const currency = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (currency === undefined) return null;
  const prices = listings
    .filter((listing) => listing.currency === currency && listing.price !== null)
    .map((listing) => listing.price ?? 0)
    .sort((a, b) => a - b);
  return {
    currency,
    min: prices[0] ?? 0,
    median: Math.round(median(prices) * 100) / 100,
    max: prices[prices.length - 1] ?? 0,
  };
}

/** Warns when prices came in a currency other than the market's, as for a seller abroad. */
export function currencyWarnings(prices: PriceSummary | null, market: Market): ReadWarning[] {
  return prices !== null && prices.currency !== market.currency ? ['otherCurrency'] : [];
}

export function listingShares(listings: readonly MarketListing[]): ListingShares {
  const count = (test: (listing: MarketListing) => boolean) =>
    shareOf(listings.filter(test).length, listings.length);
  return {
    adShare: count((listing) => listing.isAd),
    topSellerShare: count((listing) => listing.isTopSeller),
    badgeShare: count((listing) => listing.badges.length > 0),
    freeShippingShare: count((listing) => listing.freeShipping),
  };
}
