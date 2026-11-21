import type { ListingPriceDto } from '@pod/contracts/client';
import { parsePrice, typedPrices, type ShopCurrency } from '../../shared/price.js';
import type { ListingDraft } from './listing-draft.js';

/** The prices the settings give the product, to start the form with. */
export interface SavedPrices {
  /** Of every size without one of its own; none when the settings give none. */
  readonly listing: ListingPriceDto | undefined;
  /** By size. */
  readonly sizes: Readonly<Record<string, ListingPriceDto>> | undefined;
  /** The interface's locale, to write the prices the way the seller types them. */
  readonly locale: string;
}

/**
 * The prices the settings give the product, as the seller would type them:
 * the product's own as the main price, else that of the first size the
 * listing sells that has one, as the batch's drafts take them. Prices set in
 * another currency than the shop's are left empty to type again, as they
 * would mean something else now.
 */
export function savedPrices(
  saved: SavedPrices | undefined,
  shop: ShopCurrency,
  sizes: readonly (string | null)[],
): Pick<ListingDraft, 'price' | 'sizePrices'> {
  if (!saved) return { price: '', sizePrices: {} };
  const sizePrices = typedPrices(saved.sizes ?? {}, shop, saved.locale);
  const listing = saved.listing ? { listing: saved.listing } : {};
  const own = typedPrices(listing, shop, saved.locale)['listing'];
  // Without a price of its own, a product priced by size alone starts with its first size's.
  const priced = sizes.find((size) => size !== null && sizePrices[size] !== undefined);
  const first = saved.listing || !priced ? undefined : sizePrices[priced];
  return { price: own ?? first ?? '', sizePrices };
}

/**
 * The draft with only the size prices the seller can see: those of the chosen
 * sizes, and none when one size is left, where the main price applies.
 */
export function withShownSizePrices(draft: ListingDraft, sizes: readonly string[]): ListingDraft {
  const shown = sizes.length > 1 ? new Set(sizes) : new Set<string>();
  return {
    ...draft,
    sizePrices: Object.fromEntries(
      Object.entries(draft.sizePrices).filter(([size]) => shown.has(size)),
    ),
  };
}

/** The typed size prices in the minor unit, without empty ones; nothing when none was typed. */
export function sizePricesOf(typed: Readonly<Record<string, string>>, digits: number) {
  const prices: Record<string, number> = {};
  for (const [size, text] of Object.entries(typed)) {
    const price = text.trim() ? parsePrice(text, digits) : null;
    if (price !== null) prices[size] = price;
  }
  return Object.keys(prices).length > 0 ? { sizePrices: prices } : {};
}
