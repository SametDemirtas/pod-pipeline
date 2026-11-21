export interface ProductFamilyDto {
  /** Lower-case words joined by hyphens, e.g. `tote-bag`; the end of every design key. */
  readonly id: string;
}

export interface ConceptDto {
  readonly id: string;
  readonly key: string;
  /** `null` when its files name none, as a flat `01 Mug.png` does not. */
  readonly name: string | null;
}

export interface ImageAssetDto {
  readonly storageKey: string;
  readonly sha256: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
}

/** What artwork is treated as when made larger: drawn and flat, or photographic. */
export const UPSCALE_MODELS = ['illustration', 'photo'] as const;
export type UpscaleModelDto = (typeof UPSCALE_MODELS)[number];

export interface DesignDto {
  readonly id: string;
  readonly designKey: string;
  readonly familyId: string;
  readonly revision: number;
  readonly concept: ConceptDto;
  readonly asset: ImageAssetDto;
  readonly sourcePath: string;
  /** The model that made the artwork larger in the app; `null` for artwork as imported. */
  readonly upscaleModel: UpscaleModelDto | null;
  /** Degrees the artwork was turned clockwise to fit the print area; `null` when it was not. */
  readonly rotation: 90 | 270 | null;
  /** Why the checking model chose that turn; `null` when it was not turned. */
  readonly rotationReason: string | null;
  /**
   * Why the checking model advised leaving the artwork unturned although its
   * orientation is the other one than the print area's; `null` when it was not asked.
   */
  readonly keptOrientationReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DesignRevisionDto {
  readonly revision: number;
  readonly asset: ImageAssetDto;
  readonly sourcePath: string;
  readonly upscaleModel: UpscaleModelDto | null;
  readonly rotation: 90 | 270 | null;
  readonly recordedAt: string;
}

export interface DesignDetailDto extends DesignDto {
  /** Newest first; the first entry is the current revision. */
  readonly revisions: readonly DesignRevisionDto[];
}

export interface PageDto<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly total: number;
}

export type ImportItemStatusDto = 'new' | 'changed' | 'unchanged';

export interface ImportPreviewItemDto {
  readonly designKey: string;
  readonly conceptKey: string;
  /** `null` when the file location carries no concept name. */
  readonly conceptName: string | null;
  readonly familyId: string;
  readonly relativePath: string;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly status: ImportItemStatusDto;
  readonly currentRevision: number | null;
  /** Made from the file of the product it shares artwork with, e.g. a Samsung case. */
  readonly borrowed: boolean;
}

/** Why a file was left out of an import; each has a message in every language. */
export type SkipReasonDto =
  | 'invalid-path'
  | 'unsupported-extension'
  | 'unknown-family'
  | 'missing-concept-number'
  | 'missing-product-name'
  | 'too-deep'
  | 'duplicate-design-key'
  | 'conflicting-concept-name'
  | 'not-an-image'
  | 'image-too-large'
  | 'unreadable';

export interface SkippedFileDto {
  readonly relativePath: string;
  readonly reason: SkipReasonDto;
}

export interface ConceptRenameDto {
  readonly conceptKey: string;
  /** `null` for a concept named for the first time. */
  readonly from: string | null;
  readonly to: string;
}

export interface ImportPreviewDto {
  readonly rootPath: string;
  readonly fingerprint: string;
  readonly items: readonly ImportPreviewItemDto[];
  readonly skipped: readonly SkippedFileDto[];
  readonly conceptRenames: readonly ConceptRenameDto[];
  readonly counts: {
    readonly new: number;
    readonly changed: number;
    readonly unchanged: number;
    readonly skipped: number;
  };
}

export interface ImportResultDto {
  readonly created: readonly string[];
  readonly updated: readonly string[];
  readonly unchanged: number;
  readonly skipped: number;
  readonly renamedConceptKeys: readonly string[];
}

export interface ImportProgressDto {
  readonly operation: 'preview' | 'import';
  readonly phase: 'reading' | 'copying';
  readonly done: number;
  readonly total: number;
}

/** How far making a design's artwork larger has come. */
export interface UpscaleProgressDto {
  readonly designId: string;
  /** From 0 to 1. */
  readonly share: number;
}

/**
 * What turning a design's artwork to fit its print area did: `rotated` keeps it
 * turned as the next revision, `kept` leaves it as it is because the checking
 * model found it reads fine sideways, and `unneeded` means its orientation
 * already fits, it was turned before, or the product is not one that is turned.
 */
export interface RotateDesignDto {
  readonly status: 'unneeded' | 'kept' | 'rotated';
  /** The checking model's reason; `null` when it was not asked. */
  readonly reason: string | null;
  readonly design: DesignDetailDto;
}
