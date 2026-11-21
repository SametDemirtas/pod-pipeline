import { z } from 'zod';
import type { MarketListing, ReadWarning } from '@pod/core';
import type { EtsyMarketPage } from './etsy-markets.js';

/** A result card as the page script reads it, capped so a strange page cannot flood the app. */
const rawCardSchema = z.object({
  listingId: z.string().regex(/^\d{1,20}$/),
  title: z.string().max(300),
  shopName: z.string().max(100),
  price: z.string().max(30),
  currency: z.string().max(10),
  starSeller: z.boolean(),
  text: z.string().max(2_000),
});

const rawSearchPageSchema = z.object({
  /** Etsy shows a check that only a person can pass. */
  blocked: z.boolean(),
  /** Etsy found nothing for the query. */
  empty: z.boolean(),
  /** The page is one of Etsy's searches, not e.g. its home page. */
  searchPage: z.boolean(),
  resultsLabel: z.string().max(100).nullable(),
  cards: z.array(z.unknown()).max(200),
});

export type RawCard = z.infer<typeof rawCardSchema>;

export interface RawSearchPage extends Omit<z.infer<typeof rawSearchPageSchema>, 'cards'> {
  readonly cards: readonly RawCard[];
  /** Cards on the page that did not read as expected. */
  readonly unreadCards: number;
}

/** A page not read yet, or one that did not look like Etsy's search. */
export const UNREAD_PAGE: RawSearchPage = {
  blocked: false,
  empty: false,
  searchPage: false,
  resultsLabel: null,
  cards: [],
  unreadCards: 0,
};

/** What the page script returned, keeping only the cards that read as expected. */
export function parseSearchPage(value: unknown): RawSearchPage {
  const page = rawSearchPageSchema.safeParse(value);
  if (!page.success) return UNREAD_PAGE;
  const cards = page.data.cards.flatMap((card) => {
    const parsed = rawCardSchema.safeParse(card);
    return parsed.success ? [parsed.data] : [];
  });
  return { ...page.data, cards, unreadCards: page.data.cards.length - cards.length };
}

const suggestionsSchema = z.object({ ok: z.boolean(), queries: z.array(z.unknown()) });

/** The suggestions that read as text, at most 50 of them, and whether Etsy answered at all. */
export function parseSuggestions(value: unknown): { available: boolean; suggestions: string[] } {
  const answer = suggestionsSchema.safeParse(value);
  if (!answer.success || !answer.data.ok) return { available: false, suggestions: [] };
  return {
    available: true,
    suggestions: answer.data.queries
      .filter((item): item is string => typeof item === 'string' && item.length <= 200)
      .slice(0, 50),
  };
}

const CURRENCIES: Readonly<Record<string, string>> = {
  $: 'USD',
  US$: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  TL: 'TRY',
  CA$: 'CAD',
  A$: 'AUD',
};

/** `3,121.00` as 3121 where a point marks decimals, `3.121,00` where a comma does. */
function priceOf(text: string, decimalSeparator: '.' | ','): number | null {
  const grouping = decimalSeparator === '.' ? /[,\s]/g : /[.\s]/g;
  const value = Number(text.replace(grouping, '').replace(decimalSeparator, '.'));
  return text && Number.isFinite(value) ? value : null;
}

export function toMarketListing(card: RawCard, market: EtsyMarketPage): MarketListing {
  const symbol = card.currency.trim();
  // Read without the title and shop, so "Ad Astra Mug" or a shop called "Ad Hoc Prints" is no ad.
  const signs = [card.title, card.shopName]
    .filter(Boolean)
    .reduce((text, own) => text.split(own).join(' '), card.text);
  return {
    listingId: card.listingId,
    title: card.title,
    shopName: card.shopName,
    price: priceOf(card.price, market.decimalSeparator),
    currency: symbol ? (CURRENCIES[symbol] ?? symbol) : null,
    onSale: market.onSale.test(signs),
    freeShipping: market.freeShipping.test(signs),
    isAd: market.ad.test(signs),
    isTopSeller: card.starSeller,
    badges: [
      ...new Set(
        Object.entries(market.badges)
          .filter(([shown]) => signs.includes(shown))
          .map(([, badge]) => badge),
      ),
    ],
  };
}

/**
 * Keeps each listing once. Etsy can show the same one as an ad and as a
 * result, so it only counts as an ad when every card of it is one.
 */
export function listingsOf(cards: readonly RawCard[], market: EtsyMarketPage): MarketListing[] {
  const listings = new Map<string, MarketListing>();
  for (const card of cards) {
    if (!card.listingId || !card.title) continue;
    const listing = toMarketListing(card, market);
    const seen = listings.get(card.listingId);
    listings.set(card.listingId, seen ? { ...seen, isAd: seen.isAd && listing.isAd } : listing);
  }
  return [...listings.values()];
}

/** Warns when most cards, or most of their prices, could not be read. */
export function readWarnings(
  page: RawSearchPage,
  listings: readonly MarketListing[],
): ReadWarning[] {
  const unpriced = listings.filter((listing) => listing.price === null).length;
  return [
    ...(page.unreadCards > page.cards.length ? (['cardsUnread'] as const) : []),
    ...(unpriced * 2 > listings.length ? (['pricesUnread'] as const) : []),
  ];
}
