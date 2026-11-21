/** The Etsy markets research searches, by the region buyers shop from. */
export const MARKET_REGIONS = ['US', 'GB', 'DE'] as const;
export type MarketRegion = (typeof MARKET_REGIONS)[number];

/** How Etsy shows one market: the language its buyers read and the currency they pay in. */
export interface Market {
  readonly region: MarketRegion;
  /** BCP 47 tag, e.g. `de-DE`. */
  readonly language: string;
  /** ISO 4217 code. */
  readonly currency: string;
}

export const MARKETS: Readonly<Record<MarketRegion, Market>> = {
  US: { region: 'US', language: 'en-US', currency: 'USD' },
  GB: { region: 'GB', language: 'en-GB', currency: 'GBP' },
  DE: { region: 'DE', language: 'de-DE', currency: 'EUR' },
};

export const DEFAULT_MARKET: MarketRegion = 'US';

/** One listing as an Etsy search shows it to a buyer. */
export interface MarketListing {
  readonly listingId: string;
  readonly title: string;
  readonly shopName: string;
  /** The price the buyer pays now, in the currency Etsy showed; `null` when unreadable. */
  readonly price: number | null;
  readonly currency: string | null;
  readonly onSale: boolean;
  readonly freeShipping: boolean;
  /** Paid placement rather than an organic result. */
  readonly isAd: boolean;
  /** The marketplace marks the shop as one of its top sellers. */
  readonly isTopSeller: boolean;
  /** The marketplace's badges on the result, by code, e.g. `bestseller`. */
  readonly badges: readonly string[];
}

/**
 * Signs that the report may not say what the market's buyers see: Etsy
 * changed its page, so most result cards or most of their prices could not be
 * read, or it showed prices in another currency than the market's, as it does
 * for a seller searching from abroad.
 */
export type ReadWarning = 'cardsUnread' | 'pricesUnread' | 'otherCurrency';

/** What one Etsy search shows, read like a buyer would see it. */
export interface MarketSearchPage {
  readonly query: string;
  /** Etsy's count as shown, e.g. `1,000+`; `null` when it showed none. */
  readonly resultsLabel: string | null;
  readonly listings: readonly MarketListing[];
  /** Searches Etsy suggests while typing the query, most popular first. */
  readonly suggestions: readonly string[];
  /** Whether Etsy answered the request for suggestions, so none means it has none. */
  readonly suggestionsAvailable: boolean;
  readonly warnings: readonly ReadWarning[];
}
