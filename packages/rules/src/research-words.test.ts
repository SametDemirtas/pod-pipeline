import { describe, expect, it } from 'vitest';
import type { ResearchRunDto } from '@pod/contracts/client';
import { searchWordsOfRun } from './research-words.js';

describe('searchWordsOfRun', () => {
  it('sends the words for writing with the market, and no count for a query no result used', () => {
    const run = {
      market: 'DE',
      report: {
        writerWords: [
          { term: 'tulip mug', suggested: true, shops: 0 },
          { term: 'halloween coffee mug', suggested: false, shops: 1 },
        ],
      },
    } as unknown as ResearchRunDto;

    expect(searchWordsOfRun(run)).toEqual([
      { term: 'tulip mug', market: 'DE', suggested: true },
      { term: 'halloween coffee mug', market: 'DE', suggested: false, shops: 1 },
    ]);
  });
});
