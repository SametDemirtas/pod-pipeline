import { afterEach, describe, expect, it, vi } from 'vitest';
import { MARKETS, type Market } from '@pod/core';
import {
  BrowserMarketSearch,
  MarketLayoutChangedError,
  ResearchClosedError,
  ResearchTimeoutError,
  type ResearchPage,
} from './browser-market-search.js';
import type { RawCard, RawSearchPage } from './etsy-search-results.js';

const card = {
  listingId: '1',
  title: 'Tulip Mug',
  shopName: 'MoonShop',
  price: '20.00',
  currency: '$',
  starSeller: false,
  text: 'Tulip Mug',
};
const page = (overrides: Partial<RawSearchPage>): RawSearchPage => ({
  blocked: false,
  empty: false,
  searchPage: true,
  resultsLabel: null,
  cards: [],
  unreadCards: 0,
  ...overrides,
});
/** Cards the page script could not read in the expected shape. */
const unreadable = (count: number) =>
  Array.from({ length: count }, () => ({ title: 1 })) as unknown as RawCard[];
const blocked = page({ blocked: true, searchPage: false });
const loading = page({ searchPage: false });
const ready = page({ resultsLabel: '120', cards: [card] });

class FakePage implements ResearchPage {
  readonly loaded: string[] = [];
  shown = 0;
  closed = 0;
  closedBySeller = false;
  loading: Promise<void> = Promise.resolve();

  constructor(
    private readonly pages: RawSearchPage[],
    private readonly suggestions: () => Promise<unknown> = () =>
      Promise.resolve({ ok: true, queries: ['tulip mug ceramic', 7] }),
  ) {}

  load(url: string): Promise<void> {
    this.loaded.push(url);
    return this.loading;
  }

  isClosed(): boolean {
    return this.closedBySeller;
  }

  evaluate<T>(script: string): Promise<T> {
    if (script.includes('suggestions_ajax')) return this.suggestions() as Promise<T>;
    return Promise.resolve((this.pages.length > 1 ? this.pages.shift() : this.pages[0]) as T);
  }

  show(): void {
    this.shown += 1;
  }

  close(): void {
    this.closed += 1;
  }
}

function searchWith(fake: FakePage, timeoutMs = 60_000) {
  let time = 0;
  const markets: Market[] = [];
  const engine = new BrowserMarketSearch({
    openPage: (market) => {
      markets.push(market);
      return fake;
    },
    sleep: (ms) => {
      time += ms;
      return Promise.resolve();
    },
    now: () => time,
    timeoutMs,
  });
  return { engine, markets };
}

