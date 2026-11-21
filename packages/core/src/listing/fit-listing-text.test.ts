import { describe, expect, it } from 'vitest';
import { LISTING_RULES } from '@pod/rules';
import { fitListingText } from './fit-listing-text.js';
import { normalizeListingText } from './listing-text.js';

describe('fitListingText', () => {
  it('drops characters the marketplace refuses and keeps one of each once-only character', () => {
    expect(
      fitListingText(
        {
          title: 'Tulip Mug $15 & Book & Tea: Cozy: Gift ^_^',
          description: 'Nice.',
          tags: ['tulip mug!', 'bird lover'],
        },
        LISTING_RULES,
      ),
    ).toEqual({
      title: 'Tulip Mug 15 & Book Tea: Cozy Gift _',
      description: 'Nice.',
      tags: ['tulip mug', 'bird lover'],
    });
  });

  it('keeps words apart that a line break or tab separated', () => {
    expect(
      fitListingText({ title: 'Tulip\nMug\tGift', description: 'Nice.', tags: [] }, LISTING_RULES)
        .title,
    ).toBe('Tulip Mug Gift');
  });

  it('cuts a long title at a word and leaves out long and surplus tags', () => {
    const fitted = fitListingText(
      {
        title: `${'word '.repeat(40)}end`,
        description: 'Nice.',
        tags: ['a tag far longer than twenty', ...Array.from({ length: 15 }, (_, i) => `tag ${i}`)],
      },
      LISTING_RULES,
    );

    expect(Array.from(fitted.title).length).toBeLessThanOrEqual(140);
    expect(fitted.title.endsWith('word')).toBe(true);
    expect(fitted.tags).toHaveLength(13);
    expect(fitted.tags[0]).toBe('tag 0');
    expect(() => normalizeListingText(fitted, LISTING_RULES)).not.toThrow();
  });

  it('cuts a word in half only when it has no space to cut at', () => {
    expect(
      fitListingText({ title: 'x'.repeat(150), description: 'd', tags: [] }, LISTING_RULES).title,
    ).toBe('x'.repeat(140));
  });

  it('keeps three words in capitals and leaves out repeated tags before counting', () => {
    const fitted = fitListingText(
      {
        title: 'BEST TULIP MUG EVER MADE',
        description: 'd',
        tags: ['Mug', 'mug', ...Array.from({ length: 13 }, (_, i) => `tag ${i}`)],
      },
      LISTING_RULES,
    );

    expect(fitted.title).toBe('BEST TULIP MUG Ever Made');
    expect(fitted.tags).toHaveLength(13);
    expect(fitted.tags.slice(0, 2)).toEqual(['Mug', 'tag 0']);
  });
});
