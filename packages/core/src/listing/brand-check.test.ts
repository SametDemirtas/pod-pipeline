import { describe, expect, it } from 'vitest';
import { productFamilyId } from '../catalog/product-family.js';
import { OtherBrandNamedError } from '../errors.js';
import { assertOwnBrand } from './brand-check.js';

const text = (description: string) => ({ title: 'Tulip Case', description, tags: ['tulip case'] });

describe('assertOwnBrand', () => {
  it('refuses a Samsung case whose words name the iPhone in any language', () => {
    const samsung = productFamilyId('samsung-case');

    expect(() => {
      assertOwnBrand(samsung, [text('Fits the Galaxy S25.'), text('Passt zum iPhone 16.')]);
    }).toThrow(OtherBrandNamedError);
    expect(() => {
      assertOwnBrand(samsung, [text('Fits the Galaxy S25.')]);
    }).not.toThrow();
  });

  it('refuses an iPhone case that names Samsung, and leaves other products alone', () => {
    expect(() => {
      assertOwnBrand(productFamilyId('phone-case'), [text('Also for Samsung phones.')]);
    }).toThrow(
      expect.objectContaining({ code: 'OTHER_BRAND_NAMED', details: { brands: ['Samsung'] } }),
    );
    expect(() => {
      assertOwnBrand(productFamilyId('mug'), [text('An iPhone and a Samsung on the mug.')]);
    }).not.toThrow();
  });
});