describe('BrowserMarketSearch', () => {
  it('opens the search signed out, waits for results to settle and reads the suggestions', async () => {
    const fake = new FakePage([loading, ready]);

    const result = await searchWith(fake).engine.search('tulip & mug', MARKETS.US);

    expect(fake.loaded).toEqual(['https://www.etsy.com/search?q=tulip%20%26%20mug']);
    expect(result).toEqual({
      query: 'tulip & mug',
      resultsLabel: '120',
      listings: [expect.objectContaining({ listingId: '1', price: 20, currency: 'USD' })],
      suggestions: ['tulip mug ceramic'],
      suggestionsAvailable: true,
      warnings: [],
    });
    expect(fake.shown).toBe(0);
    expect(fake.closed).toBe(1);
  });

  it('searches a market in its language and reads its number format', async () => {
    const fake = new FakePage([
      page({
        cards: [{ ...card, price: '1.234,50', currency: '€', text: 'Tulip Mug Anzeige von Shop' }],
      }),
    ]);
    const { engine, markets } = searchWith(fake);

    const result = await engine.search('geister tasse', MARKETS.DE);

    expect(markets).toEqual([MARKETS.DE]);
    expect(fake.loaded).toEqual(['https://www.etsy.com/de/search?q=geister%20tasse']);
    expect(result.listings).toEqual([
      expect.objectContaining({ price: 1234.5, currency: 'EUR', isAd: true }),
    ]);
  });

  it('shows the window once when Etsy asks for a human check', async () => {
    const fake = new FakePage([blocked, blocked, ready]);

    await searchWith(fake).engine.search('tulip mug', MARKETS.US);

    expect(fake.shown).toBe(1);
  });

  it('reports a search without results and says when Etsy gave no suggestions', async () => {
    const refused = new FakePage([page({ empty: true })], () =>
      Promise.resolve({ ok: false, queries: [] }),
    );
    const broken = new FakePage([page({ empty: true })], () =>
      Promise.reject(new Error('page closed')),
    );

    for (const fake of [refused, broken]) {
      expect(await searchWith(fake).engine.search('zzqq', MARKETS.US)).toMatchObject({
        listings: [],
        suggestions: [],
        suggestionsAvailable: false,
      });
    }
  });

  it('counts none of the other listings Etsy shows below a search without results', async () => {
    const fake = new FakePage([page({ empty: true, cards: [card], unreadCards: 30 })]);

    expect(await searchWith(fake).engine.search('zzqq', MARKETS.US)).toMatchObject({
      listings: [],
      warnings: [],
    });
  });

  it('gives up in time and says whether the check was the reason', async () => {
    await expect(
      searchWith(new FakePage([loading]), 5_000).engine.search('q', MARKETS.US),
    ).rejects.toEqual(new ResearchTimeoutError(false));
    const stuck = new FakePage([blocked]);
    await expect(searchWith(stuck, 5_000).engine.search('q', MARKETS.US)).rejects.toMatchObject({
      blocked: true,
    });
    expect(stuck.closed).toBe(1);
  });

  it('keeps polling while the page cannot be read, and blames the check it showed', async () => {
    const fake = new FakePage([blocked, ready]);
    const read = fake.evaluate.bind(fake);
    let failures = 1;
    fake.evaluate = <T>(script: string) =>
      failures-- > 0 ? Promise.reject(new Error('navigating')) : read<T>(script);

    expect((await searchWith(fake).engine.search('q', MARKETS.US)).listings).toHaveLength(1);

    // The check was shown, then the page could not be read while it reloaded.
    const reloading = new FakePage([blocked]);
    const readReloading = reloading.evaluate.bind(reloading);
    reloading.evaluate = <T>(script: string) =>
      reloading.shown > 0 ? Promise.reject(new Error('navigating')) : readReloading<T>(script);
    await expect(searchWith(reloading, 5_000).engine.search('q', MARKETS.US)).rejects.toMatchObject(
      { blocked: true },
    );
    expect(reloading.shown).toBe(1);
  });

  it('reads results while the page is still loading, and reports a load that failed', async () => {
    const slow = new FakePage([ready]);
    slow.loading = new Promise(() => undefined);
    expect((await searchWith(slow).engine.search('q', MARKETS.US)).listings).toHaveLength(1);

    const broken = new FakePage([loading]);
    broken.loading = Promise.reject(new Error('ERR_NAME_NOT_RESOLVED'));
    await expect(searchWith(broken).engine.search('q', MARKETS.US)).rejects.toThrow(
      'ERR_NAME_NOT_RESOLVED',
    );
    expect(broken.closed).toBe(1);
  });

  it('says the page changed when a loaded search shows nothing it can read', async () => {
    const changed = new FakePage([page({ cards: unreadable(48) })]);
    await expect(searchWith(changed).engine.search('q', MARKETS.US)).rejects.toBeInstanceOf(
      MarketLayoutChangedError,
    );

    // Still loading, the same page is waited for instead.
    const slow = new FakePage([page({}), page({}), page({}), ready]);
    slow.loading = new Promise(() => undefined);
    expect((await searchWith(slow).engine.search('q', MARKETS.US)).listings).toHaveLength(1);
  });

  it('warns when most cards or prices could not be read', async () => {
    const fake = new FakePage([page({ cards: [{ ...card, price: '' }, ...unreadable(2)] })]);

    expect((await searchWith(fake).engine.search('q', MARKETS.US)).warnings).toEqual([
      'cardsUnread',
      'pricesUnread',
    ]);
  });

  it('stops when the seller closes the window', async () => {
    const fake = new FakePage([blocked, blocked]);
    const read = fake.evaluate.bind(fake);
    fake.evaluate = <T>(script: string) => {
      if (fake.shown > 0) fake.closedBySeller = true;
      return read<T>(script);
    };

    await expect(searchWith(fake).engine.search('q', MARKETS.US)).rejects.toBeInstanceOf(
      ResearchClosedError,
    );
  });

  describe('with a page that never answers', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('reads the page again and gives up at the deadline', async () => {
      vi.useFakeTimers();
      const hung = new FakePage([loading]);
      hung.evaluate = () => new Promise(() => undefined);

      const search = searchWith(hung, 12_000).engine.search('q', MARKETS.US);
      const outcome = expect(search).rejects.toEqual(new ResearchTimeoutError(false));
      await vi.advanceTimersByTimeAsync(60_000);
      await outcome;
      expect(hung.closed).toBe(1);
    });

    it('leaves out suggestions the page does not give in time', async () => {
      vi.useFakeTimers();
      const fake = new FakePage([ready, ready], () => new Promise(() => undefined));

      const search = searchWith(fake).engine.search('q', MARKETS.US);
      await vi.advanceTimersByTimeAsync(12_000);

      expect(await search).toMatchObject({
        listings: [{ listingId: '1' }],
        suggestionsAvailable: false,
      });
    });
  });
});
