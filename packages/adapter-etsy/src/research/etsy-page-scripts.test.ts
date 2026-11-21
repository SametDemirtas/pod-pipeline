// @vitest-environment jsdom
import { runInThisContext } from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ETSY_MARKET_PAGES } from './etsy-markets.js';
import { readSearchPage, readSuggestions } from './etsy-page-scripts.js';
import { SEARCH_PAGE_HTML } from '../testing/etsy-search-fixture.js';
import type { RawSearchPage } from './etsy-search-results.js';

const READ_US = readSearchPage(ETSY_MARKET_PAGES.US);
const READ_DE = readSearchPage(ETSY_MARKET_PAGES.DE);

// jsdom has no layout, so innerText falls back to the text content here.
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    configurable: true,
    get(this: HTMLElement) {
      return this.textContent;
    },
  });
});

/** Runs a page script the way Electron does, against this test's document. */
function run(script: string): unknown {
  return runInThisContext(script);
}

describe('readSearchPage', () => {
  it('reads every card, the result count and no human check', () => {
    window.history.pushState({}, '', '/search?q=tulip+mug');
    document.body.innerHTML = SEARCH_PAGE_HTML;

    const page = run(READ_US) as RawSearchPage;

    expect(page).toMatchObject({
      blocked: false,
      empty: false,
      searchPage: true,
      resultsLabel: '1,000+',
    });
    expect(
      page.cards.map((card) => [
        card.listingId,
        card.title,
        card.shopName,
        card.price,
        card.currency,
        card.starSeller,
      ]),
    ).toEqual([
      ['101', 'Tulip Mug, Halloween Coffee Cup', 'MoonShop', '1,248.09', 'TL', true],
      ['102', 'Cute Tulip Mug for Bird Lovers', 'PaperFox', '22.40', '$', false],
      ['103', 'Ceramic Tulip Cup', 'ClayBird', '', '', false],
    ]);
    expect(page.cards[1]?.text).toContain('Free shipping');
  });

  it('tidies the spaces of a title read from its label, as it does the card text', () => {
    window.history.pushState({}, '', '/search?q=tulip+mug');
    document.body.innerHTML = SEARCH_PAGE_HTML;
    document
      .querySelector('a[data-listing-link]')
      ?.setAttribute('aria-label', ' Tulip  Mug,\n  Halloween Coffee Cup ');

    expect((run(READ_US) as RawSearchPage).cards[0]?.title).toBe('Tulip Mug, Halloween Coffee Cup');
  });

  it('notices a human check, a search without results and a page that is no search', () => {
    window.history.pushState({}, '', '/');
    document.body.innerHTML = '<iframe src="https://geo.captcha-delivery.com/captcha/"></iframe>';
    expect(run(READ_US) as RawSearchPage).toMatchObject({
      blocked: true,
      searchPage: false,
      cards: [],
    });

    document.body.innerHTML = '<p>We couldn’t find any results for zzqq</p>';
    expect(run(READ_US) as RawSearchPage).toMatchObject({ empty: true, resultsLabel: null });
  });

  it('reads the count and an empty search in the market’s language', () => {
    window.history.pushState({}, '', '/de/search?q=tasse');
    document.body.innerHTML = '<p>1.000+ Artikel mit Anzeigen</p>';
    expect(run(READ_DE) as RawSearchPage).toMatchObject({
      searchPage: true,
      empty: false,
      resultsLabel: '1.000+',
    });

    document.body.innerHTML = '<p>Wir haben keine Ergebnisse für „zzqq“ gefunden.</p>';
    expect(run(READ_DE) as RawSearchPage).toMatchObject({ empty: true });
    expect(run(READ_US) as RawSearchPage).toMatchObject({ empty: false });
  });
});

describe('readSuggestions', () => {
  it('asks the suggestion endpoint and keeps searches, not shop names', async () => {
    const asked: string[] = [];
    globalThis.fetch = (input) => {
      asked.push(input instanceof Request ? input.url : input.toString());
      return Promise.resolve(
        new Response(
          JSON.stringify({
            results: [
              { query: 'tulip mug' },
              { query: 'tulip mug ceramic' },
              { query: '<span>find shop names</span>', shop_suggestion_item: true },
            ],
          }),
        ),
      );
    };

    expect(await (run(readSuggestions('tulip & mug')) as Promise<unknown>)).toEqual({
      ok: true,
      queries: ['tulip mug', 'tulip mug ceramic'],
    });
    expect(asked).toEqual(['/suggestions_ajax.php?search_type=all&search_query=tulip%20%26%20mug']);
  });

  it('says so when Etsy refuses or the request fails', async () => {
    const failed = { ok: false, queries: [] };
    globalThis.fetch = () => Promise.resolve(new Response('no', { status: 403 }));
    expect(await (run(readSuggestions('q')) as Promise<unknown>)).toEqual(failed);
    globalThis.fetch = () => Promise.reject(new Error('offline'));
    expect(await (run(readSuggestions('q')) as Promise<unknown>)).toEqual(failed);
  });

  it('gives up on a request Etsy does not answer within 10 s', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort());
    globalThis.fetch = (_input, init) =>
      init?.signal?.aborted ? Promise.reject(new Error('aborted')) : new Promise(() => undefined);
    try {
      expect(await (run(readSuggestions('q')) as Promise<unknown>)).toEqual({
        ok: false,
        queries: [],
      });
      expect(timeout).toHaveBeenCalledWith(10_000);
    } finally {
      timeout.mockRestore();
    }
  });
});
