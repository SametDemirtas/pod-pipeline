import { describe, expect, it } from 'vitest';
import { keywordListDto } from '../../testing/fake-api.js';
import { searchWordsFromList } from './research-tags.js';

describe('searchWordsFromList', () => {
  it('puts the most searched first, splits keywords holding commas and leaves out trademarks', () => {
    const list = keywordListDto('list-1', 'DE');
    const entry = (term: string, searches: number) => ({
      term,
      trademark: false,
      searches,
      clicks: null,
      ctr: null,
      competition: null,
    });
    const words = searchWordsFromList({
      ...list,
      keywords: [
        ...list.keywords,
        entry('katzen tasse, lustig', 99_999),
        entry('tasse', 50_000),
      ].map((keyword) => ({ ...keyword, trademark: keyword.term === 'disney mug' })),
    });

    expect(words).toEqual([
      { term: 'katzen tasse', market: 'DE' },
      { term: 'lustig', market: 'DE' },
      { term: 'tasse', market: 'DE', searches: 50_000 },
      { term: 'tulip mug gift', market: 'DE', searches: 12_345 },
      { term: 'spooky mug', market: 'DE' },
    ]);
  });
});
