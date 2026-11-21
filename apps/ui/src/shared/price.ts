import { type ListingPriceDto, type ShopOptionsDto } from '@pod/contracts/client';
import { LISTING_LIMITS } from '@pod/rules';

export type ShopCurrency = Pick<ShopOptionsDto, 'currency' | 'currencyDigits'>;

/**
 * The amount in the currency's minor unit from text such as `24.99` or `24,99`,
 * with no more decimals than the currency has; `null` when it is not a price.
 */
export function parsePrice(text: string, digits: number): number | null {
  const decimals = digits > 0 ? `(?:[.,](\\d{1,${String(digits)}}))?` : '';
  const match = new RegExp(`^(\\d{1,9})${decimals}$`).exec(text.trim());
  if (!match) return null;
  const [, whole = '0', fraction = ''] = match;
  return Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0'));
}

/**
 * Etsy's price range in the shop's minor unit. Etsy sets it in US dollars and
 * converts it at the day's rate, so it is known only for shops selling in dollars.
 */
export function priceRange(shop: ShopCurrency): { min: number; max: number } | null {
  if (shop.currency !== 'USD') return null;
  const scale = 10 ** shop.currencyDigits;
  return {
    min: Math.round(LISTING_LIMITS.minPriceUsd * scale),
    max: LISTING_LIMITS.maxPriceUsd * scale,
  };
}

/** Whether Etsy takes the price, as far as the app can tell. */
export function isListingPrice(price: number | null, shop: ShopCurrency): boolean {
  if (price === null || price < 1) return false;
  const range = priceRange(shop);
  return !range || (price >= range.min && price <= range.max);
}

/** Whether typed text is filled in but not a price Etsy takes; an empty field is fine. */
export function isWrongPrice(text: string, shop: ShopCurrency): boolean {
  return text.trim() !== '' && !isListingPrice(parsePrice(text, shop.currencyDigits), shop);
}

/** The keys whose typed price is wrong, e.g. the products or sizes of a form. */
export function wrongPrices(
  keys: readonly string[],
  typed: Readonly<Record<string, string>>,
  shop: ShopCurrency,
): string[] {
  return keys.filter((key) => isWrongPrice(typed[key] ?? '', shop));
}

/** Saved prices as the seller would type them; one in another currency is left to type again. */
export function typedPrices(
  saved: Readonly<Record<string, ListingPriceDto>>,
  shop: ShopCurrency,
  locale: string,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(saved).flatMap(([key, price]) =>
      price.currency === shop.currency
        ? [[key, formatPriceInput(price.amount, shop.currencyDigits, locale)]]
        : [],
    ),
  );
}

/** An amount in the minor unit written the way `parsePrice` reads it: `24.99`, `24,99` or `2499` for yen. */
function formatPriceInput(amount: number, digits: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  }).format(amount / 10 ** digits);
}

/** One example amount written the way `parsePrice` reads it. */
export function priceExample(digits: number, locale: string): string {
  return formatPriceInput(2499, digits, locale);
}

/** Etsy's price range as it sets it, in US dollars, e.g. `$0.20` and `$50,000`. */
export function formatPriceRange(locale: string): { min: string; max: string } {
  const dollars = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    trailingZeroDisplay: 'stripIfInteger',
  });
  return {
    min: dollars.format(LISTING_LIMITS.minPriceUsd),
    max: dollars.format(LISTING_LIMITS.maxPriceUsd),
  };
}
