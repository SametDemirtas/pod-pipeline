import { stringAt, type JsonObject } from './json.js';

/**
 * Decimal places of a currency, e.g. 2 for USD and 0 for JPY, as the Unicode
 * CLDR data in Intl gives them. Etsy only states its own divisor on prices it
 * returns, not on the shop. Prices are entered and sent with the same places,
 * so they arrive exact; where Etsy uses more places than CLDR (IDR, HUF or
 * TWD, for example), only whole amounts can be entered.
 */
export function minorDigits(currency: string): number {
  const parts = new Intl.NumberFormat('en', { style: 'currency', currency }).formatToParts(1);
  return parts.find((part) => part.type === 'fraction')?.value.length ?? 0;
}

/** The ISO 4217 code of a shop as Etsy describes it. */
export function currencyOf(shop: JsonObject): string {
  return stringAt(shop['currency_code'], 'shop currency');
}
