import { describe, expect, it } from 'vitest';
import { LISTING_RULES } from '@pod/rules';
import { sampleListing } from '../testing/index.js';
import { keywordReport, MAX_TERMS } from './keyword-report.js';
import { MARKETS, type MarketListing, type MarketSearchPage } from './market.js';

function page(
  listings: readonly MarketListing[],
  overrides: Partial<MarketSearchPage> = {},
): MarketSearchPage {
  return {
    query: 'tulip mug',
    resultsLabel: null,
    listings,
    suggestions: [],
    suggestionsAvailable: true,
    warnings: [],
    ...overrides,
  };
}

/** Listings with their own id, by the shop given. */
function byShops(...entries: (readonly [string, string, Partial<MarketListing>?])[]) {
  return entries.map(([title, shopName, overrides], index) =>
    sampleListing(title, { listingId: String(index + 1), shopName, ...overrides }),
  );
}

/** First-page titles of a search for `cat mug`, written like real ones. */
const catMugs = page(
  byShops(
    ['Funny Cat Mug, Cat Lover Gift, Coffee Mug for Her, Cat Mom Gift, Gift for Her 11oz', 'A'],
    ['Cat Mom Mug - Funny Coffee Mug - Cat Lover Gift for Her - Birthday Gift', 'B'],
    ['Personalized Cat Mug, Custom Cat Portrait Mug, Cat Lover Gifts, Gift for Her', 'C'],
    ['Cat Lady Mug | Funny Cat Mugs | Gifts for Cat Lovers | Christmas Gift', 'D'],
    ["Cute Cat Coffee Mug, Cat Mom Gift, Mother's Day Gift for Mom", 'E'],
    ['Black Cat Mug, Spooky Halloween Mug, Witchy Gift for Her', 'F'],
    ['Cat Mug Personalized, Pet Portrait Mug, Gift for Him or Her', 'G'],
    ['Funny Cat Mug for Women, Cat Lover Gift Idea, Ceramic Coffee Cup 15oz', 'H'],
    ['Cat Mom Mug, Cats Mom, Cat Lover Gift', 'I'],
    ['Disney Cat Mug Marie Aristocats Gift', 'J'],
    ['Disney Cat Mug Cheshire Gift', 'K'],
    ["Best Cat Dad Ever Mug, Father's Day Gift, Gift for Dad", 'L'],
    ['Best Cat Dad Ever Mug, Fathers Day Gift for Him', 'M'],
    ['Cat Mug, Cat Mug, Cat Mug', 'N', { isAd: true }],
  ),
  {
    query: 'cat mug',
    suggestions: ['cat mug personalized', 'cat mug funny', 'cat mug for her', 'cat mom mug'],
  },
);

/** First-page titles of a search for `christmas sweatshirt`. */
const christmasSweatshirts = [
  ['Christmas Sweatshirt, Womens Christmas Sweater, Christmas Gift for Her', 'A'],
  ['Merry Christmas Sweatshirt, Christmas Crewneck, Holiday Sweater, Christmas Gift', 'B'],
  ['Christmas Tree Sweatshirt, Cute Christmas Sweatshirt, Xmas Gift for Her', 'C'],
  ['Funny Christmas Sweatshirt, Ugly Christmas Sweater, Family Christmas Shirts', 'D'],
  ['Vintage Christmas Sweatshirt, Retro Christmas Crewneck, Christmas Gift for Her', 'E'],
  ['Christmas Sweatshirt Women, Merry and Bright Sweatshirt, Holiday Crewneck', 'F'],
  ['Gingerbread Christmas Sweatshirt, Cozy Christmas Crewneck, Christmas Gift', 'G'],
  ['Merry Christmas Sweatshirt Women, Christmas Crewneck Sweatshirt, Holiday Gift', 'I'],
  ['Christmas Sweatshirt, Santa Sweatshirt, Matching Family Christmas Shirts', 'J'],
] as const;

const terms = (report: ReturnType<typeof keywordReport>) => report.terms.map((term) => term.term);

