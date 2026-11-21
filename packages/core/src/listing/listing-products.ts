import { ValidationError } from '../errors.js';
import type { ListingProduct, ListingProperty } from '../ports/marketplace.js';
import type { PrintVariant } from '../print/print-product.js';

/** Etsy names variations in the shop's language from these. */
const COLOR_PROPERTY = 'Color';
const SIZE_PROPERTY = 'Size';

/** The SKU tells which print variant an order is for, also outside this app. */
export function skuOf(variant: PrintVariant): string {
  return `PF-${variant.id}`;
}

/**
 * One product per chosen variant, priced by its size where the seller set a
 * price for it. Buyers pick a colour only when the variants
 * differ in colour, and a size only when they differ in size.
 */
export function listingProducts(
  variants: readonly PrintVariant[],
  price: number,
  sizePrices: Readonly<Record<string, number>> = {},
): ListingProduct[] {
  const byColor = new Set(variants.map((variant) => variant.color)).size > 1;
  const bySize = new Set(variants.map((variant) => variant.size)).size > 1;
  const seen = new Set<string>();

  return variants.map((variant) => {
    const properties: ListingProperty[] = [];
    if (byColor) properties.push({ name: COLOR_PROPERTY, value: required(variant, variant.color) });
    if (bySize) properties.push({ name: SIZE_PROPERTY, value: required(variant, variant.size) });

    const key = properties.map((property) => property.value).join('\u0000');
    if (seen.has(key)) {
      throw new ValidationError('variantIds', `${variant.name} looks the same as another variant`);
    }
    seen.add(key);
    const sizePrice =
      variant.size !== null && Object.hasOwn(sizePrices, variant.size)
        ? sizePrices[variant.size]
        : undefined;
    return { sku: skuOf(variant), properties, price: sizePrice ?? price };
  });
}

function required(variant: PrintVariant, value: string | null): string {
  if (value === null) {
    throw new ValidationError('variantIds', `${variant.name} has no colour or size to choose by`);
  }
  return value;
}
