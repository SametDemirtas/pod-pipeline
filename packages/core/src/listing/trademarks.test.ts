import { describe, expect, it } from 'vitest';
import { findListingTrademarks, findTrademarks } from './trademarks.js';

describe('findTrademarks', () => {
  it('finds whole names in any case, spacing, punctuation, accents or plural', () => {
    expect(findTrademarks('bella+canvas tee')).toEqual(['Bella Canvas']);
    expect(findTrademarks('POKÉMON trainer')).toEqual(['Pokemon']);
    expect(findTrademarks('nfl fans, spider-man and Avengers')).toEqual([
      'Avenger',
      'Spider Man',
      'NFL',
    ]);
    expect(findTrademarks('Swifties gift')).toEqual(['Swiftie']);
  });

  it('finds names written together or apart', () => {
    for (const text of ['Spiderman', 'Spider Man', 'spider-man']) {
      expect(findTrademarks(text)).toEqual(['Spider Man']);
    }
    expect(findTrademarks('spongebob mug')).toEqual(['Sponge Bob']);
    expect(findTrademarks('sponge bob mug')).toEqual(['Sponge Bob']);
    expect(findTrademarks('a care bear gift')).toEqual(['Care Bear']);
  });

  it('leaves ordinary words and words that only contain a name alone', () => {
    expect(findTrademarks('marvel at the stars, olympic swimmer, world cup of tea')).toEqual([]);
    expect(findTrademarks('snfl legoland marvellous')).toEqual([]);
  });
});

describe('findListingTrademarks', () => {
  it('searches the title and tags once each, but not the description', () => {
    expect(
      findListingTrademarks({ title: 'Zelda Mug', tags: ['zelda gift', 'labubu fan'] }),
    ).toEqual(['Zelda', 'Labubu']);
  });
});
