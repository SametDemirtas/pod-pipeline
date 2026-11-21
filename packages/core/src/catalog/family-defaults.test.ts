import { describe, expect, it } from 'vitest';
import { DEFAULT_PRODUCT_FAMILIES } from './default-families.js';
import { DEFAULT_LISTING_SIZES, DEFAULT_PRODUCT_FACTS } from './family-defaults.js';

describe('family defaults', () => {
  it('has a fact sheet for every product family, so the seller can fill in each', () => {
    expect(Object.keys(DEFAULT_PRODUCT_FACTS).sort()).toEqual(
      DEFAULT_PRODUCT_FAMILIES.map((family) => family.id).sort(),
    );
  });

  it('lists default sizes only for known families', () => {
    const families = DEFAULT_PRODUCT_FAMILIES.map((family) => family.id as string);

    expect(Object.keys(DEFAULT_LISTING_SIZES).every((id) => families.includes(id))).toBe(true);
  });
});
