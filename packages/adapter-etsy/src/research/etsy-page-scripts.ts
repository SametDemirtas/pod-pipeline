import type { EtsyMarketPage } from './etsy-markets.js';

/**
 * Scripts run inside the Etsy page, kept as plain JavaScript text so the
 * bundler cannot change them. They only read what a buyer sees.
 */

/**
 * Reads the result cards, the result count, whether the page is a search at
 * all and whether Etsy asks to prove a human, in the market's words.
 */
export function readSearchPage(market: Pick<EtsyMarketPage, 'resultWords' | 'noResults'>): string {
  const count = JSON.stringify(`([\\d.,]+\\+?)\\s+(?:${market.resultWords})`);
  const empty = JSON.stringify(market.noResults);
  return `(() => {
  const tidy = (value) => value.replace(/\\s+/g, ' ').trim();
  const text = (node) => (node ? tidy(node.textContent) : '');
  const body = document.body.innerText;
  const blocked = Boolean(document.querySelector('iframe[src*="captcha-delivery"]'));
  const count = body.match(new RegExp(${count}, 'i'));
  const cards = [...document.querySelectorAll('div.v2-listing-card[data-listing-id]')].map((card) => {
    const link = card.querySelector('a[data-listing-link]');
    return {
      listingId: card.getAttribute('data-listing-id') || '',
      title: tidy((link && link.getAttribute('aria-label')) || text(card.querySelector('h3, h2'))),
      shopName: text(card.querySelector('[data-seller-name-link]')),
      price: text(card.querySelector('.lc-price .currency-value')),
      currency: text(card.querySelector('.lc-price .currency-symbol')),
      starSeller: Boolean(card.querySelector('[data-star-seller-badge]')),
      text: tidy(card.innerText),
    };
  });
  return {
    blocked,
    empty: new RegExp(${empty}, 'i').test(body),
    searchPage: /\\/search(?:\\/|$)/.test(location.pathname),
    resultsLabel: count ? count[1] : null,
    cards,
  };
})()`;
}

const SUGGESTIONS_FETCH_MS = 10_000;

/**
 * Asks Etsy's search box for its suggestions, as typing the query would; `ok`
 * is false when Etsy did not answer, or not within 10 s.
 */
export function readSuggestions(query: string): string {
  const url = `/suggestions_ajax.php?search_type=all&search_query=${encodeURIComponent(query)}`;
  return `fetch(${JSON.stringify(url)}, {
    headers: { 'x-requested-with': 'XMLHttpRequest' },
    signal: AbortSignal.timeout(${SUGGESTIONS_FETCH_MS}),
  })
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error('refused'))))
    .then((body) => ({
      ok: true,
      queries: (body.results || [])
        .filter((result) => !result.shop_suggestion_item && typeof result.query === 'string')
        .map((result) => result.query),
    }))
    .catch(() => ({ ok: false, queries: [] }))`;
}
