import type { SceneLookChoicesDto, SceneLookDto } from './scene-look.js';
import type { ImageAssetDto } from './catalog-dto.js';
import type { ProductFactsDto } from './settings-dto.js';

export const FIT_MODES = ['contain', 'cover'] as const;
/** `contain` shows the whole design; `cover` fills the print area and crops the edges. */
export type FitModeDto = (typeof FIT_MODES)[number];

export interface PrintAreaDto {
  readonly placement: string;
  readonly width: number;
  readonly height: number;
  readonly dpi: number;
}

export interface PrintVariantDto {
  readonly id: string;
  readonly name: string;
  /** Color or finish; `null` when the product has none. */
  readonly color: string | null;
  /** Size or model; `null` when the product has none. */
  readonly size: string | null;
  /** Areas the design can go on, the main one first. */
  readonly areas: readonly PrintAreaDto[];
}

export interface PrintUprightDto {
  readonly storageKey: string;
  /** The turned area, in pixels. */
  readonly width: number;
  readonly height: number;
}

export interface PrintCheckDto {
  readonly designId: string;
  readonly productId: string;
  readonly productName: string;
  readonly variants: readonly PrintVariantDto[];
  /** The variant that was checked. */
  readonly variantId: string;
  /** The print area that was checked, e.g. `front`. */
  readonly printArea: string;
  readonly fit: FitModeDto;
  /** Where the design lands, in pixels of the print area; `cover` may start outside it. */
  readonly placement: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
  readonly effectiveDpi: number;
  readonly quality: PrintQuality;
  readonly areaCovered: number;
  readonly imageCropped: number;
  /**
   * The artwork has the other orientation than this area and the product hangs
   * either way up, e.g. portrait artwork on a landscape blanket, so turning it a
   * quarter would fill the area with less cropping; `false` once it was turned.
   */
  readonly turnsToFit: boolean;
  /**
   * Set when the provider prints the artwork upright on the area turned a
   * quarter, e.g. portrait artwork on a blanket listed landscape; `placement`
   * is then in pixels of that turned area, whose size this gives, and the
   * artwork is the revision stored under `storageKey`. `null` when the
   * artwork goes on the area as listed.
   */
  readonly upright: PrintUprightDto | null;
  /** What the seller states about the product; listing text may claim only these. */
  readonly productFacts: ProductFactsDto;
}

export interface MockupDto {
  readonly id: string;
  readonly designRevision: number;
  readonly variantId: string;
  readonly printArea: string;
  readonly view: string;
  /** What a generated scene was asked to show; `null` for Printful's own photos. */
  readonly scenePrompt: string | null;
  /** Scenes only: the look it was made with; `null` for Printful's photos and older scenes. */
  readonly sceneLook: SceneLookDto | null;
  /** Scenes only: the language model's comparison with the source photo; `null` when it was not checked. */
  readonly sceneCheck: SceneCheckDto | null;
  /** Scenes only: the seller confirmed the print, so the scene may be a listing photo. */
  readonly printConfirmed: boolean;
  /** Scenes only: the photo it was made from is known, so it can be compared again. */
  readonly canCheckAgain: boolean;
  readonly asset: ImageAssetDto;
  readonly createdAt: string;
}

/** The scenes one request kept. */
export interface CreatedScenesDto {
  /** The better candidate once both were checked, otherwise every scene made. */
  readonly scenes: readonly MockupDto[];
  /** One of two candidates could not be made; the other was kept. */
  readonly candidateFailed: boolean;
}

export interface SceneCheckDto {
  /** Whether the product and its print look the same as in the source photo. */
  readonly same: boolean;
  /** What differs, one short sentence each. */
  readonly issues: readonly string[];
  /** Details too small or hidden for the language model to compare, for the seller to look at. */
  readonly unverifiable: readonly string[];
}

/** The style of a reference photo as a scene description, or why there is none. */
export type SceneStyleDto =
  | {
      readonly found: true;
      readonly description: string;
      /** Look options the photo clearly shows, for the seller to change. */
      readonly look: SceneLookChoicesDto;
    }
  | {
      readonly found: false;
      /** `copiedText`: the description repeated words read off the reference, so it was dropped. */
      readonly reason: 'nothingUsable' | 'copiedText';
    };

export const PRINT_QUALITIES = ['good', 'acceptable', 'poor'] as const;
export type PrintQuality = (typeof PRINT_QUALITIES)[number];
