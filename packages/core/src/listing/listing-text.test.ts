import { describe, expect, it } from 'vitest';
import { LISTING_LIMITS, LISTING_RULES } from '@pod/rules';
import { ValidationError } from '../errors.js';
import { normalizeListingText, type ListingText } from './listing-text.js';

const text = (overrides: Partial<ListingText> = {}): ListingText => ({
  title: 'Frost Garden Mug',
  description: 'A cosy mug.',
  tags: ['frost mug'],
  ...overrides,
});

describe('normalizeListingText', () => {
  it('drops a tag repeated in another case, keeping the accented spelling', () => {
    expect(
      normalizeListingText(
        text({ tags: ['istanbul mug', 'gift', 'İstanbul mug', 'Strasse', 'Straße', 'strasse'] }),
        LISTING_RULES,
      ).tags,
    ).toEqual(['İstanbul mug', 'gift', 'Straße']);
  });

  it('tidies spaces and drops empty and repeated tags', () => {
    expect(
      normalizeListingText(
        {
          title: '  Frost   Garden  Mug ',
          description: '\n A cosy mug. \n',
          tags: ['frost  mug', 'Frost Mug', ' ', 'gift for her'],
        },
        LISTING_RULES,
      ),
    ).toEqual({
      title: 'Frost Garden Mug',
      description: 'A cosy mug.',
      tags: ['frost mug', 'gift for her'],
    });
  });

  it('counts characters, not code units', () => {
    expect(
      normalizeListingText(text({ title: 'ğ'.repeat(140), tags: ['ğ'.repeat(20)] }), LISTING_RULES)
        .title,
    ).toHaveLength(140);
  });

  it.each<[string, Partial<ListingText>, RegExp]>([
    ['an empty title', { title: '  ' }, /title: is empty/],
    ['a long title', { title: 'a'.repeat(141) }, /longer than 140/],
    ['a repeated &', { title: 'Mug & Cup & Plate' }, /"&" more than once/],
    ['a dollar sign', { title: 'Mug for $5' }, /may only use letters/],
    ['four words in capitals', { title: 'BEST TULIP MUG EVER' }, /in capitals/],
    ['an empty description', { description: ' ' }, /description: is empty/],
    ['a long description', { description: 'a'.repeat(10_001) }, /longer than 10000/],
    [
      'too many tags',
      { tags: Array.from({ length: LISTING_LIMITS.tags + 1 }, (_, i) => `tag ${i}`) },
      /more than 13/,
    ],
    ['a long tag', { tags: ['a'.repeat(21)] }, /longer than 20/],
    ['a tag with symbols', { tags: ['mug!'] }, /may only use/],
  ])('rejects %s', (_case, overrides, message) => {
    expect(() => normalizeListingText(text(overrides), LISTING_RULES)).toThrow(ValidationError);
    expect(() => normalizeListingText(text(overrides), LISTING_RULES)).toThrow(message);
  });

  it('allows each special title character once', () => {
    expect(
      normalizeListingText(text({ title: '100% Cotton: Tee & Mug + Gift' }), LISTING_RULES).title,
    ).toBe('100% Cotton: Tee & Mug + Gift');
  });
});
