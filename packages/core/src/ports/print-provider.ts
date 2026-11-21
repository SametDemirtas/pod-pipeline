import type { ProductFamilyId } from '../catalog/product-family.js';
import type { Placement } from '../print/placement.js';
import type { PrintArea, PrintProduct } from '../print/print-product.js';

export interface PrintCatalog {
  /** The product a family is made on; `undefined` while the family has none yet. */
  findProduct(familyId: ProductFamilyId): Promise<PrintProduct | undefined>;
}

export interface MockupRequest {
  readonly productId: string;
  readonly variantIds: readonly string[];
  readonly area: PrintArea;
  readonly placement: Placement;
  /** Address the provider downloads the design from. */
  readonly imageUrl: string;
  /**
   * Whether the photos must come as lossless PNGs, e.g. because the app turns
   * them afterwards; such photos may keep a transparent background. Otherwise
   * the provider sends smaller JPEGs on an opaque background.
   */
  readonly lossless?: boolean | undefined;
  /**
   * Set when the area is photographed turned a quarter from the way the
   * provider lists it, e.g. a landscape blanket shown hanging upright; `area`
   * and `placement` then give the turned area. Asked for only once
   * {@link MockupGenerator.supportsOrientation} allowed it.
   */
  readonly orientation?: MockupOrientation | undefined;
}

/** Which way up a print area is photographed: wider than tall, or taller than wide. */
export type MockupOrientation = 'horizontal' | 'vertical';

/** One print area of a product variant, to photograph in a given orientation. */
export interface MockupOrientationQuery {
  readonly productId: string;
  readonly variantId: string;
  /** Provider name of the area, e.g. `default`. */
  readonly placement: string;
  readonly orientation: MockupOrientation;
}

export interface GeneratedMockup {
  /** Temporary address of the rendered image on the provider's servers. */
  readonly url: string;
  /** Provider name of the view, e.g. `Left`; the main view is named after its print area. */
  readonly view: string;
}

export interface MockupGenerator {
  /** Renders product photos with the design placed; resolves when they are ready. */
  generate(request: MockupRequest): Promise<readonly GeneratedMockup[]>;
  /**
   * Whether the provider can photograph the area turned to `orientation`, so
   * artwork turned to fit it can be shown the right way up in every photo.
   * Resolves `false` when unsure; a generator without it is taken to refuse.
   */
  supportsOrientation?(query: MockupOrientationQuery): Promise<boolean>;
}
