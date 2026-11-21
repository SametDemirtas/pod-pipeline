import { describe, expect, it } from 'vitest';
import { formatTags, mergeTerms, parseTags } from './tags.js';

describe('parseTags', () => {
  it('reads tags separated by commas or lines and drops blanks', () => {
    expect(parseTags(' cat mug,\n tea gift ,, \ncozy')).toEqual(['cat mug', 'tea gift', 'cozy']);
  });

  it('reads back what formatTags wrote', () => {
    expect(parseTags(formatTags(['cat mug', 'tea']))).toEqual(['cat mug', 'tea']);
  });
});

describe('mergeTerms', () => {
  it('adds new words, ignoring case, up to the limit', () => {
    expect(mergeTerms(['Cat Mug'], ['cat mug', 'tea', 'cozy'], 2)).toEqual(['Cat Mug', 'tea']);
    expect(mergeTerms(['a', 'b', 'c'], ['d'], 2)).toEqual(['a', 'b', 'c']);
    expect(mergeTerms(['INK'], ['ink'], 5)).toEqual(['INK']);
  });
});
