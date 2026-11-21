import { describe, expect, it } from 'vitest';
import type { ListingProduct } from '@pod/core';
import { EtsyRequestError } from './errors.js';
import { inventoryOf } from './etsy-inventory.js';

const options = { readinessStateId: '151', decimal: (amount: number) => (amount / 100).toFixed(2) };

const shirt = (sku: string, color: string, size: string, price: number): ListingProduct => ({
  sku,
  price,
  properties: [
    { name: 'Color', value: color },
    { name: 'Size', value: size },
  ],
});

const pricesOf = (body: ReturnType<typeof inventoryOf>) =>
  body.products.map((product) => [
    product.property_values.map((value) => value.values[0]).join('/'),
    product.offerings[0]?.price,
    product.offerings[0]?.is_enabled,
  ]);

describe('inventoryOf', () => {
  it('sets prices on nothing when every variant costs the same', () => {
    const body = inventoryOf(
      [shirt('a', 'Black', 'M', 2499), shirt('b', 'White', 'M', 2499)],
      options,
    );

    expect(body.price_on_property).toEqual([]);
  });

  it('sets prices on size when the size decides the price, and prices switched-off pairs alike', () => {
    const body = inventoryOf(
      [
        shirt('a', 'Black', 'M', 2499),
        shirt('b', 'Black', '2XL', 2699),
        shirt('c', 'White', 'M', 2499),
      ],
      options,
    );

    expect(body.price_on_property).toEqual([514]);
    expect(pricesOf(body)).toEqual([
      ['Black/M', 24.99, true],
      ['Black/2XL', 26.99, true],
      ['White/M', 24.99, true],
      ['White/2XL', 26.99, false],
    ]);
  });

  it('sets prices on colour when the colour decides the price', () => {
    const body = inventoryOf(
      [shirt('a', 'Black', 'M', 2499), shirt('b', 'Gold', 'M', 2999)],
      options,
    );

    expect(body.price_on_property).toEqual([513]);
  });

  it('keeps prices on size when the colours come in different sizes', () => {
    const body = inventoryOf(
      [shirt('a', 'Black', 'M', 2499), shirt('b', 'White', '2XL', 2699)],
      options,
    );

    expect(body.price_on_property).toEqual([514]);
    const priceBySize = new Map<string, number>();
    for (const product of body.products) {
      const size = product.property_values[1]?.values[0] ?? '';
      const price = product.offerings[0]?.price ?? 0;
      expect(priceBySize.get(size) ?? price).toBe(price);
      priceBySize.set(size, price);
    }
  });

  it('sets prices on both when neither alone decides', () => {
    const body = inventoryOf(
      [
        shirt('a', 'Black', 'M', 2499),
        shirt('b', 'Black', 'L', 2599),
        shirt('c', 'White', 'M', 2699),
        shirt('d', 'White', 'L', 2499),
      ],
      options,
    );

    expect(body.price_on_property).toEqual([513, 514]);
  });

  it('sets prices on the one property of single-property listings', () => {
    const mug = (sku: string, size: string, price: number): ListingProduct => ({
      sku,
      price,
      properties: [{ name: 'Size', value: size }],
    });

    const body = inventoryOf([mug('a', '11 oz', 1999), mug('b', '15 oz', 2199)], options);

    expect(body.price_on_property).toEqual([513]);
    expect(body.sku_on_property).toEqual([513]);
  });

  it('refuses more variations than Etsy allows before sending anything', () => {
    const product: ListingProduct = {
      sku: 'a',
      price: 2499,
      properties: [
        { name: 'Color', value: 'Black' },
        { name: 'Size', value: 'M' },
        { name: 'Fit', value: 'Slim' },
      ],
    };

    expect(() => inventoryOf([product], options)).toThrow(
      new EtsyRequestError('Etsy allows 2 variations, not 3'),
    );
  });
});
