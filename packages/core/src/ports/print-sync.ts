import type { Placement } from '../print/placement.js';
import type { PrintArea } from '../print/print-product.js';

/** A marketplace product the print provider imported from the shop. */
export interface SyncedVariant {
  readonly id: string;
  /** The marketplace's id of the product. */
  readonly productId: string;
}

export interface VariantLink {
  readonly variantId: string;
  readonly fileId: string;
  readonly area: PrintArea;
  readonly placement: Placement;
}

/** A picture the print provider keeps of what it will make for a synced variant. */
export interface PrintPreview {
  /** The provider's name for it, e.g. the print file itself or a product preview. */
  readonly kind: string;
  readonly url: string;
  readonly thumbnailUrl: string;
}

/** The print provider's copy of the shop's listings, which it fulfils orders from. */
export interface PrintSync {
  /** `undefined` while the provider has not imported the listing yet. */
  syncedVariants(marketplaceListingId: string): Promise<readonly SyncedVariant[] | undefined>;
  /** Has the provider fetch the print file from the link; resolves once it is stored. */
  uploadPrintFile(url: string, name: string): Promise<string>;
  /**
   * The distinct pictures of the files linked to the listing's variants;
   * `undefined` while the provider has not imported the listing yet.
   */
  previews(marketplaceListingId: string): Promise<readonly PrintPreview[] | undefined>;
  /** Tells the provider which product to make, with which file, for a synced variant. */
  linkVariant(syncedVariantId: string, link: VariantLink): Promise<void>;
}
