import { apiPath } from '@pod/adapter-http';
import { EtsyAccountWithoutShopError } from './errors.js';
import type { EtsyHttp } from './etsy-client.js';
import { idAt, objectAt } from './json.js';

export interface EtsyAccountShop {
  readonly shopId: string;
  readonly shopName: string;
}

/** The shop of the signed-in account, which every later request names. */
export async function findAccountShop(client: Pick<EtsyHttp, 'get'>): Promise<EtsyAccountShop> {
  const user = objectAt(await client.get('/users/me'), 'user');
  const id = user['shop_id'];
  if (id === null || id === undefined) throw new EtsyAccountWithoutShopError();
  const shopId = idAt(id, 'shop id');
  const shop = objectAt(await client.get(apiPath`/shops/${shopId}`), 'shop');
  const name = shop['shop_name'];
  return { shopId, shopName: typeof name === 'string' ? name : 'Etsy' };
}
