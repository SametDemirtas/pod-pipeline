import { describe, expect, it } from 'vitest';
import { SAMPLE_MUG, SAMPLE_SHIRT } from '../testing/index.js';
import type { PrintVariant } from '../print/print-product.js';
import { listingProducts } from './listing-products.js';

const shirts = SAMPLE_SHIRT.variants;
const variant = (id: string, color: string | null, size: string | null): PrintVariant => ({
  id,
  name: `Variant ${id}`,
  color,
  size,
  areas: [],
});

describe('listingProducts', () => {
  it('lets buyers pick colour and size when both differ', () => {
    expect(listingProducts(shirts, 2499)).toEqual([
      {
        sku: 'PF-4000',
        price: 2499,
        properties: [
          { name: 'Color', value: 'Black' },
          { name: 'Size', value: 'M' },
        ],
      },
      {
        sku: 'PF-4001',
        price: 2499,
        properties: [
          { name: 'Color', value: 'Black' },
          { name: 'Size', value: 'L' },
        ],
      },
      {
        sku: 'PF-4010',
        price: 2499,
        properties: [
          { name: 'Color', value: 'White' },
          { name: 'Size', value: 'M' },
        ],
      },
      {
        sku: 'PF-4011',
        price: 2499,
        properties: [
          { name: 'Color', value: 'White' },
          { name: 'Size', value: 'L' },
        ],
      },
    ]);
  });

  it('prices sizes the seller priced on their own', () => {
    expect(listingProducts(shirts, 2499, { L: 2699 }).map((product) => product.price)).toEqual([
      2499, 2699, 2499, 2699,
    ]);
  });

  it('asks only for what differs', () => {
    expect(listingProducts(SAMPLE_MUG.variants, 1999).map((product) => product.properties)).toEqual(
      [[{ name: 'Size', value: '11 oz' }], [{ name: 'Size', value: '15 oz' }]],
    );
    expect(listingProducts(shirts.slice(0, 1), 1999)[0]?.properties).toEqual([]);
  });

  it('rejects variants buyers could not tell apart or pick', () => {
    expect(() =>
      listingProducts(
        [variant('1', 'Black', 'M'), variant('2', 'Black', 'M'), variant('3', 'Red', 'M')],
        100,
      ),
    ).toThrow(/looks the same/);
    expect(() =>
      listingProducts([variant('1', 'Black', 'M'), variant('2', null, 'L')], 100),
    ).toThrow(/no colour or size/);
  });
});
