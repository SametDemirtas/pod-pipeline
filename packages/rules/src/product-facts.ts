import type { ProductFactsDto } from '@pod/contracts/client';

/** The facts listings state about a product, in the order the seller sees them. */
export const PRODUCT_FACTS = [
  'material',
  'care',
  'fit',
  'size',
] as const satisfies readonly (keyof ProductFactsDto)[];
