import { describe, expect, it } from 'vitest';
import { EtsyListings } from './etsy-listings.js';
import { clientWith } from './testing/fake-fetch.js';
import { path, USD_SHOP } from './testing/listings.js';

describe('EtsyListings variations', () => {
  it('writes colour and size variations with one SKU each', async () => {
    const { client, calls } = clientWith(USD_SHOP, {
      body: {
        products: [
          { product_id: 800000001, sku: 'PF-4000' },
          { product_id: 800000002, sku: 'PF-4011' },
        ],
      },
    });

    const created = await new EtsyListings(client).setProducts(
      '9',
      [
        {
          sku: 'PF-4000',
          price: 2499,
          properties: [
            { name: 'Color', value: 'Black' },
            { name: 'Size', value: 'M' },
          ],
        },
        {
          sku: 'PF-4011',
          price: 2499,
          properties: [
            { name: 'Color', value: 'White' },
            { name: 'Size', value: 'M' },
          ],
        },
      ],
      { readinessStateId: '151', currency: 'USD' },
    );

    expect(created).toEqual([
      { sku: 'PF-4000', productId: '800000001' },
      { sku: 'PF-4011', productId: '800000002' },
    ]);
    expect(path(calls()[1])).toBe('/listings/9/inventory');
    expect(calls()[1]).toMatchObject({ method: 'PUT' });
    expect(calls()[1]?.body).toEqual({
      products: [
        {
          sku: 'PF-4000',
          property_values: [
            { property_id: 513, property_name: 'Color', values: ['Black'] },
            { property_id: 514, property_name: 'Size', values: ['M'] },
          ],
          offerings: [{ price: 24.99, quantity: 999, is_enabled: true, readiness_state_id: 151 }],
        },
        {
          sku: 'PF-4011',
          property_values: [
            { property_id: 513, property_name: 'Color', values: ['White'] },
            { property_id: 514, property_name: 'Size', values: ['M'] },
          ],
          offerings: [{ price: 24.99, quantity: 999, is_enabled: true, readiness_state_id: 151 }],
        },
      ],
      price_on_property: [],
      quantity_on_property: [],
      sku_on_property: [513, 514],
      readiness_state_on_property: [],
    });
  });

  it('switches off colour and size pairings that are not offered', async () => {
    const { client, calls } = clientWith(USD_SHOP, {
      body: {
        products: [
          { product_id: 1, sku: 'PF-1' },
          { product_id: 2, sku: 'PF-2' },
          { product_id: 3, sku: '' },
          { product_id: 4, sku: '' },
        ],
      },
    });
    const shirt = (sku: string, color: string, size: string) => ({
      sku,
      price: 2499,
      properties: [
        { name: 'Color', value: color },
        { name: 'Size', value: size },
      ],
    });

    const created = await new EtsyListings(client).setProducts(
      '9',
      [shirt('PF-1', 'White', 'S'), shirt('PF-2', 'Black', 'M')],
      { readinessStateId: '151', currency: 'USD' },
    );

    const sent = (
      calls()[1]?.body as {
        products: {
          sku: string;
          offerings: { is_enabled: boolean }[];
          property_values: { values: string[] }[];
        }[];
      }
    ).products;
    expect(
      sent.map((product) => [
        product.sku,
        product.property_values.map((v) => v.values[0]),
        product.offerings[0]?.is_enabled,
      ]),
    ).toEqual([
      ['PF-1', ['White', 'S'], true],
      ['PF-2', ['Black', 'M'], true],
      ['', ['White', 'M'], false],
      ['', ['Black', 'S'], false],
    ]);
    expect(created.map((product) => product.sku)).toEqual(['PF-1', 'PF-2']);
  });

  it('writes a single product without variations', async () => {
    const { client, calls } = clientWith(USD_SHOP, {
      body: { products: [{ product_id: 1, sku: 'PF-1' }] },
    });

    await new EtsyListings(client).setProducts(
      '9',
      [{ sku: 'PF-1', price: 1999, properties: [] }],
      { readinessStateId: '151', currency: 'USD' },
    );

    expect(calls()[1]?.body).toMatchObject({ sku_on_property: [] });
  });
});
