import type { ImageMimeType } from '../catalog/model.js';
import { ImageTooLargeError } from '../catalog/image-limits.js';
import type {
  AssetStore,
  Hasher,
  ImageInfo,
  ImageInspector,
  ScanResult,
  ScanSkip,
  SourceFile,
  SourceScanner,
  StoredAsset,
} from '../ports/files.js';
import type { Clock, IdGenerator } from '../ports/system.js';
import { settle } from './settle.js';

export interface FakeFile {
  readonly relativePath: string;
  /** Stands in for the file contents; equal content means equal hash. */
  readonly content: string;
  /** `null` makes the file unreadable as an image; `too-large` one too large to read its size. */
  readonly image?: ImageInfo | null | 'too-large' | undefined;
  /** Makes every read of the file fail, as a locked or deleted file would. */
  readonly unreadable?: boolean | undefined;
}

const DEFAULT_IMAGE: ImageInfo = { mimeType: 'image/png', width: 3840, height: 1648 };

/** In-memory folder that serves as scanner, inspector and hasher at once. */
export class FakeSourceFolder implements SourceScanner, ImageInspector, Hasher {
  private readonly files = new Map<string, FakeFile>();
  scanError: Error | undefined;
  /** Top-level folders the scanner reports as unreadable instead of listing. */
  readonly lockedFolders = new Set<string>();

  constructor(
    readonly rootPath: string,
    files: readonly FakeFile[] = [],
  ) {
    for (const file of files) this.write(file);
  }

  write(file: FakeFile): void {
    this.files.set(file.relativePath, file);
  }

  remove(relativePath: string): void {
    this.files.delete(relativePath);
  }

  absolutePath(relativePath: string): string {
    return `${this.rootPath}/${relativePath}`;
  }

  contentAt(absolutePath: string): string {
    return this.read(absolutePath).content;
  }

  scan(rootPath: string, maxDepth: number): Promise<ScanResult> {
    if (this.scanError) return Promise.reject(this.scanError);
    if (rootPath !== this.rootPath) return Promise.reject(new Error(`ENOENT: ${rootPath}`));

    const files: SourceFile[] = [];
    const skipped = new Map<string, ScanSkip>();
    for (const { relativePath, content } of this.files.values()) {
      const segments = relativePath.split('/');
      const [top = ''] = segments;
      if (segments.length > 1 && this.lockedFolders.has(top)) {
        skipped.set(top, { relativePath: top, reason: 'unreadable' });
      } else if (segments.length - 1 > maxDepth) {
        const folder = segments.slice(0, maxDepth + 1).join('/');
        skipped.set(folder, { relativePath: folder, reason: 'too-deep' });
      } else {
        const absolutePath = this.absolutePath(relativePath);
        files.push({ relativePath, absolutePath, byteSize: content.length });
      }
    }
    return Promise.resolve({ files, skipped: [...skipped.values()] });
  }

  inspect(absolutePath: string): Promise<ImageInfo | undefined> {
    return settle(() => {
      const { image } = this.read(absolutePath);
      if (image === 'too-large') throw new ImageTooLargeError(absolutePath);
      return image === null ? undefined : (image ?? DEFAULT_IMAGE);
    });
  }

  async hashFile(absolutePath: string): Promise<string> {
    const { content } = await settle(() => this.read(absolutePath));
    return this.hashText(content);
  }

  hashText(text: string): Promise<string> {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return Promise.resolve(`fnv-${hash.toString(16).padStart(8, '0')}-${text.length}`);
  }

  private read(absolutePath: string): FakeFile {
    const file = this.files.get(absolutePath.slice(this.rootPath.length + 1));
    if (!file) throw new Error(`ENOENT: ${absolutePath}`);
    if (file.unreadable) throw new Error(`EBUSY: ${absolutePath}`);
    return file;
  }
}

/** Asset store over a {@link FakeSourceFolder} that records what it stored. */
export class RecordingAssetStore implements AssetStore {
  readonly stored: { storageKey: string; mimeType: ImageMimeType }[] = [];
  failWith: Error | undefined;
  /** Simulates the file changing after it was hashed for the preview. */
  contentOverride: string | undefined;

  constructor(private readonly folder: FakeSourceFolder) {}

  async put(absolutePath: string, mimeType: ImageMimeType): Promise<StoredAsset> {
    if (this.failWith) throw this.failWith;
    const content = this.contentOverride ?? this.folder.contentAt(absolutePath);
    const sha256 = await this.folder.hashText(content);
    const storageKey = `assets/${sha256}`;
    this.stored.push({ storageKey, mimeType });
    return { storageKey, sha256, byteSize: content.length };
  }
}

export class FixedClock implements Clock {
  constructor(private current: Date = new Date('2026-01-01T00:00:00.000Z')) {}

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

export class SequentialIds implements IdGenerator {
  private counter = 0;

  constructor(private readonly prefix = 'id') {}

  next(): string {
    this.counter += 1;
    return `${this.prefix}-${String(this.counter).padStart(4, '0')}`;
  }
}
