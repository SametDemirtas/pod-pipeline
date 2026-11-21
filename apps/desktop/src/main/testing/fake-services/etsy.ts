import { ListingStore } from './etsy-listings.js';
import { json, route, type Answer, type FakeService, type Json } from './http.js';

export const ETSY_SHOP_ID = 10001001;
const USER_ID = 1001001;

const SHOP = {
  shop_id: ETSY_SHOP_ID,
  user_id: USER_ID,
  shop_name: 'FakeShop',
  currency_code: 'USD',
  languages: ['en-US'],
  url: 'https://www.etsy.com/shop/FakeShop',
};

const SHIPPING_PROFILES = [{ shipping_profile_id: 900000001, title: 'Printful' }];
const READINESS_STATES = [
  {
    readiness_state_id: 900000002,
    readiness_state: 'made_to_order',
    processing_days_display_label: '2-6 days',
  },
];
const RETURN_POLICIES = [
  { return_policy_id: 900000003, accepts_returns: true, return_deadline: 14 },
];
const PRODUCTION_PARTNERS = [{ production_partner_id: 900000004, partner_name: 'Printful' }];

/** The seller's Etsy shop, with listings kept in memory. */
export interface FakeEtsy {
  readonly service: FakeService;
  /** Etsy's product ids of a listing's variations, which Printful imports; `undefined` for no listing. */
  readonly productIds: (listingId: string) => readonly string[] | undefined;
}

const page = (results: readonly Json[]) => json({ count: results.length, results });

/** Answers only for the signed-in seller's shop, named by the path's first part. */
function inShop(answer: Answer): Answer {
  return (request, params, url) =>
    params[0] === String(ETSY_SHOP_ID)
      ? answer(request, params, url)
      : json({ error: 'You do not have permission to view this shop' }, 403);
}

const SHOP_PATH = '/shops/:shop';

/** A list the shop keeps, such as its shipping profiles, read a page at a time. */
function shopList(path: string, rows: readonly Json[]) {
  return route(
    'GET',
    `${SHOP_PATH}${path}`,
    inShop(() => page(rows)),
  );
}

export function fakeEtsy(): FakeEtsy {
  const store = new ListingStore({ userId: USER_ID, shopId: ETSY_SHOP_ID }, SHOP.currency_code);
  const listing = `${SHOP_PATH}/listings/:listing`;
  const service: FakeService = {
    base: 'https://openapi.etsy.com/v3/application',
    signedIn: true,
    missing: () => json({ error: 'Resource not found' }, 404),
    routes: [
      route('GET', '/users/me', () => json({ user_id: USER_ID, shop_id: ETSY_SHOP_ID })),
      route(
        'GET',
        SHOP_PATH,
        inShop(() => json(SHOP)),
      ),
      shopList('/shipping-profiles', SHIPPING_PROFILES),
      shopList('/readiness-state-definitions', READINESS_STATES),
      shopList('/policies/return', RETURN_POLICIES),
      shopList('/production-partners', PRODUCTION_PARTNERS),
      route('POST', `${SHOP_PATH}/listings`, inShop(store.create)),
      route('PATCH', listing, inShop(store.update)),
      route('POST', `${listing}/images`, inShop(store.addImage)),
      route('POST', `${listing}/translations/:lang`, inShop(store.translation(true))),
      route('PUT', `${listing}/translations/:lang`, inShop(store.translation(false))),
      route(
        'GET',
        '/listings/:listing',
        store.withListing(0, (found) => json(found.body)),
      ),
      route('PUT', '/listings/:listing/inventory', store.setInventory),
      route('DELETE', '/listings/:listing', store.remove),
    ],
  };
  return { service, productIds: (listingId) => store.productIds(listingId) };
}
