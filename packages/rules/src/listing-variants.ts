import type { PrintCheckDto } from '@pod/contracts/client';
import { LISTING_LIMITS } from './limits.js';

interface Variant {
  readonly id: string;
  readonly color: string | null;
  readonly size: string | null;
}

/** The most variants a listing of one colour holds: Etsy's limit for one variation's options. */
const MOST_VARIANTS = Math.min(LISTING_LIMITS.variants, LISTING_LIMITS.variationOptions);

/** The most options one variation of the variants has, e.g. phone models or colours. */
export function variationOptions(variants: readonly Variant[]): number {
  const count = (values: readonly (string | null)[]) =>
    new Set(values.filter((value) => value !== null)).size;
  return Math.max(
    count(variants.map((variant) => variant.color)),
    count(variants.map((variant) => variant.size)),
  );
}

/**
 * At most `limit` of the variants, in their order, keeping the newest:
 * Printful gives variants it adds later, such as new phone models, higher ids.
 * Ids are Printful's whole numbers as text, so they are compared as numbers;
 * any other id counts as oldest, so the order stays consistent.
 */
export function newestVariants<T extends Variant>(variants: readonly T[], limit: number): T[] {
  const age = (id: string) => (/^\d+$/.test(id) ? Number(id) : -1);
  const newest = new Set(
    variants
      .map((variant) => variant.id)
      .sort((a, b) => age(b) - age(a))
      .slice(0, limit),
  );
  return variants.filter((variant) => newest.has(variant.id));
}

/**
 * Products in several colours are chosen by colour and size, as long as each
 * colour and size pair names exactly one variant; others are chosen by name.
 */
export function choosesByColor(variants: readonly Variant[]): boolean {
  const pairs = new Set(
    variants.map((variant) => `${variant.color ?? ''}\u0000${variant.size ?? ''}`),
  );
  const colors = new Set(variants.flatMap((variant) => (variant.color ? [variant.color] : [])));
  return (
    colors.size > 1 &&
    variants.every((variant) => variant.color !== null && variant.size !== null) &&
    pairs.size === variants.length
  );
}

/**
 * The variants a listing sells to start with, for the window and for batch
 * jobs alike: those that print on the checked area, of the sizes the settings
 * list for the family (all when they list none) and, for products chosen by
 * colour, of the checked variant's colour, since one listing per colour is
 * common. When there are more than Etsy takes, the newest stay.
 */
export function listingVariantIds(
  check: Pick<PrintCheckDto, 'variants' | 'variantId' | 'printArea'>,
  sizes: readonly string[] | undefined,
): string[] {
  const color = check.variants.find((variant) => variant.id === check.variantId)?.color;
  const byColor = choosesByColor(check.variants);
  const offered = check.variants.filter(
    (variant) =>
      (!byColor || variant.color === color) &&
      (!sizes || sizes.includes(variant.size ?? '')) &&
      variant.areas.some((area) => area.placement === check.printArea),
  );
  return newestVariants(offered, MOST_VARIANTS).map((variant) => variant.id);
}
