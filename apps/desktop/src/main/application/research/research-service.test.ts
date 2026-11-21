import { describe, expect, it } from 'vitest';
import { MARKETS, ResearchKeywords } from '@pod/core';
import { FakeMarketSearch, FixedClock, InMemoryResearch, SequentialIds } from '@pod/core/testing';
import { RESEARCH_GAP_MS, RESEARCH_PER_HOUR, LISTING_RULES } from '@pod/rules';
import { ResearchService } from './research-service.js';

function setUp(search = new FakeMarketSearch(), now = () => 0) {
  const runs = new InMemoryResearch();
  const service = new ResearchService({
    research: new ResearchKeywords({
      search,
      runs,
      clock: new FixedClock(),
      ids: new SequentialIds('run'),
      rules: LISTING_RULES,
    }),
    runs,
    clock: { now: () => new Date(now()) },
    rules: LISTING_RULES,
  });
  return { service, search };
}

describe('ResearchService', () => {
  it('runs a search and summarises the history', async () => {
    const { service } = setUp();

    const run = await service.researchKeywords({ query: 'tulip mug' });

    expect(run).toMatchObject({ id: 'run-0001', createdAt: '2026-01-01T00:00:00.000Z' });
    expect(await service.listResearch()).toEqual([
      {
        id: 'run-0001',
        query: 'tulip mug',
        market: 'US',
        createdAt: '2026-01-01T00:00:00.000Z',
        resultsLabel: '1,000+',
        topTerms: run.report.terms.slice(0, 5).map((term) => term.term),
      },
    ]);
  });

  it('runs one search at a time', async () => {
    const search = new FakeMarketSearch();
    let finish: () => void = () => undefined;
    const original = search.search.bind(search);
    search.search = (query, market) =>
      new Promise((resolve) => {
        finish = () => {
          resolve(original(query, market));
        };
      });
    const { service } = setUp(search);

    const first = service.researchKeywords({ query: 'a' });
    await expect(service.researchKeywords({ query: 'b' })).rejects.toMatchObject({
      code: 'RESEARCH_IN_PROGRESS',
    });
    finish();
    await expect(first).resolves.toMatchObject({ query: 'a' });
  });

  it('searches the market asked for and keeps it with the run', async () => {
    const { service, search } = setUp();

    const run = await service.researchKeywords({ query: 'geister tasse', market: 'GB' });

    expect(search.markets).toEqual([MARKETS.GB]);
    expect(run.market).toBe('GB');
    expect(await service.getResearch({ id: run.id })).toEqual(run);
    await expect(service.getResearch({ id: 'gone' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('refuses a query it cannot search without using up a search', async () => {
    const { service, search } = setUp();

    await expect(service.researchKeywords({ query: 'x'.repeat(101) })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(service.researchKeywords({ query: 'tulip mug' })).resolves.toMatchObject({
      query: 'tulip mug',
    });
    expect(search.queries).toEqual(['tulip mug']);
  });

  it('spaces searches out and caps them per hour, as a person searches', async () => {
    let time = 0;
    const { service } = setUp(new FakeMarketSearch(), () => time);

    await service.researchKeywords({ query: 'a' });
    time = RESEARCH_GAP_MS - 1_500;
    await expect(service.researchKeywords({ query: 'b' })).rejects.toMatchObject({
      code: 'RESEARCH_RATE_LIMITED',
      details: { retryAfterSeconds: 2 },
    });
    for (let turn = 1; turn < RESEARCH_PER_HOUR; turn++) {
      time = turn * RESEARCH_GAP_MS;
      await service.researchKeywords({ query: `q${String(turn)}` });
    }
    time = RESEARCH_PER_HOUR * RESEARCH_GAP_MS;
    await expect(service.researchKeywords({ query: 'c' })).rejects.toMatchObject({
      code: 'RESEARCH_RATE_LIMITED',
      details: { retryAfterSeconds: (3_600_000 - RESEARCH_PER_HOUR * RESEARCH_GAP_MS) / 1000 },
    });
    time = 3_600_000;
    await expect(service.researchKeywords({ query: 'd' })).resolves.toMatchObject({ query: 'd' });
  });
});
