import type { ImageMimeType } from '../catalog/model.js';

export interface SourceFile {
  /** Path relative to the scanned root, always using `/` as separator. */
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly byteSize: number;
}

export type ScanSkipReason = 'too-deep' | 'unreadable';

export interface ScanSkip {
  readonly relativePath: string;
  readonly reason: ScanSkipReason;
}

export interface ScanResult {
  readonly files: readonly SourceFile[];
  /** Folders deeper than `maxDepth` and entries that could not be read. */
  readonly skipped: readonly ScanSkip[];
}

export interface SourceScanner {
  /**
   * Lists every regular file under `rootPath`, at most `maxDepth` folders deep.
   * Hidden files and folders are ignored and symbolic links are not followed.
   */
  scan(rootPath: string, maxDepth: number): Promise<ScanResult>;
}

export interface ImageInfo {
  readonly mimeType: ImageMimeType;
  readonly width: number;
  readonly height: number;
}

export interface ImageInspector {
  /**
   * Returns `undefined` when the file is not a supported image; throws
   * `ImageTooLargeError` for one too large to find its size in.
   */
  inspect(absolutePath: string): Promise<ImageInfo | undefined>;
}

export interface Hasher {
  /** Lowercase hex SHA-256 of the file contents. */
  hashFile(absolutePath: string): Promise<string>;
  /** Lowercase hex SHA-256 of the UTF-8 encoded text. */
  hashText(text: string): Promise<string>;
}

export interface StoredAsset {
  readonly storageKey: string;
  /** Hash of the bytes actually stored, computed while copying. */
  readonly sha256: string;
  readonly byteSize: number;
}

export interface AssetStore {
  /**
   * Copies the file into the store under a key derived from its contents and
   * reports what was stored. Writes are atomic: a failed copy leaves nothing
   * behind, and storing identical content again reuses the existing copy.
   */
  put(absolutePath: string, mimeType: ImageMimeType): Promise<StoredAsset>;
}

/** Lists and deletes stored assets, to drop the ones nothing refers to any more. */
export interface AssetInventory {
  listKeys(): Promise<readonly string[]>;
  remove(storageKey: string): Promise<void>;
}

/** Every storage key still in use by a design, a revision or a mockup. */
export interface AssetReferences {
  referencedKeys(): Promise<ReadonlySet<string>>;
}

/**
 * Whether families such as Samsung cases are made from the artwork of the
 * family they share it with when a concept has no file of their own.
 */
export interface ArtworkSharing {
  shared(): Promise<boolean>;
}
