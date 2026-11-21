export interface MarketListingDto {
  readonly listingId: string;
  readonly title: string;
  readonly shopName: string;
  readonly price: number | null;
  readonly currency: string | null;
  readonly onSale: boolean;
  readonly freeShipping: boolean;
  readonly isAd: boolean;
  /** The marketplace marks the shop as one of its top sellers. */
  readonly isTopSeller: boolean;
  readonly badges: readonly string[];
}

export interface KeywordTermDto {
  readonly term: string;
  /** Organic results whose title uses it. */
  readonly listings: number;
  /** Shops those results come from. */
  readonly shops: number;
  /** Ads whose title uses it, counted apart. */
  readonly ads: number;
  /** Of the organic results, from 0 to 1. */
  readonly share: number;
  /** Etsy suggests it as a search. */
  readonly suggested: boolean;
  /** It names a trademark, so it is kept out of tags. */
  readonly trademark: boolean;
  /** The longer title phrase that all its results use, which it is only a piece of; `null` for none. */
  readonly partOfLonger: string | null;
  /**
   * Shown only because the ads of two shops or more use it, in a search with
   * fewer than ten results; its share counts the results alone.
   */
  readonly adOnly: boolean;
}

/** The Etsy markets research can search, by the region buyers shop from. */
export const RESEARCH_MARKETS = ['US', 'GB', 'DE'] as const;
export type ResearchMarket = (typeof RESEARCH_MARKETS)[number];
/** Markets whose Etsy page words have not been checked against live pages yet. */
export const UNCHECKED_RESEARCH_MARKETS: readonly ResearchMarket[] = ['GB', 'DE'];

/**
 * Signs that the report may not say what the market's buyers see: Etsy changed
 * its page and the app read less than it showed, or it showed prices in
 * another currency than the market's.
 */
export type ReadWarningDto = 'cardsUnread' | 'pricesUnread' | 'otherCurrency';

/** What one Etsy search says about demand and competition, counted by the app. */
export interface KeywordReportDto {
  readonly query: string;
  readonly resultsLabel: string | null;
  readonly listingCount: number;
  /** Listings that are results rather than ads. */
  readonly organicCount: number;
  readonly prices: {
    readonly currency: string;
    readonly min: number;
    readonly median: number;
    readonly max: number;
  } | null;
  readonly adShare: number;
  readonly topSellerShare: number;
  readonly badgeShare: number;
  readonly freeShippingShare: number;
  /** The query as one term, in the words terms are counted in, with its real trademark flag. */
  readonly queryTerm: KeywordTermDto;
  readonly suggestions: readonly string[];
  /** `false` when Etsy did not answer the request for suggestions. */
  readonly suggestionsAvailable: boolean;
  readonly warnings: readonly ReadWarningDto[];
  readonly terms: readonly KeywordTermDto[];
  readonly listings: readonly MarketListingDto[];
  /**
   * Up to 13 tags picked from the terms, strongest first: phrases of at most
   * four words and 20 characters, or long compounds in German. Fewer when the
   * search has no more good ones.
   */
  readonly suggestedTags: readonly string[];
  /** The strongest terms for writing a listing, the query first; trademarks left out. */
  readonly writerWords: readonly WriterWordDto[];
}

/** A term for writing a listing, with what the search found about it. */
export interface WriterWordDto {
  readonly term: string;
  readonly suggested: boolean;
  /** Shops on the first page using it; 0 for a query no result used. */
  readonly shops: number;
}

export interface ResearchRunDto {
  readonly id: string;
  readonly query: string;
  readonly market: ResearchMarket;
  readonly createdAt: string;
  readonly report: KeywordReportDto;
}

export interface ResearchSummaryDto {
  readonly id: string;
  readonly query: string;
  readonly market: ResearchMarket;
  readonly createdAt: string;
  readonly resultsLabel: string | null;
  readonly topTerms: readonly string[];
}

export type KeywordFigureDto = 'searches' | 'clicks' | 'ctr' | 'competition';

/** A keyword with the figures its keyword tool exported; `null` where the file had none. */
export interface KeywordEntryDto {
  readonly term: string;
  readonly trademark: boolean;
  readonly searches: number | null;
  readonly clicks: number | null;
  readonly ctr: number | null;
  readonly competition: number | null;
}

/** Keywords imported from a file the seller exported from a keyword tool such as eRank. */
export interface KeywordListDto {
  readonly id: string;
  readonly fileName: string;
  /** The Etsy market the list was exported for, whose language its keywords are in. */
  readonly market: ResearchMarket;
  readonly importedAt: string;
  /** The figures the file has a column for. */
  readonly figures: readonly KeywordFigureDto[];
  readonly keywords: readonly KeywordEntryDto[];
  /** The file held more keywords than a list keeps; only the first ones were kept. */
  readonly truncated: boolean;
}

export interface KeywordListSummaryDto {
  readonly id: string;
  readonly fileName: string;
  readonly market: ResearchMarket;
  readonly importedAt: string;
  readonly keywordCount: number;
}
