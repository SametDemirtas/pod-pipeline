import { describe, expect, it } from 'vitest';
import { LISTING_RULES } from '@pod/rules';
import { keywordReport, type KeywordReport, type KeywordTerm } from './keyword-report.js';
import { sampleListing } from '../testing/index.js';
import { MARKETS } from './market.js';
import { couldBeTag, suggestedTags, writerWords } from './research-tags.js';

const term = (text: string, shops: number, overrides: Partial<KeywordTerm> = {}): KeywordTerm => ({
  term: text,
  listings: shops,
  shops,
  ads: 0,
  share: 0.5,
  suggested: false,
  trademark: false,
  partOfLonger: null,
  adOnly: false,
  ...overrides,
});

function report(query: string, terms: readonly KeywordTerm[]): KeywordReport {
  const empty = keywordReport(
    {
      query,
      resultsLabel: null,
      listings: [],
      suggestions: [],
      suggestionsAvailable: true,
      warnings: [],
    },
    MARKETS.US,
    LISTING_RULES,
  );
  return {
    ...empty,
    queryTerm: terms.find((each) => each.term === query) ?? term(query, 0),
    terms,
  };
}

/** Terms as a search for `cat mug` reports them, used by most shops first. */
const catMug = report('cat mug', [
  term('gift', 13),
  term('mug', 13),
  term('cat mug', 8),
  term('cat lover', 6),
  term('cat lover gift', 5),
  term('gift for her', 4),
  term('personalized', 4),
  term('funny', 4, { suggested: true }),
  term('funny cat mug', 3),
  term('coffee mug', 3),
  term('mug cat', 2),
  term('best cat dad ever', 2),
  term('cat mom gift', 2),
  term('cat mom mug', 2, { suggested: true }),
  term('disney cat mug', 2, { trademark: true }),
  term('fathers day gift', 2),
  term('gift for him', 2),
  term('portrait mug', 2),
  term('personalized cat mug gift', 2),
  term('cat lady mug', 2),
  term('black cat mug', 2),
]);

describe('couldBeTag', () => {
  it('takes up to four words in Etsy’s 20 characters', () => {
    expect(couldBeTag('best cat dad ever', LISTING_RULES)).toBe(true);
    expect(couldBeTag('a b c d e', LISTING_RULES)).toBe(false);
    expect(couldBeTag('personalized cat mug gift', LISTING_RULES)).toBe(false);
  });
});

