import { sleep } from '@pod/adapter-http';
import type { Market, MarketSearch, MarketSearchPage } from '@pod/core';
import { ETSY_MARKET_PAGES, searchUrl } from './etsy-markets.js';
import { readSearchPage, readSuggestions } from './etsy-page-scripts.js';
import {
  listingsOf,
  parseSearchPage,
  parseSuggestions,
  readWarnings,
  UNREAD_PAGE,
  type RawSearchPage,
} from './etsy-search-results.js';

/** A browser page the search drives; an Electron window in the app. */
export interface ResearchPage {
  load(url: string): Promise<void>;
  evaluate<T>(script: string): Promise<T>;
  /** Brings the page to the seller, e.g. to pass Etsy's human check. */
  show(): void;
  /** Whether the seller closed the page, which ends the search. */
  isClosed(): boolean;
  close(): void;
}

export interface BrowserMarketSearchOptions {
  /** A page that speaks to Etsy in the market's language. */
  readonly openPage: (market: Market) => ResearchPage;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly now?: () => number;
  readonly timeoutMs?: number;
}

/** The seller closed the window Etsy's check was shown in. */
export class ResearchClosedError extends Error {
  constructor() {
    super('The research window was closed');
    this.name = new.target.name;
  }
}

export class ResearchTimeoutError extends Error {
  constructor(readonly blocked: boolean) {
    super(
      blocked
        ? 'Etsy kept asking to prove a person is searching'
        : 'Etsy did not show search results in time',
    );
    this.name = new.target.name;
  }
}

/** Etsy showed its search page, but nothing on it read as results or as an empty search. */
export class MarketLayoutChangedError extends Error {
  constructor() {
    super("Etsy's search page no longer reads as the app expects");
    this.name = new.target.name;
  }
}

const POLL_MS = 1_500;
/** How long one read of the page may take; a page that hangs is read again on the next poll. */
const READ_MS = 5_000;
/** Etsy's suggestions are fetched inside the page, which gives up after 10 s itself. */
const SUGGESTIONS_MS = 12_000;
/** Polls of a loaded search page without results before it counts as changed. */
const POLLS_BEFORE_CHANGED = 2;

/**
 * Searches Etsy in a real browser page without signing in, as a buyer in the
 * market would. The page stays hidden unless Etsy asks for a human check,
 * which the seller passes in the window; nothing is solved automatically.
 */
export class BrowserMarketSearch implements MarketSearch {
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;

  constructor(private readonly options: BrowserMarketSearchOptions) {
    this.sleep = options.sleep ?? sleep;
    this.now = options.now ?? Date.now;
  }

  async search(query: string, market: Market): Promise<MarketSearchPage> {
    const etsyPage = ETSY_MARKET_PAGES[market.region];
    const page = this.options.openPage(market);
    try {
      // Not awaited: a page that never finishes loading must not outlast the deadline.
      const load = { done: false, error: undefined as Error | undefined };
      page.load(searchUrl(query, market.region)).then(
        () => {
          load.done = true;
        },
        (error: unknown) => {
          load.error = error instanceof Error ? error : new Error('Etsy did not load');
        },
      );
      const raw = await this.waitForResults(page, readSearchPage(etsyPage), load);
      const answer = await answerWithin(page, readSuggestions(query), SUGGESTIONS_MS).catch(
        () => null,
      );
      const { available, suggestions } = parseSuggestions(answer);
      const listings = listingsOf(raw.cards, etsyPage);
      return {
        query,
        resultsLabel: raw.resultsLabel,
        listings,
        suggestions,
        suggestionsAvailable: available,
        warnings: readWarnings(raw, listings),
      };
    } finally {
      page.close();
    }
  }

  /** Waits until the page shows results whose number held for two polls, or no results. */
  private async waitForResults(
    page: ResearchPage,
    script: string,
    load: { readonly done: boolean; readonly error: Error | undefined },
  ): Promise<RawSearchPage> {
    const deadline = this.now() + (this.options.timeoutMs ?? 180_000);
    let shown = false;
    let previous = UNREAD_PAGE;
    let withoutResults = 0;
    for (;;) {
      if (page.isClosed()) throw new ResearchClosedError();
      if (load.error !== undefined) throw load.error;
      // While Etsy's check reloads the page, reading it can fail; the next poll tries again.
      const limit = Math.min(READ_MS, Math.max(0, deadline - this.now()));
      const raw = await answerWithin(page, script, limit).then(parseSearchPage, () => UNREAD_PAGE);
      // Etsy fills a search without results with other listings, which say nothing about it.
      if (raw.empty) return { ...raw, cards: [], unreadCards: 0 };
      if (raw.cards.length > 0 && raw.cards.length === previous.cards.length) return raw;
      const loadedWithoutResults =
        load.done && raw.searchPage && !raw.blocked && raw.cards.length === 0;
      withoutResults = loadedWithoutResults ? withoutResults + 1 : 0;
      if (withoutResults >= POLLS_BEFORE_CHANGED) throw new MarketLayoutChangedError();
      if (raw.blocked && !shown) {
        shown = true;
        page.show();
      }
      if (this.now() >= deadline) throw new ResearchTimeoutError(shown || raw.blocked);
      previous = raw;
      await this.sleep(POLL_MS);
    }
  }
}

/** What the script returns, or a failure once `milliseconds` passed without an answer. */
async function answerWithin(
  page: ResearchPage,
  script: string,
  milliseconds: number,
): Promise<unknown> {
  let timer: NodeJS.Timeout | undefined;
  const timeUp = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('The page did not answer in time'));
    }, milliseconds);
  });
  try {
    return await Promise.race([page.evaluate<unknown>(script), timeUp]);
  } finally {
    clearTimeout(timer);
  }
}
