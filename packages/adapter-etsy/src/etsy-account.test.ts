import { describe, expect, it } from 'vitest';
import { findAccountShop } from './etsy-account.js';
import { EtsyAccountWithoutShopError, UnexpectedEtsyResponseError } from './errors.js';
import { clientWith } from './testing/fake-fetch.js';

describe('findAccountShop', () => {
  it("finds the account's shop and its name", async () => {
    const { client, calls } = clientWith(
      { body: { user_id: 1, shop_id: 10001001 } },
      { body: { shop_id: 10001001, shop_name: 'ExampleShop' } },
    );

    expect(await findAccountShop(client)).toEqual({ shopId: '10001001', shopName: 'ExampleShop' });
    expect(calls().map((request) => request.url.split('/v3/application')[1])).toEqual([
      '/users/me',
      '/shops/10001001',
    ]);
  });

  it('takes a shop id Etsy sends as text', async () => {
    const { client } = clientWith(
      { body: { user_id: 1, shop_id: '10001001' } },
      { body: { shop_id: 10001001, shop_name: 'ExampleShop' } },
    );

    expect(await findAccountShop(client)).toMatchObject({ shopId: '10001001' });
  });

  it('refuses an account without a shop and an answer that is no object', async () => {
    await expect(findAccountShop(clientWith({ body: { user_id: 1 } }).client)).rejects.toThrow(
      EtsyAccountWithoutShopError,
    );
    await expect(
      findAccountShop(clientWith({ body: { user_id: 1, shop_id: null } }).client),
    ).rejects.toThrow(EtsyAccountWithoutShopError);
    await expect(
      findAccountShop(clientWith({ body: { user_id: 1, shop_id: 'shop' } }).client),
    ).rejects.toThrow(UnexpectedEtsyResponseError);
    await expect(findAccountShop(clientWith({ body: [] }).client)).rejects.toThrow(
      UnexpectedEtsyResponseError,
    );
  });
});
