import { describe, expect, it } from 'vitest';
import type { PrintVariantDto } from '@pod/contracts/client';
import { shopOptionsDto } from '../../testing/fake-api.js';
import { draftProblems } from './draft-validation.js';
import { initialDraft } from './initial-draft.js';
import { hasOwnWords, textKeyOf } from './listing-draft.js';

const models = (count: number): PrintVariantDto[] =>
  Array.from({ length: count }, (_, index) => ({
    id: String(17_000 + index),
    name: `Case ${String(index)}`,
    color: 'Glossy',
    size: `Model ${String(index)}`,
    areas: [{ placement: 'default', width: 1000, height: 2000, dpi: 300 }],
  }));

describe('listing draft variants', () => {
  it('offer at most the options Etsy takes for one variation, the newest', () => {
    const variants = models(75);
    const draft = initialDraft({
      title: 'Tulip Case',
      revision: 1,
      variants,
      variantId: '17000',
      printArea: 'default',
      mockups: [],
      shop: shopOptionsDto(),
      shippingProfileId: undefined,
      sizes: undefined,
    });

    expect(draft.variantIds).toHaveLength(70);
    expect(draft.variantIds).not.toContain('17004');
    expect(draft.variantIds).toContain('17074');
  });

  it('name the variants as a problem when one variation has too many options', () => {
    const variants = models(71);
    const draft = {
      ...initialDraft({
        title: 'Tulip Case',
        revision: 1,
        variants,
        variantId: '17000',
        printArea: 'default',
        mockups: [],
        shop: shopOptionsDto(),
        shippingProfileId: undefined,
        sizes: undefined,
      }),
      variantIds: variants.map((variant) => variant.id),
    };

    expect(draftProblems(draft, shopOptionsDto(), { description: 10_000, variants })).toContain(
      'variants',
    );
    expect(
      draftProblems({ ...draft, variantIds: draft.variantIds.slice(1) }, shopOptionsDto(), {
        description: 10_000,
        variants,
      }),
    ).not.toContain('variants');
  });

  it('offer the sizes the settings list for the product', () => {
    const draft = initialDraft({
      title: 'Tulip Blanket',
      revision: 1,
      variants: [
        { ...models(1)[0], id: '13222', color: null, size: '60″×80″' },
        { ...models(1)[0], id: '10986', color: null, size: '50″×60″' },
      ] as PrintVariantDto[],
      variantId: '13222',
      printArea: 'default',
      mockups: [],
      shop: shopOptionsDto(),
      shippingProfileId: undefined,
      sizes: ['50″×60″'],
    });

    expect(draft.variantIds).toEqual(['10986']);
  });

  it('offer only the variants that print on the checked area', () => {
    const [front, both] = models(2) as [PrintVariantDto, PrintVariantDto];
    const draft = initialDraft({
      title: 'Tulip Case',
      revision: 1,
      variants: [
        { ...front, areas: [{ placement: 'front', width: 1000, height: 1000, dpi: 300 }] },
        both,
      ],
      variantId: both.id,
      printArea: 'default',
      mockups: [],
      shop: shopOptionsDto(),
      shippingProfileId: undefined,
      sizes: undefined,
    });

    expect(draft.variantIds).toEqual([both.id]);
  });
});

describe('listing draft text', () => {
  const sources = {
    title: 'Tulip Mug',
    revision: 2,
    variants: models(1),
    variantId: '17000',
    printArea: 'default',
    mockups: [],
    shop: shopOptionsDto({ languages: ['en-US', 'de', 'fr'] }),
    shippingProfileId: undefined,
    sizes: undefined,
  };
  const prepared = {
    language: 'en-US',
    title: 'Lantern Harbor Mug',
    description: 'A cosy mug.',
    tags: ['tulip mug', 'bird lover'],
    translations: [
      { language: 'de', title: 'Geistertasse', description: 'Eine Tasse.', tags: ['geist'] },
      { language: 'nl', title: 'Spookmok', description: 'Een mok.', tags: [] },
    ],
  };

  it('starts with the text a batch job wrote, its translations current', () => {
    const draft = initialDraft({ ...sources, prepared });

    expect(draft).toMatchObject({
      title: 'Lantern Harbor Mug',
      description: 'A cosy mug.',
      tags: 'tulip mug, bird lover',
      languages: ['de'],
      translations: [
        {
          language: 'de',
          title: 'Geistertasse',
          description: 'Eine Tasse.',
          tags: ['geist'],
          // Not checked by the batch, so the form checks them rather than calling them clean.
          humanizer: null,
        },
      ],
    });
    expect(draft.translatedFrom).toBe(textKeyOf(draft));
  });

  it('starts with the title alone without batch text, or text in another main language', () => {
    for (const draft of [
      initialDraft({ ...sources, prepared: null }),
      initialDraft({ ...sources, prepared: { ...prepared, language: 'de' } }),
    ]) {
      expect(draft).toMatchObject({
        title: 'Tulip Mug',
        description: '',
        tags: '',
        languages: [],
        translations: [],
        translatedFrom: '',
      });
    }
  });
});

