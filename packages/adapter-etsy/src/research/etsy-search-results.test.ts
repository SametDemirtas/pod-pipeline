import { describe, expect, it } from 'vitest';
import { ETSY_MARKET_PAGES } from './etsy-markets.js';
import {
  listingsOf,
  parseSearchPage,
  parseSuggestions,
  readWarnings,
  toMarketListing,
  UNREAD_PAGE,
  type RawCard,
} from './etsy-search-results.js';

const { US, GB, DE } = ETSY_MARKET_PAGES;

const raw = (overrides: Partial<RawCard> = {}): RawCard => ({
  listingId: '1',
  title: 'Tulip Mug',
  shopName: 'MoonShop',
  price: '1,248.09',
  currency: 'TL',
  starSeller: false,
  text: 'Tulip Mug By MoonShop 1,248.09 TL',
  ...overrides,
});

describe('toMarketListing', () => {
  it('reads price, currency and the signs on the card', () => {
    expect(
      toMarketListing(
        raw({
          starSeller: true,
          text: 'Ad・By MoonShop Ad from shop MoonShop Sale Price 1 Original Price 2 Free shipping Etsy’s Pick Bestseller',
        }),
        US,
      ),
    ).toEqual({
      listingId: '1',
      title: 'Tulip Mug',
      shopName: 'MoonShop',
      price: 1248.09,
      currency: 'TRY',
      onSale: true,
      freeShipping: true,
      isAd: true,
      isTopSeller: true,
      badges: ['bestseller', 'marketPick'],
    });
  });

  it.each([
    ['$', 'USD'],
    ['€', 'EUR'],
    ['£', 'GBP'],
    ['zł', 'zł'],
  ])('names the currency shown as %s', (symbol, code) => {
    expect(toMarketListing(raw({ currency: symbol }), US).currency).toBe(code);
  });

  it('leaves out a price it cannot read and does not mistake words for ads', () => {
    expect(
      toMarketListing(raw({ price: '', currency: '', text: 'Adorable Tulip Mug' }), US),
    ).toMatchObject({ price: null, currency: null, isAd: false });
  });

  it('reads no sign from the title, e.g. a mug called Ad Astra', () => {
    const title = 'Ad Astra Space Mug, Free Shipping Bestseller Gift';

    expect(toMarketListing(raw({ title, text: `${title} By MoonShop` }), US)).toMatchObject({
      isAd: false,
      freeShipping: false,
      badges: [],
    });
  });

  it('reads no sign from the shop name, e.g. a shop called Ad Hoc Prints', () => {
    expect(
      toMarketListing(
        raw({ shopName: 'Ad Hoc Prints', text: 'Tulip Mug By Ad Hoc Prints 20.00 $' }),
        US,
      ),
    ).toMatchObject({ isAd: false });
  });

  it('reads prices with a decimal comma and the signs in German', () => {
    expect(
      toMarketListing(
        raw({
          price: '1.234,50',
          currency: '€',
          text: 'Anzeige・Von MoonShop Sonderpreis Kostenloser Versand Auswahl von Etsy',
        }),
        DE,
      ),
    ).toMatchObject({
      price: 1234.5,
      currency: 'EUR',
      onSale: true,
      freeShipping: true,
      isAd: true,
      badges: ['marketPick'],
    });
    expect(toMarketListing(raw({ price: '12,50' }), DE).price).toBe(12.5);
    expect(toMarketListing(raw({ price: '1,234.00' }), US).price).toBe(1234);
  });

  it('reads free delivery on British pages', () => {
    expect(toMarketListing(raw({ text: 'Tulip Mug Free delivery' }), GB).freeShipping).toBe(true);
  });
});

describe('listingsOf', () => {
  it('keeps each listing once and skips cards without an id or title', () => {
    expect(
      listingsOf(
        [
          raw({ text: 'Ad from shop MoonShop' }),
          raw({ listingId: '2', text: 'Ad from shop MoonShop' }),
          raw(),
          raw({ listingId: '2', text: 'Ad from shop MoonShop' }),
          raw({ listingId: '' }),
          raw({ listingId: '3', title: '' }),
        ],
        US,
      ).map((listing) => [listing.listingId, listing.isAd]),
    ).toEqual([
      // Shown as an ad and as a result, it counts as a result.
      ['1', false],
      ['2', true],
    ]);
  });
});

describe('reading what the page returned', () => {
  it('treats anything that is not a search page as not read yet', () => {
    expect(parseSearchPage(null)).toEqual(UNREAD_PAGE);
    expect(parseSearchPage({ blocked: 'yes' })).toEqual(UNREAD_PAGE);
  });

  it('keeps the cards that read as expected and counts the rest', () => {
    const good = {
      listingId: '42',
      title: 'Tulip mug',
      shopName: 'Spooky',
      price: '18.00',
      currency: '$',
      starSeller: false,
      text: '',
    };
    const page = parseSearchPage({
      blocked: false,
      empty: false,
      searchPage: true,
      resultsLabel: '1,000+ items',
      cards: [good, { ...good, listingId: 'javascript:1' }, 'card'],
    });

    expect(page.cards).toEqual([good]);
    expect(page.unreadCards).toBe(2);
  });

  it('keeps text suggestions only, at most 50, and knows when Etsy gave none', () => {
    expect(parseSuggestions('tulip')).toEqual({ available: false, suggestions: [] });
    expect(parseSuggestions({ ok: false, queries: [] })).toEqual({
      available: false,
      suggestions: [],
    });
    expect(parseSuggestions({ ok: true, queries: ['a', 1, 'x'.repeat(201)] })).toEqual({
      available: true,
      suggestions: ['a'],
    });
    expect(
      parseSuggestions({ ok: true, queries: Array.from({ length: 60 }, (_, i) => `q${i}`) })
        .suggestions,
    ).toHaveLength(50);
  });
});

describe('readWarnings', () => {
  it('warns only when most cards or most prices could not be read', () => {
    const cards = [raw(), raw({ listingId: '2' })];
    const listings = listingsOf(cards, US);

    expect(readWarnings({ ...UNREAD_PAGE, cards, unreadCards: 2 }, listings)).toEqual([]);
    expect(readWarnings({ ...UNREAD_PAGE, cards, unreadCards: 3 }, listings)).toEqual([
      'cardsUnread',
    ]);
    expect(
      readWarnings(
        { ...UNREAD_PAGE, cards },
        listings.map((listing) => ({ ...listing, price: null })),
      ),
    ).toEqual(['pricesUnread']);
  });
});
