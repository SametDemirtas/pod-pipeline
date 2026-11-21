import type { DesignId } from '../catalog/model.js';
import type { Mockup, MockupId, SceneCheck } from '../mockups/mockup.js';
import type { ProductDetails } from './product-reader.js';

/** The variant and print area a set of photos was made for. */
export interface MockupSlot {
  readonly variantId: string;
  readonly printArea: string;
}

/** The photos of each design. */
export interface MockupStore {
  /**
   * Stores the print provider's photos of one slot, removing the ones it made
   * for it before. Scenes are kept until removed on their own.
   */
  replace(designId: DesignId, slot: MockupSlot, mockups: readonly Mockup[]): Promise<void>;
  /** Stores more photos next to the ones the design has. */
  add(mockups: readonly Mockup[]): Promise<void>;
  /** Removes one photo; nothing happens when it is already gone. */
  remove(designId: DesignId, id: MockupId): Promise<void>;
  /** Newest first, in the order they were made. */
  listForDesign(designId: DesignId): Promise<readonly Mockup[]>;
}

/** How each scene's print was checked and confirmed. */
export interface SceneReviews {
  /**
   * Records a scene's check. A check that finds the print changed also takes
   * back the seller's confirmation, even one given while the check ran; nothing
   * happens when the scene is gone.
   */
  saveCheck(designId: DesignId, id: MockupId, check: SceneCheck): Promise<void>;
  /** Records whether the seller confirmed a scene's print; nothing happens when it is gone. */
  setConfirmed(designId: DesignId, id: MockupId, confirmed: boolean): Promise<void>;
}

/** What the product in each photo looks like, read once for the scene model. */
export interface ProductDetailsStore {
  /** What the product in a photo looks like, once read; `null` before. */
  productDetails(designId: DesignId, id: MockupId): Promise<ProductDetails | null>;
  /** Records what the product in a photo looks like; nothing happens when it is gone. */
  saveProductDetails(designId: DesignId, id: MockupId, details: ProductDetails): Promise<void>;
}

export interface MockupRepository extends MockupStore, SceneReviews, ProductDetailsStore {}
