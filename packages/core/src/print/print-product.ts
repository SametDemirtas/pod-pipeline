import type { ProductFamilyId } from '../catalog/product-family.js';

/** Printable region of a product variant, in pixels of the print file. */
export interface PrintArea {
  /** Provider name of the region, e.g. `default`, `front` or `back`. */
  readonly placement: string;
  readonly width: number;
  readonly height: number;
  /** Pixels per inch the provider prints the file at. */
  readonly dpi: number;
}

export interface PrintVariant {
  readonly id: string;
  /** Provider label, e.g. `White Glossy Mug 11 oz`. */
  readonly name: string;
  /** Color or finish, e.g. `Black` or `Glossy`; `null` when the product has none. */
  readonly color: string | null;
  /** Size or model, e.g. `XL` or `iPhone 15`; `null` when the product has none. */
  readonly size: string | null;
  /** Regions the design can go on, the main one first. */
  readonly areas: readonly PrintArea[];
}

/** A print provider's product that a product family is made on. */
export interface PrintProduct {
  readonly familyId: ProductFamilyId;
  readonly productId: string;
  readonly name: string;
  readonly variants: readonly PrintVariant[];
}
