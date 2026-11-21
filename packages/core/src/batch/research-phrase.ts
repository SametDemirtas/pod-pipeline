import { productTypeOf, type ProductFamilyId } from '../catalog/product-family.js';
import { researchQuery } from '../research/research-keywords.js';

/**
 * What a buyer would search for the design: its concept name and product in
 * lower case, e.g. `meadow bees mug`. The product is not repeated when the
 * name already ends with it; an unnamed concept searches the product alone.
 */
export function researchPhrase(conceptName: string | null, familyId: ProductFamilyId): string {
  const product = productTypeOf(familyId);
  const name = (conceptName ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const named = name === product || name.endsWith(` ${product}`);
  const phrase = named ? name : `${name} ${product}`;
  return researchQuery(phrase);
}
