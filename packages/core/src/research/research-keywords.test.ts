import { describe, expect, it } from 'vitest';
import { LISTING_RULES } from '@pod/rules';
import { ValidationError } from '../errors.js';
import {
  FakeMarketSearch,
  FixedClock,
  InMemoryResearch,
  sampleListing,
  SequentialIds,
} from '../testing/index.js';
import { MARKETS } from './market.js';
import { researchQuery, ResearchKeywords } from './research-keywords.js';
import type { ResearchRunId } from './research-run.js';

function setUp() {
  const search = new FakeMarketSearch();
  const runs = new InMemoryResearch();
  const research = new ResearchKeywords({
    search,
    runs,
    clock: new FixedClock(),
    ids: new SequentialIds('run'),
    rules: LISTING_RULES,
  });
  return { search, runs, research };
}

describe('ResearchKeywords', () => {
  it('searches the tidied query, reports on it and keeps the run', async () => {
    const { search, runs, research } = setUp();

    const run = await research.execute('  tulip   mug ');

    expect(search.queries).toEqual(['tulip mug']);
    expect(search.markets).toEqual([MARKETS.US]);
    expect(run).toMatchObject({
      id: 'run-0001',
      query: 'tulip mug',
      market: 'US',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      report: { query: 'tulip mug', resultsLabel: '1,000+', listingCount: 2 },
    });
    expect(run.report.terms.map((term) => term.term)).toContain('tulip mug');
    expect(await runs.get('run-0001' as ResearchRunId)).toEqual(run);
    expect(await runs.list(5)).toEqual([run]);
  });

  it('searches the market asked for and counts its titles in its language', async () => {
    const search = new FakeMarketSearch({
      resultsLabel: null,
      listings: [
        sampleListing('Geister Tasse mit Spruch', { shopName: 'A' }),
        sampleListing('Geister Tasse mit Katze', { shopName: 'B' }),
      ],
      suggestions: [],
      suggestionsAvailable: true,
      warnings: [],
    });
    const research = new ResearchKeywords({
      search,
      runs: new InMemoryResearch(),
      clock: new FixedClock(),
      ids: new SequentialIds('run'),
      rules: LISTING_RULES,
    });

    const run = await research.execute('geister tasse', 'DE');

    expect(search.markets).toEqual([MARKETS.DE]);
    expect(run.market).toBe('DE');
    // `mit` is a German stop word, so the phrase ends before it.
    expect(run.report.terms.map((term) => term.term)).toEqual(['geister tasse']);
  });

  it.each(['  ', 'x'.repeat(101)])('refuses the query %j before searching', async (query) => {
    const { search, research } = setUp();

    await expect(research.execute(query)).rejects.toBeInstanceOf(ValidationError);
    expect(() => researchQuery(query)).toThrow(ValidationError);
    expect(search.queries).toEqual([]);
  });
});
