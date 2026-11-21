import { describe, expect, it, vi } from 'vitest';
import { productFamilyId } from '../catalog/product-family.js';
import { ValidationError } from '../errors.js';
import { researchPhrase } from './research-phrase.js';

/** Casing without a locale as on a Turkish system, where `I` lowers to a dotless `ı`. */
function withTurkishDefaultCasing(check: () => void): void {
  const spy = vi.spyOn(String.prototype, 'toLocaleLowerCase').mockImplementation(function (
    this: string,
  ) {
    return this.replace(/I/g, 'ı').toLowerCase();
  });
  try {
    check();
  } finally {
    spy.mockRestore();
  }
}

describe('researchPhrase', () => {
  it('searches the concept and its product the way a buyer types', () => {
    expect(researchPhrase('Meadow  Bees', productFamilyId('mug'))).toBe('meadow bees mug');
    expect(researchPhrase('Lantern Harbor', productFamilyId('phone-case'))).toBe(
      'lantern harbor phone case',
    );
  });

  it('names the product once, and alone for an unnamed concept', () => {
    expect(researchPhrase('Cozy Mug', productFamilyId('mug'))).toBe('cozy mug');
    expect(researchPhrase('Smug Cat', productFamilyId('mug'))).toBe('smug cat mug');
    expect(researchPhrase(null, productFamilyId('blanket'))).toBe('blanket');
  });

  it('lowers a capital I the same on a Turkish system', () => {
    withTurkishDefaultCasing(() => {
      expect(researchPhrase('INDIGO IRIS', productFamilyId('mug'))).toBe('indigo iris mug');
    });
  });

  it('refuses a name too long to search', () => {
    expect(() => researchPhrase('x'.repeat(120), productFamilyId('mug'))).toThrow(ValidationError);
  });
});