describe('listing draft prices', () => {
  const sources = {
    title: 'Tulip Blanket',
    revision: 1,
    variants: models(1),
    variantId: '17000',
    printArea: 'default',
    mockups: [],
    shop: shopOptionsDto(),
    shippingProfileId: undefined,
    sizes: undefined,
  };

  it('start with the prices the settings give the product, as the seller types them', () => {
    const draft = initialDraft({
      ...sources,
      prices: {
        listing: { amount: 4999, currency: 'USD' },
        sizes: { '60″×80″': { amount: 5999, currency: 'USD' } },
        locale: 'en',
      },
    });

    expect(draft.price).toBe('49.99');
    expect(draft.sizePrices).toEqual({ '60″×80″': '59.99' });
  });

  it('start empty for prices set in another currency than the shop’s, or none', () => {
    const other = initialDraft({
      ...sources,
      prices: {
        listing: { amount: 4999, currency: 'EUR' },
        sizes: { '60″×80″': { amount: 5999, currency: 'EUR' } },
        locale: 'en',
      },
    });
    const none = initialDraft({
      ...sources,
      prices: { listing: undefined, sizes: undefined, locale: 'en' },
    });

    for (const draft of [other, none, initialDraft(sources)]) {
      expect(draft.price).toBe('');
      expect(draft.sizePrices).toEqual({});
    }
  });

  it('start with the price of the first size it sells for a product priced by size alone', () => {
    const blankets = [
      { ...models(1)[0], id: '13222', color: null, size: '60″×80″' },
      { ...models(1)[0], id: '10986', color: null, size: '50″×60″' },
    ] as PrintVariantDto[];
    const draft = initialDraft({
      ...sources,
      variants: blankets,
      variantId: '10986',
      sizes: ['50″×60″'],
      prices: {
        listing: undefined,
        sizes: {
          '60″×80″': { amount: 5999, currency: 'USD' },
          '50″×60″': { amount: 3999, currency: 'USD' },
        },
        locale: 'en',
      },
    });

    expect(draft.price).toBe('39.99');
    expect(draft.sizePrices).toEqual({ '60″×80″': '59.99', '50″×60″': '39.99' });
  });

  it('write the prices with the decimal comma of the interface’s language', () => {
    const draft = initialDraft({
      ...sources,
      prices: { listing: { amount: 4999, currency: 'USD' }, sizes: undefined, locale: 'de' },
    });

    expect(draft.price).toBe('49,99');
  });
});

describe('hasOwnWords', () => {
  const written = {
    title: 'Written',
    description: 'Text',
    tags: ['a', 'b'],
    humanizer: { fixed: 0, left: [] },
  };

  it('counts an edited title, a description or tags as the seller’s own', () => {
    const empty = { title: 'Start', description: '', tags: '' };

    expect(hasOwnWords(empty, 'Start', null)).toBe(false);
    expect(hasOwnWords({ ...empty, title: 'Mine' }, 'Start', null)).toBe(true);
    expect(hasOwnWords({ ...empty, tags: 'cat' }, 'Start', null)).toBe(true);
  });

  it('takes the text last written as nobody’s own until it is changed', () => {
    const same = { title: 'Written', description: 'Text', tags: 'a, b' };

    expect(hasOwnWords(same, 'Start', written)).toBe(false);
    expect(hasOwnWords({ ...same, tags: 'a,b, ' }, 'Start', written)).toBe(false);
    expect(hasOwnWords({ ...same, description: 'Text!' }, 'Start', written)).toBe(true);
  });
});
