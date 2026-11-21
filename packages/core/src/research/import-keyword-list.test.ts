import { describe, expect, it } from 'vitest';
import { FixedClock, InMemoryKeywordLists, SequentialIds } from '../testing/index.js';
import { ImportKeywordList } from './import-keyword-list.js';
import type { KeywordListId } from './keyword-list.js';

describe('ImportKeywordList', () => {
  it('keeps the file’s keywords under its name', async () => {
    const lists = new InMemoryKeywordLists();
    const importList = new ImportKeywordList({
      lists,
      clock: new FixedClock(),
      ids: new SequentialIds('list'),
    });

    const list = await importList.execute({
      name: 'erank-tulip.csv',
      text: 'Keyword,Searches\ntulip mug,120',
      market: 'GB',
    });

    expect(list).toEqual({
      id: 'list-0001',
      fileName: 'erank-tulip.csv',
      market: 'GB',
      importedAt: new Date('2026-01-01T00:00:00.000Z'),
      figures: ['searches'],
      keywords: [
        {
          term: 'tulip mug',
          trademark: false,
          searches: 120,
          clicks: null,
          ctr: null,
          competition: null,
        },
      ],
      truncated: false,
    });
    expect(await lists.get('list-0001' as KeywordListId)).toEqual(list);
  });
});