describe('suggestedTags', () => {
  it('starts with the query, then searched phrases, and takes no single English words', () => {
    expect(suggestedTags(catMug, 'en-US', LISTING_RULES)).toEqual([
      'cat mug',
      'cat mom mug',
      'cat lover',
      'cat lover gift',
      'gift for her',
      'funny cat mug',
      'coffee mug',
      'best cat dad ever',
      'cat mom gift',
      'fathers day gift',
      'gift for him',
      'portrait mug',
      'cat lady mug',
    ]);
  });

  it('leaves out a trademarked query, terms with the same words, and shows fewer rather than single words', () => {
    const tags = suggestedTags(
      report('disney cat mug', [
        term('disney cat mug', 3, { trademark: true }),
        term('cat mug', 3),
        term('mug cat', 2),
        term('funny', 3),
      ]),
      'en-US',
      LISTING_RULES,
    );

    expect(tags).toEqual(['cat mug']);
  });

  it('takes one piece of a longer phrase, ending where the phrase ends, after phrases of their own', () => {
    const tags = suggestedTags(
      report('dog mom shirt', [
        term('dog mom shirt', 10),
        term('gift for dog', 4, { partOfLonger: 'gift for dog mom shirt' }),
        term('dog mom', 3, { partOfLonger: 'gift for dog mom shirt' }),
        term('mom shirt', 3, { partOfLonger: 'gift for dog mom shirt' }),
        term('sweatshirt women', 2, {
          partOfLonger: 'christmas sweatshirt women',
          suggested: true,
        }),
        term('christmas sweatshirt', 2, { partOfLonger: 'christmas sweatshirt women' }),
        term('dog lover gift', 4),
      ]),
      'en-US',
      LISTING_RULES,
    );

    expect(tags).toEqual(['dog mom shirt', 'sweatshirt women', 'dog lover gift', 'mom shirt']);
  });

  it('takes the piece that ends with the noun when every result goes on past the phrase', () => {
    const report = keywordReport(
      {
        query: 'wall art',
        resultsLabel: null,
        listings: [
          ['Mid Century Modern Wall Art, Boho Print', 'A'],
          ['Mid Century Modern Wall Art Set, Retro Poster', 'B'],
          ['Boho Wall Art, Abstract Print', 'C'],
          ['Boho Wall Art Set, Neutral Print', 'D'],
        ].map(([title = '', shopName = ''], index) =>
          sampleListing(title, { listingId: String(index), shopName }),
        ),
        suggestions: [],
        suggestionsAvailable: true,
        warnings: [],
      },
      MARKETS.US,
      LISTING_RULES,
    );

    expect(suggestedTags(report, 'en-US', LISTING_RULES)).toContain('modern wall art');
    expect(suggestedTags(report, 'en-US', LISTING_RULES)).not.toContain('century modern wall');
  });

  it('lets another piece stand in when the one ending with the noun is a term of its own', () => {
    const tags = suggestedTags(
      report('fishing shirt', [
        term('fishing shirt', 3),
        term('vintage fishing shirt', 2),
        term('vintage fishing', 2, { partOfLonger: 'vintage fishing shirt' }),
        term('abstract boho wall', 2, { partOfLonger: 'abstract boho wall art' }),
        term('boho wall art', 2),
      ]),
      'en-US',
      LISTING_RULES,
    );

    expect(tags).toEqual(['fishing shirt', 'boho wall art', 'vintage fishing']);
  });

  it('ranks phrases only ads use after the pieces of longer phrases', () => {
    const tags = suggestedTags(
      report('wedding sign', [
        term('wedding sign', 4),
        term('acrylic wedding sign', 0, { adOnly: true }),
        term('wedding sign decor', 2, { partOfLonger: 'rustic wedding sign decor' }),
      ]),
      'en-US',
      LISTING_RULES,
    );

    expect(tags).toEqual(['wedding sign', 'wedding sign decor', 'acrylic wedding sign']);
  });

  it('prefers the piece more results use, then the one sharing more words with the query', () => {
    const pieces = (query: string, first: number, second: number) =>
      suggestedTags(
        report(query, [
          term('appreciation gift', first, { partOfLonger: 'teacher appreciation gift' }),
          term('teacher gift', second, { partOfLonger: 'teacher appreciation gift' }),
        ]),
        'en-US',
        LISTING_RULES,
      );

    expect(pieces('mug', 3, 2)).toEqual(['appreciation gift']);
    expect(pieces('teacher mug', 2, 2)).toEqual(['teacher mug', 'teacher gift']);
  });

  it('takes long German compounds, but no adjectives or compounds already in a tag', () => {
    const tags = suggestedTags(
      report('katzen tasse', [
        term('katzen tasse', 6),
        term('kaffeetasse katze', 3),
        term('tasse', 8),
        term('personalisiert', 5),
        term('kaffeetasse', 4),
        term('katzenliebhaber', 3),
      ]),
      'de-DE',
      LISTING_RULES,
    );

    expect(tags).toEqual(['katzen tasse', 'kaffeetasse katze', 'katzenliebhaber']);
  });
});

describe('writerWords', () => {
  it('gives the strongest terms, single words too, with what the search found', () => {
    const words = writerWords(catMug);

    expect(words[0]).toEqual({ term: 'cat mug', suggested: false, shops: 8 });
    expect(words).toContainEqual({ term: 'funny', suggested: true, shops: 4 });
    expect(words.map((word) => word.term)).not.toContain('disney cat mug');
  });

  it('puts an unused query first, with no shops', () => {
    expect(writerWords(report('axolotl mug', [term('cute mug', 2)]))).toEqual([
      { term: 'axolotl mug', suggested: false, shops: 0 },
      { term: 'cute mug', suggested: false, shops: 2 },
    ]);
  });
});
