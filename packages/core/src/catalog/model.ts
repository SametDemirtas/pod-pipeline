import type { ProductFamilyId } from './product-family.js';

export type ConceptId = string & { readonly __brand: 'ConceptId' };
export type DesignId = string & { readonly __brand: 'DesignId' };

export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg'] as const;
export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

export interface ImageAsset {
  readonly sha256: string;
  /** Key in the asset store; content addressed, so equal files share a key. */
  readonly storageKey: string;
  readonly mimeType: ImageMimeType;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
}

export interface Concept {
  readonly id: ConceptId;
  /** Zero-padded number taken from the source folder, e.g. `01`. */
  readonly key: string;
  /** `null` when its files name none, as a flat `01 Mug.png` does not. */
  readonly name: string | null;
  readonly createdAt: Date;
}

export interface Design {
  readonly id: DesignId;
  /** Concept key and product family id, e.g. `01-mug`. Unique per shop. */
  readonly designKey: string;
  readonly conceptId: ConceptId;
  readonly familyId: ProductFamilyId;
  /** Starts at 1 and increases every time a changed file is imported. */
  readonly revision: number;
  readonly asset: ImageAsset;
  /**
   * Where this revision was imported from; informational only. Importing the
   * same file from a new location stores no revision, so the old path stays.
   */
  readonly sourcePath: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Set when this revision is the imported artwork made larger; the original stays as history. */
  readonly upscale?: DesignUpscale | undefined;
  /** Set when this revision is the artwork turned to fit a print area of the other orientation. */
  readonly rotation?: DesignRotation | undefined;
  /**
   * Set once the checking model advised leaving the artwork as it is rather than
   * turning it. Kept for the design, not a revision: it holds while the imported
   * file is the same, also once that is made larger.
   */
  readonly keptOrientation?: KeptOrientation | undefined;
}

/** The checking model's advice to leave artwork of the other orientation unturned. */
export interface KeptOrientation {
  /** The imported file's content it was given for; see {@link importedSha256}. */
  readonly sha256: string;
  /** Why the artwork reads fine as it is, as the checking model put it. */
  readonly reason: string;
}

/** Why the design's artwork was left unturned, while that advice holds for its imported file. */
export function keptOrientationOf(design: Design): KeptOrientation | undefined {
  const kept = design.keptOrientation;
  return kept && !design.rotation && kept.sha256 === importedSha256(design) ? kept : undefined;
}

/** How a revision was made from the imported artwork by upscaling it. */
export interface DesignUpscale {
  /** What the artwork was treated as, e.g. `illustration`. */
  readonly model: string;
  /** The imported file's content, so importing it again is not taken for a change. */
  readonly originalSha256: string;
}

/** A quarter turn clockwise, in degrees. */
export const QUARTER_TURNS = [90, 270] as const;
export type QuarterTurn = (typeof QUARTER_TURNS)[number];

/** How a revision was made by turning the artwork before it, so it fills the print area. */
export interface DesignRotation {
  /** How far the artwork was turned clockwise. */
  readonly degrees: QuarterTurn;
  /** The imported file's content, so importing it again is not taken for a change. */
  readonly originalSha256: string;
  /** Why the artwork still reads upright this way, as the checking model put it. */
  readonly reason: string;
}

/** The hash of the file a design was imported from, before it was made larger or turned. */
export function importedSha256(design: Design): string {
  return design.upscale?.originalSha256 ?? design.rotation?.originalSha256 ?? design.asset.sha256;
}

/**
 * The artwork the right way up: the design's own when it was never turned,
 * else that of the newest revision from before the turn, as `revisions`
 * (newest first) hold it; `undefined` when no such revision is stored.
 */
export function uprightAsset(design: Design, revisions: readonly Design[]): ImageAsset | undefined {
  return uprightRevision(design, revisions)?.asset;
}

/**
 * The revision holding {@link uprightAsset}: the design itself when it was
 * never turned, else the newest unturned revision of the same imported file.
 */
export function uprightRevision(design: Design, revisions: readonly Design[]): Design | undefined {
  const { rotation } = design;
  if (!rotation) return design;
  return revisions.find(
    (revision) => !revision.rotation && importedSha256(revision) === rotation.originalSha256,
  );
}

/** The turn that undoes `turn`. */
export function inverseTurn(turn: QuarterTurn): QuarterTurn {
  return turn === 90 ? 270 : 90;
}

export interface DesignView extends Design {
  readonly concept: Concept;
}

export interface DesignDetails {
  readonly design: DesignView;
  /** Newest first; the first entry is the current revision. */
  readonly revisions: readonly Design[];
}