describe('keywordReport', () => {
  it('counts the shops of organic results, apart from ads, and needs two shops', () => {
    const report = keywordReport(
      page(
        byShops(
          ['Tulip Mug, Halloween Coffee Mug', 'MoonShop', { isAd: true }],
          ['Cute Tulip Mug for Her', 'PaperFox'],
          ['Ceramic Tulip Mug, Halloween Coffee Mug', 'ClayBird'],
          ['Tulip Mug Halloween Coffee Mug', 'ClayBird'],
          ['Halloween Coffee Mug Gift', 'ClayBird'],
        ),
      ),
      MARKETS.US,
      LISTING_RULES,
    );

    expect(
      report.terms.map(({ term, listings, shops, ads, share }) => [
        term,
        listings,
        shops,
        ads,
        share,
      ]),
    ).toEqual([['tulip mug', 3, 2, 1, 0.75]]);
    // Every result using `mug` also uses a longer phrase that is kept.
    expect(terms(report)).not.toContain('mug');
    // One shop repeating a phrase in its titles is not the market using it.
    expect(terms(report)).not.toContain('halloween coffee mug');
    expect(report).toMatchObject({ listingCount: 5, organicCount: 4 });
  });

  it('marks a term searched when a suggestion is exactly it, or a phrase that adds to the query', () => {
    const report = keywordReport(
      page(
        byShops(
          ['Halloween Tulip Mug, Ceramic Cup', 'A'],
          ['Halloween Tulip Mug, Ceramic Cup', 'B'],
          ['Tulip Mug', 'C'],
          ['Travel Mug', 'D'],
          ['Mug Set', 'E'],
        ),
        {
          suggestions: ['Tulip Mug', 'tulip mug ceramic', 'halloween tulip mug', 'mug set travel'],
        },
      ),
      MARKETS.US,
      LISTING_RULES,
    );

    expect(report.terms.map(({ term, suggested }) => [term, suggested])).toEqual([
      ['tulip mug', true],
      ['halloween tulip mug', true],
      ['ceramic cup', false],
    ]);
    // A single word inside a suggestion is no sign buyers search it alone.
    expect(
      keywordReport(
        page(byShops(['Funny Mug', 'A'], ['Funny Tea', 'B']), { suggestions: ['tulip mug funny'] }),
        MARKETS.US,
        LISTING_RULES,
      ).terms,
    ).toEqual([expect.objectContaining({ term: 'funny', suggested: false })]);
  });

  it('flags trademarks and drops terms that are a shop’s name', () => {
    const report = keywordReport(
      page(
        byShops(
          ['Disney Tulip Mug, MoonShop Original', 'MoonShop'],
          ['Disney Tulip Mug, MoonShop Style', 'PaperFox'],
        ),
      ),
      MARKETS.US,
      LISTING_RULES,
    );

    expect(report.terms.map(({ term, trademark }) => [term, trademark])).toEqual([
      ['disney tulip mug', true],
    ]);
  });

  it('leaves out sizes and loose pronouns, keeps numbers in phrases and four-word phrases', () => {
    const title = '11oz Tulip Mug Coffee Lover, Gift for Her, Her Name Mug, 330ml';
    const report = keywordReport(
      page(byShops([title, 'A'], [title, 'B'])),
      MARKETS.US,
      LISTING_RULES,
    );

    expect(terms(report)).toEqual(
      expect.arrayContaining(['tulip mug coffee lover', 'gift for her', 'name mug']),
    );
    expect(terms(report).filter((term) => /11oz|330ml|^her /.test(term))).toEqual([]);
    const numbers = keywordReport(
      page(
        byShops(
          ['Class of 2026 Mug, 50 and Fabulous, 2026', 'A'],
          ['Class of 2026 Shirt, 50 and Fabulous Gift, 15 oz', 'B'],
        ),
      ),
      MARKETS.US,
      LISTING_RULES,
    );
    expect(terms(numbers)).toEqual(['50 and fabulous', 'class of 2026']);
  });

  it('counts plural and singular as one phrase, in the form more titles use', () => {
    const english = keywordReport(
      page(byShops(['Tulip Mugs', 'A'], ['Tulip Mugs Set', 'B'], ['Tulip Mug', 'C'])),
      MARKETS.US,
      LISTING_RULES,
    );
    const german = keywordReport(
      page(byShops(['Geister Tassen für sie', 'A'], ['Geister Tasse für Sie, Geschenk', 'B']), {
        query: 'geister tasse',
      }),
      MARKETS.DE,
      LISTING_RULES,
    );

    expect(english.terms[0]).toMatchObject({ term: 'tulip mugs', listings: 3, shops: 3 });
    expect(terms(english)).not.toContain('tulip mug');
    expect(terms(german)).toEqual(['geister tasse']);
  });

  it('keeps gift phrases and reads curly apostrophes as straight ones', () => {
    const report = keywordReport(
      page(byShops(['Teacher’s gift mug', 'A'], ['Teachers gift mug, cute', 'B'], ['Cute', 'C']), {
        query: 'q',
        suggestions: ['teacher’s gift mug ideas'],
      }),
      MARKETS.US,
      LISTING_RULES,
    );

    // Possessives count as one word with or without the apostrophe.
    expect(report.terms[0]).toMatchObject({ term: 'teachers gift mug', shops: 2, suggested: true });
  });

  it('keeps the phrases sellers of cat mugs use, without fragments of longer ones', () => {
    const report = keywordReport(catMugs, MARKETS.US, LISTING_RULES);

    expect(terms(report)).toEqual(
      expect.arrayContaining(['funny cat mug', 'cat mom mug', 'fathers day gift', 'gift for her']),
    );
    // Every result calling a mug `cat mug` says more, e.g. `funny cat mug`; the query stays apart.
    expect(report.queryTerm).toMatchObject({ term: 'cat mug', shops: 8 });
    // `day gift` is only ever the end of `mothers day gift` or `fathers day gift`.
    for (const fragment of ['day gift', 'cat mom', 'cat']) {
      expect(terms(report)).not.toContain(fragment);
    }
    expect(report.terms.find((term) => term.term === 'disney cat mug')?.trademark).toBe(true);
  });

  it.each([
    [
      'christmas mug',
      [
        ['Funny Christmas Gift for Her, Holiday Coffee Mug', 'A'],
        ['Cute Christmas Gift for Her, Snowman Mug', 'B'],
        ['Christmas Gift for Her, Reindeer Mug', 'C'],
        ['Personalized Christmas Gift for Her, Name Mug', 'D'],
      ],
      ['christmas gift for her', 'christmas gift', 'gift for her', 'mug'],
    ],
    [
      'teacher gift',
      [
        ['Teacher Appreciation Gift, Teacher Mug', 'A'],
        ['Teacher Appreciation Gift, Teacher Tote', 'B'],
        ['Teacher Appreciation Gift, Pencil Sign', 'C'],
        ['Teacher Gift, End of Year Gift', 'D'],
        ['End of Year Teacher Gift', 'E'],
      ],
      ['teacher appreciation gift', 'teacher appreciation', 'teacher gift', 'end of year'],
    ],
    [
      'christmas sweatshirt',
      christmasSweatshirts,
      ['christmas sweatshirt', 'christmas gift', 'gift for her', 'christmas crewneck'],
    ],
    [
      'teacher mug',
      [
        ['Teacher Mug, Teacher Gift, Teacher Appreciation Gift, Mug Gift for Her', 'A'],
        ['Personalized Teacher Mug, Teacher Appreciation Gift, End of Year Teacher Gift', 'B'],
        ['Funny Teacher Mug, Teacher Life Mug, Back to School Teacher Gift', 'C'],
        ['Custom Teacher Mug, Teacher Name Mug, Teacher Appreciation Week Gift', 'E'],
        ['Teacher Appreciation Mug, Mug Gift for Her, Teacher Gift Idea', 'G'],
        ['Class of 2026 Teacher Mug, Retirement Teacher Gift', 'H'],
        ['Class of 2026 Mug, Graduation Gift for Teacher', 'I'],
      ],
      ['teacher mug', 'teacher gift', 'teacher appreciation', 'mug gift for her', 'class of 2026'],
    ],
    [
      'mug',
      [
        ['Floral Mug Gift for Her', 'A'],
        ['Ceramic Mug Gift for Her', 'B'],
        ['Mug Gift for Her Christmas', 'C'],
      ],
      // Every result writes `gift for her` inside the four-word tag.
      ['mug gift for her'],
    ],
  ] as const)('keeps the phrases a seller would tag in a search for %j', (query, titles, kept) => {
    const report = keywordReport(
      page(byShops(...titles.map(([title, shop]) => [title, shop] as const)), { query }),
      MARKETS.US,
      LISTING_RULES,
    );

    expect(terms(report)).toEqual(expect.arrayContaining([...kept]));
  });

  it('marks tag-sized pieces of a phrase too long to be a tag, not phrases with support of their own', () => {
    const sweatshirts = keywordReport(
      page(byShops(...christmasSweatshirts), { query: 'christmas sweatshirt' }),
      MARKETS.US,
      LISTING_RULES,
    );
    const partOf = (term: string) =>
      sweatshirts.terms.find((each) => each.term === term)?.partOfLonger;

    expect(partOf('merry christmas')).toBe('merry christmas sweatshirt');
    expect(partOf('sweatshirt women')).toBe('christmas sweatshirt women');
    expect([partOf('christmas gift'), partOf('gift for her')]).toEqual([null, null]);
    // Four words in 20 characters make a tag, and its pieces give way to it.
    const cats = terms(keywordReport(catMugs, MARKETS.US, LISTING_RULES));
    expect(cats).toContain('best cat dad ever');
    expect(cats).not.toContain('cat dad ever');
    expect(cats).not.toContain('best cat dad');
  });

  it('takes a phrase running on into a longer one for its piece only where titles write them as one run', () => {
    const run = 'Watercolor Floral Teacher Mug Gift';
    const partOf = (titles: readonly string[], term: string) =>
      keywordReport(
        page(byShops(...titles.map((title, index) => [title, `shop${String(index)}`] as const))),
        MARKETS.US,
        LISTING_RULES,
      ).terms.find((each) => each.term === term)?.partOfLonger;

    expect(partOf([run, run], 'teacher mug gift')).toBe('watercolor floral teacher mug');
    expect(
      partOf([run, 'Teacher Mug Gift, Watercolor Floral Teacher Mug'], 'teacher mug gift'),
    ).toBeNull();
    // Both name the set, but no title writes `modern wall art set of 3`.
    expect(
      partOf(
        [
          'Modern Wall Art, Boho Art Set of 3',
          'Neutral Art Set of 3 | Modern Wall Art',
          'Kids Art Set of 3',
        ],
        'modern wall art',
      ),
    ).toBeNull();
  });

  it('keeps a phrase a result writes as a whole part of its title, and drops the tail of a longer run', () => {
    const report = keywordReport(
      page(
        byShops(
          ['Dog Mom Shirt, Dog Lover Gift for Her', 'A'],
          ['Dog Mama Tee, Dog Lover Gift for Her', 'B'],
          ['Dog Mom Gift, Gift for Her', 'C'],
        ),
      ),
      MARKETS.US,
      LISTING_RULES,
    );

    expect(terms(report)).toContain('gift for her');
    // Both results write `dog` before it.
    expect(terms(report)).not.toContain('lover gift for her');
  });

  it('keeps hyphens inside words and counts every way of writing t-shirt as one', () => {
    const report = keywordReport(
      page(
        byShops(
          ['Dog Mom T-Shirt, Mid-Century Print', 'A'],
          ['Dog Mom Tshirt, Mid-Century Print', 'B'],
          ['Dog Mom T Shirt', 'C'],
        ),
      ),
      MARKETS.US,
      LISTING_RULES,
    );

    expect(report.terms.find((term) => term.term === 'dog mom t-shirt')?.shops).toBe(3);
    expect(terms(report)).toContain('mid-century print');
  });

  it('counts a word joined by hyphens and its parts as one, in the form more titles use', () => {
    const report = keywordReport(
      page(
        byShops(
          ['Mid-Century Modern Wall Art, Abstract Print', 'A'],
          ['Mid Century Modern Wall Art Print, Retro Poster', 'B'],
          ['Mid-Century Modern Poster, Hand-Drawn Line Art', 'C'],
          ['Mid Century Modern Print, Hand Drawn Line Art', 'D'],
          ['Retro Mid-Century Art Print, Hand Drawn Sketch', 'E'],
        ),
        { query: 'mid century wall art' },
      ),
      MARKETS.US,
      LISTING_RULES,
    );

    expect(report.terms.find((term) => term.term === 'mid-century modern')?.shops).toBe(4);
    expect(terms(report)).toContain('hand drawn line art');
    expect(terms(report)).not.toContain('mid century modern');
    expect(report.queryTerm.term).toBe('mid-century wall art');
  });

  it('shows phrases the ads of two shops share only when there are few results', () => {
    const titles = [
      ['Acrylic Wedding Sign, Custom Sign', 'A', { isAd: true }],
      ['Acrylic Wedding Sign Clear', 'B', { isAd: true }],
      ['Wedding Sign, Wood', 'C'],
      ['Wedding Sign Rustic', 'D'],
    ] as const;
    const few = keywordReport(
      page(byShops(...titles), { query: 'wedding sign' }),
      MARKETS.US,
      LISTING_RULES,
    );
    const many = keywordReport(
      page(
        byShops(
          ...titles,
          ...Array.from(
            { length: 8 },
            (_, index) => [`Wedding Sign ${index}`, `S${index}`] as const,
          ),
        ),
        { query: 'wedding sign' },
      ),
      MARKETS.US,
      LISTING_RULES,
    );

    expect(few.terms.find((term) => term.term === 'acrylic wedding sign')).toMatchObject({
      listings: 0,
      ads: 2,
      share: 0,
      adOnly: true,
    });
    expect(few.terms.find((term) => term.term === 'wedding sign')?.adOnly).toBe(false);
    expect(terms(few)).not.toContain('acrylic');
    expect(terms(many)).not.toContain('acrylic wedding sign');
  });

  it('warns when prices came in another currency than the market’s', () => {
    const listings = byShops(['Tulip Mug', 'A'], ['Tulip Mug', 'B']);
    const inLira = listings.map((listing) => ({ ...listing, currency: 'TRY' }));

    expect(keywordReport(page(listings), MARKETS.US, LISTING_RULES).warnings).toEqual([]);
    expect(
      keywordReport(page(inLira, { warnings: ['pricesUnread'] }), MARKETS.US, LISTING_RULES)
        .warnings,
    ).toEqual(['pricesUnread', 'otherCurrency']);
    expect(keywordReport(page([]), MARKETS.DE, LISTING_RULES).warnings).toEqual([]);
  });

  it('reports the query as one term with its counts and its trademark', () => {
    const possessive = keywordReport(
      page(byShops(["Mother's Day Mug, Gift for Mom", 'A'], ['Mothers Day Mug Gift', 'B']), {
        query: "Mother's Day  Mug",
      }),
      MARKETS.US,
      LISTING_RULES,
    );
    const branded = keywordReport(
      page(byShops(['Swoosh Tee', 'A'], ['Sport Tee', 'B']), { query: 'Nike Shirt' }),
      MARKETS.US,
      LISTING_RULES,
    );

    expect(possessive.queryTerm).toMatchObject({
      term: 'mothers day mug',
      listings: 2,
      shops: 2,
      trademark: false,
    });
    expect(terms(possessive)).not.toContain("mother's day mug");
    expect(branded.queryTerm).toMatchObject({ term: 'nike shirt', shops: 0, trademark: true });
  });

  it('does not take a single word for searched because a German suggestion holds it', () => {
    const report = keywordReport(
      page(
        byShops(
          ['Katzen Tasse personalisiert, Geschenk für Katzenliebhaber', 'A'],
          ['Tasse Katze lustig - Geschenk für Sie - Katzenmama Tasse', 'B'],
          ['Lustige Tasse Katze, Geschenk für Ihn, Geschenk für sie', 'G'],
          ['Katzen Tassen, Geschenke für Katzenliebhaber, lustig', 'F'],
          ['Katzenmama Tasse, Kaffeetasse Katze 330ml', 'E'],
        ),
        {
          query: 'katzen tasse',
          suggestions: ['katzen tasse personalisiert', 'katzen tasse lustig'],
        },
      ),
      MARKETS.DE,
      LISTING_RULES,
    );

    expect(report.terms.find((term) => term.term === 'lustig')).toMatchObject({
      suggested: false,
    });
    expect(terms(report)).toEqual(
      expect.arrayContaining(['katzen tasse', 'geschenk für sie', 'katzenmama tasse']),
    );
  });

  it('summarises prices in the most common currency and the share of badges', () => {
    const listings = byShops(
      ['Tulip Mug', 'A', { price: 18, isAd: true, badges: ['Bestseller'] }],
      ['Cute Tulip Mug', 'B', { price: 22, isTopSeller: true }],
      ['Ceramic Tulip Mug', 'C', { price: 30, freeShipping: true }],
      ['Witch Hat Tote Bag', 'D', { price: 999, currency: 'TRY' }],
    );
    const report = keywordReport(
      page(listings, { suggestionsAvailable: false, warnings: ['pricesUnread'] }),
      MARKETS.US,
      LISTING_RULES,
    );

    expect(report.prices).toEqual({ currency: 'USD', min: 18, median: 22, max: 30 });
    expect(report).toMatchObject({
      listingCount: 4,
      adShare: 0.25,
      topSellerShare: 0.25,
      badgeShare: 0.25,
      freeShippingShare: 0.25,
      suggestionsAvailable: false,
      warnings: ['pricesUnread'],
    });
  });

  it('averages the two middle prices and survives a page without listings', () => {
    const even = keywordReport(
      page(byShops(['a', 'A', { price: 10 }], ['b', 'B', { price: 15 }])),
      MARKETS.US,
      LISTING_RULES,
    );
    const empty = keywordReport(page([]), MARKETS.US, LISTING_RULES);

    expect(even.prices?.median).toBe(12.5);
    expect(empty).toMatchObject({ prices: null, adShare: 0, organicCount: 0, terms: [] });
  });

  it('keeps the strongest terms only', () => {
    const title = Array.from({ length: 60 }, (_, i) => `word${i}x`).join(', ');

    expect(
      keywordReport(page(byShops([title, 'A'], [title, 'B'])), MARKETS.US, LISTING_RULES).terms,
    ).toHaveLength(MAX_TERMS);
  });
});
