import type { MarketBadge } from '@pod/rules';
import type { MarketRegion } from '@pod/core';

/** How Etsy's search page reads in one market. */
export interface EtsyMarketPage {
  /** Where Etsy serves the market's language, e.g. `/de`; empty for the United States. */
  readonly pathPrefix: string;
  /** Sent with every request of the research window, so Etsy answers in the market's language. */
  readonly acceptLanguage: string;
  readonly decimalSeparator: '.' | ',';
  /** The word after the result count, e.g. `items` in `1,000+ items`, as a pattern. */
  readonly resultWords: string;
  /** What the page says when nothing was found, as a pattern. */
  readonly noResults: string;
  readonly ad: RegExp;
  readonly freeShipping: RegExp;
  readonly onSale: RegExp;
  /** Badges as the page names them, with the code the app keeps for each. */
  readonly badges: Readonly<Record<string, MarketBadge>>;
}

/** Etsy's English badge names, with the code the app keeps for each. */
const ENGLISH_BADGES: Readonly<Record<string, MarketBadge>> = {
  Bestseller: 'bestseller',
  'Etsy’s Pick': 'marketPick',
  "Etsy's Pick": 'marketPick',
  'Popular now': 'popularNow',
};

const ENGLISH = {
  decimalSeparator: '.',
  resultWords: 'items|results',
  noResults: "couldn[’']t find any results",
  ad: /(?:^|\s)Ad(?:\s|・|$)|Ad from shop/,
  onSale: /Sale Price|Original Price/,
  badges: ENGLISH_BADGES,
} as const;

/**
 * Words of Etsy's British and German search pages that have not been checked
 * against the live pages yet. Check each on a real search in its market before
 * relying on it: a wrong count or empty-search text is reported as a changed
 * page, but a wrong ad, shipping, sale or badge text is silently misread.
 */
export const UNCHECKED_PAGE_WORDS = {
  GB: {
    freeShipping: /Free (?:shipping|delivery)/i,
  },
  DE: {
    resultWords: 'Artikel|Ergebnisse',
    noResults: 'keine Ergebnisse',
    ad: /(?:^|\s)Anzeige(?:\s|・|$)|Anzeige von Shop/,
    freeShipping: /Kostenloser Versand/i,
    onSale: /Sonderpreis|Ursprünglicher Preis/,
    badges: {
      Bestseller: 'bestseller',
      'Auswahl von Etsy': 'marketPick',
      'Gerade beliebt': 'popularNow',
    },
  },
} as const;

/**
 * The markets research searches. A page that reads differently, after Etsy
 * changes its words, is reported as changed by the search rather than misread.
 */
export const ETSY_MARKET_PAGES: Readonly<Record<MarketRegion, EtsyMarketPage>> = {
  US: {
    ...ENGLISH,
    pathPrefix: '',
    acceptLanguage: 'en-US,en;q=0.9',
    freeShipping: /Free shipping/i,
  },
  GB: {
    ...ENGLISH,
    ...UNCHECKED_PAGE_WORDS.GB,
    pathPrefix: '/uk',
    acceptLanguage: 'en-GB,en;q=0.9',
  },
  DE: {
    ...UNCHECKED_PAGE_WORDS.DE,
    pathPrefix: '/de',
    acceptLanguage: 'de-DE,de;q=0.9',
    decimalSeparator: ',',
  },
};

/** The search page for the query in the market's language. */
export function searchUrl(query: string, region: MarketRegion): string {
  const { pathPrefix } = ETSY_MARKET_PAGES[region];
  return `https://www.etsy.com${pathPrefix}/search?q=${encodeURIComponent(query)}`;
}
