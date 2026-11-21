import { describe, expect, it } from 'vitest';
import type { KeywordEntryDto, KeywordListDto } from '@pod/contracts';
import { researchRunDto } from '../../../testing/batch-fixtures.js';
import { item, setUp } from '../../../testing/batch-steps-setup.js';

function entry(term: string, searches: number | null, trademark = false): KeywordEntryDto {
  return { term, trademark, searches, clicks: null, ctr: null, competition: null };
}

function list(
  id: string,
  keywords: KeywordEntryDto[],
  changes: Partial<KeywordListDto> = {},
): KeywordListDto {
  return {
    id,
    fileName: `${id}.csv`,
    market: 'US',
    importedAt: '2026-10-27T00:00:00.000Z',
    figures: ['searches'],
    keywords,
    truncated: false,
    ...changes,
  };
}

describe('research step', () => {
  it('reuses a recent saved search for the same words, then fitting imported words', async () => {
    const { catalog, keywordLists, run } = setUp();
    const recent = researchRunDto('r1', 'meadow bees mug', '2026-10-20T00:00:00.000Z');
    catalog.listResearch.mockResolvedValue([{ ...recent, resultsLabel: null, topTerms: [] }]);
    catalog.getResearch.mockResolvedValue(recent);
    keywordLists.lists.push(list('l1', [entry('fall coffee mug', 900), entry('meadow decor', 50)]));

    expect(await run('research')).toEqual({
      state: 'done',
      prepared: {
        keywords: [
          { term: 'meadow bees mug', market: 'US', suggested: true },
          { term: 'fall coffee mug', market: 'US', suggested: false, shops: 3 },
          { term: 'meadow decor', market: 'US', searches: 50 },
        ],
      },
    });
    expect(catalog.getResearch).toHaveBeenCalledWith({ id: 'r1' });
  });

  it("picks the job market's newest lists' words that name the product or concept, most searched first", async () => {
    const { keywordLists, run } = setUp();
    keywordLists.lists.push(
      list('l1', [
        entry('tulip mugs', 120),
        entry('meadow gift', null),
        entry('starbucks mug', 9_000, true),
        entry('throw blanket', 5_000),
        entry('autumn mug', 800),
      ]),
      list('de', [entry('herbst tasse mug', 10_000)], { market: 'DE' }),
    );

    expect(await run('research')).toEqual({
      state: 'done',
      prepared: {
        keywords: [
          { term: 'autumn mug', market: 'US', searches: 800 },
          { term: 'tulip mugs', market: 'US', searches: 120 },
          { term: 'meadow gift', market: 'US' },
        ],
      },
    });
  });

  it('finishes skipped with no keywords when nothing was saved, and never searches Etsy', async () => {
    const { catalog, run } = setUp();

    expect(await run('research')).toEqual({ state: 'skipped', prepared: { keywords: [] } });
    expect(await run('research', item({ keywords: [] }))).toEqual({ state: 'skipped' });
    expect(catalog.researchKeywords).not.toHaveBeenCalled();
  });
});
