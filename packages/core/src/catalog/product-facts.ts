/**
 * What the seller states about a product, e.g. its material. Listing text may
 * only claim these, so nothing invented reaches a buyer. Empty when unknown.
 */
export interface ProductFacts {
  readonly material: string;
  readonly care: string;
  readonly fit: string;
  readonly size: string;
}
