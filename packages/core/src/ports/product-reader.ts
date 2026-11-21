import type { PreviewImage } from './previews.js';

/**
 * What a product photo shows, in a few plain words each, for the scene model
 * to keep. Never the print's own words, which the model would draw anew.
 */
export interface ProductDetails {
  /** The product as seen, e.g. `white ceramic mug with a C-shaped handle`. */
  readonly product: string;
  /** E.g. `glossy glazed ceramic` or `soft cotton jersey`. */
  readonly material: string;
  /** Where the print sits, e.g. `centred on the chest`. */
  readonly printPlacement: string;
  readonly printHasLettering: boolean;
  /** The print's main colours as plain words, most dominant first. */
  readonly printColors: readonly string[];
  /** A lookalike the product must not turn into, e.g. `a travel mug with a lid`. */
  readonly notMistakenFor: string;
}

/** Describes the product in one of the print provider's photos. */
export interface ProductReader {
  /** `productType` is the catalog's, e.g. `mug`, to tell the product from props. */
  read(photo: PreviewImage, productType: string): Promise<ProductDetails>;
}
