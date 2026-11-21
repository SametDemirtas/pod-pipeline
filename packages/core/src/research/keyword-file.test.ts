import { describe, expect, it } from 'vitest';
import { KeywordFileUnreadableError } from '../errors.js';
import { MAX_LIST_KEYWORDS, readKeywordFile } from './keyword-file.js';

describe('readKeywordFile', () => {
  it('reads an eRank export with its figures, thousands separators and quotes', () => {
    const file = readKeywordFile(
      '\uFEFFKeyword,Avg. Searches,Avg. Clicks,Avg. CTR,Etsy Competition,Google Searches\r\n' +
        '"tulip mug","12,345",1.024,45%,"98,765","300"\r\n' +
        'spooky "witch" mug,880,12,1.5,1200,10\r\n' +
        '"say ""boo"" mug",1,2,3,4,5',
    );

    expect(file.figures).toEqual(['searches', 'clicks', 'ctr', 'competition']);
    expect(file.keywords).toEqual([
      {
        term: 'tulip mug',
        trademark: false,
        searches: 12_345,
        clicks: 1024,
        ctr: 45,
        competition: 98_765,
      },
      {
        term: 'spooky "witch" mug',
        trademark: false,
        searches: 880,
        clicks: 12,
        ctr: 1.5,
        competition: 1200,
      },
      { term: 'say "boo" mug', trademark: false, searches: 1, clicks: 2, ctr: 3, competition: 4 },
    ]);
  });

  it('reads semicolons, decimal commas and a keyword column under another name', () => {
    const file = readKeywordFile(
      'Search Term;Search Volume;Click-through rate\n"geister; tasse";1.234,5;"0,45"\n',
    );

    expect(file.figures).toEqual(['searches', 'ctr']);
    expect(file.keywords).toEqual([
      {
        term: 'geister; tasse',
        trademark: false,
        searches: 1234.5,
        clicks: null,
        ctr: 0.45,
        competition: null,
      },
    ]);
  });

  it('keeps each keyword once, flags trademarks and leaves out unreadable figures', () => {
    const file = readKeywordFile(
      'tags\tcompetition\nDisney mug\tHigh\ntulip  mug\t\nTulip Mug\t3\n\n' +
        `${'x'.repeat(101)}\t1\n"line\nbreak"\t2`,
    );

    expect(file.keywords).toEqual([
      expect.objectContaining({ term: 'Disney mug', trademark: true, competition: null }),
      expect.objectContaining({ term: 'tulip mug', competition: null }),
      expect.objectContaining({ term: 'line break', competition: 2 }),
    ]);
  });

  it('reads shares below one, big grouped numbers and grouping with spaces', () => {
    const file = readKeywordFile(
      'Keyword,CTR,Searches\na,0.125,"1,000,000.50"\nb,"0,456",1 234\nc,12.5%,"1.234.567"\n',
    );

    expect(file.keywords.map(({ term, ctr, searches }) => [term, ctr, searches])).toEqual([
      ['a', 0.125, 1_000_000.5],
      ['b', 0.456, 1234],
      ['c', 12.5, 1_234_567],
    ]);
  });

  it.each([
    ['Keyword Phrase,Searches\ncat mug,1', ['searches']],
    ['"Keyword, phrase";Searches\ncat mug;1', ['searches']],
    ['Long tail keyword,Search Volume\ncat mug,1', ['searches']],
    ['Query,Competition\ncat mug,1', ['competition']],
    [
      'Search Term,Engagement,Competition,Search Volume\ncat mug,Very High,High,"1,200"',
      ['searches', 'competition'],
    ],
    ['Keyword,Google Search Volume,Etsy Search Volume\ncat mug,5,7', ['searches']],
  ])('finds the keyword column of %j', (text, figures) => {
    const file = readKeywordFile(text);

    expect(file.keywords[0]?.term).toBe('cat mug');
    expect(file.figures).toEqual(figures);
  });

  it('takes the Etsy figure over the Google one', () => {
    expect(
      readKeywordFile('Keyword,Google Search Volume,Etsy Search Volume\nmug,5,7').keywords[0]
        ?.searches,
    ).toBe(7);
  });

  it(`keeps at most ${MAX_LIST_KEYWORDS} keywords, and says when it left some out`, () => {
    const rows = (count: number) => Array.from({ length: count }, (_, i) => `k${i}`).join('\n');

    const long = readKeywordFile(`keyword\n${rows(MAX_LIST_KEYWORDS + 5)}`);
    expect(long.keywords).toHaveLength(MAX_LIST_KEYWORDS);
    expect(long.truncated).toBe(true);
    // Repeats and empty rows after the last kept keyword leave nothing out.
    const full = readKeywordFile(`keyword\n${rows(MAX_LIST_KEYWORDS)}\nk0\n\n`);
    expect(full.keywords).toHaveLength(MAX_LIST_KEYWORDS);
    expect(full.truncated).toBe(false);
  });

  it('refuses a file without a keyword column or without keywords', () => {
    expect(() => readKeywordFile('name,searches\ntulip mug,10')).toThrow(
      new KeywordFileUnreadableError('noKeywordColumn'),
    );
    expect(() => readKeywordFile('keyword,searches\n,10\n')).toThrow(
      new KeywordFileUnreadableError('noKeywords'),
    );
  });
});
