import { describe, expect, it } from 'vitest';
import { newestVariants, variationOptions } from './listing-variants.js';
import { shippingChoice } from './shop-choices.js';

const shop = {
  shippingProfiles: [
    { id: '316', label: 'Free everywhere' },
    { id: '412', label: 'Free US' },
  ],
};
const variant = (id: string, color: string | null, size: string | null) => ({ id, color, size });

describe('shippingChoice', () => {
  it("takes the chosen profile, else the shop's first, and tells when the chosen one left", () => {
    expect(shippingChoice(shop, '412')).toEqual({ profile: shop.shippingProfiles[1], gone: false });
    expect(shippingChoice(shop, undefined)).toEqual({
      profile: shop.shippingProfiles[0],
      gone: false,
    });
    expect(shippingChoice(shop, '999')).toEqual({ profile: undefined, gone: true });
    expect(shippingChoice({ shippingProfiles: [] }, undefined)).toEqual({
      profile: undefined,
      gone: false,
    });
  });
});

describe('listing variants', () => {
  it('count the options of the largest variation', () => {
    expect(
      variationOptions([
        variant('1', 'Glossy', 'S25'),
        variant('2', 'Glossy', 'S26'),
        variant('3', 'Matte', 'S26'),
      ]),
    ).toBe(2);
    expect(variationOptions([variant('1', null, null)])).toBe(0);
  });

  it('keep the newest in their order', () => {
    const variants = [variant('20', null, 'b'), variant('5', null, 'a'), variant('30', null, 'c')];

    expect(newestVariants(variants, 2).map(({ id }) => id)).toEqual(['20', '30']);
  });

  it('take an id that is not a whole number for the oldest', () => {
    const variants = [variant('x1', null, 'a'), variant('9', null, 'b'), variant('10', null, 'c')];

    expect(newestVariants(variants, 2).map(({ id }) => id)).toEqual(['9', '10']);
  });
});
