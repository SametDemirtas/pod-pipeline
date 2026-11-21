import type { ListingPriceDto, SettingsDto } from '@pod/contracts/client';

/** What a listing of the sizes costs, in the minor unit of the shop's currency. */
export interface ListedPrices {
  /** Of every variant without a price of its own size. */
  readonly price: number;
  readonly sizePrices: Readonly<Record<string, number>>;
}

/**
 * Why a listing has no prices: the product, or some of its sizes, without
 * one, or prices set in another currency.
 */
export type PriceGap =
  | {
      readonly kind: 'missing';
      /** The product without a price. */
      readonly familyId: string;
      /** Its sizes without a price; none for a product that has no sizes. */
      readonly sizes: readonly string[];
    }
  | { readonly kind: 'currency' };

type PriceSettings = Pick<SettingsDto, 'listingPrices' | 'sizePrices'>;

/**
 * The prices a listing of the family's `sizes` takes from the settings: each
 * size's own price, else the family's. `null` stands for a product without sizes.
 */
export function listedPrices(
  settings: PriceSettings,
  familyId: string,
  currency: string,
  sizes: readonly (string | null)[],
): ListedPrices | PriceGap {
  const family = settings.listingPrices[familyId];
  const bySize = settings.sizePrices[familyId] ?? {};
  const own = sizes.flatMap((size): [string, ListingPriceDto][] => {
    const price = size === null ? undefined : bySize[size];
    return size !== null && price ? [[size, price]] : [];
  });
  const prices = [family, ...own.map(([, price]) => price)];
  if (prices.some((price) => price !== undefined && price.currency !== currency)) {
    return { kind: 'currency' };
  }
  const priced = new Set(own.map(([size]) => size));
  const unpriced = family ? [] : sizes.filter((size) => size === null || !priced.has(size));
  const first = family ?? own[0]?.[1];
  if (unpriced.length > 0 || !first) {
    return { kind: 'missing', familyId, sizes: unpriced.filter((size) => size !== null) };
  }
  return {
    price: first.amount,
    sizePrices: Object.fromEntries(own.map(([size, price]) => [size, price.amount])),
  };
}

export function isPriceGap(prices: ListedPrices | PriceGap): prices is PriceGap {
  return 'kind' in prices;
}
