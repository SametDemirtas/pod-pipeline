import { describe, expect, it, vi } from 'vitest';
import { productFamilyId } from '@pod/core';
import type { EtsyHttp } from './etsy-client.js';
import { EtsyListings } from './etsy-listings.js';
import {
  EtsyApiError,
  EtsyCurrencyChangedError,
  EtsyDraftUnconfirmedError,
  EtsyRequestError,
  EtsySignInError,
} from './errors.js';
import { ETSY_FAILURES } from './classify-error.js';
import { clientWith } from './testing/fake-fetch.js';
import { draft, path, USD_SHOP } from './testing/listings.js';

describe('EtsyListings drafts', () => {
  it('creates a made-to-order draft in the family category', async () => {
    const { client, calls } = clientWith(
      { body: { currency_code: 'USD' } },
      { body: { listing_id: 1234567890 } },
    );

    expect(await new EtsyListings(client).createDraft(draft())).toBe('1234567890');
    expect(path(calls()[1])).toBe('/shops/10001001/listings');
    expect(calls()[1]?.body).toEqual({
      quantity: '999',
      title: 'Tulip Tee',
      description: 'Spooky.',
      price: '24.99',
      who_made: 'i_did',
      when_made: 'made_to_order',
      is_supply: 'false',
      type: 'physical',
      taxonomy_id: '482',
      shipping_profile_id: '316',
      readiness_state_id: '151',
      return_policy_id: '1518',
      tags: 'tulip shirt,halloween',
      production_partner_ids: '77,78',
    });
  });

  it('warns that a draft may exist when the answer to creating it broke off', async () => {
    const post = vi.fn<EtsyHttp['post']>();
    const client = {
      shopId: () => Promise.resolve('10001001'),
      get: () => Promise.resolve({ currency_code: 'USD' }),
      post,
      put: vi.fn<EtsyHttp['put']>(),
      patch: vi.fn<EtsyHttp['patch']>(),
      delete: vi.fn<EtsyHttp['delete']>(),
    };
    const listings = new EtsyListings(client);

    post.mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'));
    await expect(listings.createDraft(draft())).rejects.toBeInstanceOf(EtsyDraftUnconfirmedError);
    expect(new EtsyDraftUnconfirmedError().code).toBe('DRAFT_UNCONFIRMED');
    expect(post).toHaveBeenCalledWith('/shops/10001001/listings', expect.anything(), 120_000);

    const refused = new EtsyApiError(400, 'Invalid taxonomy');
    post.mockRejectedValueOnce(refused);
    await expect(listings.createDraft(draft())).rejects.toBe(refused);
  });

  it.each([
    ['an answer without an id', { body: { state: 'draft' } }],
    ['an answer that is not JSON', { body: 'Created' }],
  ])('warns that a draft may exist after %s', async (_case, reply) => {
    const { client } = clientWith(USD_SHOP, reply);

    await expect(new EtsyListings(client).createDraft(draft())).rejects.toBeInstanceOf(
      EtsyDraftUnconfirmedError,
    );
  });

  it('reads the shop currency once in ten minutes and refuses prices entered in another', async () => {
    let time = Date.parse('2026-10-24T10:00:00.000Z');
    const { client, calls } = clientWith(
      USD_SHOP,
      { body: { listing_id: 1 } },
      { body: { listing_id: 2 } },
      { body: { currency_code: 'JPY' } },
    );
    const listings = new EtsyListings(client, { clock: { now: () => new Date(time) } });

    expect(await listings.createDraft(draft())).toBe('1');
    expect(await listings.createDraft(draft())).toBe('2');
    time += 10 * 60_000;
    await expect(listings.createDraft(draft())).rejects.toThrow(
      new EtsyCurrencyChangedError('JPY', 'USD'),
    );
    expect(calls().map(path)).toEqual([
      '/shops/10001001',
      '/shops/10001001/listings',
      '/shops/10001001/listings',
      '/shops/10001001',
    ]);
  });

  it('refuses variations priced in a currency the shop no longer uses', async () => {
    const { client, calls } = clientWith({ body: { currency_code: 'EUR' } });

    await expect(
      new EtsyListings(client).setProducts('9', [{ sku: 'PF-1', price: 1999, properties: [] }], {
        readinessStateId: '151',
        currency: 'USD',
      }),
    ).rejects.toMatchObject({ name: 'EtsyCurrencyChangedError', current: 'EUR' });
    expect(calls()).toHaveLength(1);
  });

  it('leaves out empty optional settings', async () => {
    const { client, calls } = clientWith(
      { body: { currency_code: 'USD' } },
      { body: { listing_id: 1 } },
    );

    await new EtsyListings(client).createDraft(
      draft({
        returnPolicyId: undefined,
        productionPartnerIds: [],
        text: { title: 'T', description: 'D', tags: [] },
      }),
    );

    expect(Object.keys(calls()[1]?.body as object)).not.toEqual(
      expect.arrayContaining(['return_policy_id', 'tags', 'production_partner_ids']),
    );
  });

  it('refuses a family without an Etsy category', async () => {
    const { client } = clientWith();

    await expect(
      new EtsyListings(client).createDraft(draft({ familyId: productFamilyId('lamp') })),
    ).rejects.toThrow(new EtsyRequestError('No Etsy category for lamp'));
  });

  it('prices currencies without cents in whole units', async () => {
    const { client, calls } = clientWith(
      { body: { currency_code: 'JPY' } },
      { body: { listing_id: 1 } },
    );

    await new EtsyListings(client).createDraft(draft({ price: 3000, currency: 'JPY' }));

    expect(calls()[1]?.body).toMatchObject({ price: '3000' });
  });

  it('prices currencies with three decimals in thousandths', async () => {
    const { client, calls } = clientWith(
      { body: { currency_code: 'KWD' } },
      { body: { listing_id: 1 } },
    );

    await new EtsyListings(client).createDraft(draft({ price: 7250, currency: 'KWD' }));

    expect(calls()[1]?.body).toMatchObject({ price: '7.250' });
  });

  it('warns that a draft may exist when Etsy answers with a gateway timeout', async () => {
    const { client } = clientWith(USD_SHOP, { status: 504, body: { error: 'Gateway timeout' } });

    await expect(new EtsyListings(client).createDraft(draft())).rejects.toBeInstanceOf(
      EtsyDraftUnconfirmedError,
    );
  });

  it.each([
    ['a fault on its side', { status: 502, body: 'Bad gateway' }, 'failed'],
    ['a refused sign-in', { status: 400, body: { error: 'invalid_grant' } }, 'not-connected'],
  ] as const)(
    'reports a renewed sign-in that ends in %s as a plain failure, as no draft was sent',
    async (_case, tokenReply, kind) => {
      const { client, fake } = clientWith(
        USD_SHOP,
        { status: 401, body: { error: 'invalid_token' } },
        tokenReply,
      );

      const error = await new EtsyListings(client).createDraft(draft()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(EtsySignInError);
      expect(ETSY_FAILURES.classify(error)).toMatchObject({ kind });
      expect(fake.requests.filter((request) => request.url.endsWith('/listings'))).toHaveLength(1);
    },
  );
});
