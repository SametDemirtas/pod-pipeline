import { beforeEach, describe, expect, it } from 'vitest';
import { LISTING_RULES } from '@pod/rules';
import type { KeywordListRepository } from '../../ports/keyword-lists.js';
import type { ResearchRepository } from '../../ports/research.js';
import { readKeywordFile } from '../../research/keyword-file.js';
import type { KeywordList, KeywordListId } from '../../research/keyword-list.js';
import { keywordReport } from '../../research/keyword-report.js';
import { MARKETS, type MarketRegion } from '../../research/market.js';
import type { ResearchRun, ResearchRunId } from '../../research/research-run.js';
import { sampleListing } from '../research-fakes.js';

function sampleRun(
  id: string,
  minute: number,
  query = 'tulip mug',
  market: MarketRegion = 'US',
): ResearchRun {
  return {
    id: id as ResearchRunId,
    query,
    market,
    createdAt: new Date(Date.UTC(2026, 9, 26, 10, minute)),
    report: keywordReport(
      {
        query,
        resultsLabel: '1,000+',
        listings: [
          sampleListing('Tulip Mug', { shopName: 'MoonShop' }),
          sampleListing('Cute Tulip Mug', { shopName: 'PaperFox' }),
          sampleListing('Tulip Mug Gift', { isAd: true }),
        ],
        suggestions: ['tulip mug ceramic'],
        suggestionsAvailable: true,
        warnings: ['pricesUnread'],
      },
      MARKETS[market],
      LISTING_RULES,
    ),
  };
}

/** Behaviour every research repository must share. */
export function describeResearchContract(
  name: string,
  create: () => Promise<ResearchRepository> | ResearchRepository,
): void {
  describe(`${name} research contract`, () => {
    let runs: ResearchRepository;

    beforeEach(async () => {
      runs = await create();
    });

    it('keeps a run with its market and whole report', async () => {
      const run = sampleRun('r1', 1, 'geister tasse', 'DE');
      await runs.save(run);

      expect(await runs.get('r1' as ResearchRunId)).toEqual(run);
      expect(await runs.get('gone' as ResearchRunId)).toBeUndefined();
    });

    it('lists the newest runs first, up to the limit', async () => {
      await runs.save(sampleRun('r1', 1));
      await runs.save(sampleRun('r3', 3));
      await runs.save(sampleRun('r2', 2));

      expect((await runs.list(2)).map((run) => run.id)).toEqual(['r3', 'r2']);
    });

    it('drops all but the newest runs', async () => {
      await runs.save(sampleRun('r1', 1));
      await runs.save(sampleRun('r3', 3));
      await runs.save(sampleRun('r2', 2));

      await runs.keepNewest(2);

      expect((await runs.list(10)).map((run) => run.id)).toEqual(['r3', 'r2']);
      expect(await runs.get('r1' as ResearchRunId)).toBeUndefined();
    });
  });
}

function sampleList(id: string, minute: number): KeywordList {
  return {
    id: id as KeywordListId,
    fileName: `${id}.csv`,
    market: 'DE',
    importedAt: new Date(Date.UTC(2026, 9, 26, 10, minute)),
    ...readKeywordFile('Keyword,Avg Searches\ntulip mug,"1,200"\nspooky mug,\n'),
  };
}

/** Behaviour every keyword list repository must share. */
export function describeKeywordListContract(
  name: string,
  create: () => Promise<KeywordListRepository> | KeywordListRepository,
): void {
  describe(`${name} keyword list contract`, () => {
    let lists: KeywordListRepository;

    beforeEach(async () => {
      lists = await create();
    });

    it('keeps a list with its keywords and figures, newest first', async () => {
      const older = sampleList('k1', 1);
      const newer = sampleList('k2', 2);
      await lists.save(older);
      await lists.save(newer);

      expect(await lists.get('k1' as KeywordListId)).toEqual(older);
      expect(await lists.get('gone' as KeywordListId)).toBeUndefined();
      expect(await lists.list()).toEqual([
        {
          id: 'k2',
          fileName: 'k2.csv',
          market: 'DE',
          importedAt: newer.importedAt,
          keywordCount: 2,
        },
        {
          id: 'k1',
          fileName: 'k1.csv',
          market: 'DE',
          importedAt: older.importedAt,
          keywordCount: 2,
        },
      ]);
    });

    it('removes a list', async () => {
      await lists.save(sampleList('k1', 1));
      await lists.save(sampleList('k2', 2));

      await lists.remove('k1' as KeywordListId);
      await lists.remove('gone' as KeywordListId);

      expect((await lists.list()).map((list) => list.id)).toEqual(['k2']);
    });
  });
}
