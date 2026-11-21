import type { ProductFacts } from '../catalog/product-facts.js';

/** `50″×60″`, `50" x 60"` or `50 in × 60 in`, as print providers write sizes in inches. */
const INCHES = /^\s*(\d+(?:\.\d+)?)\s*(?:″|"|in)\s*[×x]\s*(\d+(?:\.\d+)?)\s*(?:″|"|in)\s*$/i;
const CM_PER_INCH = 2.54;

/** A size in inches with centimetres after it, e.g. `50″×60″ (127 × 152 cm)`; `undefined` for others. */
export function inchesAndCentimetres(size: string): string | undefined {
  const match = INCHES.exec(size);
  if (!match) return undefined;
  const cm = (inches: string | undefined) => Math.round(Number(inches) * CM_PER_INCH);
  return `${size.trim()} (${String(cm(match[1]))} × ${String(cm(match[2]))} cm)`;
}

/**
 * The facts with the size the listing sells stated in inches and centimetres,
 * when every size is a measure, so the text names exactly the sizes offered.
 */
export function withListedSizes(facts: ProductFacts, sizes: readonly string[]): ProductFacts {
  const measured = sizes.map(inchesAndCentimetres);
  if (measured.length === 0 || measured.some((size) => size === undefined)) return facts;
  return { ...facts, size: measured.join(', ') };
}
