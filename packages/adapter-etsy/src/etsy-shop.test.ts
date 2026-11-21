import { describe, expect, it } from 'vitest';
import { EtsyShop } from './etsy-shop.js';
import { clientWith } from './testing/fake-fetch.js';

describe('EtsyShop', () => {
  it('reads the shop and the settings a listing refers to', async () => {
    const { client, calls } = clientWith(
      {
        body: { shop_name: 'ExampleShop', currency_code: 'USD', languages: ['en-US', 'de'] },
      },
      { body: { count: 1, results: [{ shipping_profile_id: 900000001, title: 'Printful' }] } },
      {
        body: {
          results: [
            {
              readiness_state_id: 900000002,
              readiness_state: 'made_to_order',
              processing_days_display_label: '2-6 days',
            },
            { readiness_state_id: 2, readiness_state: 'ready_to_ship' },
          ],
        },
      },
      {
        body: {
          results: [
            { return_policy_id: 900000003, accepts_returns: true, return_deadline: 14 },
            { return_policy_id: 3, accepts_returns: false },
          ],
        },
      },
      { body: { results: [{ production_partner_id: '77', partner_name: 'Printful' }] } },
    );

    expect(await new EtsyShop(client).options()).toEqual({
      shopName: 'ExampleShop',
      currency: 'USD',
      currencyDigits: 2,
      shippingProfiles: [{ id: '900000001', label: 'Printful' }],
      readinessStates: [
        { id: '900000002', label: 'made to order, 2-6 days' },
        { id: '2', label: 'ready to ship' },
      ],
      returnPolicies: [
        { id: '900000003', label: 'Returns within 14 days' },
        { id: '3', label: 'No returns' },
      ],
      productionPartners: [{ id: '77', label: 'Printful' }],
      languages: ['en-US', 'de'],
    });
    expect(calls().map((request) => request.url.split('/v3/application')[1])).toEqual([
      '/shops/10001001',
      '/shops/10001001/shipping-profiles',
      '/shops/10001001/readiness-state-definitions?limit=100&offset=0',
      '/shops/10001001/policies/return',
      '/shops/10001001/production-partners',
    ]);
  });

  it('reads every page of readiness states', async () => {
    const states = (from: number, count: number) =>
      Array.from({ length: count }, (_, index) => ({
        readiness_state_id: from + index,
        readiness_state: 'made_to_order',
      }));
    const empty = { body: { results: [] } };
    const { client, calls } = clientWith(
      { body: { shop_name: 'S', currency_code: 'USD' } },
      empty,
      { body: { count: 130, results: states(1, 100) } },
      empty,
      empty,
      { body: { count: 130, results: states(101, 30) } },
    );

    const { readinessStates } = await new EtsyShop(client).options();

    expect(readinessStates.map((state) => state.id)).toEqual(
      Array.from({ length: 130 }, (_, index) => String(index + 1)),
    );
    expect(calls().at(-1)?.url).toMatch(/readiness-state-definitions\?limit=100&offset=100$/);
  });

  it('gives the decimal places of the shop currency', async () => {
    const empty = { body: { results: [] } };
    const { client } = clientWith(
      { body: { shop_name: 'S', currency_code: 'JPY' } },
      empty,
      empty,
      empty,
      empty,
    );

    expect(await new EtsyShop(client).options()).toMatchObject({
      currency: 'JPY',
      currencyDigits: 0,
    });
  });

  it('rejects ids that are not numbers', async () => {
    const { client } = clientWith(
      { body: { shop_name: 'S', currency_code: 'USD' } },
      { body: { results: [{ shipping_profile_id: 'abc', title: 'x' }] } },
      { body: { results: [] } },
      { body: { results: [] } },
      { body: { results: [] } },
    );

    await expect(new EtsyShop(client).options()).rejects.toThrow(
      /shipping profile id is not an id/,
    );
  });
});
