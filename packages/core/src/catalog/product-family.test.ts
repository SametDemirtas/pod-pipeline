import { describe, expect, it } from 'vitest';
import { DEFAULT_PRODUCT_FAMILIES } from './default-families.js';
import { normalizeLabel } from './text-folding.js';
import { ProductFamilyCatalog, productFamilyId, type ProductFamily } from './product-family.js';

describe('default product families', () => {
  const catalog = new ProductFamilyCatalog(DEFAULT_PRODUCT_FAMILIES);

  it('lists the eleven families in a fixed order', () => {
    expect(catalog.all().map((family) => family.id)).toEqual([
      'phone-case',
      'samsung-case',
      'mug',
      'blanket',
      't-shirt',
      'sweatshirt',
      'hoodie',
      'poster',
      'canvas',
      'tote-bag',
      'sticker',
    ]);
  });

  it.each([
    ['Telefon Kılıfı', 'phone-case'],
    ['Phone Case', 'phone-case'],
    ['phone-case', 'phone-case'],
    ['Handyhülle', 'phone-case'],
    ['iPhone Hülle', 'phone-case'],
    ['Samsung Kılıfı', 'samsung-case'],
    ['Samsung Case', 'samsung-case'],
    ['Samsung-Hülle', 'samsung-case'],
    ['Kupa', 'mug'],
    ['MUG', 'mug'],
    ['Tasse', 'mug'],
    ['Battaniye', 'blanket'],
    ['Throw Blanket', 'blanket'],
    ['Decke', 'blanket'],
    ['T-Shirt', 't-shirt'],
    ['tshirt', 't-shirt'],
    ['Tişört', 't-shirt'],
    ['Sweatshirt', 'sweatshirt'],
    ['Sweat', 'sweatshirt'],
    ['Pullover', 'sweatshirt'],
    ['Hoodie', 'hoodie'],
    ['Kapüşonlu', 'hoodie'],
    ['Kapüşonlu Sweatshirt', 'hoodie'],
    ['Kapuzenpullover', 'hoodie'],
    ['Poster', 'poster'],
    ['Afiş', 'poster'],
    ['Plakat', 'poster'],
    ['Canvas', 'canvas'],
    ['Kanvas Tablo', 'canvas'],
    ['Leinwand', 'canvas'],
    ['Tote Bag', 'tote-bag'],
    ['tote-bag', 'tote-bag'],
    ['Bez Çanta', 'tote-bag'],
    ['Stofftasche', 'tote-bag'],
    ['Sticker', 'sticker'],
    ['Çıkartma', 'sticker'],
    ['Aufkleber', 'sticker'],
  ])('recognises file name %j as %s', (stem, family) => {
    expect(catalog.findByFileName(stem)?.id).toBe(family);
  });

  it('gives every alias to exactly one family', () => {
    const owners = new Map<string, string[]>();
    for (const family of DEFAULT_PRODUCT_FAMILIES) {
      for (const alias of family.fileAliases) {
        const key = normalizeLabel(alias);
        owners.set(key, [...(owners.get(key) ?? []), family.id]);
      }
    }

    expect([...owners].filter(([, families]) => new Set(families).size > 1)).toEqual([]);
  });

  it('does not guess from generic words', () => {
    for (const word of ['Case', 'Throw', 'Shirt', 'Bag', 'Print', 'Cup']) {
      expect(catalog.findByFileName(word)).toBeUndefined();
    }
  });
});

describe('ProductFamilyCatalog', () => {
  const mug: ProductFamily = { id: productFamilyId('mug'), fileAliases: ['cup'] };

  it('looks families up by id', () => {
    const catalog = new ProductFamilyCatalog([mug]);

    expect(catalog.get(productFamilyId('mug'))).toBe(mug);
    expect(catalog.get(productFamilyId('poster'))).toBeUndefined();
  });

  it.each<[string, ProductFamily[], RegExp]>([
    ['a repeated id', [mug, { ...mug, fileAliases: ['tea'] }], /id "mug" is used twice/],
    [
      'a repeated alias',
      [mug, { id: productFamilyId('tumbler'), fileAliases: ['CUP'] }],
      /Alias "cup"/,
    ],
    ['no aliases', [{ ...mug, fileAliases: [] }], /non-empty file aliases/],
    ['a blank alias', [{ ...mug, fileAliases: [' _ '] }], /non-empty file aliases/],
    ['an empty id', [{ ...mug, id: productFamilyId('') }], /lower-case words/],
    ['an upper-case id', [{ ...mug, id: productFamilyId('Mug') }], /lower-case words/],
    ['an id with spaces', [{ ...mug, id: productFamilyId('tote bag') }], /lower-case words/],
    ['a trailing hyphen', [{ ...mug, id: productFamilyId('mug-') }], /lower-case words/],
  ])('rejects %s', (_case, families, message) => {
    expect(() => new ProductFamilyCatalog(families)).toThrow(message);
  });
});

describe('families made from the artwork of another', () => {
  it('make Samsung cases from the phone case artwork', () => {
    const catalog = new ProductFamilyCatalog(DEFAULT_PRODUCT_FAMILIES);

    expect(catalog.usingArtworkOf(productFamilyId('phone-case')).map(({ id }) => id)).toEqual([
      'samsung-case',
    ]);
    expect(catalog.usingArtworkOf(productFamilyId('mug'))).toEqual([]);
  });

  it('refuse artwork of a family the catalog does not know', () => {
    const borrowing: ProductFamily = {
      id: productFamilyId('samsung-case'),
      fileAliases: ['samsung case'],
      artworkOf: productFamilyId('phone-case'),
    };

    expect(() => new ProductFamilyCatalog([borrowing])).toThrow(/unknown phone-case/);
  });
});
