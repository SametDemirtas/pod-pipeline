import { apiPath } from '@pod/adapter-http';
import type { MarketplaceShop, ShopOption, ShopOptions } from '@pod/core';
import { currencyOf, minorDigits } from './currency.js';
import type { EtsyHttp } from './etsy-client.js';
import { idAt, objectAt, resultsOf, stringAt, type JsonObject } from './json.js';

/** The most entries Etsy hands out in one page. */
const PAGE_SIZE = 100;

/** Every entry of a collection Etsy hands out in pages. */
async function allResults(
  client: Pick<EtsyHttp, 'get'>,
  path: string,
  what: string,
): Promise<JsonObject[]> {
  const results: JsonObject[] = [];
  for (;;) {
    const page = await client.get(`${path}?limit=${PAGE_SIZE}&offset=${results.length}`);
    const entries = resultsOf(page, what);
    results.push(...entries);
    const count = objectAt(page, what)['count'];
    if (entries.length < PAGE_SIZE || (typeof count === 'number' && results.length >= count)) {
      return results;
    }
  }
}

/** Reads the shop settings a new listing refers to. */
export class EtsyShop implements MarketplaceShop {
  constructor(private readonly client: Pick<EtsyHttp, 'get' | 'shopId'>) {}

  async options(): Promise<ShopOptions> {
    const shop = apiPath`/shops/${await this.client.shopId()}`;
    const [details, shipping, readiness, returns, partners] = await Promise.all([
      this.client.get(shop),
      this.client.get(`${shop}/shipping-profiles`),
      allResults(this.client, `${shop}/readiness-state-definitions`, 'readiness state'),
      this.client.get(`${shop}/policies/return`),
      this.client.get(`${shop}/production-partners`),
    ]);
    const info = objectAt(details, 'shop');
    const currency = currencyOf(info);
    return {
      shopName: stringAt(info['shop_name'], 'shop name'),
      currency,
      currencyDigits: minorDigits(currency),
      shippingProfiles: resultsOf(shipping, 'shipping profile').map((profile) => ({
        id: idAt(profile['shipping_profile_id'], 'shipping profile id'),
        label: stringAt(profile['title'], 'shipping profile title'),
      })),
      readinessStates: readiness.map(readinessOption),
      returnPolicies: resultsOf(returns, 'return policy').map(returnOption),
      productionPartners: resultsOf(partners, 'production partner').map((partner) => ({
        id: idAt(partner['production_partner_id'], 'production partner id'),
        label: stringAt(partner['partner_name'], 'production partner name'),
      })),
      languages: languagesOf(info),
    };
  }
}

function readinessOption(state: JsonObject): ShopOption {
  const kind = stringAt(state['readiness_state'], 'readiness state').replace(/_/g, ' ');
  const days = state['processing_days_display_label'];
  return {
    id: idAt(state['readiness_state_id'], 'readiness state id'),
    label: typeof days === 'string' && days ? `${kind}, ${days}` : kind,
  };
}

function returnOption(policy: JsonObject): ShopOption {
  const days = policy['return_deadline'];
  const accepts = policy['accepts_returns'] === true;
  return {
    id: idAt(policy['return_policy_id'], 'return policy id'),
    label: accepts && typeof days === 'number' ? `Returns within ${days} days` : 'No returns',
  };
}

/** Etsy lists the shop's primary language first; an older shop may list none. */
function languagesOf(shop: JsonObject): string[] {
  const languages = shop['languages'];
  if (!Array.isArray(languages)) return ['en-US'];
  const named = languages.filter((language): language is string => typeof language === 'string');
  return named.length > 0 ? named : ['en-US'];
}
