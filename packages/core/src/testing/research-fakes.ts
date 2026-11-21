import type { KeywordListRepository } from '../ports/keyword-lists.js';
import type { MarketSearch } from '../ports/market-search.js';
import type { ResearchRepository } from '../ports/research.js';
import type { KeywordList, KeywordListId, KeywordListSummary } from '../research/keyword-list.js';
import type { Market, MarketListing, MarketSearchPage } from '../research/market.js';
import type { ResearchRun, ResearchRunId } from '../research/research-run.js';

export function sampleListing(
  title: string,
  overrides: Partial<MarketListing> = {},
): MarketListing {
  return {
    listingId: `l-${title.length}-${title.slice(0, 4)}`,
    title,
    shopName: 'SampleShop',
    price: 20,
    currency: 'USD',
    onSale: false,
    freeShipping: false,
    isAd: false,
    isTopSeller: false,
    badges: [],
    ...overrides,
  };
}

/** Answers every search with the same page under the asked query. */
export class FakeMarketSearch implements MarketSearch {
  readonly queries: string[] = [];
  readonly markets: Market[] = [];

  constructor(
    private readonly page: Omit<MarketSearchPage, 'query'> = {
      resultsLabel: '1,000+',
      listings: [
        sampleListing('Tulip Mug, Halloween Tulip Mug', { shopName: 'MoonShop' }),
        sampleListing('Cute Tulip Mug', { shopName: 'PaperFox' }),
      ],
      suggestions: ['tulip mug ceramic'],
      suggestionsAvailable: true,
      warnings: [],
    },
  ) {}

  search(query: string, market: Market): Promise<MarketSearchPage> {
    this.queries.push(query);
    this.markets.push(market);
    return Promise.resolve({ query, ...this.page });
  }
}

export class InMemoryResearch implements ResearchRepository {
  private runs: ResearchRun[] = [];

  save(run: ResearchRun): Promise<void> {
    this.runs = [run, ...this.runs.filter((other) => other.id !== run.id)];
    return Promise.resolve();
  }

  list(limit: number): Promise<readonly ResearchRun[]> {
    const newest = [...this.runs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return Promise.resolve(newest.slice(0, limit));
  }

  get(id: ResearchRunId): Promise<ResearchRun | undefined> {
    return Promise.resolve(this.runs.find((run) => run.id === id));
  }

  async keepNewest(count: number): Promise<void> {
    const kept = new Set((await this.list(count)).map((run) => run.id));
    this.runs = this.runs.filter((run) => kept.has(run.id));
  }
}

export class InMemoryKeywordLists implements KeywordListRepository {
  private lists: KeywordList[] = [];

  save(list: KeywordList): Promise<void> {
    this.lists = [list, ...this.lists.filter((other) => other.id !== list.id)];
    return Promise.resolve();
  }

  list(): Promise<readonly KeywordListSummary[]> {
    return Promise.resolve(
      [...this.lists]
        .sort((a, b) => b.importedAt.getTime() - a.importedAt.getTime())
        .map(({ id, fileName, market, importedAt, keywords }) => ({
          id,
          fileName,
          market,
          importedAt,
          keywordCount: keywords.length,
        })),
    );
  }

  get(id: KeywordListId): Promise<KeywordList | undefined> {
    return Promise.resolve(this.lists.find((list) => list.id === id));
  }

  remove(id: KeywordListId): Promise<void> {
    this.lists = this.lists.filter((list) => list.id !== id);
    return Promise.resolve();
  }
}
