import type { FulfilmentStoreProblem } from '@pod/contracts';

/** The fulfilment store a token belongs to, as the fulfilment adapter reads it. */
export interface FulfilmentStore {
  readonly name: string;
  /** Whether the store syncs with a marketplace shop; `null` when the service did not say. */
  readonly syncsWithMarketplace: boolean | null;
  /** The marketplace shop's name in the store's address; `null` when it shows none. */
  readonly shopHandle: string | null;
}

/** Asks the fulfilment service which store a token belongs to. */
export type FulfilmentStoreLookup = (token: string) => Promise<FulfilmentStore>;

/** Lower case letters and digits only, so `Maple Lane` and `maple-lane` compare equal. */
const plain = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** Whether the store is the fulfilment copy of the shop: by its name or its address. */
function isShop(store: FulfilmentStore, shopName: string): boolean {
  const shop = plain(shopName);
  return [store.name, store.shopHandle].some((name) => name !== null && plain(name) === shop);
}

/**
 * Why listings of the marketplace shop cannot reach the fulfilment store: it
 * does not sync with the marketplace at all, e.g. a store for manual orders, or
 * it syncs with another shop. `null` when it looks right, or when the service
 * did not say what kind of store it is, as nothing can be told then.
 */
export function fulfilmentStoreProblem(
  store: FulfilmentStore,
  shopName: string | undefined,
): FulfilmentStoreProblem | null {
  if (store.syncsWithMarketplace === null) return null;
  if (!store.syncsWithMarketplace) return 'not-marketplace';
  if (shopName === undefined || !shopName.trim() || isShop(store, shopName)) return null;
  return 'other-shop';
}
