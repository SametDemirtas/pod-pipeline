import type { DesignId, ImageAsset } from '../catalog/model.js';
import type { SceneLook } from './scenes/scene-look.js';

export type MockupId = string & { readonly __brand: 'MockupId' };

/**
 * A product photo with a design printed on it: rendered by the print provider,
 * or a scene generated from such a photo.
 */
export interface Mockup {
  readonly id: MockupId;
  readonly designId: DesignId;
  /** Design revision the photo shows; older photos stay until replaced. */
  readonly designRevision: number;
  readonly variantId: string;
  /** Provider name of the print area the design was placed on. */
  readonly printArea: string;
  /** Provider name of the view, e.g. `Left`; the main view is named after its print area. */
  readonly view: string;
  /** What the scene was asked to show; `null` for the print provider's own photos. */
  readonly scenePrompt: string | null;
  /**
   * Scenes only: the look they were made with, kept so a scene can be made
   * again alike; absent for the print provider's photos and older scenes.
   */
  readonly sceneLook?: SceneLook;
  /** Scenes only: how the scene compares with its source photo; `null` when it was not checked. */
  readonly sceneCheck: SceneCheck | null;
  /** Scenes only: the seller looked at the print in the scene and confirmed it. */
  readonly printConfirmed: boolean;
  /**
   * Scenes only: the photo the scene was made from, kept so it can be compared
   * again; `null` for scenes made before it was kept.
   */
  readonly sourceAsset: ImageAsset | null;
  readonly asset: ImageAsset;
  readonly createdAt: Date;
}

/** Whether a generated scene still shows the product and print of its source photo. */
export interface SceneCheck {
  /** Nothing was found changed; details in `unverifiable` were not seen well enough to tell. */
  readonly same: boolean;
  /** What differs, one short sentence each; may name small flaws in the scene even when `same`. */
  readonly issues: readonly string[];
  /** Details too small or hidden to compare, which the seller should look at. */
  readonly unverifiable: readonly string[];
}
