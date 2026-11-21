import type { ImageMimeType } from '../catalog/model.js';
import type { ProductFamilyId } from '../catalog/product-family.js';
import type { ScanSkipReason } from '../ports/files.js';
import type { LayoutSkipReason } from './import-layout.js';

export type ImportItemStatus = 'new' | 'changed' | 'unchanged';

export type SkipReason = LayoutSkipReason | ScanSkipReason | 'not-an-image' | 'image-too-large';

export interface SkippedFile {
  readonly relativePath: string;
  readonly reason: SkipReason;
}

export interface ImportPreviewItem {
  readonly designKey: string;
  readonly conceptKey: string;
  /** `null` when the file's location gives no concept name. */
  readonly conceptName: string | null;
  readonly familyId: ProductFamilyId;
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly byteSize: number;
  readonly mimeType: ImageMimeType;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
  readonly status: ImportItemStatus;
  /** Revision currently stored, or `null` for a new design. */
  readonly currentRevision: number | null;
  /** Made from the file of the family it shares artwork with, e.g. a Samsung case. */
  readonly borrowed: boolean;
}

/** A concept the import touches, with the name its files give it. */
export interface PreviewConcept {
  readonly conceptKey: string;
  /** First name found among its files; `null` keeps the stored name. */
  readonly name: string | null;
}

export interface ConceptRename {
  readonly conceptKey: string;
  /** `null` for a concept named for the first time. */
  readonly from: string | null;
  readonly to: string;
}

export interface ImportPreview {
  readonly rootPath: string;
  /**
   * Summarises everything the import would do. Pass it back to `RunImport`,
   * which refuses to run if the folder or the catalog changed in the meantime.
   */
  readonly fingerprint: string;
  readonly items: readonly ImportPreviewItem[];
  readonly concepts: readonly PreviewConcept[];
  readonly skipped: readonly SkippedFile[];
  readonly conceptRenames: readonly ConceptRename[];
  readonly counts: Readonly<Record<ImportItemStatus | 'skipped', number>>;
}

export type ImportPhase = 'reading' | 'copying';

export interface ImportProgress {
  readonly phase: ImportPhase;
  readonly done: number;
  readonly total: number;
}

export type ProgressListener = (progress: ImportProgress) => void;

/** Produces the import preview that `RunImport` executes. */
export interface ImportPlanner {
  execute(rootPath: string, onProgress?: ProgressListener): Promise<ImportPreview>;
}
