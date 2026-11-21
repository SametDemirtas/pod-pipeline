import { familyProfileOf } from '@pod/rules';
import { brandsNamedIn } from '../catalog/family-brands.js';
import type { ProductFamilyId } from '../catalog/product-family.js';
import { OtherBrandNamedError } from '../errors.js';
import { listingWords } from './finish-written-text.js';
import type { ListingText } from './listing-text.js';

/** Refuses words in any language that name a brand the family's product is not made for. */
export function assertOwnBrand(familyId: ProductFamilyId, texts: readonly ListingText[]): void {
  const brands = familyProfileOf(familyId).otherBrands;
  const named = new Set(texts.flatMap((text) => brandsNamedIn(listingWords(text), brands)));
  if (named.size > 0) throw new OtherBrandNamedError([...named]);
}
