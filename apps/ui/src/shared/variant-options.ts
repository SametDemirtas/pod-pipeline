import type { PrintVariantDto } from '@pod/contracts/client';

/** Distinct values in first-seen order, skipping variants without one. */
function distinct(values: readonly (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => value !== null))];
}

export function colorsOf(variants: readonly PrintVariantDto[]): string[] {
  return distinct(variants.map((variant) => variant.color));
}

/** Clothing sizes in the order people expect; Printful lists them alphabetically. */
const CLOTHING_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'];

function sizeRank(size: string): number {
  const rank = CLOTHING_SIZES.indexOf(size.toUpperCase());
  return rank === -1 ? CLOTHING_SIZES.length : rank;
}

/** Sizes the colour comes in; clothing sizes from small to large, others as listed. */
export function sizesOf(variants: readonly PrintVariantDto[], color: string | null): string[] {
  return allSizesOf(variants.filter((variant) => variant.color === color));
}

/** Every size of the given variants, in the same order as {@link sizesOf}. */
export function allSizesOf(variants: readonly PrintVariantDto[]): string[] {
  const sizes = distinct(variants.map((variant) => variant.size));
  return sizes.sort((a, b) => sizeRank(a) - sizeRank(b));
}

/** The variant in that colour, in the same size when the colour comes in it. */
export function variantFor(
  variants: readonly PrintVariantDto[],
  color: string | null,
  size: string | null,
): PrintVariantDto | undefined {
  const inColor = variants.filter((variant) => variant.color === color);
  return inColor.find((variant) => variant.size === size) ?? inColor[0];
}
